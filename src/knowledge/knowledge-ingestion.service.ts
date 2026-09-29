import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { lookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { PDFParse } from 'pdf-parse';
import { Repository } from 'typeorm';
import { LLM_PROVIDER } from '../llm/llm-provider.interface.js';
import type { LlmProvider } from '../llm/llm-provider.interface.js';
import { KnowledgeChunk } from './knowledge-chunk.entity.js';
import { KnowledgeSource } from './knowledge-source.entity.js';
import {
  requireText,
  parseUrl,
  isPrivateAddress,
} from '../utils/knowledge-validation.util.js';
import {
  chunkText,
  cleanHtml,
  extractMetadata,
  normalizeText,
} from '../utils/knowledge-text.util.js';

const MAX_TEXT_LENGTH = 60_000;

@Injectable()
export class KnowledgeIngestionService {
  constructor(
    @Inject(LLM_PROVIDER)
    private readonly llmProvider: LlmProvider,
    @InjectRepository(KnowledgeSource)
    private readonly sourceRepository: Repository<KnowledgeSource>,
  ) {}

  async list() {
    const sources = await this.sourceRepository.find({
      order: { createdAt: 'DESC' },
    });
    return sources.map((source) => this.sourceResponse(source));
  }

  async addQa(question: string, answer: string) {
    const cleanQuestion = requireText(question, 'Question', 2_000);
    const cleanAnswer = requireText(answer, 'Answer', 20_000);
    return this.ingest(
      'qa',
      cleanQuestion.slice(0, 255),
      cleanQuestion.slice(0, 500),
      `Question: ${cleanQuestion}\nAnswer: ${cleanAnswer}`,
    );
  }

  async addUrl(rawUrl: string) {
    const url = parseUrl(rawUrl);
    const { html, finalUrl, isHtml } = await this.fetchWebsite(url);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = cleanHtml(titleMatch?.[1] ?? '') || finalUrl.hostname;
    const metadata = extractMetadata(html);
    const text = isHtml
      ? normalizeText(`${metadata}\n\n${cleanHtml(html)}`)
      : normalizeText(html);
    if (text.length < 40)
      throw new BadRequestException(
        'The URL did not contain enough readable text',
      );
    return this.ingest('url', title.slice(0, 255), finalUrl.toString(), text);
  }

  async addPdf(file: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
  }) {
    if (!file?.buffer?.length)
      throw new BadRequestException('A PDF file is required');
    if (
      file.mimetype !== 'application/pdf' &&
      !file.originalname.toLowerCase().endsWith('.pdf')
    ) {
      throw new BadRequestException('Only PDF files are supported');
    }
    if (!file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new BadRequestException('The uploaded file is not a valid PDF');
    }
    const parser = new PDFParse({ data: file.buffer });
    let text: string;
    try {
      const result = await parser.getText();
      text = normalizeText(result.text);
    } catch {
      throw new BadRequestException(
        'The PDF could not be read. Upload a readable, unencrypted PDF.',
      );
    } finally {
      await parser.destroy();
    }
    if (text.length < 20)
      throw new BadRequestException('No readable text was found in the PDF');
    return this.ingest(
      'pdf',
      file.originalname.slice(0, 255),
      file.originalname.slice(0, 500),
      text,
    );
  }

  async remove(id: number) {
    if (!Number.isInteger(id) || id < 1)
      throw new BadRequestException('Invalid source id');
    const result = await this.sourceRepository.delete(id);
    if (!result.affected)
      throw new NotFoundException('Knowledge source not found');
    return { deleted: true };
  }

  async reindex(id: number) {
    const source = await this.sourceRepository.findOne({
      where: { id },
      relations: { chunks: true },
      order: { chunks: { id: 'ASC' } },
    });
    if (!source) throw new NotFoundException('Knowledge source not found');
    if (!source.chunks.length)
      throw new BadRequestException('Knowledge source has no content');
    const embeddings: number[][] = [];
    for (const chunk of source.chunks)
      embeddings.push(await this.llmProvider.getEmbedding(chunk.content));
    await this.sourceRepository.manager.transaction(async (manager) => {
      const current = await manager.findOne(KnowledgeSource, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) throw new NotFoundException('Knowledge source not found');
      for (const [index, chunk] of source.chunks.entries()) {
        await manager.update(
          KnowledgeChunk,
          { id: chunk.id, sourceId: id },
          { embedding: embeddings[index] },
        );
      }
      await manager.update(KnowledgeSource, id, {
        embeddingModel: this.llmProvider.embeddingModel,
      });
    });
    // Existing duplicates are preserved; new uploads reuse the first indexed copy.
    const contentHash = createHash('sha256')
      .update(JSON.stringify(source.chunks.map(({ content }) => content)))
      .digest('hex');
    try {
      await this.sourceRepository.update(id, { contentHash });
    } catch (error) {
      if (
        (error as { driverError?: { code?: string } }).driverError?.code !==
        'ER_DUP_ENTRY'
      )
        throw error;
    }
    return { id, reindexed: true, chunkCount: source.chunks.length };
  }

  private async ingest(
    type: 'pdf' | 'qa' | 'url',
    title: string,
    originalRef: string,
    rawText: string,
  ) {
    const text = normalizeText(rawText);
    if (text.length > MAX_TEXT_LENGTH) {
      throw new BadRequestException(
        `Knowledge content exceeds ${MAX_TEXT_LENGTH} characters. Split it into smaller documents; no content was saved.`,
      );
    }
    const contents = chunkText(text);
    const contentHash = createHash('sha256')
      .update(JSON.stringify(contents))
      .digest('hex');
    const existing = await this.sourceRepository.findOne({
      where: { contentHash },
    });
    if (existing) return { ...this.sourceResponse(existing), duplicate: true };
    if (!contents.length)
      throw new BadRequestException('No knowledge content was found');
    const embeddings: number[][] = [];
    for (const content of contents)
      embeddings.push(await this.llmProvider.getEmbedding(content));
    try {
      return await this.sourceRepository.manager.transaction(
        async (manager) => {
          const source = await manager.save(
            manager.create(KnowledgeSource, {
              type,
              title,
              originalRef,
              contentHash,
              embeddingModel: this.llmProvider.embeddingModel,
            }),
          );
          await manager.save(
            KnowledgeChunk,
            contents.map((content, index) =>
              manager.create(KnowledgeChunk, {
                sourceId: source.id,
                content,
                embedding: embeddings[index],
              }),
            ),
          );
          return this.sourceResponse(source);
        },
      );
    } catch (error) {
      // The unique hash also prevents concurrent requests from storing duplicates.
      if (
        (error as { driverError?: { code?: string } }).driverError?.code ===
        'ER_DUP_ENTRY'
      ) {
        const duplicate = await this.sourceRepository.findOne({
          where: { contentHash },
        });
        if (duplicate)
          return { ...this.sourceResponse(duplicate), duplicate: true };
        throw new ConflictException(
          'This knowledge was uploaded concurrently. Please retry.',
        );
      }
      throw error;
    }
  }

  private sourceResponse(source: KnowledgeSource) {
    return {
      id: source.id,
      type: source.type,
      title: source.title,
      originalRef: source.originalRef,
      createdAt: source.createdAt,
      embeddingModel: source.embeddingModel,
      needsReindex: source.embeddingModel !== this.llmProvider.embeddingModel,
    };
  }

  private async fetchWebsite(initialUrl: URL) {
    let currentUrl = initialUrl;
    for (let redirect = 0; redirect <= 3; redirect++) {
      const addresses = await this.assertPublicUrl(currentUrl);
      let response;
      try {
        response = await axios.get<string>(currentUrl.toString(), {
          adapter: 'http',
          proxy: false,
          // Pin the connection to the addresses already validated above.
          lookup: (_hostname, _options, callback) => callback(null, addresses),
          headers: { 'User-Agent': 'BnbGrace-KnowledgeBot/1.0' },
          maxRedirects: 0,
          timeout: 20_000,
          maxContentLength: 2_000_000,
          responseType: 'text',
          validateStatus: (status) => status >= 200 && status < 400,
        });
      } catch {
        throw new BadGatewayException('Unable to retrieve the website');
      }
      if (response.status >= 300) {
        const location = response.headers.location;
        if (!location || redirect === 3)
          throw new BadGatewayException('Too many website redirects');
        try {
          currentUrl = parseUrl(new URL(location, currentUrl).toString());
        } catch {
          throw new BadRequestException(
            'The website redirected to an invalid URL',
          );
        }
        continue;
      }
      const contentType = String(
        response.headers['content-type'] ?? '',
      ).toLowerCase();
      if (
        !contentType.includes('text/html') &&
        !contentType.includes('text/plain')
      ) {
        throw new BadRequestException(
          'The URL must return an HTML or text page',
        );
      }
      return {
        html: response.data,
        finalUrl: currentUrl,
        isHtml: contentType.includes('text/html'),
      };
    }
    throw new BadGatewayException('Unable to retrieve the website');
  }

  private async assertPublicUrl(url: URL) {
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .replace(/\.$/, '');
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    )
      throw new BadRequestException('Local network URLs are not allowed');
    let addresses: Array<{ address: string; family: 4 | 6 }>;
    try {
      const family = isIP(hostname);
      addresses = family
        ? [{ address: hostname, family: family as 4 | 6 }]
        : (await lookup(hostname, { all: true })).map(
            ({ address, family }) => ({ address, family: family as 4 | 6 }),
          );
    } catch {
      throw new BadGatewayException('Unable to resolve the website hostname');
    }
    if (
      !addresses.length ||
      addresses.some(({ address }) => isPrivateAddress(address))
    ) {
      throw new BadRequestException('Private network URLs are not allowed');
    }
    return addresses;
  }
}

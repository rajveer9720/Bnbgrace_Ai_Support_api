import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { lookup } from 'node:dns/promises';
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

  list() {
    return this.sourceRepository.find({ order: { createdAt: 'DESC' } });
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
    const { html, finalUrl } = await this.fetchWebsite(url);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = cleanHtml(titleMatch?.[1] ?? '') || finalUrl.hostname;
    const metadata = extractMetadata(html);
    const text = normalizeText(`${metadata}\n\n${cleanHtml(html)}`);
    if (text.length < 40)
      throw new BadRequestException(
        'The URL did not contain enough readable text',
      );
    return this.ingest(
      'url',
      title.slice(0, 255),
      finalUrl.toString().slice(0, 500),
      text,
    );
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
    try {
      const result = await parser.getText();
      const text = normalizeText(result.text);
      if (text.length < 20)
        throw new BadRequestException('No readable text was found in the PDF');
      return this.ingest(
        'pdf',
        file.originalname.slice(0, 255),
        file.originalname.slice(0, 500),
        text,
      );
    } finally {
      await parser.destroy();
    }
  }

  async remove(id: number) {
    if (!Number.isInteger(id) || id < 1)
      throw new BadRequestException('Invalid source id');
    const result = await this.sourceRepository.delete(id);
    if (!result.affected)
      throw new NotFoundException('Knowledge source not found');
    return { deleted: true };
  }

  private async ingest(
    type: 'pdf' | 'qa' | 'url',
    title: string,
    originalRef: string,
    rawText: string,
  ) {
    const text = normalizeText(rawText).slice(0, MAX_TEXT_LENGTH);
    const contents = chunkText(text);
    if (!contents.length)
      throw new BadRequestException('No knowledge content was found');
    const embeddings: number[][] = [];
    for (const content of contents)
      embeddings.push(await this.llmProvider.getEmbedding(content));
    return this.sourceRepository.manager.transaction(async (manager) => {
      const source = await manager.save(
        manager.create(KnowledgeSource, { type, title, originalRef }),
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
      return source;
    });
  }

  private async fetchWebsite(initialUrl: URL) {
    let currentUrl = initialUrl;
    for (let redirect = 0; redirect <= 3; redirect++) {
      await this.assertPublicUrl(currentUrl);
      let response;
      try {
        response = await axios.get<string>(currentUrl.toString(), {
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
        currentUrl = new URL(location, currentUrl);
        continue;
      }
      const contentType = String(response.headers['content-type'] ?? '');
      if (
        !contentType.includes('text/html') &&
        !contentType.includes('text/plain')
      ) {
        throw new BadRequestException(
          'The URL must return an HTML or text page',
        );
      }
      return { html: response.data, finalUrl: currentUrl };
    }
    throw new BadGatewayException('Unable to retrieve the website');
  }

  private async assertPublicUrl(url: URL) {
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.local'))
      throw new BadRequestException('Local network URLs are not allowed');
    const addresses = await lookup(hostname, { all: true });
    if (
      !addresses.length ||
      addresses.some(({ address }) => isPrivateAddress(address))
    ) {
      throw new BadRequestException('Private network URLs are not allowed');
    }
  }
}

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
import { isIP } from 'node:net';
import { PDFParse } from 'pdf-parse';
import { Repository } from 'typeorm';
import { LLM_PROVIDER } from '../llm/llm-provider.interface.js';
import type { LlmProvider } from '../llm/llm-provider.interface.js';
import { KnowledgeChunk } from './knowledge-chunk.entity.js';
import { KnowledgeSource } from './knowledge-source.entity.js';

const MAX_TEXT_LENGTH = 60_000;
const CHUNK_LENGTH = 1_200;
const CHUNK_OVERLAP = 150;

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
    const cleanQuestion = this.requireText(question, 'Question', 2_000);
    const cleanAnswer = this.requireText(answer, 'Answer', 20_000);
    return this.ingest('qa', cleanQuestion.slice(0, 255), cleanQuestion.slice(0, 500), `Question: ${cleanQuestion}\nAnswer: ${cleanAnswer}`);
  }

  async addUrl(rawUrl: string) {
    const url = this.parseUrl(rawUrl);
    const { html, finalUrl } = await this.fetchWebsite(url);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = this.cleanHtml(titleMatch?.[1] ?? '') || finalUrl.hostname;
    const metadata = this.extractMetadata(html);
    const text = this.normalizeText(`${metadata}\n\n${this.cleanHtml(html)}`);
    if (text.length < 40) throw new BadRequestException('The URL did not contain enough readable text');
    return this.ingest('url', title.slice(0, 255), finalUrl.toString().slice(0, 500), text);
  }

  async addPdf(file: { originalname: string; mimetype: string; buffer: Buffer }) {
    if (!file?.buffer?.length) throw new BadRequestException('A PDF file is required');
    if (file.mimetype !== 'application/pdf' && !file.originalname.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('Only PDF files are supported');
    }
    if (!file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new BadRequestException('The uploaded file is not a valid PDF');
    }
    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      const text = this.normalizeText(result.text);
      if (text.length < 20) throw new BadRequestException('No readable text was found in the PDF');
      return this.ingest('pdf', file.originalname.slice(0, 255), file.originalname.slice(0, 500), text);
    } finally {
      await parser.destroy();
    }
  }

  async remove(id: number) {
    if (!Number.isInteger(id) || id < 1) throw new BadRequestException('Invalid source id');
    const result = await this.sourceRepository.delete(id);
    if (!result.affected) throw new NotFoundException('Knowledge source not found');
    return { deleted: true };
  }

  private async ingest(type: 'pdf' | 'qa' | 'url', title: string, originalRef: string, rawText: string) {
    const text = this.normalizeText(rawText).slice(0, MAX_TEXT_LENGTH);
    const contents = this.chunkText(text);
    if (!contents.length) throw new BadRequestException('No knowledge content was found');
    const embeddings: number[][] = [];
    for (const content of contents) embeddings.push(await this.llmProvider.getEmbedding(content));
    return this.sourceRepository.manager.transaction(async (manager) => {
      const source = await manager.save(manager.create(KnowledgeSource, { type, title, originalRef }));
      await manager.save(KnowledgeChunk, contents.map((content, index) => manager.create(KnowledgeChunk, {
        sourceId: source.id,
        content,
        embedding: embeddings[index],
      })));
      return source;
    });
  }

  private chunkText(text: string) {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + CHUNK_LENGTH, text.length);
      if (end < text.length) {
        const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('. ', end), text.lastIndexOf(' ', end));
        if (boundary > start + CHUNK_LENGTH / 2) end = boundary + 1;
      }
      const chunk = text.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      if (end >= text.length) break;
      start = Math.max(end - CHUNK_OVERLAP, start + 1);
    }
    return chunks;
  }

  private requireText(value: string, label: string, maxLength: number) {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${label} is required`);
    if (value.trim().length > maxLength) throw new BadRequestException(`${label} is too long`);
    return this.normalizeText(value);
  }

  private parseUrl(value: string) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      url.username = '';
      url.password = '';
      return url;
    } catch {
      throw new BadRequestException('A valid HTTP or HTTPS URL is required');
    }
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
        if (!location || redirect === 3) throw new BadGatewayException('Too many website redirects');
        currentUrl = new URL(location, currentUrl);
        continue;
      }
      const contentType = String(response.headers['content-type'] ?? '');
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        throw new BadRequestException('The URL must return an HTML or text page');
      }
      return { html: response.data, finalUrl: currentUrl };
    }
    throw new BadGatewayException('Unable to retrieve the website');
  }

  private async assertPublicUrl(url: URL) {
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.local')) throw new BadRequestException('Local network URLs are not allowed');
    const addresses = await lookup(hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => this.isPrivateAddress(address))) {
      throw new BadRequestException('Private network URLs are not allowed');
    }
  }

  private isPrivateAddress(address: string) {
    if (isIP(address) === 4) {
      const [a, b] = address.split('.').map(Number);
      return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    }
    const value = address.toLowerCase();
    return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value);
  }

  private cleanHtml(html: string) {
    return this.normalizeText(html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|section|article|main|header|footer)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'"));
  }

  private extractMetadata(html: string) {
    const values = new Set<string>();
    const allowed = new Set([
      'description',
      'og:title',
      'og:description',
      'twitter:title',
      'twitter:description',
    ]);
    for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
      const attributes = new Map<string, string>();
      for (const attribute of match[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gi)) {
        attributes.set(attribute[1].toLowerCase(), attribute[3]);
      }
      const key = (attributes.get('name') ?? attributes.get('property') ?? '').toLowerCase();
      const content = attributes.get('content');
      if (allowed.has(key) && content) values.add(this.cleanHtml(content));
    }
    return [...values].join('\n');
  }

  private normalizeText(text: string) {
    return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
}

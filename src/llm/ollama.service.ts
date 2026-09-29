import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { LlmProviderWithModels } from './llm-provider.interface.js';

@Injectable()
export class OllamaService implements LlmProviderWithModels {
  constructor(private readonly configService: ConfigService) {}

  get embeddingModel(): string {
    return `ollama:${this.configService.get<string>('OLLAMA_EMBEDDING_MODEL') ?? 'nomic-embed-text'}`;
  }

  private get baseUrl(): string {
    return (
      this.configService.get<string>('OLLAMA_URL') ?? 'http://localhost:11434'
    ).replace(/\/+$/, '');
  }

  private validateInput(input: string): void {
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('A non-empty text input is required');
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      const response = await axios.post<T>(`${this.baseUrl}${path}`, body, {
        timeout: 60000,
      });
      return response.data;
    } catch {
      throw new BadGatewayException(
        'Ollama request failed. Check availability and model configuration.',
      );
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    this.validateInput(text);
    const data = await this.post<{ embeddings?: number[][] }>('/api/embed', {
      model:
        this.configService.get<string>('OLLAMA_EMBEDDING_MODEL') ??
        'nomic-embed-text',
      input: text,
    });
    const embedding = data.embeddings?.[0];
    if (
      !Array.isArray(embedding) ||
      !embedding.length ||
      !embedding.every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      )
    ) {
      throw new BadGatewayException('Ollama returned an invalid embedding');
    }
    return embedding;
  }

  async generateReply(prompt: string, instructions?: string): Promise<string> {
    this.validateInput(prompt);
    const data = await this.post<{ message?: { content?: string } }>(
      '/api/chat',
      {
        model: this.configService.get<string>('OLLAMA_MODEL') ?? 'llama3.1:8b',
        messages: [
          ...(instructions ? [{ role: 'system', content: instructions }] : []),
          { role: 'user', content: prompt },
        ],
        stream: false,
      },
    );
    const reply = data.message?.content;
    if (!reply?.trim()) {
      throw new BadGatewayException('Ollama returned an empty response');
    }
    return reply;
  }

  async getModels() {
    try {
      const response = await axios.get<{
        models: Array<{ name: string }>;
      }>(`${this.baseUrl}/api/tags`, { timeout: 15000 });
      return { provider: 'ollama' as const, models: response.data.models };
    } catch {
      throw new BadGatewayException('Unable to retrieve Ollama models');
    }
  }
}

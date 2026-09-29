import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { LlmProviderWithModels } from './llm-provider.interface.js';

interface OpenAiResponse {
  status: string;
  output: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
}

@Injectable()
export class OpenAiService implements LlmProviderWithModels {
  constructor(private readonly configService: ConfigService) {}

  get embeddingModel(): string {
    return `openai:${this.configService.get<string>('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small'}`;
  }

  private get headers(): Record<string, string> {
    const key = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is required when LLM_PROVIDER=openai',
      );
    }
    return { Authorization: `Bearer ${key}` };
  }

  private validateInput(input: string): void {
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('A non-empty text input is required');
    }
  }

  private async post<T>(url: string, body: unknown): Promise<T> {
    try {
      const response = await axios.post<T>(url, body, {
        headers: this.headers,
        timeout: 60000,
      });
      return response.data;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new BadGatewayException(
        'OpenAI request failed. Check credentials, quota and model configuration.',
      );
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    this.validateInput(text);
    const data = await this.post<{
      data?: Array<{ embedding: number[] }>;
    }>('https://api.openai.com/v1/embeddings', {
      model:
        this.configService.get<string>('OPENAI_EMBEDDING_MODEL') ??
        'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    });
    const embedding = data.data?.[0]?.embedding;
    if (
      !Array.isArray(embedding) ||
      !embedding.length ||
      !embedding.every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      )
    ) {
      throw new BadGatewayException('OpenAI returned an invalid embedding');
    }
    return embedding;
  }

  async generateReply(prompt: string, instructions?: string): Promise<string> {
    this.validateInput(prompt);
    const data = await this.post<OpenAiResponse>(
      'https://api.openai.com/v1/responses',
      {
        model: this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
        input: prompt,
        instructions,
        store: false,
      },
    );
    if (data.status !== 'completed') {
      throw new BadGatewayException('OpenAI did not complete the response');
    }
    const reply = data.output
      ?.filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((item) => item.type === 'output_text')
      .map((item) => item.text ?? '')
      .join('\n');
    if (!reply?.trim()) {
      throw new BadGatewayException('OpenAI returned an empty response');
    }
    return reply;
  }

  async getModels() {
    try {
      const response = await axios.get<{
        data: Array<{ id: string }>;
      }>('https://api.openai.com/v1/models', {
        headers: this.headers,
        timeout: 15000,
      });
      return {
        provider: 'openai' as const,
        models: response.data.data.map((model) => ({ name: model.id })),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new BadGatewayException('Unable to retrieve OpenAI models');
    }
  }
}

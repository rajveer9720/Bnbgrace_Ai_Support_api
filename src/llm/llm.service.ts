import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface OpenAiResponse {
  status: string;
  output: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
}

@Injectable()
export class LlmService {
  constructor(private readonly configService: ConfigService) {}

  private get provider(): 'openai' | 'ollama' {
    const provider = this.configService.get<string>('LLM_PROVIDER') ?? 'ollama';
    if (provider !== 'openai' && provider !== 'ollama') {
      throw new ServiceUnavailableException(
        'LLM_PROVIDER must be openai or ollama',
      );
    }
    return provider;
  }

  private get ollamaUrl(): string {
    return (
      this.configService.get<string>('OLLAMA_URL') ?? 'http://localhost:11434'
    ).replace(/\/+$/, '');
  }

  private get openAiHeaders(): Record<string, string> {
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

  private async post<T>(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    try {
      const response = await axios.post<T>(url, body, {
        headers,
        timeout: 60000,
      });
      return response.data;
    } catch {
      throw new BadGatewayException(
        'LLM request failed. Check provider availability, credentials, quota and model configuration.',
      );
    }
  }

  async generateReply(prompt: string): Promise<string> {
    this.validateInput(prompt);
    let reply: string | undefined;
    if (this.provider === 'openai') {
      const data = await this.post<OpenAiResponse>(
        'https://api.openai.com/v1/responses',
        {
          model:
            this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4.1-mini',
          input: prompt,
          store: false,
        },
        this.openAiHeaders,
      );
      if (data.status !== 'completed') {
        throw new BadGatewayException('OpenAI did not complete the response');
      }
      reply = data.output
        ?.filter((item) => item.type === 'message')
        .flatMap((item) => item.content ?? [])
        .filter((item) => item.type === 'output_text')
        .map((item) => item.text ?? '')
        .join('\n');
    } else {
      const data = await this.post<{ message?: { content?: string } }>(
        `${this.ollamaUrl}/api/chat`,
        {
          model:
            this.configService.get<string>('OLLAMA_MODEL') ?? 'llama3.1:8b',
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        },
      );
      reply = data.message?.content;
    }
    if (typeof reply !== 'string' || !reply.trim()) {
      throw new BadGatewayException('LLM returned an empty response');
    }
    return reply;
  }

  async getEmbedding(text: string): Promise<number[]> {
    this.validateInput(text);
    let embedding: unknown;
    if (this.provider === 'openai') {
      const data = await this.post<{ data?: Array<{ embedding: number[] }> }>(
        'https://api.openai.com/v1/embeddings',
        {
          model:
            this.configService.get<string>('OPENAI_EMBEDDING_MODEL') ??
            'text-embedding-3-small',
          input: text,
          encoding_format: 'float',
        },
        this.openAiHeaders,
      );
      embedding = data.data?.[0]?.embedding;
    } else {
      const data = await this.post<{ embeddings?: number[][] }>(
        `${this.ollamaUrl}/api/embed`,
        {
          model:
            this.configService.get<string>('OLLAMA_EMBEDDING_MODEL') ??
            'nomic-embed-text',
          input: text,
        },
      );
      embedding = data.embeddings?.[0];
    }
    if (
      !Array.isArray(embedding) ||
      !embedding.length ||
      !embedding.every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      )
    ) {
      throw new BadGatewayException('LLM returned an invalid embedding');
    }
    return embedding as number[];
  }

  async getModels() {
    const provider = this.provider;
    const headers = provider === 'openai' ? this.openAiHeaders : undefined;
    try {
      if (provider === 'openai') {
        const response = await axios.get<{ data: Array<{ id: string }> }>(
          'https://api.openai.com/v1/models',
          { headers, timeout: 15000 },
        );
        return {
          models: response.data.data.map((model) => ({ name: model.id })),
          provider,
        };
      }
      const response = await axios.get<{ models: Array<{ name: string }> }>(
        `${this.ollamaUrl}/api/tags`,
        { timeout: 15000 },
      );
      return { ...response.data, provider };
    } catch {
      throw new BadGatewayException('Unable to retrieve LLM models');
    }
  }
}

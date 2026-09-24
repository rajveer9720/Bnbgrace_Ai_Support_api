import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class OllamaService {
  constructor(private readonly configService: ConfigService) {}

  async getEmbedding(text: string): Promise<number[]> {
    const ollamaUrl = this.configService.get<string>('OLLAMA_URL') ?? 'http://localhost:11434';
    const response = await axios.post(`${ollamaUrl}/api/embed`, {
      model: 'nomic-embed-text',
      input: text,
    });

    return response.data.embeddings[0];
  }

  async generateReply(prompt: string): Promise<string> {
    const ollamaUrl = this.configService.get<string>('OLLAMA_URL') ?? 'http://localhost:11434';
    const response = await axios.post(`${ollamaUrl}/api/chat`, {
      model: 'llama3.1:8b',
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    });

    return response.data.message.content;
  }
}
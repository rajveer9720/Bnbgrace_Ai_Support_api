import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KnowledgeService {
  constructor(private readonly configService: ConfigService) {}

  async getKnowledgeBase() {
    const ollamaUrl = this.configService.get<string>('OLLAMA_URL') ?? 'http://localhost:11434';

    try {
      const response = await axios.get(`${ollamaUrl}/api/tags`);
      return response.data;
    } catch {
      return {
        models: [],
        message: 'Ollama not reachable',
      };
    }
  }
}

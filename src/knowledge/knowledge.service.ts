import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';

@Injectable()
export class KnowledgeService {
  constructor(private readonly llmService: LlmService) {}

  async getKnowledgeBase() {
    return this.llmService.getModels();
  }
}

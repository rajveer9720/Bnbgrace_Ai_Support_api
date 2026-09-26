import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER } from '../llm/llm-provider.interface.js';
import type { LlmProviderWithModels } from '../llm/llm-provider.interface.js';

@Injectable()
export class KnowledgeService {
  constructor(
    @Inject(LLM_PROVIDER)
    private readonly llmProvider: LlmProviderWithModels,
  ) {}

  async getKnowledgeBase() {
    return this.llmProvider.getModels();
  }
}

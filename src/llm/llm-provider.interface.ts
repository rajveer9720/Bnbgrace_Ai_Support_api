export interface LlmProvider {
  readonly embeddingModel: string;
  getEmbedding(text: string): Promise<number[]>;
  generateReply(prompt: string, instructions?: string): Promise<string>;
}

export interface LlmProviderWithModels extends LlmProvider {
  getModels(): Promise<{
    provider: 'openai' | 'ollama';
    models: Array<{ name: string }>;
  }>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

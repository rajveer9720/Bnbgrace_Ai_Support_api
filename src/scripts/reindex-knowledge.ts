import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { AppDataSource } from '../data-source.js';
import { KnowledgeSource } from '../knowledge/knowledge-source.entity.js';
import { KnowledgeIngestionService } from '../knowledge/knowledge-ingestion.service.js';
import { OpenAiService } from '../llm/openai.service.js';
import { OllamaService } from '../llm/ollama.service.js';

const config = new ConfigService(process.env);
const providerName = config.get<string>('LLM_PROVIDER') ?? 'ollama';
if (!['openai', 'ollama'].includes(providerName)) {
  throw new Error('Invalid LLM_PROVIDER');
}
const provider = providerName === 'openai'
  ? new OpenAiService(config)
  : new OllamaService(config);
await AppDataSource.initialize();
try {
  const repository = AppDataSource.getRepository(KnowledgeSource);
  const service = new KnowledgeIngestionService(provider, repository);
  const sources = await repository.find({ order: { id: 'ASC' } });
  for (const source of sources) {
    if (source.embeddingModel === provider.embeddingModel && !process.argv.includes('--all')) continue;
    await service.reindex(source.id);
    console.log(`Reindexed knowledge source ${source.id}`);
  }
} finally {
  await AppDataSource.destroy();
}

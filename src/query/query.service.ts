import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeChunk } from '../knowledge/knowledge-chunk.entity.js';
import { QueryLog } from './query-log.entity.js';
import { LLM_PROVIDER } from '../llm/llm-provider.interface.js';
import type { LlmProvider } from '../llm/llm-provider.interface.js';
import { getTopMatches } from './cosine-similarity.util.js';

const FALLBACK_REPLY = 'This query requires supervisor verification.';

@Injectable()
export class QueryService {
  constructor(
    private readonly configService: ConfigService,
    @Inject(LLM_PROVIDER)
    private readonly llmProvider: LlmProvider,
    @InjectRepository(KnowledgeChunk)
    private readonly knowledgeChunkRepository: Repository<KnowledgeChunk>,
    @InjectRepository(QueryLog)
    private readonly queryLogRepository: Repository<QueryLog>,
  ) {}

  async ask(prompt: string) {
    return {
      answer: await this.llmProvider.generateReply(prompt),
    };
  }

  async generateReply(question: string, userId: number) {
    const questionEmbedding = await this.llmProvider.getEmbedding(question);
    const chunks = await this.knowledgeChunkRepository.find();
    const topMatches = getTopMatches(questionEmbedding, chunks, 5);
    const bestScore = topMatches[0]?.score ?? 0;
    const configuredThreshold = Number(
      this.configService.get<string>('KNOWLEDGE_SIMILARITY_THRESHOLD') ?? 0.25,
    );
    const threshold =
      Number.isFinite(configuredThreshold) &&
      configuredThreshold >= 0 &&
      configuredThreshold <= 1
        ? configuredThreshold
        : 0.25;

    if (bestScore < threshold) {
      await this.queryLogRepository.save(
        this.queryLogRepository.create({
          userId,
          question,
          reply: FALLBACK_REPLY,
          matchedChunkIds: topMatches.map((match) => match.chunk.id),
          similarityScore: bestScore,
          fallbackUsed: true,
        }),
      );

      return { reply: FALLBACK_REPLY, fallback: true };
    }

    const relevantMatches = topMatches.filter((match) => match.score >= threshold);
    const context = relevantMatches
      .map((match) => match.chunk.content)
      .join('\n\n');
    const prompt = `Answer ONLY using the context below. If insufficient, say exactly 'This query requires supervisor verification.'\n\nContext:\n${context}\n\nQuestion: ${question}`;
    const reply = await this.llmProvider.generateReply(prompt);
    const fallbackUsed = reply.trim() === FALLBACK_REPLY;

    await this.queryLogRepository.save(
      this.queryLogRepository.create({
        userId,
        question,
        reply,
        matchedChunkIds: relevantMatches.map((match) => match.chunk.id),
        similarityScore: bestScore,
        fallbackUsed,
      }),
    );

    return { reply, fallback: fallbackUsed };
  }
}

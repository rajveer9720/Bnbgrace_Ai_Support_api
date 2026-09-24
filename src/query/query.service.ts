import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeChunk } from '../knowledge/knowledge-chunk.entity.js';
import { QueryLog } from './query-log.entity.js';
import { LlmService } from '../llm/llm.service.js';
import { getTopMatches } from './cosine-similarity.util.js';

const FALLBACK_REPLY = 'This query requires supervisor verification.';
const SIMILARITY_THRESHOLD = 0.75;

@Injectable()
export class QueryService {
  constructor(
    private readonly llmService: LlmService,
    @InjectRepository(KnowledgeChunk)
    private readonly knowledgeChunkRepository: Repository<KnowledgeChunk>,
    @InjectRepository(QueryLog)
    private readonly queryLogRepository: Repository<QueryLog>,
  ) {}

  async ask(prompt: string) {
    return {
      answer: await this.llmService.generateReply(prompt),
    };
  }

  async generateReply(question: string, userId: number) {
    const questionEmbedding = await this.llmService.getEmbedding(question);
    const chunks = await this.knowledgeChunkRepository.find();
    const topMatches = getTopMatches(questionEmbedding, chunks, 5);
    const bestScore = topMatches[0]?.score ?? 0;

    if (bestScore < SIMILARITY_THRESHOLD) {
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

    const context = topMatches.map((match) => match.chunk.content).join('\n\n');
    const prompt = `Answer ONLY using the context below. If insufficient, say exactly 'This query requires supervisor verification.'\n\nContext:\n${context}\n\nQuestion: ${question}`;
    const reply = await this.llmService.generateReply(prompt);
    const fallbackUsed = reply.trim() === FALLBACK_REPLY;

    await this.queryLogRepository.save(
      this.queryLogRepository.create({
        userId,
        question,
        reply,
        matchedChunkIds: topMatches.map((match) => match.chunk.id),
        similarityScore: bestScore,
        fallbackUsed,
      }),
    );

    return { reply, fallback: fallbackUsed };
  }
}

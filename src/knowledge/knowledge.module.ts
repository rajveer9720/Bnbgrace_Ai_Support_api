import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmModule } from '../llm/llm.module.js';
import { KnowledgeService } from './knowledge.service.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeIngestionService } from './knowledge-ingestion.service.js';
import { KnowledgeChunk } from './knowledge-chunk.entity.js';
import { KnowledgeSource } from './knowledge-source.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeSource, KnowledgeChunk]), LlmModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeIngestionService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}

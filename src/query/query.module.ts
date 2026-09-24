import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueryController, AgentController } from './query.controller.js';
import { QueryService } from './query.service.js';
import { KnowledgeChunk } from '../knowledge/knowledge-chunk.entity.js';
import { QueryLog } from './query-log.entity.js';
import { LlmModule } from '../llm/llm.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeChunk, QueryLog]), LlmModule],
  controllers: [QueryController, AgentController],
  providers: [QueryService],
  exports: [QueryService],
})
export class QueryModule {}

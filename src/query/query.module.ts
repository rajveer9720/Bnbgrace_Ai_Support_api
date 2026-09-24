import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueryController, AgentController } from './query.controller.js';
import { QueryService } from './query.service.js';
import { KnowledgeChunk } from '../knowledge/knowledge-chunk.entity.js';
import { QueryLog } from './query-log.entity.js';
import { OllamaModule } from '../ollama/ollama.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeChunk, QueryLog]), OllamaModule],
  controllers: [QueryController, AgentController],
  providers: [QueryService],
  exports: [QueryService],
})
export class QueryModule {}

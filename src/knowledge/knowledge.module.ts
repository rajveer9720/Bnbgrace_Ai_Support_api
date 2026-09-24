import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { KnowledgeService } from './knowledge.service.js';
import { KnowledgeController } from './knowledge.controller.js';

@Module({
  imports: [LlmModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}

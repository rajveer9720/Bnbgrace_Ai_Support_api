import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { KnowledgeService } from './knowledge.service.js';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  getKnowledgeBase() {
    return this.knowledgeService.getKnowledgeBase();
  }
}

import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { QueryService } from './query.service.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller('query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async ask(@Body('prompt') prompt: string) {
    return this.queryService.ask(prompt);
  }
}

@Controller('agent')
export class AgentController {
  constructor(private readonly queryService: QueryService) {}

  @Post('generate-reply')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('agent', 'admin')
  async generateReply(@Body('question') question: string, @Req() req: Request) {
    const userId = (req.user as { id: number }).id;
    return this.queryService.generateReply(question, userId);
  }
}

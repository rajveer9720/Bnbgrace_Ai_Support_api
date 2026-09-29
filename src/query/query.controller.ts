import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { QueryService } from './query.service.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface.js';

@Controller('query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async ask(@Body('prompt') prompt: string, @Req() req: AuthenticatedRequest) {
    return this.queryService.ask(prompt, req.user.id);
  }
}

@Controller('agent')
export class AgentController {
  constructor(private readonly queryService: QueryService) {}

  @Post('generate-reply')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('agent', 'admin')
  async generateReply(
    @Body('question') question: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.queryService.generateReply(question, req.user.id);
  }
}

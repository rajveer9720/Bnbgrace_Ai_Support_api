import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { KnowledgeIngestionService } from './knowledge-ingestion.service.js';

@Controller('knowledge')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeIngestionService) {}

  @Get()
  list() {
    return this.knowledgeService.list();
  }

  @Post('qa')
  addQa(@Body('question') question: string, @Body('answer') answer: string) {
    return this.knowledgeService.addQa(question, answer);
  }

  @Post('url')
  addUrl(@Body('url') url: string) {
    return this.knowledgeService.addUrl(url);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20_000_000, files: 1 } }),
  )
  upload(
    @UploadedFile()
    file: {
      originalname: string;
      mimetype: string;
      buffer: Buffer;
    },
  ) {
    return this.knowledgeService.addPdf(file);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeService.remove(id);
  }

  @Post(':id/reindex')
  reindex(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeService.reindex(id);
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER } from './llm-provider.interface.js';
import type { LlmProviderWithModels } from './llm-provider.interface.js';
import { OpenAiService } from './openai.service.js';
import { OllamaService } from './ollama.service.js';

@Module({
  imports: [ConfigModule],
  providers: [
    OpenAiService,
    OllamaService,
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService, OpenAiService, OllamaService],
      useFactory: (
        configService: ConfigService,
        openAiService: OpenAiService,
        ollamaService: OllamaService,
      ): LlmProviderWithModels => {
        const provider = configService.get<string>('LLM_PROVIDER') ?? 'ollama';
        if (provider === 'openai') {
          return openAiService;
        }
        if (provider === 'ollama') {
          return ollamaService;
        }
        throw new Error('LLM_PROVIDER must be openai or ollama');
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import { QueryModule } from './query/query.module.js';
import { getDatabaseConfig } from './common/app.config.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();
const configModule = ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: '.env',
});
export const isObserveEnabled =
  process.env.OBSERVE_ENABLED?.toLowerCase() === 'true';

@Module({
  imports: [
    configModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        getDatabaseConfig(configService),
    }),
    ...(isObserveEnabled
      ? [
          ObserveModule.forRoot({
            appKey: process.env.OBSERVE_APP_KEY ?? '',
            appSecret: process.env.OBSERVE_APP_SECRET ?? '',
            serviceId: process.env.OBSERVE_SERVICE_ID ?? 'backend',
          }),
        ]
      : []),
    AuthModule,
    KnowledgeModule,
    QueryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

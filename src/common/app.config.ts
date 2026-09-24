import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../auth/user.entity.js';
import { KnowledgeChunk } from '../knowledge/knowledge-chunk.entity.js';
import { KnowledgeSource } from '../knowledge/knowledge-source.entity.js';
import { QueryLog } from '../query/query-log.entity.js';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: configService.get<string>('DB_HOST') ?? 'localhost',
  port: Number(configService.get<number>('DB_PORT') ?? 3306),
  username: configService.get<string>('DB_USER') ?? 'root',
  password: configService.get<string>('DB_PASS') ?? '',
  database: configService.get<string>('DB_NAME') ?? 'ai_support_bnbgrace',
  entities: [User, KnowledgeSource, KnowledgeChunk, QueryLog],
  synchronize: false,
  migrationsRun: false,
  logging: false,
  extra: {
    connectionLimit: 10,
  },
});

export const getJwtSecret = (configService: ConfigService): string =>
  configService.get<string>('JWT_SECRET') ?? 'dev-secret-key';

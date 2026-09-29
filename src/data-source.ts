import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from './auth/user.entity.js';
import { KnowledgeChunk } from './knowledge/knowledge-chunk.entity.js';
import { KnowledgeSource } from './knowledge/knowledge-source.entity.js';
import { QueryLog } from './query/query-log.entity.js';
import { KnowledgeMetadata1790553600000 } from './migrations/1790553600000-KnowledgeMetadata.js';

config();

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASS ?? '',
  database: process.env.DB_NAME ?? 'ai_support_bnbgrace',
  entities: [User, KnowledgeSource, KnowledgeChunk, QueryLog],
  migrations: [KnowledgeMetadata1790553600000],
  synchronize: false,
  logging: false,
});

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../auth/user.entity.js';

@Entity('query_logs')
export class QueryLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text', nullable: true })
  reply: string | null;

  @Column({ name: 'matched_chunk_ids', type: 'json', nullable: true })
  matchedChunkIds: number[] | null;

  @Column({ name: 'similarity_score', type: 'float', nullable: true })
  similarityScore: number | null;

  @Column({ name: 'fallback_used', type: 'boolean', default: false })
  fallbackUsed: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.queryLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}

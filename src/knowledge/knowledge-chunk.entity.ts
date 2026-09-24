import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KnowledgeSource } from './knowledge-source.entity.js';

@Entity('knowledge_chunks')
export class KnowledgeChunk {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'source_id' })
  sourceId: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'json', nullable: true })
  embedding: number[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(
    () => KnowledgeSource,
    (knowledgeSource) => knowledgeSource.chunks,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'source_id' })
  source: KnowledgeSource;
}

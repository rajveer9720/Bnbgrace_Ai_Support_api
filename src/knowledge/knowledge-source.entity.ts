import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { KnowledgeChunk } from './knowledge-chunk.entity.js';

@Entity('knowledge_sources')
export class KnowledgeSource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: ['pdf', 'qa', 'url'],
  })
  type: 'pdf' | 'qa' | 'url';

  @Column({ length: 255 })
  title: string;

  @Column({ name: 'original_ref', length: 500 })
  originalRef: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => KnowledgeChunk, (knowledgeChunk) => knowledgeChunk.source)
  chunks: Relation<KnowledgeChunk[]>;
}

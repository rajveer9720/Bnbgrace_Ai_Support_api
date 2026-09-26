import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { QueryLog } from '../query/query-log.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: ['admin', 'agent'],
    default: 'agent',
  })
  role: 'admin' | 'agent';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => QueryLog, (queryLog) => queryLog.user)
  queryLogs: Relation<QueryLog[]>;
}

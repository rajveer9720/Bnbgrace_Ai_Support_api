import { TableColumn } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class KnowledgeMetadata1790553600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('knowledge_sources'))) {
      throw new Error(
        'Initialize the base schema before running KnowledgeMetadata. See KNOWLEDGE.md.',
      );
    }
    if (!(await queryRunner.hasColumn('knowledge_sources', 'embedding_model'))) {
      await queryRunner.addColumn(
        'knowledge_sources',
        new TableColumn({
          name: 'embedding_model',
          type: 'varchar',
          length: '255',
          isNullable: true,
        }),
      );
    }
    if (!(await queryRunner.hasColumn('knowledge_sources', 'content_hash'))) {
      await queryRunner.addColumn(
        'knowledge_sources',
        new TableColumn({
          name: 'content_hash',
          type: 'varchar',
          length: '64',
          isNullable: true,
          isUnique: true,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('knowledge_sources', 'content_hash');
    await queryRunner.dropColumn('knowledge_sources', 'embedding_model');
  }
}

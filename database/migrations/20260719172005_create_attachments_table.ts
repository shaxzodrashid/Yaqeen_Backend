import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('attachments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('entity_type', 50).notNullable();
    table.uuid('entity_id').notNullable();
    table.string('file_name', 255).notNullable();
    table.string('file_path', 512).notNullable();
    table.integer('file_size');
    table.string('mime_type', 100);
    table
      .uuid('uploaded_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('attachments');
}

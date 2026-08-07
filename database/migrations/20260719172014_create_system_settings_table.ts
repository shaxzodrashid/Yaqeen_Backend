import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('system_settings', (table) => {
    table.string('key', 100).primary();
    table.text('value').notNullable();
    table.text('description');
    table.timestamps(true, true);
    table
      .uuid('updated_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('system_settings');
}

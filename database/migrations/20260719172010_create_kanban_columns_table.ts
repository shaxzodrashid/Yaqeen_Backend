import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('kanban_columns', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('board_id')
      .references('id')
      .inTable('kanban_boards')
      .onDelete('CASCADE')
      .notNullable();
    table.string('name', 50).notNullable();
    table.integer('position').notNullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('kanban_columns');
}

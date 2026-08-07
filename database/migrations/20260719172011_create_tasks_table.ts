import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tasks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('column_id')
      .references('id')
      .inTable('kanban_columns')
      .onDelete('CASCADE')
      .notNullable();
    table.string('title', 200).notNullable();
    table.text('description');
    table
      .uuid('assignee_id')
      .references('id')
      .inTable('employees')
      .onDelete('SET NULL');
    table.integer('position').notNullable();
    table.timestamp('due_date');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tasks');
}

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('employee_plans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('employee_id')
      .references('id')
      .inTable('employees')
      .onDelete('CASCADE')
      .notNullable();
    table.decimal('target_amount', 12, 2).notNullable();
    table.date('period').notNullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('employee_plans');
}

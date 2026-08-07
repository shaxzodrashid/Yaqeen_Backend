import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('expenses', (table) => {
    table
      .uuid('employee_id')
      .nullable()
      .references('id')
      .inTable('employees')
      .onDelete('SET NULL');
    table.index(['employee_id'], 'expenses_employee_id_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('expenses', (table) => {
    table.dropIndex(['employee_id'], 'expenses_employee_id_idx');
    table.dropColumn('employee_id');
  });
}

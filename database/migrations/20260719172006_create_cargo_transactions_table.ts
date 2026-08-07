import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cargo_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('employee_id')
      .references('id')
      .inTable('employees')
      .onDelete('RESTRICT')
      .notNullable();
    table
      .uuid('department_id')
      .references('id')
      .inTable('departments')
      .onDelete('RESTRICT')
      .notNullable();
    table
      .uuid('client_id')
      .references('id')
      .inTable('clients')
      .onDelete('RESTRICT')
      .notNullable();
    table.text('description');
    table.decimal('buy_price', 12, 2).defaultTo(0.0).notNullable();
    table.decimal('sell_price', 12, 2).defaultTo(0.0).notNullable();
    table.decimal('margin', 12, 2).defaultTo(0.0).notNullable();
    table.decimal('kpi_percentage', 5, 2).defaultTo(0.0).notNullable();
    table.decimal('kpi_bonus', 12, 2).defaultTo(0.0).notNullable();
    table.date('transaction_date').notNullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cargo_transactions');
}

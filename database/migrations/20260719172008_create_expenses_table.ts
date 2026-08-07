import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('expenses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('category', 50).notNullable();
    table.decimal('amount', 12, 2).notNullable();
    table.text('description');
    table.date('expense_date').notNullable();
    table.timestamps(true, true);

    table.check(
      `category IN ('tax', 'utility', 'rent', 'salary_payout', 'cleaner', 'other')`,
      [],
      'expenses_category_check',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('expenses');
}

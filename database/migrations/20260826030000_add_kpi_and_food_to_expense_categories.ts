import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('expenses', (table) => {
    table.dropChecks(['expenses_category_check']);
    table.check(
      `category IN ('tax', 'utility', 'rent', 'salary_payout', 'cleaner', 'kpi', 'food', 'other')`,
      [],
      'expenses_category_check',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('expenses', (table) => {
    table.dropChecks(['expenses_category_check']);
    table.check(
      `category IN ('tax', 'utility', 'rent', 'salary_payout', 'cleaner', 'other')`,
      [],
      'expenses_category_check',
    );
  });
}

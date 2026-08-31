import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasSectionColumn = await knex.schema.hasColumn('expenses', 'section');

  if (!hasSectionColumn) {
    await knex.schema.alterTable('expenses', (table) => {
      table.string('section', 20).notNullable().defaultTo('ftl');
    });
  }

  // Update check constraints and add performance indexes
  await knex.schema.alterTable('expenses', (table) => {
    table.dropChecks(['expenses_category_check']);
    table.check(
      `category IN ('tax', 'utility', 'rent', 'salary_payout', 'cleaner', 'kpi', 'food', 'other', 'china_warehouse', 'firm_service', 'declarant')`,
      [],
      'expenses_category_check',
    );
    table.check(`section IN ('ftl', 'ltl')`, [], 'expenses_section_check');
    table.index(['section'], 'expenses_section_idx');
    table.index(
      ['section', 'expense_date'],
      'expenses_section_expense_date_idx',
    );
  });

  // Heuristic backfill if any category implies ltl
  await knex.raw(`
    UPDATE expenses
    SET section = 'ltl'
    WHERE category IN ('china_warehouse', 'firm_service', 'declarant')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('expenses', (table) => {
    table.dropIndex(['section'], 'expenses_section_idx');
    table.dropIndex(
      ['section', 'expense_date'],
      'expenses_section_expense_date_idx',
    );
    table.dropChecks(['expenses_category_check', 'expenses_section_check']);
    table.check(
      `category IN ('tax', 'utility', 'rent', 'salary_payout', 'cleaner', 'kpi', 'food', 'other')`,
      [],
      'expenses_category_check',
    );
    table.dropColumn('section');
  });
}

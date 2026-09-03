import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Alter cargo_registrations table
  const hasCargoRegTable = await knex.schema.hasTable('cargo_registrations');
  if (hasCargoRegTable) {
    const hasInternalLogisticsCost = await knex.schema.hasColumn(
      'cargo_registrations',
      'internal_logistics_cost',
    );
    if (!hasInternalLogisticsCost) {
      await knex.schema.alterTable('cargo_registrations', (table) => {
        table
          .decimal('internal_logistics_cost', 14, 2)
          .notNullable()
          .defaultTo(0);
        table
          .string('internal_logistics_currency', 10)
          .notNullable()
          .defaultTo('USD');
      });
    }
  }

  // 2. Alter cargo_transactions table for legacy support
  const hasCargoTxTable = await knex.schema.hasTable('cargo_transactions');
  if (hasCargoTxTable) {
    const hasTxInternalLogisticsCost = await knex.schema.hasColumn(
      'cargo_transactions',
      'internal_logistics_cost',
    );
    if (!hasTxInternalLogisticsCost) {
      await knex.schema.alterTable('cargo_transactions', (table) => {
        table
          .decimal('internal_logistics_cost', 14, 2)
          .notNullable()
          .defaultTo(0);
        table
          .string('internal_logistics_currency', 10)
          .notNullable()
          .defaultTo('USD');
      });
    }
  }

  // 3. Update check constraint on expenses table to allow internal_logistics category
  const hasExpensesTable = await knex.schema.hasTable('expenses');
  if (hasExpensesTable) {
    try {
      await knex.schema.alterTable('expenses', (table) => {
        table.dropChecks(['expenses_category_check']);
        table.check(
          `category IN ('tax', 'utility', 'rent', 'salary_payout', 'cleaner', 'kpi', 'food', 'other', 'china_warehouse', 'firm_service', 'declarant', 'internal_logistics')`,
          [],
          'expenses_category_check',
        );
      });
    } catch {
      // Ignore if table does not have check constraint or in mock DB
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasExpensesTable = await knex.schema.hasTable('expenses');
  if (hasExpensesTable) {
    try {
      await knex.schema.alterTable('expenses', (table) => {
        table.dropChecks(['expenses_category_check']);
        table.check(
          `category IN ('tax', 'utility', 'rent', 'salary_payout', 'cleaner', 'kpi', 'food', 'other', 'china_warehouse', 'firm_service', 'declarant')`,
          [],
          'expenses_category_check',
        );
      });
    } catch {
      // Ignore if constraint does not exist
    }
  }

  const hasCargoTxTable = await knex.schema.hasTable('cargo_transactions');
  if (hasCargoTxTable) {
    const hasTxInternalLogisticsCost = await knex.schema.hasColumn(
      'cargo_transactions',
      'internal_logistics_cost',
    );
    if (hasTxInternalLogisticsCost) {
      await knex.schema.alterTable('cargo_transactions', (table) => {
        table.dropColumn('internal_logistics_cost');
        table.dropColumn('internal_logistics_currency');
      });
    }
  }

  const hasCargoRegTable = await knex.schema.hasTable('cargo_registrations');
  if (hasCargoRegTable) {
    const hasInternalLogisticsCost = await knex.schema.hasColumn(
      'cargo_registrations',
      'internal_logistics_cost',
    );
    if (hasInternalLogisticsCost) {
      await knex.schema.alterTable('cargo_registrations', (table) => {
        table.dropColumn('internal_logistics_cost');
        table.dropColumn('internal_logistics_currency');
      });
    }
  }
}

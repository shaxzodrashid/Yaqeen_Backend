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
}

export async function down(knex: Knex): Promise<void> {
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

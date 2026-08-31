import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Alter cargo_registrations table
  const hasCargoRegTable = await knex.schema.hasTable('cargo_registrations');
  if (hasCargoRegTable) {
    const hasAdditionalExpense = await knex.schema.hasColumn(
      'cargo_registrations',
      'additional_expense',
    );
    if (!hasAdditionalExpense) {
      await knex.schema.alterTable('cargo_registrations', (table) => {
        table.decimal('additional_expense', 14, 2).notNullable().defaultTo(0);
        table
          .string('additional_expense_currency', 10)
          .notNullable()
          .defaultTo('USD');
        table.boolean('is_speed_up').notNullable().defaultTo(false);
        table.decimal('speed_up', 14, 2).notNullable().defaultTo(0);
        table.string('speed_up_currency', 10).notNullable().defaultTo('USD');
        table.decimal('turnkey_price', 14, 2).notNullable().defaultTo(0);
        table.string('turnkey_currency', 10).notNullable().defaultTo('USD');

        table.index(['is_turnkey']);
        table.index(['is_speed_up']);
      });
    }
  }

  // 2. Alter cargo_transactions table for legacy support
  const hasCargoTxTable = await knex.schema.hasTable('cargo_transactions');
  if (hasCargoTxTable) {
    const hasTxAdditionalExpense = await knex.schema.hasColumn(
      'cargo_transactions',
      'additional_expense',
    );
    if (!hasTxAdditionalExpense) {
      const hasTxIsTurnkey = await knex.schema.hasColumn(
        'cargo_transactions',
        'is_turnkey',
      );
      await knex.schema.alterTable('cargo_transactions', (table) => {
        table.decimal('additional_expense', 14, 2).notNullable().defaultTo(0);
        table
          .string('additional_expense_currency', 10)
          .notNullable()
          .defaultTo('USD');
        table.boolean('is_speed_up').notNullable().defaultTo(false);
        table.decimal('speed_up', 14, 2).notNullable().defaultTo(0);
        table.string('speed_up_currency', 10).notNullable().defaultTo('USD');
        if (!hasTxIsTurnkey) {
          table.boolean('is_turnkey').notNullable().defaultTo(false);
        }
        table.decimal('turnkey_price', 14, 2).notNullable().defaultTo(0);
        table.string('turnkey_currency', 10).notNullable().defaultTo('USD');

        table.index(['is_speed_up']);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCargoTxTable = await knex.schema.hasTable('cargo_transactions');
  if (hasCargoTxTable) {
    const hasTxAdditionalExpense = await knex.schema.hasColumn(
      'cargo_transactions',
      'additional_expense',
    );
    if (hasTxAdditionalExpense) {
      await knex.schema.alterTable('cargo_transactions', (table) => {
        table.dropIndex(['is_speed_up']);
        table.dropColumn('additional_expense');
        table.dropColumn('additional_expense_currency');
        table.dropColumn('is_speed_up');
        table.dropColumn('speed_up');
        table.dropColumn('speed_up_currency');
        table.dropColumn('turnkey_price');
        table.dropColumn('turnkey_currency');
      });
    }
  }

  const hasCargoRegTable = await knex.schema.hasTable('cargo_registrations');
  if (hasCargoRegTable) {
    const hasAdditionalExpense = await knex.schema.hasColumn(
      'cargo_registrations',
      'additional_expense',
    );
    if (hasAdditionalExpense) {
      await knex.schema.alterTable('cargo_registrations', (table) => {
        table.dropIndex(['is_turnkey']);
        table.dropIndex(['is_speed_up']);
        table.dropColumn('additional_expense');
        table.dropColumn('additional_expense_currency');
        table.dropColumn('is_speed_up');
        table.dropColumn('speed_up');
        table.dropColumn('speed_up_currency');
        table.dropColumn('turnkey_price');
        table.dropColumn('turnkey_currency');
      });
    }
  }
}

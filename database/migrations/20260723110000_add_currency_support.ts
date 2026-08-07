import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Create currency_rates table for CBU rates history/cache
  await knex.schema.createTable('currency_rates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('code', 10).notNullable(); // USD, RUB, UZS
    table.decimal('rate', 14, 4).notNullable();
    table.integer('nominal').defaultTo(1).notNullable();
    table.decimal('diff', 12, 4).defaultTo(0).notNullable();
    table.string('rate_date', 20);
    table.jsonb('raw_data');
    table.timestamps(true, true);

    table.index(['code'], 'currency_rates_code_idx');
  });

  // 2. Add currency column to expenses table
  await knex.schema.alterTable('expenses', (table) => {
    table.string('currency', 3).defaultTo('UZS').notNullable();
    table.check(
      `currency IN ('UZS', 'USD', 'RUB')`,
      [],
      'expenses_currency_check',
    );
  });

  // 3. Add currency column to cargo_transactions table
  await knex.schema.alterTable('cargo_transactions', (table) => {
    table.string('currency', 3).defaultTo('UZS').notNullable();
    table.check(
      `currency IN ('UZS', 'USD', 'RUB')`,
      [],
      'cargo_transactions_currency_check',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cargo_transactions', (table) => {
    table.dropChecks(['cargo_transactions_currency_check']);
    table.dropColumn('currency');
  });

  await knex.schema.alterTable('expenses', (table) => {
    table.dropChecks(['expenses_currency_check']);
    table.dropColumn('currency');
  });

  await knex.schema.dropTableIfExists('currency_rates');
}

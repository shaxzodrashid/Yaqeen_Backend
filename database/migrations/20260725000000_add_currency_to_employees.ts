import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table) => {
    table.string('currency', 3).defaultTo('UZS').notNullable();
    table.check(
      `currency IN ('UZS', 'USD', 'RUB')`,
      [],
      'employees_currency_check',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table) => {
    table.dropChecks(['employees_currency_check']);
    table.dropColumn('currency');
  });
}

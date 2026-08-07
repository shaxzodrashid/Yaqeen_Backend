import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employee_plans', (table) => {
    table.string('currency', 3).defaultTo('UZS').notNullable();
    table.check(
      `currency IN ('UZS', 'USD', 'RUB')`,
      [],
      'employee_plans_currency_check',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employee_plans', (table) => {
    table.dropChecks(['employee_plans_currency_check']);
    table.dropColumn('currency');
  });
}

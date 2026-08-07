import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Update expenses table check constraint
  await knex.schema.alterTable('expenses', (table) => {
    table.dropChecks(['expenses_currency_check']);
    table.check(
      `currency IN ('UZS', 'USD', 'RUB', 'RMB', 'CNY')`,
      [],
      'expenses_currency_check',
    );
  });

  // 2. Update cargo_transactions table check constraint
  await knex.schema.alterTable('cargo_transactions', (table) => {
    table.dropChecks(['cargo_transactions_currency_check']);
    table.check(
      `currency IN ('UZS', 'USD', 'RUB', 'RMB', 'CNY')`,
      [],
      'cargo_transactions_currency_check',
    );
  });

  // 3. Update employee_plans table check constraint
  await knex.schema.alterTable('employee_plans', (table) => {
    table.dropChecks(['employee_plans_currency_check']);
    table.check(
      `currency IN ('UZS', 'USD', 'RUB', 'RMB', 'CNY')`,
      [],
      'employee_plans_currency_check',
    );
  });

  // 4. Update employees table check constraint
  await knex.schema.alterTable('employees', (table) => {
    table.dropChecks(['employees_currency_check']);
    table.check(
      `currency IN ('UZS', 'USD', 'RUB', 'RMB', 'CNY')`,
      [],
      'employees_currency_check',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table) => {
    table.dropChecks(['employees_currency_check']);
    table.check(
      `currency IN ('UZS', 'USD', 'RUB')`,
      [],
      'employees_currency_check',
    );
  });

  await knex.schema.alterTable('employee_plans', (table) => {
    table.dropChecks(['employee_plans_currency_check']);
    table.check(
      `currency IN ('UZS', 'USD', 'RUB')`,
      [],
      'employee_plans_currency_check',
    );
  });

  await knex.schema.alterTable('cargo_transactions', (table) => {
    table.dropChecks(['cargo_transactions_currency_check']);
    table.check(
      `currency IN ('UZS', 'USD', 'RUB')`,
      [],
      'cargo_transactions_currency_check',
    );
  });

  await knex.schema.alterTable('expenses', (table) => {
    table.dropChecks(['expenses_currency_check']);
    table.check(
      `currency IN ('UZS', 'USD', 'RUB')`,
      [],
      'expenses_currency_check',
    );
  });
}

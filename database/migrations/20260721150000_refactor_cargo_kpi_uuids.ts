import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('ltl_cargo_items').whereNull('employee_id').delete();
  await knex('ftl_fura_items').whereNull('manager_id').delete();
  await knex('rop_worker_sales').whereNull('employee_id').delete();

  await knex.schema.alterTable('ltl_cargo_items', (table) => {
    table.dropColumn('employee_name');
    table.uuid('employee_id').notNullable().alter();
  });

  await knex.schema.alterTable('ftl_fura_items', (table) => {
    table.dropColumn('manager_name');
    table.uuid('manager_id').notNullable().alter();
  });

  await knex.schema.alterTable('rop_worker_sales', (table) => {
    table.dropColumn('worker_name');
    table.uuid('employee_id').notNullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rop_worker_sales', (table) => {
    table.string('worker_name').notNullable().defaultTo('Unknown');
    table.uuid('employee_id').nullable().alter();
  });

  await knex.schema.alterTable('ftl_fura_items', (table) => {
    table.string('manager_name').notNullable().defaultTo('Unknown');
    table.uuid('manager_id').nullable().alter();
  });

  await knex.schema.alterTable('ltl_cargo_items', (table) => {
    table.string('employee_name').notNullable().defaultTo('Unknown');
    table.uuid('employee_id').nullable().alter();
  });
}

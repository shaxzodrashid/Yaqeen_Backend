import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cargo_registrations', (table) => {
    table.index(['purchase_date']);
    table.index(['sell_date']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cargo_registrations', (table) => {
    table.dropIndex(['purchase_date']);
    table.dropIndex(['sell_date']);
  });
}

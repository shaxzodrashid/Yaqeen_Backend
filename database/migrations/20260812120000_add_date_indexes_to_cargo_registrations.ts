import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cargo_registrations', (table) => {
    table.index(['confirmed_date']);
    table.index(['loaded_date']);
    table.index(['arrived_date']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cargo_registrations', (table) => {
    table.dropIndex(['confirmed_date']);
    table.dropIndex(['loaded_date']);
    table.dropIndex(['arrived_date']);
    table.dropIndex(['created_at']);
  });
}

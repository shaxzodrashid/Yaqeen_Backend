import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cargo_transactions', (table) => {
    table.string('status', 50).notNullable().defaultTo('Waiting');
    table.index(['status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cargo_transactions', (table) => {
    table.dropIndex(['status']);
    table.dropColumn('status');
  });
}

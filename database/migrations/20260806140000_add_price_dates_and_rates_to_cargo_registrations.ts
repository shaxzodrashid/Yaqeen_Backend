import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cargo_registrations', (table) => {
    table.date('purchase_date').nullable();
    table.date('sell_date').nullable();
    table.decimal('purchase_usd_rate', 14, 4).nullable();
    table.decimal('sell_usd_rate', 14, 4).nullable();
    table.decimal('purchase_custom_rate', 14, 4).nullable();
    table.decimal('sell_custom_rate', 14, 4).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cargo_registrations', (table) => {
    table.dropColumn('purchase_date');
    table.dropColumn('sell_date');
    table.dropColumn('purchase_usd_rate');
    table.dropColumn('sell_usd_rate');
    table.dropColumn('purchase_custom_rate');
    table.dropColumn('sell_custom_rate');
  });
}

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cargo_registrations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('cargo_type', 10).notNullable(); // LTL or FTL
    table.decimal('volume', 12, 4).nullable();
    table.decimal('weight', 12, 4).nullable();
    table.string('container_type', 50).nullable();
    table.string('container_truck_id', 100).notNullable();
    table.string('agent_name', 255).notNullable();
    table.string('cargo', 255).notNullable();
    table.date('confirmed_date').nullable();
    table.date('loaded_date').nullable();
    table.date('arrived_date').nullable();
    table.decimal('purchase_price', 14, 2).notNullable();
    table.string('purchase_currency', 10).notNullable();
    table.decimal('sell_price', 14, 2).notNullable();
    table.string('sell_currency', 10).notNullable();
    table.decimal('usd_rmb_rate', 14, 4).nullable();
    table.string('status', 50).notNullable().defaultTo('Waiting');
    table.text('description').nullable();

    table
      .uuid('client_id')
      .references('id')
      .inTable('clients')
      .onDelete('RESTRICT')
      .notNullable();

    table
      .uuid('employee_id')
      .references('id')
      .inTable('employees')
      .onDelete('RESTRICT')
      .notNullable();

    table.timestamps(true, true);

    table.index(['status']);
    table.index(['employee_id']);
    table.index(['client_id']);
    table.index(['cargo_type']);
    table.index(['container_truck_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cargo_registrations');
}

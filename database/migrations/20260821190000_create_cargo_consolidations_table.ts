import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Create cargo_consolidations table
  await knex.schema.createTable('cargo_consolidations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('consolidation_code', 50).notNullable().unique();
    table.string('container_truck_id', 100).notNullable();
    table.string('container_type', 50).nullable();
    table.decimal('max_volume_capacity', 12, 4).nullable();
    table.decimal('max_weight_capacity', 12, 4).nullable();
    table.string('carrier_name', 255).nullable();
    table.string('carrier_phone', 50).nullable();
    table.string('origin_place', 255).nullable();
    table.string('destination_place', 255).nullable();
    table.date('loaded_date').nullable();
    table.date('departure_date').nullable();
    table.date('estimated_arrival_date').nullable();
    table.date('arrived_date').nullable();
    table.decimal('total_carrier_cost', 14, 2).notNullable().defaultTo(0);
    table.string('carrier_cost_currency', 10).notNullable().defaultTo('USD');
    table.decimal('carrier_cost_usd_rate', 14, 4).nullable();
    table.string('status', 50).notNullable().defaultTo('Planning');
    table.text('description').nullable();
    table
      .uuid('created_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL')
      .nullable();
    table.timestamps(true, true);

    table.index(['status']);
    table.index(['container_truck_id']);
    table.index(['consolidation_code']);
    table.index(['departure_date']);
    table.index(['arrived_date']);
    table.index(['created_at']);
  });

  // 2. Add consolidation_id foreign key column to cargo_registrations table
  await knex.schema.alterTable('cargo_registrations', (table) => {
    table
      .uuid('consolidation_id')
      .references('id')
      .inTable('cargo_consolidations')
      .onDelete('SET NULL')
      .nullable();
    table.index(['consolidation_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cargo_registrations', (table) => {
    table.dropColumn('consolidation_id');
  });
  await knex.schema.dropTableIfExists('cargo_consolidations');
}

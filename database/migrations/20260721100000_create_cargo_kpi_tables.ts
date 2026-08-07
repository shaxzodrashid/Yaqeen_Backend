import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ltl_cargo_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('employee_id')
      .references('id')
      .inTable('employees')
      .onDelete('SET NULL')
      .nullable();
    table.string('employee_name').notNullable();
    table.decimal('volume', 12, 4).notNullable();
    table.decimal('weight', 12, 4).notNullable();
    table.string('cargo_type', 50).notNullable().defaultTo('oddiy');
    table.timestamps(true, true);
  });

  await knex.schema.createTable('ftl_fura_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('manager_id')
      .references('id')
      .inTable('employees')
      .onDelete('SET NULL')
      .nullable();
    table.string('manager_name').notNullable();
    table.string('month', 7).notNullable(); // YYYY-MM
    table.decimal('agent_price', 12, 2).notNullable().defaultTo(0.0);
    table.decimal('sell_price', 12, 2).notNullable().defaultTo(0.0);
    table.decimal('profit', 12, 2).notNullable().defaultTo(0.0);
    table.integer('planned_days').notNullable().defaultTo(20);
    table.integer('actual_days').notNullable().defaultTo(20);
    table.boolean('kpi_received').notNullable().defaultTo(false);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('rop_worker_sales', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('employee_id')
      .references('id')
      .inTable('employees')
      .onDelete('SET NULL')
      .nullable();
    table.string('worker_name').notNullable();
    table.decimal('sales_amount', 12, 2).notNullable().defaultTo(0.0);
    table.string('month', 7).nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('rop_truck_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('truck_number').notNullable();
    table.decimal('profit', 12, 2).notNullable().defaultTo(0.0);
    table.string('month', 7).nullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('rop_truck_items');
  await knex.schema.dropTableIfExists('rop_worker_sales');
  await knex.schema.dropTableIfExists('ftl_fura_items');
  await knex.schema.dropTableIfExists('ltl_cargo_items');
}

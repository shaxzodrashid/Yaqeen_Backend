import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cargo_registrations', (table) => {
    // Composite indexes for fast filtering and ordering combinations
    table.index(['status', 'created_at'], 'idx_cargo_reg_status_created_at');
    table.index(
      ['cargo_type', 'created_at'],
      'idx_cargo_reg_cargo_type_created_at',
    );
    table.index(
      ['employee_id', 'created_at'],
      'idx_cargo_reg_employee_created_at',
    );
    table.index(['client_id', 'created_at'], 'idx_cargo_reg_client_created_at');
    table.index(
      ['status', 'purchase_date'],
      'idx_cargo_reg_status_purchase_date',
    );
    table.index(['status', 'sell_date'], 'idx_cargo_reg_status_sell_date');
  });

  // Expression indexes for case-insensitive search
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_cargo_reg_lower_truck_id ON cargo_registrations (LOWER(container_truck_id));
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_cargo_reg_lower_cargo ON cargo_registrations (LOWER(cargo));
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_cargo_reg_lower_cargo;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_cargo_reg_lower_truck_id;`);

  await knex.schema.alterTable('cargo_registrations', (table) => {
    table.dropIndex(
      ['status', 'created_at'],
      'idx_cargo_reg_status_created_at',
    );
    table.dropIndex(
      ['cargo_type', 'created_at'],
      'idx_cargo_reg_cargo_type_created_at',
    );
    table.dropIndex(
      ['employee_id', 'created_at'],
      'idx_cargo_reg_employee_created_at',
    );
    table.dropIndex(
      ['client_id', 'created_at'],
      'idx_cargo_reg_client_created_at',
    );
    table.dropIndex(
      ['status', 'purchase_date'],
      'idx_cargo_reg_status_purchase_date',
    );
    table.dropIndex(['status', 'sell_date'], 'idx_cargo_reg_status_sell_date');
  });
}

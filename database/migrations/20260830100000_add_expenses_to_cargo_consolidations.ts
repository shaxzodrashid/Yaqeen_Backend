import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasAgent = await knex.schema.hasColumn('cargo_consolidations', 'agent');
  if (!hasAgent) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.decimal('agent', 14, 2).notNullable().defaultTo(0);
    });
  }

  const hasChinaWarehouse = await knex.schema.hasColumn(
    'cargo_consolidations',
    'china_warehouse',
  );
  if (!hasChinaWarehouse) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.decimal('china_warehouse', 14, 2).notNullable().defaultTo(0);
    });
  }

  const hasCompanyService = await knex.schema.hasColumn(
    'cargo_consolidations',
    'company_service',
  );
  if (!hasCompanyService) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.decimal('company_service', 14, 2).notNullable().defaultTo(0);
    });
  }

  const hasCustomsClearance = await knex.schema.hasColumn(
    'cargo_consolidations',
    'customs_clearance_of_goods',
  );
  if (!hasCustomsClearance) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table
        .decimal('customs_clearance_of_goods', 14, 2)
        .notNullable()
        .defaultTo(0);
    });
  }

  const hasCct = await knex.schema.hasColumn('cargo_consolidations', 'cct');
  if (!hasCct) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.decimal('cct', 14, 2).notNullable().defaultTo(0);
    });
  }

  // Backfill agent from total_carrier_cost for existing consolidations
  await knex.raw(`
    UPDATE cargo_consolidations
    SET agent = total_carrier_cost
    WHERE (agent = 0 OR agent IS NULL) AND total_carrier_cost > 0;
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasCct = await knex.schema.hasColumn('cargo_consolidations', 'cct');
  if (hasCct) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('cct');
    });
  }

  const hasCustomsClearance = await knex.schema.hasColumn(
    'cargo_consolidations',
    'customs_clearance_of_goods',
  );
  if (hasCustomsClearance) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('customs_clearance_of_goods');
    });
  }

  const hasCompanyService = await knex.schema.hasColumn(
    'cargo_consolidations',
    'company_service',
  );
  if (hasCompanyService) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('company_service');
    });
  }

  const hasChinaWarehouse = await knex.schema.hasColumn(
    'cargo_consolidations',
    'china_warehouse',
  );
  if (hasChinaWarehouse) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('china_warehouse');
    });
  }

  const hasAgent = await knex.schema.hasColumn('cargo_consolidations', 'agent');
  if (hasAgent) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('agent');
    });
  }
}

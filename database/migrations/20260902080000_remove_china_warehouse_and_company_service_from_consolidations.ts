import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasChinaWarehouse = await knex.schema.hasColumn(
    'cargo_consolidations',
    'china_warehouse',
  );
  if (hasChinaWarehouse) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('china_warehouse');
    });
  }

  const hasChinaWarehouseCurr = await knex.schema.hasColumn(
    'cargo_consolidations',
    'china_warehouse_currency',
  );
  if (hasChinaWarehouseCurr) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('china_warehouse_currency');
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

  const hasCompanyServiceCurr = await knex.schema.hasColumn(
    'cargo_consolidations',
    'company_service_currency',
  );
  if (hasCompanyServiceCurr) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('company_service_currency');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasChinaWarehouse = await knex.schema.hasColumn(
    'cargo_consolidations',
    'china_warehouse',
  );
  if (!hasChinaWarehouse) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.decimal('china_warehouse', 14, 2).notNullable().defaultTo(0);
    });
  }

  const hasChinaWarehouseCurr = await knex.schema.hasColumn(
    'cargo_consolidations',
    'china_warehouse_currency',
  );
  if (!hasChinaWarehouseCurr) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table
        .string('china_warehouse_currency', 10)
        .notNullable()
        .defaultTo('USD');
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

  const hasCompanyServiceCurr = await knex.schema.hasColumn(
    'cargo_consolidations',
    'company_service_currency',
  );
  if (!hasCompanyServiceCurr) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table
        .string('company_service_currency', 10)
        .notNullable()
        .defaultTo('USD');
    });
  }
}

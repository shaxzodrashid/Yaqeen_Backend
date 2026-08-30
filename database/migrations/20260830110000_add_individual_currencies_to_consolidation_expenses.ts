import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasAgentCurr = await knex.schema.hasColumn(
    'cargo_consolidations',
    'agent_currency',
  );
  if (!hasAgentCurr) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.string('agent_currency', 10).notNullable().defaultTo('USD');
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

  const hasCustomsClearanceCurr = await knex.schema.hasColumn(
    'cargo_consolidations',
    'customs_clearance_of_goods_currency',
  );
  if (!hasCustomsClearanceCurr) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table
        .string('customs_clearance_of_goods_currency', 10)
        .notNullable()
        .defaultTo('USD');
    });
  }

  const hasCctCurr = await knex.schema.hasColumn(
    'cargo_consolidations',
    'cct_currency',
  );
  if (!hasCctCurr) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.string('cct_currency', 10).notNullable().defaultTo('USD');
    });
  }

  // Backfill agent_currency from carrier_cost_currency for existing records
  await knex.raw(`
    UPDATE cargo_consolidations
    SET agent_currency = carrier_cost_currency
    WHERE carrier_cost_currency IS NOT NULL AND carrier_cost_currency != 'USD';
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasCctCurr = await knex.schema.hasColumn(
    'cargo_consolidations',
    'cct_currency',
  );
  if (hasCctCurr) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('cct_currency');
    });
  }

  const hasCustomsClearanceCurr = await knex.schema.hasColumn(
    'cargo_consolidations',
    'customs_clearance_of_goods_currency',
  );
  if (hasCustomsClearanceCurr) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('customs_clearance_of_goods_currency');
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

  const hasChinaWarehouseCurr = await knex.schema.hasColumn(
    'cargo_consolidations',
    'china_warehouse_currency',
  );
  if (hasChinaWarehouseCurr) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('china_warehouse_currency');
    });
  }

  const hasAgentCurr = await knex.schema.hasColumn(
    'cargo_consolidations',
    'agent_currency',
  );
  if (hasAgentCurr) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('agent_currency');
    });
  }
}

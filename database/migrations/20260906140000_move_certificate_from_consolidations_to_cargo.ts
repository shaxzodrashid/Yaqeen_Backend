import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Remove cct and cct_currency from cargo_consolidations
  const hasConsTable = await knex.schema.hasTable('cargo_consolidations');
  if (hasConsTable) {
    const hasCct = await knex.schema.hasColumn('cargo_consolidations', 'cct');
    if (hasCct) {
      await knex.schema.alterTable('cargo_consolidations', (table) => {
        table.dropColumn('cct');
      });
    }

    const hasCctCurr = await knex.schema.hasColumn(
      'cargo_consolidations',
      'cct_currency',
    );
    if (hasCctCurr) {
      await knex.schema.alterTable('cargo_consolidations', (table) => {
        table.dropColumn('cct_currency');
      });
    }
  }

  // 2. Add certificate_price and certificate_currency to cargo_registrations
  const hasCargoRegTable = await knex.schema.hasTable('cargo_registrations');
  if (hasCargoRegTable) {
    const hasCertPrice = await knex.schema.hasColumn(
      'cargo_registrations',
      'certificate_price',
    );
    if (!hasCertPrice) {
      await knex.schema.alterTable('cargo_registrations', (table) => {
        table.decimal('certificate_price', 14, 2).notNullable().defaultTo(0);
        table.string('certificate_currency', 10).notNullable().defaultTo('USD');
      });
    }
  }

  // 3. Add certificate_price and certificate_currency to cargo_transactions (legacy archive)
  const hasCargoTxTable = await knex.schema.hasTable('cargo_transactions');
  if (hasCargoTxTable) {
    const hasTxCertPrice = await knex.schema.hasColumn(
      'cargo_transactions',
      'certificate_price',
    );
    if (!hasTxCertPrice) {
      await knex.schema.alterTable('cargo_transactions', (table) => {
        table.decimal('certificate_price', 14, 2).notNullable().defaultTo(0);
        table.string('certificate_currency', 10).notNullable().defaultTo('USD');
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // 1. Drop certificate_price and certificate_currency from cargo_transactions
  const hasCargoTxTable = await knex.schema.hasTable('cargo_transactions');
  if (hasCargoTxTable) {
    const hasTxCertPrice = await knex.schema.hasColumn(
      'cargo_transactions',
      'certificate_price',
    );
    if (hasTxCertPrice) {
      await knex.schema.alterTable('cargo_transactions', (table) => {
        table.dropColumn('certificate_price');
        table.dropColumn('certificate_currency');
      });
    }
  }

  // 2. Drop certificate_price and certificate_currency from cargo_registrations
  const hasCargoRegTable = await knex.schema.hasTable('cargo_registrations');
  if (hasCargoRegTable) {
    const hasCertPrice = await knex.schema.hasColumn(
      'cargo_registrations',
      'certificate_price',
    );
    if (hasCertPrice) {
      await knex.schema.alterTable('cargo_registrations', (table) => {
        table.dropColumn('certificate_price');
        table.dropColumn('certificate_currency');
      });
    }
  }

  // 3. Re-add cct and cct_currency to cargo_consolidations
  const hasConsTable = await knex.schema.hasTable('cargo_consolidations');
  if (hasConsTable) {
    const hasCct = await knex.schema.hasColumn('cargo_consolidations', 'cct');
    if (!hasCct) {
      await knex.schema.alterTable('cargo_consolidations', (table) => {
        table.decimal('cct', 14, 2).notNullable().defaultTo(0);
        table.string('cct_currency', 10).notNullable().defaultTo('USD');
      });
    }
  }
}

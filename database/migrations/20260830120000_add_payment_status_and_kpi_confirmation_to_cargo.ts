import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Alter cargo_registrations table
  const hasCargoRegTable = await knex.schema.hasTable('cargo_registrations');
  if (hasCargoRegTable) {
    const hasPaymentStatus = await knex.schema.hasColumn(
      'cargo_registrations',
      'payment_status',
    );
    if (!hasPaymentStatus) {
      await knex.schema.alterTable('cargo_registrations', (table) => {
        table.string('payment_status', 50).notNullable().defaultTo('waiting');
        table.integer('payment_deadline_days').nullable().defaultTo(15);
        table.boolean('is_kpi_received').notNullable().defaultTo(false);
        table.timestamp('kpi_received_at').nullable();
        table.index(['payment_status']);
        table.index(['is_kpi_received']);
      });
    }
  }

  // 2. Alter cargo_transactions table
  const hasCargoTxTable = await knex.schema.hasTable('cargo_transactions');
  if (hasCargoTxTable) {
    const hasTxPaymentStatus = await knex.schema.hasColumn(
      'cargo_transactions',
      'payment_status',
    );
    if (!hasTxPaymentStatus) {
      await knex.schema.alterTable('cargo_transactions', (table) => {
        table.string('payment_status', 50).notNullable().defaultTo('waiting');
        table.integer('payment_deadline_days').nullable().defaultTo(15);
        table.boolean('is_kpi_received').notNullable().defaultTo(false);
        table.timestamp('kpi_received_at').nullable();
        table.index(['payment_status']);
        table.index(['is_kpi_received']);
      });
    }
  }

  // 3. Alter sales_manager_evaluations table
  const hasEvalTable = await knex.schema.hasTable('sales_manager_evaluations');
  if (hasEvalTable) {
    const hasPaidSalesBonus = await knex.schema.hasColumn(
      'sales_manager_evaluations',
      'paid_sales_bonus_amount',
    );
    if (!hasPaidSalesBonus) {
      await knex.schema.alterTable('sales_manager_evaluations', (table) => {
        table
          .decimal('paid_sales_bonus_amount', 12, 2)
          .notNullable()
          .defaultTo(0.0);
        table
          .decimal('unpaid_sales_bonus_amount', 12, 2)
          .notNullable()
          .defaultTo(0.0);
        table.integer('paid_cargos_count').notNullable().defaultTo(0);
        table.integer('unpaid_cargos_count').notNullable().defaultTo(0);
        table.integer('waiting_cargos_count').notNullable().defaultTo(0);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasEvalTable = await knex.schema.hasTable('sales_manager_evaluations');
  if (hasEvalTable) {
    const hasPaidSalesBonus = await knex.schema.hasColumn(
      'sales_manager_evaluations',
      'paid_sales_bonus_amount',
    );
    if (hasPaidSalesBonus) {
      await knex.schema.alterTable('sales_manager_evaluations', (table) => {
        table.dropColumn('paid_sales_bonus_amount');
        table.dropColumn('unpaid_sales_bonus_amount');
        table.dropColumn('paid_cargos_count');
        table.dropColumn('unpaid_cargos_count');
        table.dropColumn('waiting_cargos_count');
      });
    }
  }

  const hasCargoTxTable = await knex.schema.hasTable('cargo_transactions');
  if (hasCargoTxTable) {
    const hasTxPaymentStatus = await knex.schema.hasColumn(
      'cargo_transactions',
      'payment_status',
    );
    if (hasTxPaymentStatus) {
      await knex.schema.alterTable('cargo_transactions', (table) => {
        table.dropIndex(['payment_status']);
        table.dropIndex(['is_kpi_received']);
        table.dropColumn('payment_status');
        table.dropColumn('payment_deadline_days');
        table.dropColumn('is_kpi_received');
        table.dropColumn('kpi_received_at');
      });
    }
  }

  const hasCargoRegTable = await knex.schema.hasTable('cargo_registrations');
  if (hasCargoRegTable) {
    const hasPaymentStatus = await knex.schema.hasColumn(
      'cargo_registrations',
      'payment_status',
    );
    if (hasPaymentStatus) {
      await knex.schema.alterTable('cargo_registrations', (table) => {
        table.dropIndex(['payment_status']);
        table.dropIndex(['is_kpi_received']);
        table.dropColumn('payment_status');
        table.dropColumn('payment_deadline_days');
        table.dropColumn('is_kpi_received');
        table.dropColumn('kpi_received_at');
      });
    }
  }
}

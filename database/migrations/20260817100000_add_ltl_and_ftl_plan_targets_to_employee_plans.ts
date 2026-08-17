import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employee_plans', (table) => {
    table.decimal('ltl_target_volume', 12, 4).defaultTo(0).notNullable();
    table.decimal('ftl_target_amount', 14, 2).defaultTo(0).notNullable();
    table.decimal('target_amount', 14, 2).nullable().alter();
    table.string('currency', 10).defaultTo('USD').alter();
  });

  // Backfill ftl_target_amount from target_amount for existing records
  await knex.raw(`
    UPDATE employee_plans
    SET ftl_target_amount = COALESCE(target_amount, 0)
    WHERE ftl_target_amount = 0 AND target_amount IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employee_plans', (table) => {
    table.string('currency', 3).defaultTo('UZS').alter();
    table.dropColumn('ltl_target_volume');
    table.dropColumn('ftl_target_amount');
  });
}

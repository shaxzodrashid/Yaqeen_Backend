import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Add career_level and mentees_count to employees table if not present
  const hasCareerLevel = await knex.schema.hasColumn(
    'employees',
    'career_level',
  );
  if (!hasCareerLevel) {
    await knex.schema.table('employees', (table) => {
      table.string('career_level', 20).notNullable().defaultTo('JUNIOR'); // JUNIOR, MID, SENIOR, EXPERT
      table.integer('mentees_count').notNullable().defaultTo(0);
    });
  }

  // 2. Create sales_manager_evaluations table
  const hasTable = await knex.schema.hasTable('sales_manager_evaluations');
  if (!hasTable) {
    await knex.schema.createTable('sales_manager_evaluations', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table
        .uuid('employee_id')
        .references('id')
        .inTable('employees')
        .onDelete('CASCADE')
        .notNullable();
      table.string('month', 7).notNullable(); // YYYY-MM
      table.string('career_level', 20).notNullable(); // JUNIOR, MID, SENIOR, EXPERT
      table.decimal('fixed_salary', 12, 2).notNullable().defaultTo(0.0);
      table.decimal('total_sales', 12, 2).notNullable().defaultTo(0.0);
      table.integer('deal_count').notNullable().defaultTo(0);
      table.decimal('average_check', 12, 2).notNullable().defaultTo(0.0);
      table.decimal('plan_target_min', 12, 2).notNullable().defaultTo(0.0);
      table.decimal('plan_target_max', 12, 2).notNullable().defaultTo(0.0);
      table.decimal('sr_check_min', 12, 2).notNullable().defaultTo(0.0);
      table.decimal('sr_check_target', 12, 2).notNullable().defaultTo(0.0);
      table.boolean('is_plan_achieved').notNullable().defaultTo(false);
      table.boolean('is_sr_check_achieved').notNullable().defaultTo(false);
      table.decimal('sales_bonus_rate', 5, 2).notNullable().defaultTo(0.0); // e.g. 15.00 for 15%
      table.decimal('sales_bonus_amount', 12, 2).notNullable().defaultTo(0.0);
      table.decimal('kpi_bonus_amount', 12, 2).notNullable().defaultTo(0.0);
      table
        .decimal('additional_bonus_amount', 12, 2)
        .notNullable()
        .defaultTo(0.0);
      table.decimal('total_earnings', 12, 2).notNullable().defaultTo(0.0);
      table.integer('consecutive_successes').notNullable().defaultTo(0);
      table.integer('consecutive_failures').notNullable().defaultTo(0);
      table.string('approval_status', 50).notNullable().defaultTo('APPROVED');
      // APPROVED, PENDING_SR_CHECK_APPROVAL, DEMOTION_PENDING_REVIEW, DEMOTION_APPROVED, DEMOTION_REJECTED
      table
        .uuid('reviewed_by')
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
        .nullable();
      table.text('review_notes').nullable();
      table.timestamps(true, true);

      table.unique(['employee_id', 'month']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sales_manager_evaluations');

  const hasCareerLevel = await knex.schema.hasColumn(
    'employees',
    'career_level',
  );
  if (hasCareerLevel) {
    await knex.schema.table('employees', (table) => {
      table.dropColumn('career_level');
      table.dropColumn('mentees_count');
    });
  }
}

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('kpi_alerts');
  if (!hasTable) {
    await knex.schema.createTable('kpi_alerts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('month', 7).notNullable(); // YYYY-MM
      table
        .uuid('employee_id')
        .references('id')
        .inTable('employees')
        .onDelete('CASCADE')
        .notNullable();
      table
        .uuid('evaluation_id')
        .references('id')
        .inTable('sales_manager_evaluations')
        .onDelete('SET NULL')
        .nullable();
      table.string('alert_type', 40).notNullable();
      // PROMOTION_SUGGESTION, DEMOTION_SUGGESTION, SR_CHECK_PENDING, MONTH_END_KPI_UPDATE
      table.string('status', 30).notNullable().defaultTo('PENDING');
      // PENDING, APPROVED, REJECTED, MAINTAINED, DISMISSED
      table.string('title', 255).notNullable();
      table.text('message').notNullable();
      table.string('current_level', 20).notNullable();
      table.string('suggested_level', 20).nullable();
      table.decimal('current_salary', 12, 2).notNullable().defaultTo(0.0);
      table.decimal('suggested_salary', 12, 2).nullable();
      table.decimal('approved_salary', 12, 2).nullable();
      table.jsonb('metrics').nullable();
      table
        .uuid('reviewed_by')
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
        .nullable();
      table.text('review_notes').nullable();
      table.timestamp('reviewed_at', { useTz: true }).nullable();
      table.boolean('is_dismissed').notNullable().defaultTo(false);
      table.timestamps(true, true);

      table.index(['month', 'status']);
      table.index(['employee_id', 'month']);
      table.index(['alert_type', 'status']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('kpi_alerts');
}

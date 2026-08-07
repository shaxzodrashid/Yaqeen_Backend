import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Add dynamic status properties & permissions to kanban_columns table
  await knex.schema.alterTable('kanban_columns', (table) => {
    table.jsonb('allowed_roles').nullable(); // e.g. ["CEO", "ROP"]
    table.string('color', 30).nullable(); // e.g. "#10B981"
    table.boolean('is_done_status').defaultTo(false).notNullable();
  });

  // 2. Add enhancement columns to tasks table
  await knex.schema.alterTable('tasks', (table) => {
    table.string('priority', 20).defaultTo('MEDIUM').notNullable();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('target_time').nullable();
    table.boolean('target_time_notified').defaultTo(false).notNullable();
  });

  // 3. Create task_assignees junction table for multi-employee assignment
  await knex.schema.createTable('task_assignees', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('task_id')
      .references('id')
      .inTable('tasks')
      .onDelete('CASCADE')
      .notNullable();
    table
      .uuid('employee_id')
      .references('id')
      .inTable('employees')
      .onDelete('CASCADE')
      .notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.unique(['task_id', 'employee_id']);
  });

  // 4. Create task_checklists table for rich interactive checklist support
  await knex.schema.createTable('task_checklists', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('task_id')
      .references('id')
      .inTable('tasks')
      .onDelete('CASCADE')
      .notNullable();
    table.string('title', 255).notNullable();
    table.boolean('is_completed').defaultTo(false).notNullable();
    table.integer('position').defaultTo(0).notNullable();
    table.timestamps(true, true);
  });

  // 5. Create task_activity_logs table for management audit trail & edition tracking
  await knex.schema.createTable('task_activity_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('task_id')
      .references('id')
      .inTable('tasks')
      .onDelete('CASCADE')
      .notNullable();
    table
      .uuid('user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL')
      .nullable();
    table.string('action', 50).notNullable();
    table.text('details').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('task_activity_logs');
  await knex.schema.dropTableIfExists('task_checklists');
  await knex.schema.dropTableIfExists('task_assignees');

  await knex.schema.alterTable('tasks', (table) => {
    table.dropColumn('target_time_notified');
    table.dropColumn('target_time');
    table.dropColumn('completed_at');
    table.dropColumn('started_at');
    table.dropColumn('priority');
  });

  await knex.schema.alterTable('kanban_columns', (table) => {
    table.dropColumn('is_done_status');
    table.dropColumn('color');
    table.dropColumn('allowed_roles');
  });
}

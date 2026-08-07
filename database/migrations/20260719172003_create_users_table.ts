import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('employee_id')
      .references('id')
      .inTable('employees')
      .onDelete('SET NULL')
      .unique();
    table.string('username', 100).unique().notNullable();
    table.string('password_hash', 255).notNullable();
    table.string('role', 20).notNullable();
    table.boolean('is_active').defaultTo(true).notNullable();
    table.timestamps(true, true);

    // Add check constraint for role
    table.check(`role IN ('CEO', 'ROP', 'EMPLOYEE')`, [], 'users_role_check');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}

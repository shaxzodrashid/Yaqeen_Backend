import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('employees', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('phone', 20).notNullable();
    table.string('secondary_phone', 20);
    table.text('address');
    table
      .uuid('department_id')
      .references('id')
      .inTable('departments')
      .onDelete('RESTRICT')
      .notNullable();
    table.decimal('fixed_salary', 12, 2).defaultTo(0.0).notNullable();
    table.string('color', 7).defaultTo('#CCCCCC').notNullable();
    table.text('picture_url');
    table.boolean('is_active').defaultTo(true).notNullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('employees');
}

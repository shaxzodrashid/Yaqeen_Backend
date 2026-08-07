import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Alter users table
  await knex.schema.alterTable('users', (table) => {
    table.string('phone_number', 20).unique().nullable();
    table.string('status', 20).defaultTo('Pending').notNullable();
    table.string('username', 100).nullable().alter();
    table.string('password_hash', 255).nullable().alter();

    // Add check constraint for status
    table.check(
      "status IN ('Pending', 'Open', 'Banned', 'Deleted')",
      [],
      'users_status_check',
    );
  });

  // Create telegram_contacts table
  await knex.schema.createTable('telegram_contacts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('chat_id', 100).unique().notNullable();
    table.string('phone_number', 50).unique().notNullable();
    table.string('first_name', 100);
    table.string('last_name', 100);
    table.string('username', 100);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop telegram_contacts table
  await knex.schema.dropTableIfExists('telegram_contacts');

  // Drop status constraint using raw sql to avoid Knex TypeScript type issues
  await knex.raw(
    'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check',
  );

  // Revert changes on users table
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('status');
    table.dropColumn('phone_number');
    table.string('username', 100).notNullable().alter();
    table.string('password_hash', 255).notNullable().alter();
  });
}

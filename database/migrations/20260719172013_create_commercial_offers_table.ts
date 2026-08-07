import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('commercial_offers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('offer_number', 50).unique().notNullable();
    table
      .uuid('client_id')
      .references('id')
      .inTable('clients')
      .onDelete('SET NULL');
    table.string('client_name', 100).notNullable();
    table.string('client_company', 200).notNullable();
    table.string('origin', 100).notNullable();
    table.string('destination', 100).notNullable();
    table.text('cargo_description');
    table.decimal('cargo_weight', 10, 2);
    table.decimal('cargo_volume', 10, 2);
    table.decimal('price_usd', 12, 2).notNullable();
    table.decimal('price_local', 18, 2).notNullable();
    table.jsonb('inclusions');
    table.jsonb('exclusions');
    table.text('terms');
    table.string('status', 20).notNullable();
    table
      .uuid('created_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamps(true, true);

    table.check(
      `status IN ('draft', 'sent', 'accepted', 'rejected')`,
      [],
      'commercial_offers_status_check',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('commercial_offers');
}

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Create cities / locations master table
  const hasCitiesTable = await knex.schema.hasTable('cities');
  if (!hasCitiesTable) {
    await knex.schema.createTable('cities', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.integer('geoname_id').nullable().unique();
      table.string('name', 255).notNullable();
      table.string('ascii_name', 255).nullable();
      table.string('country_name', 100).nullable();
      table.string('country_code', 10).nullable();
      table.string('admin1_name', 255).nullable();
      table.decimal('latitude', 10, 7).nullable();
      table.decimal('longitude', 10, 7).nullable();
      table.string('timezone', 100).nullable();
      table.bigint('population').nullable();
      table.timestamps(true, true);

      table.index(['country_code']);
      table.index(['name']);
    });

    // Lowercase expression indexes for fast case-insensitive lookups
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_cities_lower_name ON cities (LOWER(name));
      CREATE INDEX IF NOT EXISTS idx_cities_lower_ascii ON cities (LOWER(ascii_name));
    `);
  }

  // 2. Add origin and destination columns to cargo_registrations
  const hasCargoRegTable = await knex.schema.hasTable('cargo_registrations');
  if (hasCargoRegTable) {
    await knex.schema.alterTable('cargo_registrations', (table) => {
      table.string('origin_city', 255).nullable();
      table.string('origin_country', 100).nullable();
      table.string('origin_country_code', 10).nullable();
      table.integer('origin_geoname_id').nullable();
      table.decimal('origin_lat', 10, 7).nullable();
      table.decimal('origin_lng', 10, 7).nullable();

      table.string('destination_city', 255).nullable();
      table.string('destination_country', 100).nullable();
      table.string('destination_country_code', 10).nullable();
      table.integer('destination_geoname_id').nullable();
      table.decimal('destination_lat', 10, 7).nullable();
      table.decimal('destination_lng', 10, 7).nullable();

      table.index(['origin_geoname_id']);
      table.index(['destination_geoname_id']);
      table.index(['origin_city', 'destination_city']);
    });

    // Expression indexes for case-insensitive search
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_cargo_reg_lower_origin_city ON cargo_registrations (LOWER(origin_city));
      CREATE INDEX IF NOT EXISTS idx_cargo_reg_lower_dest_city ON cargo_registrations (LOWER(destination_city));
    `);
  }

  // 3. Add geoname metadata to cargo_consolidations (origin_place and destination_place already exist)
  const hasCargoConsTable = await knex.schema.hasTable('cargo_consolidations');
  if (hasCargoConsTable) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.string('origin_country', 100).nullable();
      table.string('origin_country_code', 10).nullable();
      table.integer('origin_geoname_id').nullable();
      table.decimal('origin_lat', 10, 7).nullable();
      table.decimal('origin_lng', 10, 7).nullable();

      table.string('destination_country', 100).nullable();
      table.string('destination_country_code', 10).nullable();
      table.integer('destination_geoname_id').nullable();
      table.decimal('destination_lat', 10, 7).nullable();
      table.decimal('destination_lng', 10, 7).nullable();

      table.index(['origin_geoname_id']);
      table.index(['destination_geoname_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCargoConsTable = await knex.schema.hasTable('cargo_consolidations');
  if (hasCargoConsTable) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('origin_country');
      table.dropColumn('origin_country_code');
      table.dropColumn('origin_geoname_id');
      table.dropColumn('origin_lat');
      table.dropColumn('origin_lng');

      table.dropColumn('destination_country');
      table.dropColumn('destination_country_code');
      table.dropColumn('destination_geoname_id');
      table.dropColumn('destination_lat');
      table.dropColumn('destination_lng');
    });
  }

  const hasCargoRegTable = await knex.schema.hasTable('cargo_registrations');
  if (hasCargoRegTable) {
    await knex.raw(`
      DROP INDEX IF EXISTS idx_cargo_reg_lower_origin_city;
      DROP INDEX IF EXISTS idx_cargo_reg_lower_dest_city;
    `);

    await knex.schema.alterTable('cargo_registrations', (table) => {
      table.dropColumn('origin_city');
      table.dropColumn('origin_country');
      table.dropColumn('origin_country_code');
      table.dropColumn('origin_geoname_id');
      table.dropColumn('origin_lat');
      table.dropColumn('origin_lng');

      table.dropColumn('destination_city');
      table.dropColumn('destination_country');
      table.dropColumn('destination_country_code');
      table.dropColumn('destination_geoname_id');
      table.dropColumn('destination_lat');
      table.dropColumn('destination_lng');
    });
  }

  await knex.raw(`
    DROP INDEX IF EXISTS idx_cities_lower_name;
    DROP INDEX IF EXISTS idx_cities_lower_ascii;
  `);
  await knex.schema.dropTableIfExists('cities');
}

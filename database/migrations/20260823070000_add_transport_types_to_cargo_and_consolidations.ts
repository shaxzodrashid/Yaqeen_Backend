import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Add transport_types array column to cargo_consolidations table
  const hasConsolidationTransportTypes = await knex.schema.hasColumn(
    'cargo_consolidations',
    'transport_types',
  );
  if (!hasConsolidationTransportTypes) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table
        .specificType('transport_types', 'text[]')
        .notNullable()
        .defaultTo(knex.raw("ARRAY['auto']::text[]"));
    });
  }

  // 2. Add transport_types array column to cargo_registrations table
  const hasRegistrationTransportTypes = await knex.schema.hasColumn(
    'cargo_registrations',
    'transport_types',
  );
  if (!hasRegistrationTransportTypes) {
    await knex.schema.alterTable('cargo_registrations', (table) => {
      table
        .specificType('transport_types', 'text[]')
        .notNullable()
        .defaultTo(knex.raw("ARRAY['auto']::text[]"));
    });
  }

  // 3. Add high-performance GIN indexes for array lookups and overlap queries
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_cargo_consolidations_transport_types ON cargo_consolidations USING GIN (transport_types);',
  );
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_cargo_registrations_transport_types ON cargo_registrations USING GIN (transport_types);',
  );

  // 4. Heuristic backfill for existing historical records based on container_type and container_truck_id
  await knex.raw(`
    UPDATE cargo_registrations
    SET transport_types = CASE
      WHEN lower(COALESCE(container_type, '')) ~ '(air|avia|plane|flight)'
        OR lower(COALESCE(container_truck_id, '')) ~ 'air'
        THEN ARRAY['air']::text[]
      WHEN lower(COALESCE(container_type, '')) ~ '(rail|train|poezd|temir|20gp|40gp|40hq|40hc|45hq|45hc)'
        THEN ARRAY['railway']::text[]
      WHEN lower(COALESCE(container_type, '')) ~ '(sea|ship|vessel|ocean|dengiz|marine|port)'
        THEN ARRAY['sea']::text[]
      ELSE ARRAY['auto']::text[]
    END;
  `);

  await knex.raw(`
    UPDATE cargo_consolidations
    SET transport_types = CASE
      WHEN lower(COALESCE(container_type, '')) ~ '(air|avia|plane|flight)'
        OR lower(COALESCE(container_truck_id, '')) ~ 'air'
        THEN ARRAY['air']::text[]
      WHEN lower(COALESCE(container_type, '')) ~ '(rail|train|poezd|temir|20gp|40gp|40hq|40hc|45hq|45hc)'
        THEN ARRAY['railway']::text[]
      WHEN lower(COALESCE(container_type, '')) ~ '(sea|ship|vessel|ocean|dengiz|marine|port)'
        THEN ARRAY['sea']::text[]
      ELSE ARRAY['auto']::text[]
    END;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    'DROP INDEX IF EXISTS idx_cargo_registrations_transport_types;',
  );
  await knex.raw(
    'DROP INDEX IF EXISTS idx_cargo_consolidations_transport_types;',
  );

  const hasRegistrationTransportTypes = await knex.schema.hasColumn(
    'cargo_registrations',
    'transport_types',
  );
  if (hasRegistrationTransportTypes) {
    await knex.schema.alterTable('cargo_registrations', (table) => {
      table.dropColumn('transport_types');
    });
  }

  const hasConsolidationTransportTypes = await knex.schema.hasColumn(
    'cargo_consolidations',
    'transport_types',
  );
  if (hasConsolidationTransportTypes) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('transport_types');
    });
  }
}

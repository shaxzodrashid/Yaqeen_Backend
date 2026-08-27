import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Add load_code and is_turnkey to cargo_registrations table
  const hasLoadCode = await knex.schema.hasColumn(
    'cargo_registrations',
    'load_code',
  );
  if (!hasLoadCode) {
    await knex.schema.alterTable('cargo_registrations', (table) => {
      table.string('load_code', 100).nullable();
    });
  }

  const hasIsTurnkey = await knex.schema.hasColumn(
    'cargo_registrations',
    'is_turnkey',
  );
  if (!hasIsTurnkey) {
    await knex.schema.alterTable('cargo_registrations', (table) => {
      table.boolean('is_turnkey').notNullable().defaultTo(false);
    });
  }

  // 2. Add load_date, border_arrival_date, tashkent_arrival_date to cargo_consolidations table
  const hasLoadDate = await knex.schema.hasColumn(
    'cargo_consolidations',
    'load_date',
  );
  if (!hasLoadDate) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.date('load_date').nullable();
    });
  }

  const hasBorderArrivalDate = await knex.schema.hasColumn(
    'cargo_consolidations',
    'border_arrival_date',
  );
  if (!hasBorderArrivalDate) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.date('border_arrival_date').nullable();
    });
  }

  const hasTashkentArrivalDate = await knex.schema.hasColumn(
    'cargo_consolidations',
    'tashkent_arrival_date',
  );
  if (!hasTashkentArrivalDate) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.date('tashkent_arrival_date').nullable();
    });
  }

  // 3. Backfill load_date from loaded_date for existing consolidations
  await knex.raw(`
    UPDATE cargo_consolidations
    SET load_date = loaded_date
    WHERE load_date IS NULL AND loaded_date IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasTashkentArrivalDate = await knex.schema.hasColumn(
    'cargo_consolidations',
    'tashkent_arrival_date',
  );
  if (hasTashkentArrivalDate) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('tashkent_arrival_date');
    });
  }

  const hasBorderArrivalDate = await knex.schema.hasColumn(
    'cargo_consolidations',
    'border_arrival_date',
  );
  if (hasBorderArrivalDate) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('border_arrival_date');
    });
  }

  const hasLoadDate = await knex.schema.hasColumn(
    'cargo_consolidations',
    'load_date',
  );
  if (hasLoadDate) {
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.dropColumn('load_date');
    });
  }

  const hasIsTurnkey = await knex.schema.hasColumn(
    'cargo_registrations',
    'is_turnkey',
  );
  if (hasIsTurnkey) {
    await knex.schema.alterTable('cargo_registrations', (table) => {
      table.dropColumn('is_turnkey');
    });
  }

  const hasLoadCode = await knex.schema.hasColumn(
    'cargo_registrations',
    'load_code',
  );
  if (hasLoadCode) {
    await knex.schema.alterTable('cargo_registrations', (table) => {
      table.dropColumn('load_code');
    });
  }
}

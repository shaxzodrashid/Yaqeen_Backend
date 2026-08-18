import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Migrate existing cargo registration status values to new statuses:
  // 'Waiting' -> 'Waiting' (unchanged)
  // 'In Transit' -> 'On the way'
  // 'Border' -> 'On the border'
  // 'At Station' -> 'Station'
  // 'Delivered' -> 'Arrived'
  // New status: 'Reload'
  const hasTable = await knex.schema.hasTable('cargo_registrations');
  if (hasTable) {
    await knex('cargo_registrations')
      .where('status', 'In Transit')
      .update({ status: 'On the way' });

    await knex('cargo_registrations')
      .where('status', 'Border')
      .update({ status: 'On the border' });

    await knex('cargo_registrations')
      .where('status', 'At Station')
      .update({ status: 'Station' });

    await knex('cargo_registrations')
      .where('status', 'Delivered')
      .update({ status: 'Arrived' });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('cargo_registrations');
  if (hasTable) {
    await knex('cargo_registrations')
      .where('status', 'On the way')
      .update({ status: 'In Transit' });

    await knex('cargo_registrations')
      .where('status', 'On the border')
      .update({ status: 'Border' });

    await knex('cargo_registrations')
      .where('status', 'Station')
      .update({ status: 'At Station' });

    await knex('cargo_registrations')
      .where('status', 'Arrived')
      .update({ status: 'Delivered' });
  }
}

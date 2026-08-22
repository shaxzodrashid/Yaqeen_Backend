import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('cargo_consolidations');
  if (hasTable) {
    // 1. Migrate existing status values
    await knex('cargo_consolidations')
      .where('status', 'Planning')
      .update({ status: 'Waiting' });

    await knex('cargo_consolidations')
      .where('status', 'Loading')
      .update({ status: 'Waiting' });

    await knex('cargo_consolidations')
      .where('status', 'Completed')
      .update({ status: 'Arrived' });

    // 2. Alter column default to 'Waiting'
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.string('status', 50).notNullable().defaultTo('Waiting').alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('cargo_consolidations');
  if (hasTable) {
    // 1. Revert default to 'Planning'
    await knex.schema.alterTable('cargo_consolidations', (table) => {
      table.string('status', 50).notNullable().defaultTo('Planning').alter();
    });

    // 2. Revert statuses back to historical defaults
    await knex('cargo_consolidations')
      .where('status', 'Waiting')
      .update({ status: 'Planning' });
  }
}

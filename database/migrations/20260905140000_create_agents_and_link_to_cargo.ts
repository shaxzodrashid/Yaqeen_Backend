import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Create agents table if not exists
  const hasAgentsTable = await knex.schema.hasTable('agents');
  if (!hasAgentsTable) {
    await knex.schema.createTable('agents', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('first_name', 100).nullable();
      table.string('last_name', 100).nullable();
      table.string('phone_number', 50).nullable();
      table.string('email', 255).nullable();
      table.string('company_name', 255).nullable();
      table.jsonb('company_names').notNullable().defaultTo('[]');
      table.text('notes').nullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamps(true, true);

      table.index(['first_name']);
      table.index(['last_name']);
      table.index(['company_name']);
      table.index(['phone_number']);
      table.index(['email']);
      table.index(['is_active']);
      table.index(['created_at']);
    });
  }

  // 2. Add agent_id to cargo_registrations and make agent_name nullable
  const hasCargoRegTable = await knex.schema.hasTable('cargo_registrations');
  if (hasCargoRegTable) {
    const hasAgentId = await knex.schema.hasColumn(
      'cargo_registrations',
      'agent_id',
    );
    if (!hasAgentId) {
      await knex.schema.alterTable('cargo_registrations', (table) => {
        table
          .uuid('agent_id')
          .references('id')
          .inTable('agents')
          .onDelete('SET NULL')
          .nullable();
        table.index(['agent_id']);
      });
    }

    // Make agent_name nullable so selecting an agent without explicit raw agent_name is supported
    await knex.raw(`
      ALTER TABLE cargo_registrations ALTER COLUMN agent_name DROP NOT NULL;
    `);
  }

  // 3. Add agent_id to cargo_consolidations
  const hasCargoConsTable = await knex.schema.hasTable('cargo_consolidations');
  if (hasCargoConsTable) {
    const hasConsAgentId = await knex.schema.hasColumn(
      'cargo_consolidations',
      'agent_id',
    );
    if (!hasConsAgentId) {
      await knex.schema.alterTable('cargo_consolidations', (table) => {
        table
          .uuid('agent_id')
          .references('id')
          .inTable('agents')
          .onDelete('SET NULL')
          .nullable();
        table.index(['agent_id']);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCargoConsTable = await knex.schema.hasTable('cargo_consolidations');
  if (hasCargoConsTable) {
    const hasConsAgentId = await knex.schema.hasColumn(
      'cargo_consolidations',
      'agent_id',
    );
    if (hasConsAgentId) {
      await knex.schema.alterTable('cargo_consolidations', (table) => {
        table.dropColumn('agent_id');
      });
    }
  }

  const hasCargoRegTable = await knex.schema.hasTable('cargo_registrations');
  if (hasCargoRegTable) {
    const hasAgentId = await knex.schema.hasColumn(
      'cargo_registrations',
      'agent_id',
    );
    if (hasAgentId) {
      await knex.schema.alterTable('cargo_registrations', (table) => {
        table.dropColumn('agent_id');
      });
    }

    await knex.raw(`
      UPDATE cargo_registrations SET agent_name = 'Unknown Agent' WHERE agent_name IS NULL;
      ALTER TABLE cargo_registrations ALTER COLUMN agent_name SET NOT NULL;
    `);
  }

  await knex.schema.dropTableIfExists('agents');
}

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasRolesTable = await knex.schema.hasTable('roles');
  if (!hasRolesTable) return;

  const hasColumn = await knex.schema.hasColumn('roles', 'is_plan_settable');
  if (!hasColumn) {
    await knex.schema.alterTable('roles', (table) => {
      table.boolean('is_plan_settable').notNullable().defaultTo(false);
      table.index(['is_plan_settable']);
    });

    // Mark default operational and sales roles as plan-settable
    await knex('roles')
      .whereIn('name', [
        'EMPLOYEE',
        'ROP',
        'Sales Manager',
        'SALES_MANAGER',
        'sales_manager',
      ])
      .update({ is_plan_settable: true });

    // Synchronize cargo_kpi.plan_settable in permissions JSON for plan-settable roles
    const planSettableRoles = await knex('roles')
      .where('is_plan_settable', true)
      .select('id', 'permissions');

    for (const r of planSettableRoles) {
      let perms: Record<string, any> = {};
      if (typeof r.permissions === 'string') {
        try {
          perms = JSON.parse(r.permissions);
        } catch {
          perms = {};
        }
      } else if (r.permissions && typeof r.permissions === 'object') {
        perms = { ...r.permissions };
      }

      if (!perms.cargo_kpi) {
        perms.cargo_kpi = {};
      }
      perms.cargo_kpi.plan_settable = true;

      await knex('roles')
        .where('id', r.id)
        .update({
          permissions: JSON.stringify(perms),
        });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasRolesTable = await knex.schema.hasTable('roles');
  if (!hasRolesTable) return;

  const hasColumn = await knex.schema.hasColumn('roles', 'is_plan_settable');
  if (hasColumn) {
    await knex.schema.alterTable('roles', (table) => {
      table.dropColumn('is_plan_settable');
    });
  }
}

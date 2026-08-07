import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Create roles table
  await knex.schema.createTable('roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 100).unique().notNullable();
    table.string('display_name', 100).notNullable();
    table.text('description');
    table.jsonb('permissions').defaultTo('{}').notNullable();
    table.boolean('is_system').defaultTo(false).notNullable();
    table.timestamps(true, true);
  });

  // 2. Define default module permissions for system roles
  const fullPermissions = {
    clients: { create: true, read: true, update: true, delete: true },
    employees: { create: true, read: true, update: true, delete: true },
    departments: { create: true, read: true, update: true, delete: true },
    cargo_kpi: { create: true, read: true, update: true, delete: true },
    finance: { create: true, read: true, update: true, delete: true },
    commercial_offers: { create: true, read: true, update: true, delete: true },
    tasks: { create: true, read: true, update: true, delete: true },
    currency: { create: true, read: true, update: true, delete: true },
    attachments: { create: true, read: true, update: true, delete: true },
    roles: { create: true, read: true, update: true, delete: true },
  };

  const ropPermissions = {
    clients: { create: true, read: true, update: true, delete: true },
    employees: { create: false, read: true, update: true, delete: false },
    departments: { create: false, read: true, update: false, delete: false },
    cargo_kpi: { create: true, read: true, update: true, delete: true },
    finance: { create: false, read: true, update: false, delete: false },
    commercial_offers: { create: true, read: true, update: true, delete: true },
    tasks: { create: true, read: true, update: true, delete: true },
    currency: { create: false, read: true, update: false, delete: false },
    attachments: { create: true, read: true, update: true, delete: true },
    roles: { create: false, read: true, update: false, delete: false },
  };

  const employeePermissions = {
    clients: { create: false, read: true, update: true, delete: false },
    employees: { create: false, read: true, update: false, delete: false },
    departments: { create: false, read: true, update: false, delete: false },
    cargo_kpi: { create: false, read: true, update: false, delete: false },
    finance: { create: false, read: false, update: false, delete: false },
    commercial_offers: {
      create: true,
      read: true,
      update: false,
      delete: false,
    },
    tasks: { create: true, read: true, update: true, delete: false },
    currency: { create: false, read: true, update: false, delete: false },
    attachments: { create: true, read: true, update: false, delete: false },
    roles: { create: false, read: false, update: false, delete: false },
  };

  interface SystemRole {
    id: string;
    name: string;
    display_name: string;
    description: string;
    permissions: unknown;
    is_system: boolean;
  }

  // Seed system roles
  const ceoRoles = await knex<SystemRole>('roles')
    .insert({
      name: 'CEO',
      display_name: 'Chief Executive Officer',
      description:
        'Full administrative access to all modules and system settings',
      permissions: JSON.stringify(fullPermissions),
      is_system: true,
    })
    .returning('*');
  const ceoRole = ceoRoles[0];

  const ropRoles = await knex<SystemRole>('roles')
    .insert({
      name: 'ROP',
      display_name: 'Head of Sales / Operations',
      description: 'Department head level access for operations and sales',
      permissions: JSON.stringify(ropPermissions),
      is_system: true,
    })
    .returning('*');
  const ropRole = ropRoles[0];

  const employeeRoles = await knex<SystemRole>('roles')
    .insert({
      name: 'EMPLOYEE',
      display_name: 'Standard Employee',
      description: 'Standard operational user access',
      permissions: JSON.stringify(employeePermissions),
      is_system: true,
    })
    .returning('*');
  const employeeRole = employeeRoles[0];

  // 3. Update users table with role_id reference and drop check constraint
  await knex.schema.alterTable('users', (table) => {
    table
      .uuid('role_id')
      .references('id')
      .inTable('roles')
      .onDelete('RESTRICT');
  });

  await knex.raw(
    'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check',
  );

  // 4. Populate role_id for existing users
  if (ceoRole) {
    await knex('users').where('role', 'CEO').update({ role_id: ceoRole.id });
  }
  if (ropRole) {
    await knex('users').where('role', 'ROP').update({ role_id: ropRole.id });
  }
  if (employeeRole) {
    await knex('users')
      .where((builder) => {
        builder.where('role', 'EMPLOYEE').orWhereNull('role_id');
      })
      .update({ role_id: employeeRole.id });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('role_id');
  });

  await knex.schema.dropTableIfExists('roles');
}

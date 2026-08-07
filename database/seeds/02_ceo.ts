import { Knex } from 'knex';
import * as bcrypt from 'bcryptjs';

interface DepartmentRecord {
  id: string;
  name: string;
  display_name?: string;
}

interface RoleRecord {
  id: string;
  name: string;
}

interface EmployeeRecord {
  id: string;
  first_name?: string;
  last_name?: string;
  phone: string;
  department_id?: string;
  color?: string;
  fixed_salary?: number;
  currency?: string;
  is_active?: boolean;
}

interface UserRecord {
  id: string;
  phone_number: string;
}

export async function seed(knex: Knex): Promise<void> {
  // 1. Ensure Administration department exists
  let adminDept = await knex<DepartmentRecord>('departments')
    .where({ name: 'administration' })
    .first();
  if (!adminDept) {
    const inserted = await knex<DepartmentRecord>('departments')
      .insert({
        name: 'administration',
        display_name: 'Administration',
      })
      .returning('*');
    adminDept = inserted[0];
  }

  // 2. Ensure CEO role exists (it is created in migration, but let's query it)
  const ceoRole = await knex<RoleRecord>('roles')
    .where({ name: 'CEO' })
    .first();
  if (!ceoRole) {
    throw new Error('CEO role not found in database. Run migrations first.');
  }

  // 3. Ensure CEO employee exists
  const ceoPhone = '+998330094112';
  const normalizedPhone = '998330094112';

  if (!adminDept) {
    throw new Error('Administration department could not be created or found.');
  }

  let ceoEmp = await knex<EmployeeRecord>('employees')
    .where({ phone: ceoPhone })
    .first();
  if (!ceoEmp) {
    const inserted = await knex<EmployeeRecord>('employees')
      .insert({
        first_name: 'Shaxzod',
        last_name: 'Rashiov',
        phone: ceoPhone,
        department_id: adminDept.id,
        color: '#000000',
        fixed_salary: 0.0,
        currency: 'UZS',
        is_active: true,
      })
      .returning('*');
    ceoEmp = inserted[0];
  }

  if (!ceoEmp) {
    throw new Error('CEO employee could not be created or found.');
  }

  // 4. Ensure CEO user account exists
  const ceoUser = await knex<UserRecord>('users')
    .where({ phone_number: normalizedPhone })
    .first();
  if (!ceoUser) {
    const passwordHash = await bcrypt.hash('Yaqeen2026!', 10);
    await knex('users').insert({
      employee_id: ceoEmp.id,
      phone_number: normalizedPhone,
      username: normalizedPhone,
      password_hash: passwordHash,
      role_id: ceoRole.id,
      role: 'CEO',
      status: 'Open',
      is_active: true,
    });
  }
}

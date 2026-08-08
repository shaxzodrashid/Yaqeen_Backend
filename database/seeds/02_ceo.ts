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
  updated_at?: unknown;
}

interface UserRecord {
  id: string;
  employee_id?: string;
  phone_number?: string;
  username?: string;
  password_hash?: string;
  role_id?: string;
  role?: string;
  status?: string;
  is_active?: boolean;
  updated_at?: unknown;
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

  if (!adminDept) {
    throw new Error('Administration department could not be created or found.');
  }

  // 2. Ensure CEO role exists (it is created in migration, but query it)
  const ceoRole = await knex<RoleRecord>('roles')
    .where({ name: 'CEO' })
    .first();
  if (!ceoRole) {
    throw new Error('CEO role not found in database. Run migrations first.');
  }

  const phoneWithPlus = '+998330094112';
  const phoneNormalized = '998330094112';

  // 3. Upsert CEO employee (check phone number first)
  let ceoEmp = await knex<EmployeeRecord>('employees')
    .whereIn('phone', [phoneWithPlus, phoneNormalized])
    .first();

  const employeeData = {
    first_name: 'Shaxzod',
    last_name: 'Rashidov',
    phone: phoneWithPlus,
    department_id: adminDept.id,
    color: '#000000',
    fixed_salary: 0.0,
    currency: 'UZS',
    is_active: true,
  };

  if (ceoEmp) {
    const [updated] = await knex<EmployeeRecord>('employees')
      .where({ id: ceoEmp.id })
      .update({
        ...employeeData,
        updated_at: knex.fn.now(),
      })
      .returning('*');
    ceoEmp = updated || ceoEmp;
  } else {
    const [inserted] = await knex<EmployeeRecord>('employees')
      .insert(employeeData)
      .returning('*');
    ceoEmp = inserted;
  }

  if (!ceoEmp) {
    throw new Error('CEO employee record could not be created or updated.');
  }

  // 4. Upsert CEO user account (check phone number / username / employee_id first)
  const ceoUser = await knex<UserRecord>('users')
    .whereIn('phone_number', [phoneNormalized, phoneWithPlus])
    .orWhereIn('username', [phoneNormalized, phoneWithPlus])
    .orWhere({ employee_id: ceoEmp.id })
    .first();

  if (ceoUser) {
    await knex('users').where({ id: ceoUser.id }).update({
      employee_id: ceoEmp.id,
      phone_number: phoneNormalized,
      username: phoneNormalized,
      role_id: ceoRole.id,
      role: 'CEO',
      status: 'Open',
      is_active: true,
      updated_at: knex.fn.now(),
    });
  } else {
    const passwordHash = await bcrypt.hash('Yaqeen2026!', 10);
    await knex('users').insert({
      employee_id: ceoEmp.id,
      phone_number: phoneNormalized,
      username: phoneNormalized,
      password_hash: passwordHash,
      role_id: ceoRole.id,
      role: 'CEO',
      status: 'Open',
      is_active: true,
    });
  }
}

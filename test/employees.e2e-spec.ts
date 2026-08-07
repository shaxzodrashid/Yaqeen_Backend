import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { KNEX_CONNECTION } from '../src/database/database.module';
import { Knex } from 'knex';
import * as jwt from 'jsonwebtoken';
import { MinioService } from '../src/minio/minio.service';

describe('Employees and Departments (e2e)', () => {
  let app: INestApplication<App>;
  let knex: Knex;
  let jwtSecret: string;

  // Mock users
  const ceoUserId = '11111111-1111-1111-1111-111111111111';
  const ropUserId = '22222222-2222-2222-2222-222222222222';
  const empUserId = '33333333-3333-3333-3333-333333333333';

  let ceoToken: string;
  let ropToken: string;
  let empToken: string;

  let testDeptId: string;
  let testEmployeeId: string;

  const mockMinioService = {
    onModuleInit: jest.fn().mockResolvedValue(undefined),
    ensureBucketExists: jest.fn().mockResolvedValue(undefined),
    uploadFile: jest.fn().mockResolvedValue('dummy-path'),
    getPresignedUrl: jest.fn().mockResolvedValue('http://dummy-presigned-url'),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MinioService)
      .useValue(mockMinioService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.enableShutdownHooks();
    await app.init();

    knex = app.get<Knex>(KNEX_CONNECTION);
    jwtSecret =
      process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';

    // Generate tokens
    ceoToken = jwt.sign(
      { sub: ceoUserId, phone_number: '998991112233', role: 'CEO' },
      jwtSecret,
    );
    ropToken = jwt.sign(
      { sub: ropUserId, phone_number: '998991112244', role: 'ROP' },
      jwtSecret,
    );
    empToken = jwt.sign(
      { sub: empUserId, phone_number: '998991112255', role: 'EMPLOYEE' },
      jwtSecret,
    );

    // Clean up potentially dirty state
    await cleanDb();

    // Insert mock users into DB
    await knex('users').insert([
      {
        id: ceoUserId,
        phone_number: '998991112233',
        username: 'ceo_user',
        password_hash: 'hash',
        role: 'CEO',
        status: 'Open',
        is_active: true,
      },
      {
        id: ropUserId,
        phone_number: '998991112244',
        username: 'rop_user',
        password_hash: 'hash',
        role: 'ROP',
        status: 'Open',
        is_active: true,
      },
      {
        id: empUserId,
        phone_number: '998991112255',
        username: 'emp_user',
        password_hash: 'hash',
        role: 'EMPLOYEE',
        status: 'Open',
        is_active: true,
      },
    ]);
  });

  afterAll(async () => {
    await cleanDb();
    if (app) {
      await app.close();
    }
  });

  const cleanDb = async () => {
    if (!knex) return;
    await knex('attachments').del();
    await knex('cargo_transactions').del();
    await knex('clients').del();
    await knex('employee_plans').del();
    await knex('ltl_cargo_items').del();
    await knex('ftl_fura_items').del();
    await knex('rop_worker_sales').del();
    await knex('rop_truck_items').del();
    await knex('users').whereIn('id', [ceoUserId, ropUserId, empUserId]).del();
    await knex('users').where('phone_number', '998990001111').del();
    await knex('employees').where('phone', '+998990001111').del();
    await knex('employees').where('phone', '+998991112255').del();
    await knex('departments').where('name', 'test-logistics').del();
  };

  // ==========================================
  // DEPARTMENTS TEST SUITE
  // ==========================================
  describe('Departments Management', () => {
    it('POST /departments (CEO) - Should create a department', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          name: 'test-logistics',
          display_name: 'Test Logistics',
        });

      expect(response.status).toBe(HttpStatus.CREATED);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('test-logistics');
      testDeptId = response.body.id;
    });

    it('POST /departments (EMPLOYEE) - Should return 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${empToken}`)
        .send({
          name: 'unauthorized-dept',
          display_name: 'Unauthorized',
        });

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('GET /departments - Should return list of departments', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/departments')
        .set('Authorization', `Bearer ${empToken}`);

      expect(response.status).toBe(HttpStatus.OK);
      expect(Array.isArray(response.body)).toBe(true);
      const testDept = response.body.find((d: any) => d.id === testDeptId);
      expect(testDept).toBeDefined();
    });
  });

  // ==========================================
  // EMPLOYEES TEST SUITE
  // ==========================================
  describe('Employees Management', () => {
    it('POST /employees (EMPLOYEE) - Should return 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${empToken}`)
        .send({
          first_name: 'Jane',
          last_name: 'Doe',
          phone: '+998990001111',
          department_id: testDeptId,
          role: 'EMPLOYEE',
        });

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('POST /employees (CEO) - Should create employee and link user', async () => {
      // We will create an employee whose phone is 998991112255 (which belongs to mock user empUserId)
      // This will verify that the user gets linked automatically!
      const response = await request(app.getHttpServer())
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          first_name: 'John',
          last_name: 'Doe',
          phone: '+998991112255',
          department_id: testDeptId,
          role: 'EMPLOYEE',
          fixed_salary: '1200.50',
          color: '#FF5733',
        });

      expect(response.status).toBe(HttpStatus.CREATED);
      expect(response.body).toHaveProperty('id');
      expect(response.body.first_name).toBe('John');
      testEmployeeId = response.body.id;

      // Verify that the user account was linked
      const linkedUser = await knex('users').where('id', empUserId).first();
      expect(linkedUser.employee_id).toBe(testEmployeeId);
    });

    it('GET /employees/me (EMPLOYEE) - Should return own profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/employees/me')
        .set('Authorization', `Bearer ${empToken}`);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.id).toBe(testEmployeeId);
      expect(response.body.first_name).toBe('John');
      expect(response.body.department_name).toBe('test-logistics');
    });

    it('GET /employees/:id (Another Employee) - Should return 403 Forbidden', async () => {
      // Simulate another employee trying to access John Doe's profile
      const anotherEmpToken = jwt.sign(
        {
          sub: 'different-user-id',
          phone_number: '998991112266',
          role: 'EMPLOYEE',
        },
        jwtSecret,
      );

      const response = await request(app.getHttpServer())
        .get(`/api/v1/employees/${testEmployeeId}`)
        .set('Authorization', `Bearer ${anotherEmpToken}`);

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('GET /employees (CEO) - Should return list of employees with search', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/employees?search=John')
        .set('Authorization', `Bearer ${ceoToken}`);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveProperty('items');
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.items[0].first_name).toBe('John');
    });

    it('PUT /employees/:id - Should update and sync deactivation', async () => {
      // Deactivate employee and verify user account status turns into Banned
      const response = await request(app.getHttpServer())
        .put(`/api/v1/employees/${testEmployeeId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          is_active: false,
        });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.is_active).toBe(false);

      const updatedUser = await knex('users').where('id', empUserId).first();
      expect(updatedUser.is_active).toBe(false);
      expect(updatedUser.status).toBe('Banned');
    });

    it('POST /employees/me/picture (EMPLOYEE) - Should upload profile picture successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/employees/me/picture')
        .set('Authorization', `Bearer ${empToken}`)
        .attach('file', Buffer.from('fake-image-bytes'), {
          filename: 'profile.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(HttpStatus.CREATED);
      expect(response.body).toHaveProperty('picture_url');
      expect(response.body.picture_url).toBe('http://dummy-presigned-url');
    });

    it('GET /employees/me (EMPLOYEE) - Should return profile picture URL', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/employees/me')
        .set('Authorization', `Bearer ${empToken}`);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.picture_url).toBe('http://dummy-presigned-url');
      expect(response.body.employee.picture_url).toBe(
        'http://dummy-presigned-url',
      );
    });

    it('POST /employees/:id/picture (Invalid File Type) - Should return 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/employees/${testEmployeeId}/picture`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .attach('file', Buffer.from('echo dangerous'), {
          filename: 'script.sh',
          contentType: 'application/x-sh',
        });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('DELETE /employees/me/picture (EMPLOYEE) - Should remove profile picture', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/v1/employees/me/picture')
        .set('Authorization', `Bearer ${empToken}`);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.picture_url).toBeNull();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { KNEX_CONNECTION } from '../src/database/database.module';
import { Knex } from 'knex';
import * as jwt from 'jsonwebtoken';
import { MinioService } from '../src/minio/minio.service';
import { CustomExceptionFilter } from '../src/common/filters/custom-exception.filter';

jest.setTimeout(60000);

describe('Clients API (e2e)', () => {
  let app: INestApplication<App>;
  let knex: Knex;
  let jwtSecret: string;

  const ceoUserId = '11111111-1111-1111-1111-111111111111';
  const empUserId = '33333333-3333-3333-3333-333333333333';
  const customUserId = '44444444-4444-4444-4444-444444444444';

  let ceoToken: string;
  let empToken: string;
  let customToken: string;

  let testEmployeeId: string;
  let otherEmployeeId: string;
  let testClientId: string;
  let unassignedClientId: string;
  let customRoleId: string;

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
    app.useGlobalFilters(new CustomExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.enableShutdownHooks();
    await app.init();

    knex = app.get<Knex>(KNEX_CONNECTION);
    jwtSecret =
      process.env.JWT_SECRET || 'super_secret_key_change_me_in_production';

    ceoToken = jwt.sign(
      { sub: ceoUserId, phone_number: '998991112233', role: 'CEO' },
      jwtSecret,
    );
    empToken = jwt.sign(
      { sub: empUserId, phone_number: '998991112255', role: 'EMPLOYEE' },
      jwtSecret,
    );
    customToken = jwt.sign(
      { sub: customUserId, phone_number: '998991112266', role: 'CUSTOM_LEAD' },
      jwtSecret,
    );

    await cleanDb();

    // Create a dummy department and employee to test assignment
    const [dept] = await knex('departments')
      .insert({ name: 'Sales Dept', display_name: 'Sales Dept' })
      .returning('*');

    const [emp] = await knex('employees')
      .insert({
        first_name: 'Jasur',
        last_name: 'Yoldoshev',
        phone: '+998901112233',
        department_id: dept.id,
        color: '#FF0000',
      })
      .returning('*');
    testEmployeeId = emp.id;

    const [emp2] = await knex('employees')
      .insert({
        first_name: 'Bobur',
        last_name: 'Karimov',
        phone: '+998901112244',
        department_id: dept.id,
        color: '#00FF00',
      })
      .returning('*');
    otherEmployeeId = emp2.id;

    // Create custom role with can_work_with_all_clients: true
    const [customRole] = await knex('roles')
      .insert({
        name: 'CUSTOM_LEAD',
        display_name: 'Custom Team Lead',
        description: 'Lead with full client view',
        is_system: false,
        permissions: JSON.stringify({
          clients: {
            create: true,
            read: true,
            update: true,
            delete: true,
            can_work_with_all_clients: true,
          },
        }),
      })
      .returning('*');
    customRoleId = customRole.id;

    await knex('users').insert([
      {
        id: ceoUserId,
        phone_number: '998991112233',
        username: 'ceo_user_client_test',
        password_hash: 'hash',
        role: 'CEO',
        status: 'Open',
        is_active: true,
      },
      {
        id: empUserId,
        phone_number: '998991112255',
        username: 'emp_user_client_test',
        password_hash: 'hash',
        role: 'EMPLOYEE',
        employee_id: testEmployeeId,
        status: 'Open',
        is_active: true,
      },
      {
        id: customUserId,
        phone_number: '998991112266',
        username: 'custom_lead_test',
        password_hash: 'hash',
        role: 'CUSTOM_LEAD',
        role_id: customRoleId,
        employee_id: otherEmployeeId,
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

  async function cleanDb() {
    if (!knex) return;
    await knex('attachments').delete();
    await knex('cargo_registrations').delete();
    await knex('commercial_offers').delete();
    await knex('cargo_transactions').delete();
    await knex('employee_plans').delete();
    await knex('ltl_cargo_items').delete();
    await knex('ftl_fura_items').delete();
    await knex('rop_worker_sales').delete();
    await knex('rop_truck_items').delete();
    await knex('clients').delete();
    await knex('users')
      .whereIn('id', [ceoUserId, empUserId, customUserId])
      .delete();
    await knex('employees').delete();
    await knex('departments').delete();
    if (customRoleId) {
      await knex('roles').where('id', customRoleId).delete();
    }
  }

  describe('POST /api/v1/clients', () => {
    it('should fail creation if user is standard EMPLOYEE (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${empToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Client',
          phone: '+998901234567',
          company_name: 'Test Co',
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail if assigned employee does not exist (404 assigned_employee_not_found)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Client',
          phone: '+998901234500',
          company_name: 'Test Co',
          assigned_employee_id: '00000000-0000-4000-8000-000000000000',
        })
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.location).toBe('assigned_employee_not_found');
    });

    it('should create a new client successfully with assigned employee and inherit employee color tag', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          first_name: 'Mijoz1',
          last_name: 'Familiya1',
          phone: '+998901234567',
          company_name: 'Orient Cargo LLC',
          address: 'Tashkent',
          assigned_employee_id: testEmployeeId,
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.id).toBeDefined();
      expect(res.body.first_name).toBe('Mijoz1');
      expect(res.body.effective_color).toBe('#FF0000'); // inherited from assigned employee
      expect(res.body.assigned_employee.id).toBe(testEmployeeId);

      testClientId = res.body.id;
    });

    it('should create an unassigned client with default unassigned gray color tag (#808080)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          first_name: 'MijozUnassigned',
          last_name: 'FamiliyaUnassigned',
          phone: '+998909998877',
          company_name: 'Unassigned Co LLC',
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.id).toBeDefined();
      expect(res.body.assigned_employee).toBeNull();
      expect(res.body.effective_color).toBe('#808080'); // default unassigned gray

      unassignedClientId = res.body.id;
    });

    it('should fail to create another client with duplicate phone number (400 client_phone_exists)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          first_name: 'Mijoz2',
          last_name: 'Familiya2',
          phone: '+998901234567', // same digits, normalized check
          company_name: 'Another LLC',
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.location).toBe('client_phone_exists');
    });
  });

  describe('GET /api/v1/clients Permissions: can_work_with_all_clients', () => {
    it('should list only assigned clients for EMPLOYEE (can_work_with_all_clients: false)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${empToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.data[0].id).toBe(testClientId);
    });

    it('should list all clients for CEO (can_work_with_all_clients: true)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.total).toBe(2);
    });

    it('should list all clients for CUSTOM_LEAD with can_work_with_all_clients: true', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${customToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.total).toBe(2);
    });

    it('should filter clients by search term', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/clients?search=Orient')
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
    });

    it('should filter clients by inherited effective color', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/clients?color=%23FF0000')
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(testClientId);
    });

    it('should filter unassigned clients by default unassigned color (#808080)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/clients?color=%23808080')
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(unassignedClientId);
    });
  });

  describe('GET /api/v1/clients/stats/color-distribution', () => {
    it('should return client color distribution stats for CEO', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/clients/stats/color-distribution')
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.total_clients).toBe(2);
      expect(res.body.by_color).toEqual(
        expect.arrayContaining([
          { color: '#FF0000', count: 1 },
          { color: '#808080', count: 1 },
        ]),
      );
      expect(res.body.by_employee).toHaveLength(2);
    });

    it('should return client color distribution stats scoped to employee when can_work_with_all_clients is false', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/clients/stats/color-distribution')
        .set('Authorization', `Bearer ${empToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.total_clients).toBe(1);
      expect(res.body.by_color).toEqual([{ color: '#FF0000', count: 1 }]);
    });
  });

  describe('GET /api/v1/clients/:id', () => {
    it('should return single client details by ID for assigned employee', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clients/${testClientId}`)
        .set('Authorization', `Bearer ${empToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.id).toBe(testClientId);
      expect(res.body.company_name).toBe('Orient Cargo LLC');
    });

    it('should deny employee viewing client assigned to another or unassigned (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clients/${unassignedClientId}`)
        .set('Authorization', `Bearer ${empToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.location).toBe('permission_denied_for_other_employees');
    });

    it('should return 404 for non-existing client ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/clients/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.location).toBe('client_not_found');
    });
  });

  describe('PUT /api/v1/clients/:id', () => {
    it('should update client details and update effective color when assigned employee changes', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/clients/${unassignedClientId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          company_name: 'Assigned Cargo Group',
          assigned_employee_id: testEmployeeId,
        })
        .expect(HttpStatus.OK);

      expect(res.body.company_name).toBe('Assigned Cargo Group');
      expect(res.body.assigned_employee.id).toBe(testEmployeeId);
      expect(res.body.effective_color).toBe('#FF0000');
    });
  });

  describe('DELETE /api/v1/clients/:id', () => {
    it('should delete client (204 No Content)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/clients/${testClientId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Verify deletion
      await request(app.getHttpServer())
        .get(`/api/v1/clients/${testClientId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});

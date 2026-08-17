import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { KNEX_CONNECTION } from '../src/database/database.module';
import { Knex } from 'knex';
import * as jwt from 'jsonwebtoken';
import { MinioService } from '../src/minio/minio.service';
import { CustomExceptionFilter } from '../src/common/filters/custom-exception.filter';

describe('Cargo & KPI API (e2e)', () => {
  let app: INestApplication<App>;
  let knex: Knex;
  let jwtSecret: string;
  let authToken: string;

  const testUserId = '11111111-1111-1111-1111-111111111111';
  let testDeptId: string;
  let testEmpId: string;
  let testClientId: string;

  const mockMinioService = {
    onModuleInit: jest.fn().mockResolvedValue(undefined),
    ensureBucketExists: jest.fn().mockResolvedValue(undefined),
    uploadFile: jest.fn().mockResolvedValue('dummy-path'),
    getPresignedUrl: jest.fn().mockResolvedValue('http://dummy-presigned-url'),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    jest.setTimeout(30000);

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

    authToken = jwt.sign(
      { sub: testUserId, phone_number: '998991112233', role: 'CEO' },
      jwtSecret,
    );

    await cleanDb();

    // Insert user
    await knex('users').insert({
      id: testUserId,
      phone_number: '998991112233',
      username: 'ceo_cargo_test',
      password_hash: 'hash',
      role: 'CEO',
      status: 'Open',
      is_active: true,
    });

    // Insert department
    const [dept] = await knex('departments')
      .insert({
        name: 'cargo-kpi-dept',
        display_name: 'Cargo KPI Dept',
      })
      .returning('*');
    testDeptId = dept.id;

    // Insert employee
    const [emp] = await knex('employees')
      .insert({
        first_name: 'Jasur',
        last_name: 'Yoldoshev',
        phone: '+998901119988',
        department_id: testDeptId,
        color: '#FF0000',
      })
      .returning('*');
    testEmpId = emp.id;

    // Insert client
    const [client] = await knex('clients')
      .insert({
        first_name: 'Jasur',
        last_name: 'Yoldoshev',
        phone: '+998901112255',
        company_name: 'Yaqeen Client Co',
        assigned_employee_id: testEmpId,
      })
      .returning('*');
    testClientId = client.id;
  }, 30000);

  afterAll(async () => {
    await cleanDb();
    if (app) {
      await app.close();
    }
  });

  async function cleanDb() {
    if (!knex) return;
    await knex('cargo_transactions').delete();
    await knex('employee_plans').delete();
    await knex('ltl_cargo_items').delete();
    await knex('ftl_fura_items').delete();
    await knex('rop_worker_sales').delete();
    await knex('rop_truck_items').delete();
    await knex('clients').delete();
    await knex('employees').delete();
    await knex('departments').delete();
    await knex('users').where({ id: testUserId }).delete();
  }

  // ==========================================
  // 1. LTL CALCULATOR & LTL KPI
  // ==========================================
  describe('1. LTL Calc & Items API', () => {
    let createdLtlId: string;

    it('POST /api/v1/cargo-kpi/ltl/calculate - calculates LTL transport price', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cargo-kpi/ltl/calculate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ volume: 2, weight: 400 })
        .expect(200);

      expect(res.body).toEqual({
        volume: 2,
        weight: 400,
        density: 200,
        basis: 'hajm',
        rate: 110,
        unit: 'USD/m3',
        total_price: 220,
      });
    });

    it('POST /api/v1/cargo-kpi/ltl/calculate - fails without auth token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cargo-kpi/ltl/calculate')
        .send({ volume: 2, weight: 400 })
        .expect(401);
    });

    it('POST /api/v1/cargo-kpi/ltl/items - creates LTL cargo item', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cargo-kpi/ltl/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employee_id: testEmpId,
          volume: 25,
          weight: 2500,
          cargo_type: 'oddiy',
        })
        .expect(201);

      expect(res.body.employees.length).toBeGreaterThan(0);
      const emp = res.body.employees.find(
        (e: any) => e.employee_id === testEmpId,
      );
      expect(emp).toBeDefined();
      expect(emp.total_volume).toBe(25);
      expect(emp.volume_coefficient).toBe(0.5); // 21..40 -> 50%
      createdLtlId = emp.items[0].id;
    });

    it('GET /api/v1/cargo-kpi/ltl/items - gets LTL items summary', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cargo-kpi/ltl/items')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.total_items).toBeGreaterThan(0);
    });

    it('PUT /api/v1/cargo-kpi/ltl/items/:id - updates LTL cargo item', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/cargo-kpi/ltl/items/${createdLtlId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          volume: 30,
        })
        .expect(200);

      const emp = res.body.employees.find(
        (e: any) => e.employee_id === testEmpId,
      );
      expect(emp.total_volume).toBe(30);
    });

    it('DELETE /api/v1/cargo-kpi/ltl/items/:id - deletes LTL cargo item', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/cargo-kpi/ltl/items/${createdLtlId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('POST /api/v1/cargo-kpi/ltl/reset - clears all LTL items', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cargo-kpi/ltl/reset')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.total_items).toBe(0);
    });
  });

  // ==========================================
  // 2. FTL KPI API
  // ==========================================
  describe('2. FTL KPI API', () => {
    let createdFtlId: string;

    it('POST /api/v1/cargo-kpi/ftl/items - creates FTL item', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cargo-kpi/ftl/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          manager_id: testEmpId,
          month: '2026-07',
          agent_price: 1000,
          sell_price: 6000,
          planned_days: 20,
          actual_days: 25,
          kpi_received: false,
          qty: 1,
        })
        .expect(201);

      expect(res.body.summaries.length).toBeGreaterThan(0);
      const summary = res.body.summaries[0];
      expect(summary.total_profit).toBe(5000);
      expect(summary.monthly_kpi_rate).toBe(0.12);
      createdFtlId = summary.items[0].id;
    });

    it('GET /api/v1/cargo-kpi/ftl/summary - gets FTL summary', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/cargo-kpi/ftl/summary?manager_id=${testEmpId}&month=2026-07`,
        )
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.summaries).toHaveLength(1);
    });

    it('PUT /api/v1/cargo-kpi/ftl/items/:id - updates FTL item', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/cargo-kpi/ftl/items/${createdFtlId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sell_price: 7000,
        })
        .expect(200);

      expect(res.body.summaries[0].total_profit).toBe(6000);
    });

    it('POST /api/v1/cargo-kpi/ftl/items/:id/copy - copies FTL item', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/cargo-kpi/ftl/items/${createdFtlId}/copy`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.summaries[0].truck_count).toBe(2);
    });

    it('PATCH /api/v1/cargo-kpi/ftl/items/:id/toggle-kpi - toggles received status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/cargo-kpi/ftl/items/${createdFtlId}/toggle-kpi`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const item = res.body.summaries[0].items.find(
        (i: any) => i.id === createdFtlId,
      );
      expect(item.kpi_received).toBe(true);
    });

    it('DELETE /api/v1/cargo-kpi/ftl/items/:id - deletes FTL item', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/cargo-kpi/ftl/items/${createdFtlId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('POST /api/v1/cargo-kpi/ftl/reset - resets FTL data', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cargo-kpi/ftl/reset')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.message).toContain('reset successfully');
    });
  });

  // ==========================================
  // 3. ROP & SEO KPI API
  // ==========================================
  describe('3. ROP & SEO KPI API', () => {
    let createdWorkerId: string;
    let createdTruckId: string;

    it('POST /api/v1/cargo-kpi/rop/workers - adds ROP worker sales', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cargo-kpi/rop/workers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employee_id: testEmpId,
          sales_amount: 30000,
          month: '2026-07',
        })
        .expect(201);

      expect(res.body.workers.length).toBeGreaterThan(0);
      createdWorkerId = res.body.workers[0].id;
    });

    it('POST /api/v1/cargo-kpi/rop/trucks - adds ROP truck item', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cargo-kpi/rop/trucks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          truck_number: '01A777AA',
          profit: 5000,
          month: '2026-07',
        })
        .expect(201);

      expect(res.body.trucks.length).toBeGreaterThan(0);
      createdTruckId = res.body.trucks[0].id;
    });

    it('GET /api/v1/cargo-kpi/rop/summary - gets ROP KPI summary', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cargo-kpi/rop/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.rop_total_kpi).toBeGreaterThan(0);
    });

    it('DELETE /api/v1/cargo-kpi/rop/workers/:id - deletes ROP worker record', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/cargo-kpi/rop/workers/${createdWorkerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('DELETE /api/v1/cargo-kpi/rop/trucks/:id - deletes ROP truck record', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/cargo-kpi/rop/trucks/${createdTruckId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('POST /api/v1/cargo-kpi/seo/calculate - calculates SEO KPI', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cargo-kpi/seo/calculate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ net_profit: 20000 })
        .expect(200);

      expect(res.body.seo_kpi).toBe(2000);
    });
  });

  // ==========================================
  // 4. EMPLOYEE PLANS API
  // ==========================================
  describe('4. Employee Plans API', () => {
    let createdPlanId: string;

    it('POST /api/v1/cargo-kpi/plans - creates employee plan', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cargo-kpi/plans')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employee_id: testEmpId,
          target_amount: 10000,
          period: '2026-07-01',
        })
        .expect(201);

      expect(res.body.leaderboard.length).toBeGreaterThan(0);
      const plan = res.body.leaderboard.find(
        (p: any) => p.employee_id === testEmpId,
      );
      expect(plan).toBeDefined();
      expect(plan.target_amount).toBe(10000);
      createdPlanId = plan.id;
    });

    it('GET /api/v1/cargo-kpi/plans - lists employee plans progress', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cargo-kpi/plans')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.total_plans).toBeGreaterThan(0);
    });

    it('GET /api/v1/cargo-kpi/plans/stats - returns aggregated plans statistics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cargo-kpi/plans/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('ltl_statistics');
      expect(res.body).toHaveProperty('ftl_statistics');
      expect(res.body).toHaveProperty('leaderboard');
    });

    it('GET /api/v1/cargo-kpi/plans/employee/:id/stats - returns employee personal stats', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cargo-kpi/plans/employee/${testEmpId}/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('employee');
      expect(res.body.employee.id).toBe(testEmpId);
      expect(res.body).toHaveProperty('totals');
      expect(res.body).toHaveProperty('history');
    });

    it('PUT /api/v1/cargo-kpi/plans/:id - updates employee plan', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/cargo-kpi/plans/${createdPlanId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ltl_target_volume: 50,
          ftl_target_amount: 12000,
        })
        .expect(200);

      const plan = res.body.leaderboard.find(
        (p: any) => p.id === createdPlanId,
      );
      expect(plan.target_amount).toBe(12000);
      expect(plan.ltl_plan.target_volume).toBe(50);
    });

    it('DELETE /api/v1/cargo-kpi/plans/:id - deletes employee plan', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/cargo-kpi/plans/${createdPlanId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  // ==========================================
  // 5. CARGO TRANSACTIONS API
  // ==========================================
  describe('5. Cargo Transactions API', () => {
    let createdTxId: string;

    it('POST /api/v1/cargo-kpi/transactions - creates cargo transaction', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cargo-kpi/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employee_id: testEmpId,
          department_id: testDeptId,
          client_id: testClientId,
          description: 'Shipment #101',
          buy_price: 3000,
          sell_price: 5000,
          kpi_percentage: 10,
          transaction_date: '2026-07-15',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.margin).toBe(2000);
      expect(res.body.kpi_bonus).toBe(200);
      expect(res.body.status).toBe('Waiting');
      createdTxId = res.body.id;
    });

    it('GET /api/v1/cargo-kpi/transactions - lists transactions with { meta, data } structure', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cargo-kpi/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta.total).toBeGreaterThan(0);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].status).toBe('Waiting');
      expect(res.body.pagination.total).toBeGreaterThan(0);
    });

    it('GET /api/v1/cargo-kpi/transactions/viewable - returns status-grouped transactions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/cargo-kpi/transactions/viewable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('meta');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('Waiting');
      expect(res.body.data).toHaveProperty('In Transit');
      expect(res.body.data).toHaveProperty('Border');
      expect(res.body.data).toHaveProperty('At Station');
      expect(res.body.data).toHaveProperty('Delivered');
      expect(
        res.body.data['Waiting'].metrics.total_transactions,
      ).toBeGreaterThan(0);
    });

    it('GET /api/v1/cargo-kpi/transactions/:id - gets transaction by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cargo-kpi/transactions/${createdTxId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.id).toBe(createdTxId);
      expect(res.body.description).toBe('Shipment #101');
      expect(res.body.status).toBe('Waiting');
    });

    it('PUT /api/v1/cargo-kpi/transactions/:id - updates transaction and status', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/cargo-kpi/transactions/${createdTxId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sell_price: 6000,
          status: 'In Transit',
        })
        .expect(200);

      expect(res.body.margin).toBe(3000);
      expect(res.body.kpi_bonus).toBe(300);
      expect(res.body.status).toBe('In Transit');
    });

    it('DELETE /api/v1/cargo-kpi/transactions/:id - deletes transaction (204)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/cargo-kpi/transactions/${createdTxId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);
    });
  });

  // ==========================================
  // 6. RESET ALL API
  // ==========================================
  describe('6. Reset All API', () => {
    it('POST /api/v1/cargo-kpi/reset-all - resets all module data', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cargo-kpi/reset-all')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.message).toContain('reset successfully');
    });
  });
});

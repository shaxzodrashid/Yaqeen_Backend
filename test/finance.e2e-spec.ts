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

describe('Finance & Expenses API (e2e)', () => {
  let app: INestApplication<App>;
  let knex: Knex;
  let jwtSecret: string;
  let authToken: string;

  const testUserId = 'f1111111-1111-1111-1111-111111111111';
  let testDeptId: string;
  let testEmpId: string;
  let testClientId: string;
  let createdExpenseId: string;

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
      { sub: testUserId, phone_number: '998991119900', role: 'CEO' },
      jwtSecret,
    );

    await cleanDb();

    // Insert test user
    await knex('users').insert({
      id: testUserId,
      phone_number: '998991119900',
      username: 'ceo_finance_test',
      password_hash: 'hash',
      role: 'CEO',
      status: 'Open',
      is_active: true,
    });

    // Insert department
    const [dept] = await knex('departments')
      .insert({
        name: 'finance-test-dept',
        display_name: 'Finance Test Dept',
      })
      .returning('*');
    testDeptId = dept.id;

    // Insert employee
    const [emp] = await knex('employees')
      .insert({
        first_name: 'Jasur',
        last_name: 'Yoldoshev',
        phone: '+998901234567',
        department_id: testDeptId,
        fixed_salary: 800,
        color: '#FF0000',
      })
      .returning('*');
    testEmpId = emp.id;

    // Insert client
    const [client] = await knex('clients')
      .insert({
        first_name: 'Finance',
        last_name: 'Client',
        phone: '+998901114455',
        company_name: 'Finance Co',
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
    await knex('expenses').delete();
    await knex('cargo_transactions').delete();
    await knex('clients').delete();
    await knex('employees').delete();
    await knex('departments').delete();
    await knex('users').where({ id: testUserId }).delete();
  }

  // ==========================================
  // 1. EXPENSES CRUD & CATEGORIES
  // ==========================================
  describe('1. Expenses CRUD & Categories', () => {
    it('POST /api/v1/finance/expenses - creates a new expense', async () => {
      const payload = {
        category: 'tax',
        amount: 350.5,
        description: 'Monthly business tax payment',
        expense_date: '2026-07-10',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/finance/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.category).toBe('tax');
      expect(res.body.amount).toBe(350.5);
      expect(res.body.description).toBe('Monthly business tax payment');
      expect(res.body.expense_date).toBe('2026-07-10');

      createdExpenseId = res.body.id;
    });

    it('POST /api/v1/finance/expenses - creates KPI and food expenses', async () => {
      const kpiRes = await request(app.getHttpServer())
        .post('/api/v1/finance/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'kpi',
          amount: 500,
          currency: 'USD',
          description: 'Sales quarterly KPI bonus',
          expense_date: '2026-07-20',
        })
        .expect(201);

      expect(kpiRes.body.category).toBe('kpi');
      expect(kpiRes.body.amount).toBe(500);

      const foodRes = await request(app.getHttpServer())
        .post('/api/v1/finance/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'food',
          amount: 150000,
          currency: 'UZS',
          description: 'Office tea and lunch supplies',
          expense_date: '2026-07-21',
        })
        .expect(201);

      expect(foodRes.body.category).toBe('food');
      expect(foodRes.body.amount).toBe(150000);
    });

    it('GET /api/v1/finance/expenses - lists expenses with pagination and sum', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/finance/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ category: 'tax' })
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total_sum');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.total_sum).toBeGreaterThanOrEqual(350.5);
    });

    it('GET /api/v1/finance/expenses/categories - returns category breakdown with 8 categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/finance/expenses/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ period: '2026-07' })
        .expect(200);

      expect(res.body).toHaveProperty('categories');
      expect(res.body).toHaveProperty('grand_total');
      expect(Array.isArray(res.body.categories)).toBe(true);
      expect(res.body.categories.length).toBe(8);

      const taxCat = res.body.categories.find((c: any) => c.category === 'tax');
      expect(taxCat).toBeDefined();
      expect(taxCat.total_amount).toBeGreaterThanOrEqual(350.5);

      const kpiCat = res.body.categories.find((c: any) => c.category === 'kpi');
      expect(kpiCat).toBeDefined();

      const foodCat = res.body.categories.find(
        (c: any) => c.category === 'food',
      );
      expect(foodCat).toBeDefined();
      expect(foodCat.total_amount).toBeGreaterThanOrEqual(150000);
    });

    it('GET /api/v1/finance/expenses/:id - gets single expense details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/finance/expenses/${createdExpenseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.id).toBe(createdExpenseId);
      expect(res.body.amount).toBe(350.5);
    });

    it('PATCH /api/v1/finance/expenses/:id - updates an expense', async () => {
      const updatePayload = {
        amount: 400.0,
        description: 'Updated tax payment',
      };

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/finance/expenses/${createdExpenseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatePayload)
        .expect(200);

      expect(res.body.amount).toBe(400.0);
      expect(res.body.description).toBe('Updated tax payment');
    });

    it('DELETE /api/v1/finance/expenses/:id - deletes an expense', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/finance/expenses/${createdExpenseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/finance/expenses/${createdExpenseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  // ==========================================
  // 2. FIXED SALARIES MANAGEMENT
  // ==========================================
  describe('2. Fixed Salaries Management', () => {
    it('GET /api/v1/finance/salaries - lists fixed salaries per department', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/finance/salaries')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('total_employees');
      expect(res.body).toHaveProperty('total_monthly_salaries');
      expect(res.body).toHaveProperty('departments');
      expect(res.body.total_monthly_salaries).toBeGreaterThanOrEqual(800);
    });

    it('PATCH /api/v1/finance/salaries/:employee_id - updates single employee salary', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/finance/salaries/${testEmpId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ fixed_salary: 1200 })
        .expect(200);

      expect(res.body.id).toBe(testEmpId);
      expect(res.body.fixed_salary).toBe(1200);
    });

    it('PATCH /api/v1/finance/salaries - batch updates employee salaries', async () => {
      const batchPayload = {
        salaries: [{ employee_id: testEmpId, fixed_salary: 1500 }],
      };

      const res = await request(app.getHttpServer())
        .patch('/api/v1/finance/salaries')
        .set('Authorization', `Bearer ${authToken}`)
        .send(batchPayload)
        .expect(200);

      expect(res.body.total_monthly_salaries).toBeGreaterThanOrEqual(1500);
    });
  });

  // ==========================================
  // 3. FINANCIAL SUMMARY & NET PROFIT ENGINE
  // ==========================================
  describe('3. Financial Summary & Net Profit Engine', () => {
    it('GET /api/v1/finance/summary - computes complete financial summary & 10% SEO share', async () => {
      // 1. Create a cargo transaction for margin revenue
      await knex('cargo_transactions').insert({
        employee_id: testEmpId,
        department_id: testDeptId,
        client_id: testClientId,
        description: 'E2E Finance cargo order',
        buy_price: 5000,
        sell_price: 8000,
        margin: 3000,
        kpi_percentage: 10,
        kpi_bonus: 300,
        transaction_date: '2026-07-15',
      });

      // 2. Create operational expenses
      await knex('expenses').insert([
        {
          category: 'utility',
          amount: 200,
          description: 'Electricity bill',
          expense_date: '2026-07-05',
        },
        {
          category: 'rent',
          amount: 500,
          description: 'Office rent',
          expense_date: '2026-07-01',
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/finance/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ period: '2026-07' })
        .expect(200);

      expect(res.body).toHaveProperty('summary');
      expect(res.body.summary.gross_revenue).toBe(8000);
      expect(res.body.summary.gross_profit).toBe(3000);
      expect(res.body.summary.operational_expenses).toBe(700);
      expect(res.body.summary.fixed_salaries_expense).toBe(1500);
      expect(res.body.summary.kpi_bonuses_expense).toBe(300);
      expect(res.body.summary.total_expenses).toBe(2500); // 700 op + 1500 salary + 300 kpi
      expect(res.body.summary.net_profit).toBe(500); // 3000 gross margin - 2500 total expenses
      expect(res.body.summary.seo_cut_10pc).toBe(50); // 500 * 0.10

      expect(res.body).toHaveProperty('comparison');
      expect(res.body.comparison).toHaveProperty(
        'net_profit_growth_percentage',
      );
    });
  });
});

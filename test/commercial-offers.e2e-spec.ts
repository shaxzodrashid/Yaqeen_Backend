import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { KNEX_CONNECTION } from '../src/database/database.module';
import { Knex } from 'knex';
import * as jwt from 'jsonwebtoken';
import { MinioService } from '../src/minio/minio.service';

describe('Commercial Offers API (e2e)', () => {
  let app: INestApplication<App>;
  let knex: Knex;
  let jwtSecret: string;

  const ceoUserId = 'aa111111-1111-1111-1111-111111111111';
  const empUserId = 'aa222222-2222-2222-2222-222222222222';

  let ceoToken: string;
  let empToken: string;

  let testClientId: string;
  let testOfferId: string;

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
      { sub: ceoUserId, phone_number: '998990001100', role: 'CEO' },
      jwtSecret,
    );
    empToken = jwt.sign(
      { sub: empUserId, phone_number: '998990001122', role: 'EMPLOYEE' },
      jwtSecret,
    );

    await cleanDb();

    // Seed test users
    await knex('users').insert([
      {
        id: ceoUserId,
        phone_number: '998990001100',
        username: 'ceo_co_test',
        password_hash: 'hash',
        role: 'CEO',
        status: 'Open',
        is_active: true,
      },
      {
        id: empUserId,
        phone_number: '998990001122',
        username: 'emp_co_test',
        password_hash: 'hash',
        role: 'EMPLOYEE',
        status: 'Open',
        is_active: true,
      },
    ]);

    // Seed a test client for client_id linking
    const [dept] = await knex('departments')
      .insert({ name: 'CO Test Dept', display_name: 'CO Test Dept' })
      .returning('*');

    const [emp] = await knex('employees')
      .insert({
        first_name: 'TestEmp',
        last_name: 'ForCO',
        phone: '+998900110011',
        department_id: dept.id,
      })
      .returning('*');

    const [client] = await knex('clients')
      .insert({
        first_name: 'Mijoz',
        last_name: 'Testov',
        phone: '+998900110022',
        company_name: 'Test Cargo LLC',
        assigned_employee_id: emp.id,
      })
      .returning('*');
    testClientId = client.id;
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  async function cleanDb() {
    await knex('commercial_offers').delete();
    await knex('attachments').delete();
    await knex('cargo_transactions').delete();
    await knex('clients').delete();
    await knex('employee_plans').delete();
    await knex('employees').delete();
    await knex('departments').whereIn('name', ['CO Test Dept']).delete();
    await knex('users').whereIn('id', [ceoUserId, empUserId]).delete();
  }

  // ==========================================
  // AUTHENTICATION
  // ==========================================

  describe('Authentication', () => {
    it('should reject unauthenticated requests (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/commercial-offers')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should reject requests with invalid token (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/commercial-offers')
        .set('Authorization', 'Bearer invalid-token')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  // ==========================================
  // CREATE
  // ==========================================

  describe('POST /api/v1/commercial-offers', () => {
    it('should create an offer successfully (CEO)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/commercial-offers')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          client_name: 'Jasur Yoldoshev',
          client_company: 'Global Trade LLC',
          origin: 'Tashkent',
          destination: 'Shanghai',
          cargo_description: 'Electronic parts',
          cargo_weight: 1500,
          cargo_volume: 12.5,
          price_usd: 5000,
          price_local: 65000000,
          inclusions: ['Loading', 'Insurance', 'Customs docs'],
          exclusions: ['Destination duties', 'Unloading'],
          terms: 'Payment within 30 days',
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.offer_number).toMatch(/^YQ-\d{4}-\d{4}$/);
      expect(res.body.status).toBe('draft');
      expect(res.body.client_name).toBe('Jasur Yoldoshev');
      expect(res.body.origin).toBe('Tashkent');
      expect(res.body.destination).toBe('Shanghai');
      expect(res.body.price_usd).toBe(5000);
      expect(res.body.inclusions).toEqual([
        'Loading',
        'Insurance',
        'Customs docs',
      ]);
      expect(res.body.exclusions).toEqual(['Destination duties', 'Unloading']);

      testOfferId = res.body.id;
    });

    it('should create an offer with client_id and auto-fill client info', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/commercial-offers')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          client_id: testClientId,
          client_name: 'Override Name',
          client_company: 'Override Company',
          origin: 'Moscow',
          destination: 'Tashkent',
          price_usd: 2000,
          price_local: 26000000,
        })
        .expect(HttpStatus.CREATED);

      // Should use client table data, not the override
      expect(res.body.client_name).toBe('Mijoz Testov');
      expect(res.body.client_company).toBe('Test Cargo LLC');
      expect(res.body.client_id).toBe(testClientId);
    });

    it('should fail with invalid client_id (404)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/commercial-offers')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          client_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          client_name: 'Test Client',
          client_company: 'Test Company',
          origin: 'Tashkent',
          destination: 'Beijing',
          price_usd: 100,
          price_local: 1300000,
        })
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.location).toBe('client_not_found');
    });

    it('EMPLOYEE should also be able to create (has commercial_offers:create)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/commercial-offers')
        .set('Authorization', `Bearer ${empToken}`)
        .send({
          client_name: 'Employee Offer',
          client_company: 'Employee Corp',
          origin: 'Samarkand',
          destination: 'Istanbul',
          price_usd: 3000,
          price_local: 39000000,
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.status).toBe('draft');
    });

    it('should fail validation when required fields are missing (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/commercial-offers')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          client_name: 'Test',
          // missing client_company, origin, destination, price_usd, price_local
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail validation when price_usd is negative (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/commercial-offers')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          client_name: 'Test',
          client_company: 'Test Co',
          origin: 'A',
          destination: 'B',
          price_usd: -100,
          price_local: 1300000,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // ==========================================
  // LIST / QUERY
  // ==========================================

  describe('GET /api/v1/commercial-offers', () => {
    it('should return paginated list of offers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/commercial-offers')
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('page');
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('totalPages');
      expect(res.body.pagination.total).toBeGreaterThan(0);
    });

    it('should filter by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/commercial-offers?status=draft')
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      res.body.data.forEach((offer: any) => {
        expect(offer.status).toBe('draft');
      });
    });

    it('should search by client name', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/commercial-offers?search=Jasur')
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should search by origin/destination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/commercial-offers?search=Shanghai')
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination with page and limit', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/commercial-offers?page=1&limit=1')
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.length).toBeLessThanOrEqual(1);
      expect(res.body.pagination.limit).toBe(1);
    });
  });

  // ==========================================
  // GET BY ID
  // ==========================================

  describe('GET /api/v1/commercial-offers/:id', () => {
    it('should return a single offer with all fields', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/commercial-offers/${testOfferId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.id).toBe(testOfferId);
      expect(res.body).toHaveProperty('offer_number');
      expect(res.body).toHaveProperty('client_name');
      expect(res.body).toHaveProperty('origin');
      expect(res.body).toHaveProperty('destination');
      expect(res.body).toHaveProperty('price_usd');
      expect(res.body).toHaveProperty('price_local');
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('inclusions');
      expect(res.body).toHaveProperty('exclusions');
    });

    it('should return 404 for nonexistent offer', async () => {
      const fakeId = '99999999-9999-9999-9999-999999999999';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/commercial-offers/${fakeId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.location).toBe('offer_not_found');
    });
  });

  // ==========================================
  // UPDATE
  // ==========================================

  describe('PUT /api/v1/commercial-offers/:id', () => {
    it('should update specific fields', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/commercial-offers/${testOfferId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          price_usd: 6500,
          price_local: 84500000,
          cargo_description: 'Updated: Premium electronics',
        })
        .expect(HttpStatus.OK);

      expect(res.body.price_usd).toBe(6500);
      expect(res.body.price_local).toBe(84500000);
      expect(res.body.cargo_description).toBe('Updated: Premium electronics');
      // Other fields should remain unchanged
      expect(res.body.client_name).toBe('Jasur Yoldoshev');
    });

    it('EMPLOYEE should not be able to update (403)', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/commercial-offers/${testOfferId}`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({ price_usd: 9999 })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  // ==========================================
  // STATUS MANAGEMENT
  // ==========================================

  describe('PATCH /api/v1/commercial-offers/:id/status', () => {
    it('should transition from draft to sent', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/commercial-offers/${testOfferId}/status`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({ status: 'sent' })
        .expect(HttpStatus.OK);

      expect(res.body.status).toBe('sent');
    });

    it('should transition from sent to accepted', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/commercial-offers/${testOfferId}/status`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({ status: 'accepted' })
        .expect(HttpStatus.OK);

      expect(res.body.status).toBe('accepted');
    });

    it('should reject invalid transition from accepted to sent (400)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/commercial-offers/${testOfferId}/status`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({ status: 'sent' })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.location).toBe('invalid_status_transition');
    });

    it('should allow reopening: accepted to draft', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/commercial-offers/${testOfferId}/status`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({ status: 'draft' })
        .expect(HttpStatus.OK);

      expect(res.body.status).toBe('draft');
    });

    it('should reject invalid status value (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/commercial-offers/${testOfferId}/status`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({ status: 'invalid_status' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // ==========================================
  // DUPLICATE
  // ==========================================

  describe('POST /api/v1/commercial-offers/:id/duplicate', () => {
    it('should duplicate an offer with new number and draft status', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/commercial-offers/${testOfferId}/duplicate`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.id).not.toBe(testOfferId);
      expect(res.body.offer_number).not.toBe(
        (
          await request(app.getHttpServer())
            .get(`/api/v1/commercial-offers/${testOfferId}`)
            .set('Authorization', `Bearer ${ceoToken}`)
        ).body.offer_number,
      );
      expect(res.body.status).toBe('draft');
      expect(res.body.client_name).toBe('Jasur Yoldoshev');
      expect(res.body.origin).toBe('Tashkent');
      expect(res.body.destination).toBe('Shanghai');
    });

    it('should return 404 for nonexistent source offer', async () => {
      const fakeId = '99999999-9999-9999-9999-999999999999';
      const res = await request(app.getHttpServer())
        .post(`/api/v1/commercial-offers/${fakeId}/duplicate`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.location).toBe('offer_not_found');
    });
  });

  // ==========================================
  // PDF DOWNLOAD
  // ==========================================

  describe('GET /api/v1/commercial-offers/:id/pdf', () => {
    it('should generate and download a PDF', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/commercial-offers/${testOfferId}/pdf`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('.pdf');

      // Verify it's a valid PDF
      const pdfHeader = res.body.subarray(0, 5).toString('ascii');
      expect(pdfHeader).toBe('%PDF-');
    });

    it('should return 404 for nonexistent offer PDF', async () => {
      const fakeId = '99999999-9999-9999-9999-999999999999';
      await request(app.getHttpServer())
        .get(`/api/v1/commercial-offers/${fakeId}/pdf`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // ==========================================
  // SUMMARY STATS
  // ==========================================

  describe('GET /api/v1/commercial-offers/stats/summary', () => {
    it('should return summary statistics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/commercial-offers/stats/summary')
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toHaveProperty('total_offers');
      expect(res.body).toHaveProperty('by_status');
      expect(res.body).toHaveProperty('accepted_revenue');
      expect(res.body.by_status).toHaveProperty('draft');
      expect(res.body.by_status).toHaveProperty('sent');
      expect(res.body.by_status).toHaveProperty('accepted');
      expect(res.body.by_status).toHaveProperty('rejected');
      expect(res.body.total_offers).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // DELETE
  // ==========================================

  describe('DELETE /api/v1/commercial-offers/:id', () => {
    it('EMPLOYEE should not be able to delete (403)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/commercial-offers/${testOfferId}`)
        .set('Authorization', `Bearer ${empToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should delete an offer (CEO)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/commercial-offers/${testOfferId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.NO_CONTENT);
    });

    it('should return 404 after deletion', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/commercial-offers/${testOfferId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.location).toBe('offer_not_found');
    });

    it('should return 404 when deleting nonexistent offer', async () => {
      const fakeId = '99999999-9999-9999-9999-999999999999';
      await request(app.getHttpServer())
        .delete(`/api/v1/commercial-offers/${fakeId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});

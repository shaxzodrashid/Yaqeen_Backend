import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { KNEX_CONNECTION } from '../src/database/database.module';
import { Knex } from 'knex';
import * as jwt from 'jsonwebtoken';
import { MinioService } from '../src/minio/minio.service';
import { TaskTargetTimeSchedulerService } from '../src/kanban/task-target-time-scheduler.service';

describe('Kanban Board & Tasks Module (e2e)', () => {
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

  let testEmployeeId: string;
  let testBoardId: string;
  let testColumnId: string;
  let doneColumnId: string;
  let restrictedColumnId: string;
  let testTaskId: string;

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

    // Seed mock test users in DB if not existing
    const ensureUser = async (id: string, phone: string, role: string) => {
      const existing = await knex('users').where('id', id).first();
      if (!existing) {
        await knex('users').insert({
          id,
          phone_number: phone,
          username: `user_${role.toLowerCase()}`,
          password_hash: 'hash',
          role,
          status: 'Open',
          is_active: true,
        });
      }
    };

    await ensureUser(ceoUserId, '998991110001', 'CEO');
    await ensureUser(ropUserId, '998991110002', 'ROP');
    await ensureUser(empUserId, '998991110003', 'EMPLOYEE');

    // Ensure test department exists
    let dept = await knex('departments').first();
    if (!dept) {
      const [newDept] = await knex('departments')
        .insert({
          name: 'Logistics Department',
          display_name: 'Logistics Department',
        })
        .returning('*');
      dept = newDept;
    }

    // Create a test employee
    const [emp] = await knex('employees')
      .insert({
        first_name: 'Kanban',
        last_name: 'Tester',
        phone: '+998901112233',
        department_id: dept.id,
      })
      .returning('*');
    testEmployeeId = emp.id;

    // Map Telegram contact for testing Telegram notifications
    await knex('telegram_contacts').where('phone_number', '998901112233').del();
    await knex('telegram_contacts').insert({
      chat_id: '123456789',
      phone_number: '998901112233',
      first_name: 'Kanban',
      last_name: 'Tester',
    });

    // Generate JWT tokens
    ceoToken = jwt.sign(
      { sub: ceoUserId, phone_number: '998991110001', role: 'CEO' },
      jwtSecret,
    );
    ropToken = jwt.sign(
      { sub: ropUserId, phone_number: '998991110002', role: 'ROP' },
      jwtSecret,
    );
    empToken = jwt.sign(
      { sub: empUserId, phone_number: '998991110003', role: 'EMPLOYEE' },
      jwtSecret,
    );
  });

  afterAll(async () => {
    // Cleanup created test records
    if (knex) {
      if (testBoardId) {
        await knex('kanban_boards').where('id', testBoardId).del();
      }
      if (testEmployeeId) {
        await knex('employees').where('id', testEmployeeId).del();
      }
    }
    if (app) {
      await app.close();
    }
  });

  // ==========================================
  // 1. KANBAN BOARD MANAGEMENT
  // ==========================================
  describe('Kanban Board CRUD', () => {
    it('POST /api/v1/kanban/boards - should create board with default columns', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/kanban/boards')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          name: 'Q3 Development Board',
          description: 'Board for tracking logistics software features',
        })
        .expect(HttpStatus.CREATED);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toEqual('Q3 Development Board');
      testBoardId = res.body.id;

      // Verify default columns were automatically generated
      const boardDetails = await request(app.getHttpServer())
        .get(`/api/v1/kanban/boards/${testBoardId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(HttpStatus.OK);

      expect(boardDetails.body.columns).toHaveLength(4);
      const colNames = boardDetails.body.columns.map((c: any) => c.name);
      expect(colNames).toContain('To Do');
      expect(colNames).toContain('In Progress');
      expect(colNames).toContain('Review');
      expect(colNames).toContain('Done');

      testColumnId = boardDetails.body.columns[0].id;
      doneColumnId = boardDetails.body.columns.find(
        (c: any) => c.name === 'Done',
      ).id;
    });

    it('GET /api/v1/kanban/boards - should list boards', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/kanban/boards')
        .set('Authorization', `Bearer ${empToken}`)
        .expect(HttpStatus.OK);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((b: any) => b.id === testBoardId)).toBe(true);
    });
  });

  // ==========================================
  // 2. DYNAMIC STATUS & PERMISSIONS
  // ==========================================
  describe('Dynamic Status Columns & Permissions', () => {
    it('POST /api/v1/kanban/columns - should create custom status column with role permissions', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/kanban/columns')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          board_id: testBoardId,
          name: 'Management Review',
          color: '#8B5CF6',
          allowed_roles: ['ROP', 'CEO'],
        })
        .expect(HttpStatus.CREATED);

      expect(res.body).toHaveProperty('id');
      expect(res.body.allowed_roles).toEqual(['ROP', 'CEO']);
      restrictedColumnId = res.body.id;
    });
  });

  // ==========================================
  // 3. TASKS MODULE & RICH FEATURES
  // ==========================================
  describe('Tasks Lifecycle & Rich Content', () => {
    it('POST /api/v1/tasks - should create task with rich text, assignees, target_time, and checklists', async () => {
      const targetTime = new Date(Date.now() + 3600000).toISOString(); // 1 hr in future

      const res = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${ropToken}`)
        .send({
          column_id: testColumnId,
          title: 'Implement Payment Gateway Integration',
          description:
            '<h1>Payment Setup</h1><p>Full integration with <b>Stripe</b> and <b>Payme</b></p>',
          priority: 'HIGH',
          assignee_ids: [testEmployeeId],
          target_time: targetTime,
          checklists: [
            { title: 'Setup Webhook Endpoint', is_completed: false },
            { title: 'Verify SSL Certification', is_completed: true },
          ],
        })
        .expect(HttpStatus.CREATED);

      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toEqual('Implement Payment Gateway Integration');
      expect(res.body.priority).toEqual('HIGH');
      expect(res.body.assignees).toHaveLength(1);
      expect(res.body.assignees[0].id).toEqual(testEmployeeId);
      expect(res.body.checklists).toHaveLength(2);

      testTaskId = res.body.id;
    });

    it('GET /api/v1/tasks - should return list of tasks with { meta, data } structure', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${empToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta.total).toBeGreaterThan(0);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((t: any) => t.id === testTaskId)).toBe(true);
    });

    it('GET /api/v1/tasks/viewable - should return tasks grouped by column status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks/viewable')
        .set('Authorization', `Bearer ${empToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toHaveProperty('meta');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty(testColumnId);
      expect(res.body.data[testColumnId].metrics.total_tasks).toBeGreaterThan(
        0,
      );
    });

    it('GET /api/v1/tasks/:id - should return full task details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${empToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.id).toEqual(testTaskId);
      expect(res.body.description).toContain('Payment Setup');
      expect(res.body.activityLogs.length).toBeGreaterThan(0);
    });

    it('PUT /api/v1/tasks/:id - EMPLOYEE moving task to restricted status should be rejected (403)', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${empToken}`)
        .send({
          column_id: restrictedColumnId,
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('PUT /api/v1/tasks/:id - ROP moving task to restricted status should succeed', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${ropToken}`)
        .send({
          column_id: restrictedColumnId,
        })
        .expect(HttpStatus.OK);

      expect(res.body.columnId).toEqual(restrictedColumnId);
    });

    it('PUT /api/v1/tasks/:id - moving task to Done status should automatically record completed_at timestamp', async () => {
      // Mark Done column as done status
      await knex('kanban_columns')
        .where('id', doneColumnId)
        .update({ is_done_status: true });

      const res = await request(app.getHttpServer())
        .put(`/api/v1/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          column_id: doneColumnId,
        })
        .expect(HttpStatus.OK);

      expect(res.body.columnId).toEqual(doneColumnId);
      expect(res.body.completedAt).not.toBeNull();
    });
  });

  // ==========================================
  // 4. CHECKLISTS & COMMENTS
  // ==========================================
  describe('Checklists & Comments', () => {
    let checklistItemId: string;

    it('POST /api/v1/tasks/:id/checklists - should add checklist item', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${testTaskId}/checklists`)
        .set('Authorization', `Bearer ${ropToken}`)
        .send({
          title: 'Write Unit & E2E Tests',
          is_completed: false,
        })
        .expect(HttpStatus.CREATED);

      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toEqual('Write Unit & E2E Tests');
      checklistItemId = res.body.id;
    });

    it('PUT /api/v1/tasks/:id/checklists/:itemId - should toggle checklist item completion', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/tasks/${testTaskId}/checklists/${checklistItemId}`)
        .set('Authorization', `Bearer ${ropToken}`)
        .send({
          is_completed: true,
        })
        .expect(HttpStatus.OK);

      expect(res.body.isCompleted).toBe(true);
    });

    it('POST /api/v1/tasks/:id/comments - should add comment to task', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${testTaskId}/comments`)
        .set('Authorization', `Bearer ${ropToken}`)
        .send({
          content: 'All tasks completed successfully.',
        })
        .expect(HttpStatus.CREATED);

      expect(res.body).toHaveProperty('id');
      expect(res.body.content).toEqual('All tasks completed successfully.');
    });
  });

  // ==========================================
  // 5. TARGET TIME SCHEDULER NOTIFICATION
  // ==========================================
  describe('Target Time Reaches Scheduler', () => {
    it('TaskTargetTimeSchedulerService should process target time reached tasks and flag them', async () => {
      // Set task target_time to past and clear completed_at to simulate active task target time reached
      await knex('tasks')
        .where('id', testTaskId)
        .update({
          target_time: new Date(Date.now() - 60000), // 1 min ago
          completed_at: null,
          target_time_notified: false,
        });

      const scheduler = app.get(TaskTargetTimeSchedulerService);
      await scheduler.checkTargetTimeReaches();

      const updatedTask = await knex('tasks').where('id', testTaskId).first();
      expect(Boolean(updatedTask.target_time_notified)).toBe(true);
    });
  });
});

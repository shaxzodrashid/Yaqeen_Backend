import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { KanbanColumnsService } from './kanban-columns.service';
import { TelegramBotService } from '../auth/telegram-bot.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { ForbiddenException } from '@nestjs/common';

describe('TasksService', () => {
  let service: TasksService;
  let mockKnexBuilder: any;
  let mockColumnsService: any;
  let mockTelegramBotService: any;
  let mockAttachmentsService: any;

  beforeEach(async () => {
    mockKnexBuilder = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      whereExists: jest.fn().mockReturnThis(),
      whereILike: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      max: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([{ id: 'emp-1' }])),
    };

    const mockKnex: any = jest.fn(() => mockKnexBuilder);
    mockKnex.fn = { now: jest.fn().mockReturnValue(new Date()) };

    mockColumnsService = {
      validateStatusPermission: jest.fn(),
    };

    mockTelegramBotService = {
      sendTaskEditionNotification: jest.fn().mockResolvedValue(undefined),
      sendTargetTimeNotification: jest.fn().mockResolvedValue(undefined),
    };

    mockAttachmentsService = {
      listAttachmentsForEntity: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: KNEX_CONNECTION, useValue: mockKnex },
        { provide: KanbanColumnsService, useValue: mockColumnsService },
        { provide: TelegramBotService, useValue: mockTelegramBotService },
        { provide: AttachmentsService, useValue: mockAttachmentsService },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTask', () => {
    it('should create a task, sync assignees, and trigger Telegram notification', async () => {
      const columnId = 'col-1';
      const dto = {
        column_id: columnId,
        title: 'New High Priority Task',
        description: '<p>Rich text description with <b>checkboxes</b></p>',
        assignee_ids: ['emp-1'],
        priority: 'HIGH' as any,
      };

      mockColumnsService.validateStatusPermission.mockResolvedValue({
        id: columnId,
        name: 'In Progress',
        is_done_status: false,
      });

      mockKnexBuilder.first
        .mockResolvedValueOnce({ maxPos: 0 }) // max position check
        .mockResolvedValueOnce({
          id: 'task-1',
          column_id: columnId,
          title: dto.title,
          description: dto.description,
          priority: 'HIGH',
          position: 1,
        }) // getTaskById: task
        .mockResolvedValueOnce({ id: columnId, name: 'In Progress' }); // getTaskById: column

      mockKnexBuilder.returning.mockResolvedValueOnce([
        {
          id: 'task-1',
          column_id: columnId,
          title: dto.title,
          description: dto.description,
          priority: 'HIGH',
          position: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const result = await service.createTask(dto, {
        id: 'user-1',
        role: 'ROP',
      });

      expect(mockColumnsService.validateStatusPermission).toHaveBeenCalledWith(
        columnId,
        'ROP',
      );
      expect(result).toBeDefined();
      expect(result.id).toEqual('task-1');
      expect(
        mockTelegramBotService.sendTaskEditionNotification,
      ).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user lacks status permission', async () => {
      mockColumnsService.validateStatusPermission.mockRejectedValue(
        new ForbiddenException('Access denied'),
      );

      await expect(
        service.createTask(
          { column_id: 'col-restricted', title: 'Restricted' },
          { id: 'user-1', role: 'EMPLOYEE' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateTask & status transition', () => {
    it('should set completed_at when moving task to a done column', async () => {
      const taskId = 'task-1';
      const doneColId = 'col-done';

      mockColumnsService.validateStatusPermission.mockResolvedValue({
        id: doneColId,
        name: 'Done',
        is_done_status: true,
      });

      mockKnexBuilder.first
        .mockResolvedValueOnce({
          id: taskId,
          column_id: 'col-1',
          title: 'Task to finish',
        }) // existing task check
        .mockResolvedValueOnce({
          id: taskId,
          column_id: doneColId,
          title: 'Task to finish',
        }) // updated task for notification
        .mockResolvedValueOnce({
          id: taskId,
          column_id: doneColId,
          title: 'Task to finish',
          completed_at: new Date(),
        }) // getTaskById: task
        .mockResolvedValueOnce({ id: doneColId, name: 'Done' }); // getTaskById: column

      mockKnexBuilder.update.mockResolvedValue([1]);

      const result = await service.updateTask(
        taskId,
        { column_id: doneColId },
        { id: 'user-1', role: 'CEO' },
      );

      expect(mockKnexBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          column_id: doneColId,
          completed_at: expect.any(Date),
        }),
      );
      expect(result.columnId).toEqual(doneColId);
    });
  });

  describe('listTasks & listTasksViewable', () => {
    it('returns standardized { meta, data } response envelope in listTasks', async () => {
      mockKnexBuilder.then = jest
        .fn()
        .mockImplementationOnce((resolve: any) => resolve([{ total: '1' }])) // count total
        .mockImplementationOnce((resolve: any) =>
          resolve([{ column_id: 'col-1', total: '1' }]),
        ) // columnCounts
        .mockImplementationOnce((resolve: any) =>
          resolve([
            {
              id: 'task-1',
              column_id: 'col-1',
              column_name: 'To Do',
              title: 'Task 1',
              priority: 'MEDIUM',
              position: 0,
            },
          ]),
        ); // tasks

      const res = await service.listTasks({});
      expect(res).toHaveProperty('meta');
      expect(res).toHaveProperty('data');
      expect(res.meta.total).toBe(1);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data[0].title).toBe('Task 1');
    });

    it('returns column-grouped viewable tasks in listTasksViewable', async () => {
      mockKnexBuilder.then = jest
        .fn()
        .mockImplementationOnce((resolve: any) => resolve([{ total: '1' }])) // count total
        .mockImplementationOnce((resolve: any) =>
          resolve([{ column_id: 'col-1', total: '1' }]),
        ) // columnCounts
        .mockImplementationOnce((resolve: any) =>
          resolve([
            {
              id: 'task-1',
              column_id: 'col-1',
              column_name: 'To Do',
              title: 'Task 1',
              priority: 'MEDIUM',
              position: 0,
            },
          ]),
        ) // tasks
        .mockImplementationOnce((resolve: any) =>
          resolve([
            {
              id: 'col-1',
              board_id: 'b-1',
              name: 'To Do',
              position: 0,
              color: '#FF0000',
              is_done_status: false,
            },
          ]),
        ); // columns

      const res = await service.listTasksViewable({});
      expect(res).toHaveProperty('meta');
      expect(res).toHaveProperty('data');
      expect(res.data).toHaveProperty('col-1');
      expect(res.data['col-1'].metrics.total_tasks).toBe(1);
    });
  });
});

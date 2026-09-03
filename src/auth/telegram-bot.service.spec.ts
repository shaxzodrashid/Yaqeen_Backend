import { Test, TestingModule } from '@nestjs/testing';
import { TelegramBotService } from './telegram-bot.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { ConfigService } from '@nestjs/config';

function createMockQueryBuilder(overrides: Record<string, any> = {}) {
  const qb: any = {
    where: jest.fn((...args: any[]) => {
      if (typeof args[0] === 'function') {
        const subBuilder = createMockQueryBuilder();
        args[0](subBuilder);
      }
      return qb;
    }),
    whereIn: jest.fn().mockReturnThis(),
    whereRaw: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orWhereIn: jest.fn().mockReturnThis(),
    orWhereRaw: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    update: jest.fn().mockResolvedValue(1),
    insert: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([]),
    }),
    del: jest.fn().mockResolvedValue(1),
    first: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
  return qb;
}

describe('TelegramBotService', () => {
  let service: TelegramBotService;
  let mockKnex: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockKnex = jest.fn();
    mockKnex.fn = { now: jest.fn().mockReturnValue('NOW()') };
    mockKnex.transaction = jest.fn(async (cb: any) => {
      const trx = jest.fn((table: string) => mockKnex(table));
      (trx as any).fn = mockKnex.fn;
      (trx as any).raw = jest.fn((sql, bindings) => ({ sql, bindings }));
      return await cb(trx);
    });

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'telegramBotToken')
          return '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramBotService,
        { provide: KNEX_CONNECTION, useValue: mockKnex },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TelegramBotService>(TelegramBotService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleUpdate (contact sharing)', () => {
    it('should NOT create an orphaned user when contact is shared but no employee exists', async () => {
      const contactsQb = createMockQueryBuilder();
      const employeesQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue(null), // No employee in CRM!
      });
      const usersQb = createMockQueryBuilder();

      mockKnex.mockImplementation((table: string) => {
        if (table === 'telegram_contacts') return contactsQb;
        if (table === 'employees') return employeesQb;
        if (table === 'users') return usersQb;
        return createMockQueryBuilder();
      });

      const update = {
        message: {
          chat: { id: 12345, username: 'testuser' },
          contact: {
            phone_number: '+998901234567',
            first_name: 'John',
            last_name: 'Doe',
            user_id: 12345,
          },
        },
      };

      await service.handleUpdate(update);

      // Contact was recorded for future matching
      expect(contactsQb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_id: '12345',
          phone_number: '998901234567',
        }),
      );
      // But users table was NOT inserted (no orphaned user created!)
      expect(usersQb.insert).not.toHaveBeenCalled();
    });

    it('should link employee and assign role_id when employee exists', async () => {
      const contactsQb = createMockQueryBuilder();
      const employeesQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({
          id: 'emp-10',
          first_name: 'Valid',
          last_name: 'Employee',
          is_active: true,
        }),
      });
      const rolesQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({
          id: 'role-emp-id',
          name: 'EMPLOYEE',
        }),
      });
      const usersQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue(null), // No user account yet
      });

      mockKnex.mockImplementation((table: string) => {
        if (table === 'telegram_contacts') return contactsQb;
        if (table === 'employees') return employeesQb;
        if (table === 'roles') return rolesQb;
        if (table === 'users') return usersQb;
        return createMockQueryBuilder();
      });

      const update = {
        message: {
          chat: { id: 99999, username: 'valid_user' },
          contact: {
            phone_number: '901234567',
            first_name: 'Valid',
            user_id: 99999,
          },
        },
      };

      await service.handleUpdate(update);

      expect(usersQb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          employee_id: 'emp-10',
          role_id: 'role-emp-id',
          role: 'EMPLOYEE',
          status: 'Pending',
          is_active: true,
        }),
      );
    });

    it('should reconcile conflicts between linkedUser and userByPhone without crash', async () => {
      const contactsQb = createMockQueryBuilder();
      const employeesQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({
          id: 'emp-reconcile',
          first_name: 'Reconcile',
          is_active: true,
        }),
      });
      const rolesQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({
          id: 'role-emp-id',
          name: 'EMPLOYEE',
        }),
      });

      // linkedUser already mapped to employee, but stale orphaned user holds this phone
      const linkedUser = {
        id: 'u-linked',
        employee_id: 'emp-reconcile',
        phone_number: '998999999999',
        status: 'Open',
        is_active: true,
      };
      const userByPhone = {
        id: 'u-orphan',
        employee_id: null,
        phone_number: '998901234567',
        status: 'Pending',
      };

      let userFirstCall = 0;
      const usersQb = createMockQueryBuilder({
        first: jest.fn(() => {
          userFirstCall++;
          if (userFirstCall === 1) return Promise.resolve(linkedUser); // linkedUser query
          return Promise.resolve(userByPhone); // userByPhone query
        }),
      });

      mockKnex.mockImplementation((table: string) => {
        if (table === 'telegram_contacts') return contactsQb;
        if (table === 'employees') return employeesQb;
        if (table === 'roles') return rolesQb;
        if (table === 'users') return usersQb;
        return createMockQueryBuilder();
      });

      const update = {
        message: {
          chat: { id: 88888 },
          contact: {
            phone_number: '998901234567',
            first_name: 'Reconcile',
            user_id: 88888,
          },
        },
      };

      await service.handleUpdate(update);

      // Orphaned conflicting row deleted before updating linkedUser phone
      expect(usersQb.del).toHaveBeenCalled();
      expect(usersQb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          phone_number: '998901234567',
        }),
      );
    });
  });

  describe('sendOtp', () => {
    it('should find contact by phone variants', async () => {
      const contactsQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({
          chat_id: '77777',
          phone_number: '998901234567',
        }),
      });

      mockKnex.mockImplementation((table: string) => {
        if (table === 'telegram_contacts') return contactsQb;
        return createMockQueryBuilder();
      });

      // Mock native global fetch
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ ok: true }),
      }) as any;

      const sent = await service.sendOtp('901234567', '123456');

      expect(sent).toBe(true);
      expect(contactsQb.whereIn).toHaveBeenCalledWith(
        'phone_number',
        expect.arrayContaining(['998901234567', '901234567']),
      );

      global.fetch = originalFetch;
    });

    it('should fallback to employee secondary phone in telegram_contacts when primary phone not directly registered', async () => {
      const employee = {
        id: 'emp-multi-phone',
        phone: '998901111111',
        secondary_phone: '998902222222',
      };

      let contactCallCount = 0;
      mockKnex.mockImplementation((table: string) => {
        if (table === 'telegram_contacts') {
          contactCallCount++;
          // First call: for primary phone -> returns null
          // Second call: for secondary phone -> returns contact
          if (contactCallCount === 1) {
            return createMockQueryBuilder({
              first: jest.fn().mockResolvedValue(null),
            });
          }
          return createMockQueryBuilder({
            first: jest.fn().mockResolvedValue({
              chat_id: '88888',
              phone_number: '998902222222',
            }),
          });
        }
        if (table === 'employees') {
          return createMockQueryBuilder({
            first: jest.fn().mockResolvedValue(employee),
          });
        }
        return createMockQueryBuilder();
      });

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ ok: true }),
      }) as any;

      const sent = await service.sendOtp('998901111111', '654321');

      expect(sent).toBe(true);
      global.fetch = originalFetch;
    });
  });

  describe('handleUpdate role preservation', () => {
    it('should preserve and resolve ROP role_id when linkedUser is an ROP', async () => {
      const contactsQb = createMockQueryBuilder();
      const employeesQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({ id: 'emp-rop', is_active: true }),
      });
      const rolesQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({ id: 'role-rop-id', name: 'ROP' }),
      });
      const usersQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({
          id: 'u-rop',
          employee_id: 'emp-rop',
          phone_number: '998901234567',
          role: 'ROP',
          role_id: null,
          status: 'Pending',
        }),
      });

      mockKnex.mockImplementation((table: string) => {
        if (table === 'telegram_contacts') return contactsQb;
        if (table === 'employees') return employeesQb;
        if (table === 'roles') return rolesQb;
        if (table === 'users') return usersQb;
        return createMockQueryBuilder();
      });

      const update = {
        message: {
          chat: { id: 55555, username: 'rop_user' },
          contact: {
            phone_number: '+998901234567',
            first_name: 'ROP',
            user_id: 55555,
          },
        },
      };

      await service.handleUpdate(update);

      expect(usersQb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'ROP',
          role_id: 'role-rop-id',
        }),
      );
    });
  });
});

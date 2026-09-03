import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { RedisService } from '../redis/redis.service';
import { TelegramBotService } from './telegram-bot.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

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
    whereNot: jest.fn().mockReturnThis(),
    whereRaw: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orWhereIn: jest.fn().mockReturnThis(),
    orWhereRaw: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockResolvedValue(1),
    insert: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([]),
    }),
    returning: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(1),
    first: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
  return qb;
}

describe('AuthService', () => {
  let service: AuthService;
  let mockKnex: any;
  let mockRedisService: any;
  let mockTelegramBotService: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockKnex = jest.fn();
    mockKnex.fn = { now: jest.fn().mockReturnValue('NOW()') };
    mockKnex.raw = jest.fn((sql, bindings) => ({ sql, bindings }));

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    mockTelegramBotService = {
      isUserRegistered: jest.fn().mockResolvedValue(true),
      sendOtp: jest.fn().mockResolvedValue(true),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'jwtSecret') return 'test_secret';
        if (key === 'jwtExpiresIn') return '1d';
        if (key === 'refreshTokenExpiresIn') return '30m';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: KNEX_CONNECTION, useValue: mockKnex },
        { provide: RedisService, useValue: mockRedisService },
        { provide: TelegramBotService, useValue: mockTelegramBotService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('healUserAccount', () => {
    it('should auto-link employee_id when missing if employee exists by phone variants', async () => {
      const user: any = {
        id: 'u-1',
        employee_id: null,
        phone_number: '998901234567',
        role: 'EMPLOYEE',
        role_id: 'r-1',
      };

      const matchingEmployee = {
        id: 'emp-100',
        phone: '998901234567',
        first_name: 'Ali',
        last_name: 'Valiyev',
        is_active: true,
      };

      const employeeQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue(matchingEmployee),
      });
      const userQb = createMockQueryBuilder();
      const rolesQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({ id: 'r-1', name: 'EMPLOYEE' }),
      });

      mockKnex.mockImplementation((table: string) => {
        if (table === 'employees') return employeeQb;
        if (table === 'users') return userQb;
        if (table === 'roles') return rolesQb;
        return createMockQueryBuilder();
      });

      const healed = await service.healUserAccount(user);

      expect(healed.employee_id).toBe('emp-100');
      expect(userQb.update).toHaveBeenCalledWith(
        expect.objectContaining({ employee_id: 'emp-100' }),
      );
    });

    it('should auto-heal missing role_id from roles table', async () => {
      const user: any = {
        id: 'u-2',
        employee_id: 'emp-1',
        phone_number: '998901234567',
        role: 'ROP',
        role_id: null,
      };

      const rolesQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({ id: 'r-rop', name: 'ROP' }),
      });
      const userQb = createMockQueryBuilder();

      mockKnex.mockImplementation((table: string) => {
        if (table === 'roles') return rolesQb;
        if (table === 'users') return userQb;
        return createMockQueryBuilder();
      });

      const healed = await service.healUserAccount(user);

      expect(healed.role_id).toBe('r-rop');
      expect(userQb.update).toHaveBeenCalledWith(
        expect.objectContaining({ role_id: 'r-rop' }),
      );
    });
  });

  describe('registerSendOtp', () => {
    it('should disallow registration (account_not_found) when no employee profile exists', async () => {
      const contactQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({ phone_number: '998901234567' }),
      });
      const employeeQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue(null), // No employee exists!
      });

      mockKnex.mockImplementation((table: string) => {
        if (table === 'telegram_contacts') return contactQb;
        if (table === 'employees') return employeeQb;
        return createMockQueryBuilder();
      });

      await expect(
        service.registerSendOtp({ phone_number: '901234567' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should revive Deleted user account to Pending on re-hiring/registration', async () => {
      const contactQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({ phone_number: '998901234567' }),
      });
      const employeeQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({
          id: 'emp-revive',
          phone: '998901234567',
          is_active: true,
        }),
      });

      const deletedUser: any = {
        id: 'u-deleted',
        employee_id: 'emp-revive',
        phone_number: '998901234567',
        status: 'Deleted',
        is_active: false,
        password_hash: 'old_hash',
      };

      const userQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue(deletedUser),
      });
      const rolesQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({ id: 'r-emp', name: 'EMPLOYEE' }),
      });

      mockKnex.mockImplementation((table: string) => {
        if (table === 'telegram_contacts') return contactQb;
        if (table === 'employees') return employeeQb;
        if (table === 'users') return userQb;
        if (table === 'roles') return rolesQb;
        return createMockQueryBuilder();
      });

      const res = await service.registerSendOtp({
        phone_number: '+998 90 123 45 67',
      });

      expect(res.message).toBe('OTP message sent successfully.');
      expect(userQb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'Pending',
          is_active: true,
          password_hash: '',
        }),
      );
      expect(mockRedisService.set).toHaveBeenCalled();
      expect(mockTelegramBotService.sendOtp).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should find user with 9-digit input when stored as 12-digit international format', async () => {
      const passwordHash = await bcrypt.hash('secret123', 10);
      const userRecord: any = {
        id: 'u-login',
        employee_id: 'emp-1',
        phone_number: '998901234567',
        username: '998901234567',
        password_hash: passwordHash,
        role: 'EMPLOYEE',
        role_id: 'r-emp',
        status: 'Open',
        is_active: true,
      };

      const userQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue(userRecord),
      });
      const rolesQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({ id: 'r-emp', name: 'EMPLOYEE' }),
      });

      mockKnex.mockImplementation((table: string) => {
        if (table.startsWith('users')) return userQb;
        if (table === 'roles') return rolesQb;
        return createMockQueryBuilder();
      });

      const res = await service.login({
        phone_number: '901234567', // 9-digit local format input
        password: 'secret123',
      });

      expect(res.accessToken).toBeDefined();
      expect(res.refreshToken).toBeDefined();
      expect(res.user.id).toBe('u-login');
      expect(res.user.phone_number).toBe('998901234567');
    });

    it('should allow login via employee secondary phone', async () => {
      const passwordHash = await bcrypt.hash('secret123', 10);
      const userRecord: any = {
        id: 'u-sec-login',
        employee_id: 'emp-both',
        phone_number: '998901111111', // Primary phone on user row
        password_hash: passwordHash,
        status: 'Open',
        role: 'EMPLOYEE',
        role_id: 'r-1',
        is_active: true,
      };

      const employeeRecord: any = {
        id: 'emp-both',
        phone: '998901111111',
        secondary_phone: '998902222222',
        is_active: true,
      };

      let userCallCount = 0;
      const customKnex = jest.fn((table: string) => {
        if (table.startsWith('users')) {
          userCallCount++;
          // First call: by phone -> returns null
          // Second call: by employee_id -> returns userRecord
          if (userCallCount === 1) {
            return createMockQueryBuilder({
              first: jest.fn().mockResolvedValue(null),
            });
          }
          return createMockQueryBuilder({
            first: jest.fn().mockResolvedValue(userRecord),
          });
        }
        if (table === 'employees') {
          return createMockQueryBuilder({
            first: jest.fn().mockResolvedValue(employeeRecord),
          });
        }
        if (table === 'roles') {
          return createMockQueryBuilder({
            first: jest.fn().mockResolvedValue({ id: 'r-1', name: 'EMPLOYEE' }),
          });
        }
        return createMockQueryBuilder();
      });
      (customKnex as any).fn = { now: jest.fn().mockReturnValue('NOW()') };
      (customKnex as any).raw = jest.fn((sql, bindings) => ({ sql, bindings }));

      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: KNEX_CONNECTION, useValue: customKnex },
          { provide: RedisService, useValue: mockRedisService },
          { provide: TelegramBotService, useValue: mockTelegramBotService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const authSvc = module.get<AuthService>(AuthService);
      const res = await authSvc.login({
        phone_number: '998902222222', // Logging in with secondary phone
        password: 'secret123',
      });

      expect(res.accessToken).toBeDefined();
      expect(res.user.id).toBe('u-sec-login');
    });

    it('should reject login if user is Pending registration', async () => {
      const passwordHash = await bcrypt.hash('secret123', 10);
      const userRecord: any = {
        id: 'u-pending',
        phone_number: '998901234567',
        password_hash: passwordHash,
        status: 'Pending',
        is_active: true,
      };

      const userQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue(userRecord),
      });

      mockKnex.mockImplementation(() => userQb);

      await expect(
        service.login({
          phone_number: '998901234567',
          password: 'secret123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('healUserAccount conflict safety', () => {
    it('should safely clear employee_id from placeholder user before auto-linking active user', async () => {
      const activeUser: any = {
        id: 'u-active',
        employee_id: null,
        phone_number: '998901234567',
        status: 'Open',
        password_hash: 'hashed_pw',
        role: 'EMPLOYEE',
        role_id: 'r-1',
      };

      const placeholderHolder: any = {
        id: 'u-placeholder',
        employee_id: 'emp-100',
        phone_number: '998901234567',
        status: 'Pending',
        password_hash: '',
      };

      const matchingEmployee = {
        id: 'emp-100',
        phone: '998901234567',
        is_active: true,
      };

      const empQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue(matchingEmployee),
      });
      const userQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue(placeholderHolder),
      });
      const rolesQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({ id: 'r-1', name: 'EMPLOYEE' }),
      });

      mockKnex.mockImplementation((table: string) => {
        if (table === 'employees') return empQb;
        if (table === 'users') return userQb;
        if (table === 'roles') return rolesQb;
        return createMockQueryBuilder();
      });

      const healed = await service.healUserAccount(activeUser);

      expect(healed.employee_id).toBe('emp-100');
      // Checked that existing holder was cleared first
      expect(userQb.update).toHaveBeenCalledWith(
        expect.objectContaining({ employee_id: null }),
      );
    });
  });

  describe('registerSetPassword with secondary phone', () => {
    it('should find user linked via employee profile when registering with secondary phone', async () => {
      mockRedisService.get.mockResolvedValue('998902222222'); // Registered with secondary phone

      const pendingUser: any = {
        id: 'u-pending-emp',
        employee_id: 'emp-sec',
        phone_number: '998901111111', // Primary phone on user row
        status: 'Pending',
        password_hash: '',
        role: 'EMPLOYEE',
        role_id: 'r-1',
      };

      const employee: any = {
        id: 'emp-sec',
        phone: '998901111111',
        secondary_phone: '998902222222',
        is_active: true,
      };

      let userLookupCount = 0;
      mockKnex.mockImplementation((table: string) => {
        if (table === 'users') {
          userLookupCount++;
          // First query: by phone variants -> returns null
          // Second query: by employee_id -> returns pendingUser
          if (userLookupCount === 1) {
            return createMockQueryBuilder({
              first: jest.fn().mockResolvedValue(null),
            });
          }
          return createMockQueryBuilder({
            first: jest.fn().mockResolvedValue(pendingUser),
          });
        }
        if (table === 'employees') {
          return createMockQueryBuilder({
            first: jest.fn().mockResolvedValue(employee),
          });
        }
        if (table === 'roles') {
          return createMockQueryBuilder({
            first: jest.fn().mockResolvedValue({ id: 'r-1', name: 'EMPLOYEE' }),
          });
        }
        return createMockQueryBuilder();
      });

      const res = await service.registerSetPassword({
        token: 'valid-token',
        password: 'NewPassword123!',
        password_confirmation: 'NewPassword123!',
      });

      expect(res.message).toContain('Registration completed successfully');
    });
  });

  describe('resetPasswordSendOtp', () => {
    it('should give clear registration hint if employee exists but user account not registered', async () => {
      const contactQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue({ phone_number: '998901234567' }),
      });
      const userQb = createMockQueryBuilder({
        first: jest.fn().mockResolvedValue(null), // No user account yet
      });
      const employeeQb = createMockQueryBuilder({
        first: jest
          .fn()
          .mockResolvedValue({ id: 'emp-only', phone: '998901234567' }),
      });

      mockKnex.mockImplementation((table: string) => {
        if (table === 'telegram_contacts') return contactQb;
        if (table === 'users') return userQb;
        if (table === 'employees') return employeeQb;
        return createMockQueryBuilder();
      });

      await expect(
        service.resetPasswordSendOtp({ phone_number: '901234567' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

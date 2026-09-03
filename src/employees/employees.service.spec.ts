import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { MinioService } from '../minio/minio.service';
import { RedisService } from '../redis/redis.service';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let mockKnex: any;
  let mockMinioService: any;
  let mockRedisService: any;

  const createQB = (overrides: Record<string, any> = {}): any => ({
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn((...args: any[]) => {
      if (typeof args[0] === 'function') {
        const sub = createQB();
        args[0](sub);
      }
      return createQB(overrides);
    }),
    whereIn: jest.fn().mockReturnThis(),
    whereRaw: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orWhereIn: jest.fn().mockReturnThis(),
    orWhereRaw: jest.fn().mockReturnThis(),
    whereNot: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    sum: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockResolvedValue([]),
    first: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(1),
    insert: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([]),
    }),
    returning: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(1),
    ...overrides,
  });

  beforeEach(async () => {
    mockKnex = jest.fn(() => createQB());
    mockKnex.fn = { now: jest.fn() };
    mockKnex.schema = {
      hasColumn: jest.fn().mockResolvedValue(true),
    };
    mockMinioService = {
      getPresignedUrl: jest.fn(),
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
    };
    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        {
          provide: KNEX_CONNECTION,
          useValue: mockKnex,
        },
        {
          provide: MinioService,
          useValue: mockMinioService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllEmployees', () => {
    it('should return { meta, data } with plan_completed and total_revenue objects', async () => {
      const mockRawEmployee = {
        id: 'emp-uuid-1',
        first_name: 'Jasur',
        last_name: 'Yoldoshev',
        phone: '+998901234567',
        department_name: 'sales',
        department_display_name: 'Sales',
        role_name: 'Sales Manager',
        user_status: 'Open',
        is_active: true,
        fixed_salary: '1000',
        currency: 'USD',
        color: '#336699',
        _raw_picture_path: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockKnexQueryBuilder: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereBetween: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orWhereBetween: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ total: 1, open_employees: 1 }),
        then: jest
          .fn()
          .mockImplementation((cb: any) =>
            Promise.resolve(cb([mockRawEmployee])),
          ),
      };

      mockKnex.raw = jest.fn((str: string) => str);
      mockKnex.schema = {
        hasTable: jest.fn().mockResolvedValue(true),
        hasColumn: jest.fn().mockResolvedValue(true),
      };

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const testConfirmedDate = `${currentYear}-${currentMonth}-15`;

      const mockKnexFn: any = jest.fn((table: string) => {
        if (table === 'employee_plans') {
          return {
            ...mockKnexQueryBuilder,
            select: jest.fn().mockResolvedValue([
              {
                employee_id: 'emp-uuid-1',
                ltl_target_volume: '100',
                ftl_target_amount: '50000',
                currency: 'USD',
                period: `${currentYear}-${currentMonth}-01`,
              },
            ]),
          };
        }
        if (table === 'cargo_registrations') {
          return {
            ...mockKnexQueryBuilder,
            select: jest.fn().mockResolvedValue([
              {
                employee_id: 'emp-uuid-1',
                cargo_type: 'LTL',
                volume: '80',
                sell_price: '0',
                sell_currency: 'USD',
                confirmed_date: testConfirmedDate,
              },
              {
                employee_id: 'emp-uuid-1',
                cargo_type: 'FTL',
                volume: '0',
                sell_price: '40000',
                sell_currency: 'USD',
                confirmed_date: testConfirmedDate,
              },
              {
                employee_id: 'emp-uuid-1',
                cargo_type: 'FTL',
                volume: '0',
                sell_price: '12850000',
                sell_currency: 'UZS',
                sell_usd_rate: 12850,
                confirmed_date: testConfirmedDate,
              },
            ]),
          };
        }
        if (table === 'cargo_transactions') {
          return {
            ...mockKnexQueryBuilder,
            select: jest.fn().mockResolvedValue([]),
          };
        }
        if (table === 'clients') {
          return {
            ...mockKnexQueryBuilder,
            groupBy: jest
              .fn()
              .mockResolvedValue([{ employee_id: 'emp-uuid-1', count: '5' }]),
          };
        }
        return {
          ...mockKnexQueryBuilder,
          offset: jest.fn().mockResolvedValue([mockRawEmployee]),
        };
      });

      mockKnexFn.raw = jest.fn((str: string) => str);
      mockKnexFn.schema = {
        hasTable: jest.fn().mockResolvedValue(true),
        hasColumn: jest.fn().mockResolvedValue(true),
      };

      const customModule: TestingModule = await Test.createTestingModule({
        providers: [
          EmployeesService,
          {
            provide: KNEX_CONNECTION,
            useValue: mockKnexFn,
          },
          {
            provide: MinioService,
            useValue: mockMinioService,
          },
          {
            provide: RedisService,
            useValue: mockRedisService,
          },
        ],
      }).compile();

      const customService =
        customModule.get<EmployeesService>(EmployeesService);
      const res = await customService.findAllEmployees({ page: 1, limit: 10 });

      expect(res).toHaveProperty('meta');
      expect(res).toHaveProperty('data');
      expect(res.meta.total).toBe(1);
      expect(res.meta.open_employees).toBe(1);
      expect(res.meta.offset).toBe(0);
      expect(res.meta.limit).toBe(10);
      expect(res.meta.plan_completed.ltl_completion).toBe(80);
      expect(res.meta.plan_completed.ftl_completion).toBe(82);
      expect(res.meta.total_revenue.USD).toBe(40000);
      expect(res.meta.total_revenue.UZS).toBe(12850000);
      expect(res.meta.total_revenue.RUB).toBe(0);

      expect(res.data.length).toBe(1);
      const emp = res.data[0];
      expect(emp.full_name).toBe('Jasur Yoldoshev');
      expect(emp.role_name).toBe('Sales Manager');
      expect(emp.department_name).toBe('Sales');
      expect(emp.status).toBe('Open');
      expect(emp.total_assigned_employees).toBe(5);
      expect(emp.color).toBe('#336699');
      expect(emp.plan_completion.ltl_completion).toBe(80);
      expect(emp.plan_completion.ftl_completion).toBe(82);
      expect(emp.total_revenue.USD).toBe(40000);
      expect(emp.total_revenue.UZS).toBe(12850000);
      expect(emp.total_revenue.RUB).toBe(0);
      expect((emp as any).first_name).toBeUndefined();
      expect((emp as any).last_name).toBeUndefined();
      expect((emp as any).phone).toBeUndefined();
      expect((emp as any).secondary_phone).toBeUndefined();
      expect((emp as any).address).toBeUndefined();
      expect((emp as any).department_id).toBeUndefined();
      expect((emp as any).fixed_salary).toBeUndefined();
      expect((emp as any).currency).toBeUndefined();
    });

    it('should calculate plans completions with Net Yield (sell - purchase) exactly as cargo-kpi/plans', async () => {
      const mockRawEmployee1 = {
        id: 'emp-uuid-1',
        first_name: 'Jasur',
        last_name: 'Yoldoshev',
        department_name: 'sales',
        role_name: 'Sales Manager',
        user_status: 'Open',
        is_active: true,
        color: '#336699',
        created_at: new Date(),
      };
      const mockRawEmployee2 = {
        id: 'emp-uuid-2',
        first_name: 'Alisher',
        last_name: 'Navoiy',
        department_name: 'sales',
        role_name: 'Sales Manager',
        user_status: 'Open',
        is_active: true,
        color: '#993366',
        created_at: new Date(),
      };

      const mockKnexQueryBuilder: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereBetween: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orWhereBetween: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ total: 2, open_employees: 2 }),
      };

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const testConfirmedDate = `${currentYear}-${currentMonth}-15`;

      const mockKnexFn: any = jest.fn((table: string) => {
        if (table === 'employee_plans') {
          return {
            ...mockKnexQueryBuilder,
            select: jest.fn().mockResolvedValue([
              {
                employee_id: 'emp-uuid-1',
                ltl_target_volume: '200',
                ftl_target_amount: '10000',
                currency: 'USD',
                period: `${currentYear}-${currentMonth}-01`,
              },
              {
                employee_id: 'emp-uuid-2',
                ltl_target_volume: '100',
                ftl_target_amount: '20000',
                currency: 'USD',
                period: `${currentYear}-${currentMonth}-01`,
              },
            ]),
          };
        }
        if (table === 'cargo_registrations') {
          return {
            ...mockKnexQueryBuilder,
            select: jest.fn().mockResolvedValue([
              // Employee 1: LTL 150m3 / 200m3 = 75%
              {
                employee_id: 'emp-uuid-1',
                cargo_type: 'LTL',
                volume: '150',
                confirmed_date: testConfirmedDate,
              },
              // Employee 1: FTL Net Yield: sell 12000 - purchase 4000 = 8000 USD / 10000 USD = 80%
              {
                employee_id: 'emp-uuid-1',
                cargo_type: 'FTL',
                volume: '0',
                sell_price: '12000',
                sell_currency: 'USD',
                purchase_price: '4000',
                purchase_currency: 'USD',
                confirmed_date: testConfirmedDate,
              },
              // Employee 2: LTL 50m3 / 100m3 = 50%
              {
                employee_id: 'emp-uuid-2',
                cargo_type: 'LTL',
                volume: '50',
                confirmed_date: testConfirmedDate,
              },
              // Employee 2: FTL Net Yield: sell 20000 - purchase 5000 = 15000 USD / 20000 USD = 75%
              {
                employee_id: 'emp-uuid-2',
                cargo_type: 'FTL',
                volume: '0',
                sell_price: '20000',
                sell_currency: 'USD',
                purchase_price: '5000',
                purchase_currency: 'USD',
                confirmed_date: testConfirmedDate,
              },
            ]),
          };
        }
        if (table === 'cargo_transactions') {
          return {
            ...mockKnexQueryBuilder,
            select: jest.fn().mockResolvedValue([]),
          };
        }
        if (table === 'clients') {
          return {
            ...mockKnexQueryBuilder,
            groupBy: jest.fn().mockResolvedValue([]),
          };
        }
        return {
          ...mockKnexQueryBuilder,
          offset: jest
            .fn()
            .mockResolvedValue([mockRawEmployee1, mockRawEmployee2]),
        };
      });

      mockKnexFn.raw = jest.fn((str: string) => str);
      mockKnexFn.schema = {
        hasTable: jest.fn().mockResolvedValue(true),
        hasColumn: jest.fn().mockResolvedValue(true),
      };

      const customModule: TestingModule = await Test.createTestingModule({
        providers: [
          EmployeesService,
          {
            provide: KNEX_CONNECTION,
            useValue: mockKnexFn,
          },
          {
            provide: MinioService,
            useValue: mockMinioService,
          },
          {
            provide: RedisService,
            useValue: mockRedisService,
          },
        ],
      }).compile();

      const customService =
        customModule.get<EmployeesService>(EmployeesService);
      const res = await customService.findAllEmployees({ page: 1, limit: 10 });

      // Employee 1
      expect(res.data[0].plan_completion.ltl_completion).toBe(75);
      expect(res.data[0].plan_completion.ftl_completion).toBe(80);
      expect(res.data[0].total_revenue.USD).toBe(8000);
      expect(res.data[0].total_revenue.UZS).toBe(0);
      expect(res.data[0].total_revenue.RUB).toBe(0);

      // Employee 2
      expect(res.data[1].plan_completion.ltl_completion).toBe(50);
      expect(res.data[1].plan_completion.ftl_completion).toBe(75);
      expect(res.data[1].total_revenue.USD).toBe(15000);
      expect(res.data[1].total_revenue.UZS).toBe(0);
      expect(res.data[1].total_revenue.RUB).toBe(0);

      // Meta:
      // Total LTL: (150 + 50) / (200 + 100) = 200 / 300 = 66.67%
      expect(res.meta.plan_completed.ltl_completion).toBe(66.67);
      // Total FTL: (8000 + 15000) / (10000 + 20000) = 23000 / 30000 = 76.67%
      expect(res.meta.plan_completed.ftl_completion).toBe(76.67);
      expect(res.meta.total_revenue.USD).toBe(23000);
      expect(res.meta.total_revenue.UZS).toBe(0);
      expect(res.meta.total_revenue.RUB).toBe(0);
    });

    it('should calculate multi-currency total_revenue representing net yields only for cargo registrations and cargo transactions', async () => {
      const mockRawEmployee = {
        id: 'emp-uuid-1',
        first_name: 'Jasur',
        last_name: 'Yoldoshev',
        department_name: 'sales',
        role_name: 'Sales Manager',
        user_status: 'Open',
        is_active: true,
        color: '#336699',
        created_at: new Date(),
      };

      const mockKnexQueryBuilder: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereBetween: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orWhereBetween: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ total: 1, open_employees: 1 }),
      };

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const testConfirmedDate = `${currentYear}-${currentMonth}-15`;

      const mockKnexFn: any = jest.fn((table: string) => {
        if (table === 'employee_plans') {
          return {
            ...mockKnexQueryBuilder,
            select: jest.fn().mockResolvedValue([]),
          };
        }
        if (table === 'cargo_registrations') {
          return {
            ...mockKnexQueryBuilder,
            select: jest.fn().mockResolvedValue([
              // 1. USD: sell 10,000 USD, purchase 6,000 USD => net yield = 4,000 USD
              {
                employee_id: 'emp-uuid-1',
                cargo_type: 'FTL',
                sell_price: '10000',
                sell_currency: 'USD',
                purchase_price: '6000',
                purchase_currency: 'USD',
                confirmed_date: testConfirmedDate,
              },
              // 2. UZS: sell 25,700,000 UZS, purchase 1,000 USD (rate 12,850 => 12,850,000 UZS) => net yield = 12,850,000 UZS
              {
                employee_id: 'emp-uuid-1',
                cargo_type: 'FTL',
                sell_price: '25700000',
                sell_currency: 'UZS',
                sell_usd_rate: 12850,
                purchase_price: '1000',
                purchase_currency: 'USD',
                purchase_usd_rate: 12850,
                confirmed_date: testConfirmedDate,
              },
              // 3. RUB: sell 500,000 RUB, purchase 300,000 RUB => net yield = 200,000 RUB
              {
                employee_id: 'emp-uuid-1',
                cargo_type: 'FTL',
                sell_price: '500000',
                sell_currency: 'RUB',
                purchase_price: '300000',
                purchase_currency: 'RUB',
                confirmed_date: testConfirmedDate,
              },
            ]),
          };
        }
        if (table === 'cargo_transactions') {
          return {
            ...mockKnexQueryBuilder,
            select: jest.fn().mockResolvedValue([
              // Cargo transaction: sell 5,000 USD, buy 3,500 USD, margin 1,500 USD
              {
                employee_id: 'emp-uuid-1',
                sell_price: '5000',
                buy_price: '3500',
                margin: '1500',
                currency: 'USD',
              },
              // Cargo transaction: sell 10,000,000 UZS, buy 8,000,000 UZS, margin 2,000,000 UZS
              {
                employee_id: 'emp-uuid-1',
                sell_price: '10000000',
                buy_price: '8000000',
                margin: '2000000',
                currency: 'UZS',
              },
            ]),
          };
        }
        if (table === 'clients') {
          return {
            ...mockKnexQueryBuilder,
            groupBy: jest.fn().mockResolvedValue([]),
          };
        }
        return {
          ...mockKnexQueryBuilder,
          offset: jest.fn().mockResolvedValue([mockRawEmployee]),
        };
      });

      mockKnexFn.raw = jest.fn((str: string) => str);
      mockKnexFn.schema = {
        hasTable: jest.fn().mockResolvedValue(true),
        hasColumn: jest.fn().mockResolvedValue(true),
      };

      const customModule: TestingModule = await Test.createTestingModule({
        providers: [
          EmployeesService,
          {
            provide: KNEX_CONNECTION,
            useValue: mockKnexFn,
          },
          {
            provide: MinioService,
            useValue: mockMinioService,
          },
          {
            provide: RedisService,
            useValue: mockRedisService,
          },
        ],
      }).compile();

      const customService =
        customModule.get<EmployeesService>(EmployeesService);
      const res = await customService.findAllEmployees({ page: 1, limit: 10 });

      // Total Net Yields:
      // USD: 4000 (cargo_reg) + 1500 (cargo_tx) = 5500 USD
      // UZS: 12850000 (cargo_reg) + 2000000 (cargo_tx) = 14850000 UZS
      // RUB: 200000 (cargo_reg) = 200000 RUB
      expect(res.data[0].total_revenue.USD).toBe(5500);
      expect(res.data[0].total_revenue.UZS).toBe(14850000);
      expect(res.data[0].total_revenue.RUB).toBe(200000);

      expect(res.meta.total_revenue.USD).toBe(5500);
      expect(res.meta.total_revenue.UZS).toBe(14850000);
      expect(res.meta.total_revenue.RUB).toBe(200000);
    });
  });

  describe('findEmployeeByUserId', () => {
    it('should include cargo_consolidations permissions in the returned profile', async () => {
      const mockUserRow = {
        user_id: 'usr-1',
        user_phone: '+998901234567',
        username: 'john_doe',
        role: 'EMPLOYEE',
        role_id: 'role-1',
        status: 'active',
        user_is_active: true,
        user_created_at: new Date(),
        user_updated_at: new Date(),
        role_name: 'EMPLOYEE',
        role_display_name: 'Employee',
        role_description: 'Standard employee',
        role_permissions: JSON.stringify({
          cargo_consolidations: {
            create: true,
            read: true,
            update: true,
            delete: false,
            assign_cargo: true,
          },
        }),
        role_is_system: true,
        employee_id: 'emp-1',
        first_name: 'John',
        last_name: 'Doe',
        employee_phone: '+998901234567',
        secondary_phone: null,
        address: 'Tashkent',
        fixed_salary: '1000',
        currency: 'USD',
        color: '#ff0000',
        employee_picture_path: null,
        employee_is_active: true,
        department_id: 'dep-1',
        department_name: 'logistics',
        department_display_name: 'Logistics',
      };

      const mockQueryBuilder: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockResolvedValue([]),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUserRow),
      };

      const customKnex: any = jest.fn(() => mockQueryBuilder);
      customKnex.schema = {
        hasTable: jest.fn().mockResolvedValue(false),
        hasColumn: jest.fn().mockResolvedValue(true),
      };

      const customModule: TestingModule = await Test.createTestingModule({
        providers: [
          EmployeesService,
          {
            provide: KNEX_CONNECTION,
            useValue: customKnex,
          },
          {
            provide: MinioService,
            useValue: mockMinioService,
          },
          {
            provide: RedisService,
            useValue: mockRedisService,
          },
        ],
      }).compile();

      const customService =
        customModule.get<EmployeesService>(EmployeesService);
      const res = await customService.findEmployeeByUserId('usr-1');

      expect(res.permissions).toBeDefined();
      expect(res.permissions.cargo_consolidations).toEqual({
        create: true,
        read: true,
        update: true,
        delete: false,
        assign_cargo: true,
      });
      expect(res.user.permissions.cargo_consolidations).toEqual({
        create: true,
        read: true,
        update: true,
        delete: false,
        assign_cargo: true,
      });
    });

    it('should auto-heal employee_id when missing if employee matches phone variants', async () => {
      const createQB = (overrides: Record<string, any> = {}): any => ({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn((...args: any[]) => {
          if (typeof args[0] === 'function') {
            const sub = createQB();
            args[0](sub);
          }
          return createQB(overrides);
        }),
        whereIn: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orWhereIn: jest.fn().mockReturnThis(),
        orWhereRaw: jest.fn().mockReturnThis(),
        whereNot: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockResolvedValue([]),
        first: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(1),
        insert: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
        del: jest.fn().mockResolvedValue(1),
        ...overrides,
      });

      const userWithoutEmp: any = {
        user_id: 'u-unlinked',
        user_phone: '901234567',
        role: 'EMPLOYEE',
        role_id: 'r-1',
        employee_id: null,
      };

      const matchedEmp = {
        id: 'emp-found',
        first_name: 'Auto',
        last_name: 'Linked',
        phone: '998901234567',
        is_active: true,
      };

      const userWithEmp: any = {
        user_id: 'u-unlinked',
        user_phone: '901234567',
        role: 'EMPLOYEE',
        role_id: 'r-1',
        employee_id: 'emp-found',
        first_name: 'Auto',
        last_name: 'Linked',
      };

      let userQueryCount = 0;
      const customKnex: any = jest.fn((table: string) => {
        if (table.startsWith('users')) {
          userQueryCount++;
          return createQB({
            first: jest
              .fn()
              .mockResolvedValue(
                userQueryCount === 1 ? userWithoutEmp : userWithEmp,
              ),
            update: jest.fn().mockResolvedValue(1),
          });
        }
        if (table === 'employees') {
          return createQB({
            first: jest.fn().mockResolvedValue(matchedEmp),
          });
        }
        return createQB();
      });
      customKnex.fn = { now: jest.fn() };
      customKnex.schema = {
        hasTable: jest.fn().mockResolvedValue(false),
        hasColumn: jest.fn().mockResolvedValue(true),
      };

      const customModule: TestingModule = await Test.createTestingModule({
        providers: [
          EmployeesService,
          { provide: KNEX_CONNECTION, useValue: customKnex },
          { provide: MinioService, useValue: mockMinioService },
          { provide: RedisService, useValue: mockRedisService },
        ],
      }).compile();

      const customService =
        customModule.get<EmployeesService>(EmployeesService);
      const res = await customService.findEmployeeByUserId('u-unlinked');

      expect(res.id).toBe('emp-found');
    });
  });

  describe('createEmployee', () => {
    it('should revive Deleted user account to Pending and active on employee creation', async () => {
      const createQB = (overrides: Record<string, any> = {}): any => ({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn((...args: any[]) => {
          if (typeof args[0] === 'function') {
            const sub = createQB();
            args[0](sub);
          }
          return createQB(overrides);
        }),
        whereIn: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orWhereIn: jest.fn().mockReturnThis(),
        orWhereRaw: jest.fn().mockReturnThis(),
        whereNot: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockResolvedValue([]),
        first: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(1),
        insert: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
        del: jest.fn().mockResolvedValue(1),
        ...overrides,
      });

      const deletedUser = {
        id: 'u-del',
        phone_number: '998901234567',
        status: 'Deleted',
        is_active: false,
        password_hash: 'old_pw',
      };

      const userUpdateMock = jest.fn().mockResolvedValue(1);

      const customKnex: any = jest.fn((table: string) => {
        if (table === 'departments') {
          return createQB({
            first: jest.fn().mockResolvedValue({ id: 'dep-1' }),
          });
        }
        if (table === 'roles') {
          return createQB({
            first: jest
              .fn()
              .mockResolvedValue({ id: 'role-1', name: 'EMPLOYEE' }),
          });
        }
        if (table === 'employees') {
          return createQB({
            first: jest.fn().mockResolvedValue(null),
            insert: jest.fn().mockReturnValue({
              returning: jest
                .fn()
                .mockResolvedValue([{ id: 'emp-new', phone: '998901234567' }]),
            }),
          });
        }
        if (table === 'users') {
          return createQB({
            first: jest.fn().mockResolvedValue(deletedUser),
            update: userUpdateMock,
          });
        }
        return createQB();
      });
      customKnex.fn = { now: jest.fn() };
      customKnex.transaction = jest.fn(async (cb: any) => {
        return await cb(customKnex);
      });

      const customModule: TestingModule = await Test.createTestingModule({
        providers: [
          EmployeesService,
          { provide: KNEX_CONNECTION, useValue: customKnex },
          { provide: MinioService, useValue: mockMinioService },
          { provide: RedisService, useValue: mockRedisService },
        ],
      }).compile();

      const customService =
        customModule.get<EmployeesService>(EmployeesService);
      await customService.createEmployee({
        first_name: 'John',
        last_name: 'Rehired',
        phone: '901234567',
        department_id: 'dep-1',
        role_id: 'role-1',
      });

      expect(userUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'Pending',
          is_active: true,
          password_hash: '',
        }),
      );
    });

    it('should reject employee creation when primary and secondary phone are identical', async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table === 'departments') {
          return createQB({
            first: jest.fn().mockResolvedValue({ id: 'dep-1' }),
          });
        }
        if (table === 'roles') {
          return createQB({
            first: jest
              .fn()
              .mockResolvedValue({ id: 'role-1', name: 'EMPLOYEE' }),
          });
        }
        return createQB();
      });

      let error: any;
      try {
        await service.createEmployee({
          first_name: 'Identical',
          last_name: 'Phones',
          phone: '+998901234567',
          secondary_phone: '901234567', // Same number in different format
          department_id: 'dep-1',
          role_id: 'role-1',
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(BadRequestException);
    });

    it('should link user when user exists matching secondary_phone', async () => {
      const userUpdateMock = jest.fn().mockResolvedValue(1);
      const customKnex: any = jest.fn((table: string) => {
        if (table === 'departments') {
          return createQB({
            first: jest.fn().mockResolvedValue({ id: 'dep-1' }),
          });
        }
        if (table === 'roles') {
          return createQB({
            first: jest
              .fn()
              .mockResolvedValue({ id: 'role-1', name: 'EMPLOYEE' }),
          });
        }
        if (table === 'employees') {
          return createQB({
            first: jest.fn().mockResolvedValue(null),
            insert: jest.fn().mockReturnValue({
              returning: jest
                .fn()
                .mockResolvedValue([
                  { id: 'emp-sec-linked', phone: '998901111111' },
                ]),
            }),
          });
        }
        if (table === 'users') {
          return createQB({
            first: jest.fn().mockResolvedValue({
              id: 'u-sec-user',
              phone_number: '998902222222',
              status: 'Pending',
              is_active: true,
            }),
            update: userUpdateMock,
          });
        }
        return createQB();
      });
      customKnex.fn = { now: jest.fn() };
      customKnex.transaction = jest.fn((cb: any) => cb(customKnex));

      const customModule: TestingModule = await Test.createTestingModule({
        providers: [
          EmployeesService,
          { provide: KNEX_CONNECTION, useValue: customKnex },
          { provide: MinioService, useValue: mockMinioService },
          { provide: RedisService, useValue: mockRedisService },
        ],
      }).compile();

      const customService =
        customModule.get<EmployeesService>(EmployeesService);
      await customService.createEmployee({
        first_name: 'Secondary',
        last_name: 'User',
        phone: '998901111111',
        secondary_phone: '998902222222',
        department_id: 'dep-1',
        role_id: 'role-1',
      });

      expect(userUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          employee_id: 'emp-sec-linked',
        }),
      );
    });
  });

  describe('updateEmployee', () => {
    it('should preserve Pending status and not set Open when activating employee with unregistered user', async () => {
      const userUpdateMock = jest.fn().mockResolvedValue(1);
      const pendingUnregisteredUser = {
        id: 'u-unregistered',
        employee_id: 'emp-1',
        phone_number: '998901234567',
        password_hash: '', // No password yet!
        status: 'Pending',
        is_active: false,
      };

      const customKnex: any = jest.fn((table: string) => {
        if (table === 'employees') {
          return createQB({
            first: jest
              .fn()
              .mockResolvedValue({ id: 'emp-1', phone: '998901234567' }),
            update: jest.fn().mockReturnValue({
              returning: jest
                .fn()
                .mockResolvedValue([{ id: 'emp-1', is_active: true }]),
            }),
          });
        }
        if (table === 'users') {
          return createQB({
            first: jest.fn().mockResolvedValue(pendingUnregisteredUser),
            update: userUpdateMock,
          });
        }
        return createQB();
      });
      customKnex.fn = { now: jest.fn() };
      customKnex.transaction = jest.fn((cb: any) => cb(customKnex));

      const customModule: TestingModule = await Test.createTestingModule({
        providers: [
          EmployeesService,
          { provide: KNEX_CONNECTION, useValue: customKnex },
          { provide: MinioService, useValue: mockMinioService },
          { provide: RedisService, useValue: mockRedisService },
        ],
      }).compile();

      const customService =
        customModule.get<EmployeesService>(EmployeesService);
      await customService.updateEmployee('emp-1', { is_active: true });

      expect(userUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: true,
          status: 'Pending', // Must NOT be 'Open' because user has no password!
        }),
      );
    });

    it('should reject updating secondary phone if it already belongs to another employee', async () => {
      let callCount = 0;
      mockKnex.mockImplementation((table: string) => {
        if (table === 'employees') {
          callCount++;
          // First call: find employee by id -> returns current employee
          // Second call: check if existing employee has secondary phone -> returns collision
          if (callCount === 1) {
            return createQB({
              first: jest.fn().mockResolvedValue({
                id: 'emp-1',
                phone: '998901111111',
                secondary_phone: null,
              }),
            });
          }
          return createQB({
            first: jest
              .fn()
              .mockResolvedValue({ id: 'emp-2', phone: '998903333333' }),
          });
        }
        return createQB();
      });

      let error: any;
      try {
        await service.updateEmployee('emp-1', {
          secondary_phone: '998903333333',
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(BadRequestException);
    });
  });
});

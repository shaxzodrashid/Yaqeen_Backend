import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { MinioService } from '../minio/minio.service';
import { RedisService } from '../redis/redis.service';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let mockKnex: any;
  let mockMinioService: any;
  let mockRedisService: any;

  beforeEach(async () => {
    mockKnex = jest.fn();
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
              },
              {
                employee_id: 'emp-uuid-1',
                cargo_type: 'FTL',
                volume: '0',
                sell_price: '40000',
                sell_currency: 'USD',
              },
              {
                employee_id: 'emp-uuid-1',
                cargo_type: 'FTL',
                volume: '0',
                sell_price: '12850000',
                sell_currency: 'UZS',
                sell_usd_rate: 12850,
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
      expect(emp.currency).toBeUndefined();
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

      // Employee 2
      expect(res.data[1].plan_completion.ltl_completion).toBe(50);
      expect(res.data[1].plan_completion.ftl_completion).toBe(75);

      // Meta:
      // Total LTL: (150 + 50) / (200 + 100) = 200 / 300 = 66.67%
      expect(res.meta.plan_completed.ltl_completion).toBe(66.67);
      // Total FTL: (8000 + 15000) / (10000 + 20000) = 23000 / 30000 = 76.67%
      expect(res.meta.plan_completed.ftl_completion).toBe(76.67);
    });
  });
});

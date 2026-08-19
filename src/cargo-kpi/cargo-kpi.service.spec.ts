import { Test, TestingModule } from '@nestjs/testing';
import { CargoKpiService } from './cargo-kpi.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { CargoType } from './dto/ltl-item.dto';
import { Currency } from '../currency/currency.types';

describe('CargoKpiService', () => {
  let service: CargoKpiService;
  let mockQueryBuilder: any;
  let mockKnex: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      truncate: jest.fn().mockResolvedValue(true),
      returning: jest.fn().mockResolvedValue([{ id: 'mock-uuid-1' }]),
      first: jest.fn(),
      count: jest.fn().mockReturnThis(),
      sum: jest.fn().mockResolvedValue([{ actualSales: 0 }]),
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([])),
    };

    mockKnex = jest.fn().mockReturnValue(mockQueryBuilder);
    mockKnex.raw = jest.fn((sql) => sql);
    mockKnex.fn = { now: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CargoKpiService,
        {
          provide: KNEX_CONNECTION,
          useValue: mockKnex,
        },
      ],
    }).compile();

    service = module.get<CargoKpiService>(CargoKpiService);
  });

  describe('LTL Calc Tests (LC-01 to LC-07)', () => {
    it('LC-01: V=2, W=200 (D=100) -> 100 USD/m3; total 200 USD', () => {
      const res = service.calculateLtlPrice({ volume: 2, weight: 200 });
      expect(res.density).toBe(100);
      expect(res.rate).toBe(100);
      expect(res.unit).toBe('USD/m3');
      expect(res.total_price).toBe(200);
    });

    it('LC-02: V=2, W=400 (D=200) -> 110 USD/m3; total 220 USD', () => {
      const res = service.calculateLtlPrice({ volume: 2, weight: 400 });
      expect(res.density).toBe(200);
      expect(res.rate).toBe(110);
      expect(res.unit).toBe('USD/m3');
      expect(res.total_price).toBe(220);
    });

    it('LC-03: V=1, W=700 (D=700) -> 180 USD/m3; total 180 USD', () => {
      const res = service.calculateLtlPrice({ volume: 1, weight: 700 });
      expect(res.density).toBe(700);
      expect(res.rate).toBe(180);
      expect(res.unit).toBe('USD/m3');
      expect(res.total_price).toBe(180);
    });

    it('LC-04: V=1, W=700.01 -> 0.40 USD/kg; total 280.004 USD', () => {
      const res = service.calculateLtlPrice({ volume: 1, weight: 700.01 });
      expect(res.density).toBe(700.01);
      expect(res.rate).toBe(0.4);
      expect(res.unit).toBe('USD/kg');
      expect(res.total_price).toBe(280.004);
    });

    it('LC-05: V=1, W=1000 -> 0.40 USD/kg; total 400 USD', () => {
      const res = service.calculateLtlPrice({ volume: 1, weight: 1000 });
      expect(res.density).toBe(1000);
      expect(res.rate).toBe(0.4);
      expect(res.unit).toBe('USD/kg');
      expect(res.total_price).toBe(400);
    });

    it('LC-06: V=1, W=1001 -> 0.30 USD/kg; total 300.3 USD', () => {
      const res = service.calculateLtlPrice({ volume: 1, weight: 1001 });
      expect(res.density).toBe(1001);
      expect(res.rate).toBe(0.3);
      expect(res.unit).toBe('USD/kg');
      expect(res.total_price).toBe(300.3);
    });

    it('LC-07: Invalid volume or weight -> throws BadRequestException', () => {
      expect(() =>
        service.calculateLtlPrice({ volume: 0, weight: 100 }),
      ).toThrow();
      expect(() =>
        service.calculateLtlPrice({ volume: 1, weight: -50 }),
      ).toThrow();
    });
  });

  describe('LTL KPI Tests (LK-01 to LK-07)', () => {
    it('LK-01: V=10, W=1000, oddiy -> D=100; rate=3; Base KPI=30', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            employee_id: 'emp-uuid-1',
            first_name: 'Test',
            last_name: 'User',
            volume: 10,
            weight: 1000,
            cargo_type: CargoType.ODDIY,
            created_at: new Date(),
          },
        ]),
      );

      const summary = await service.getLtlItemsSummary();
      const emp = summary.employees[0];
      expect(emp.items[0].density).toBe(100);
      expect(emp.items[0].base_rate).toBe(3);
      expect(emp.items[0].base_kpi).toBe(30);
    });

    it('LK-02: V=10, W=1000, pod klyuch -> D=100; rate=8; Base KPI=80', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            employee_id: 'emp-uuid-1',
            first_name: 'Test',
            last_name: 'User',
            volume: 10,
            weight: 1000,
            cargo_type: CargoType.POD_KLYUCH,
            created_at: new Date(),
          },
        ]),
      );

      const summary = await service.getLtlItemsSummary();
      const emp = summary.employees[0];
      expect(emp.items[0].base_rate).toBe(8);
      expect(emp.items[0].base_kpi).toBe(80);
    });

    it('LK-03: V=10, W=1000, lyustra -> rate=3; Base KPI=30', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            employee_id: 'emp-uuid-1',
            first_name: 'Test',
            last_name: 'User',
            volume: 10,
            weight: 1000,
            cargo_type: CargoType.LYUSTRA,
            created_at: new Date(),
          },
        ]),
      );

      const summary = await service.getLtlItemsSummary();
      const emp = summary.employees[0];
      expect(emp.items[0].base_rate).toBe(3);
      expect(emp.items[0].base_kpi).toBe(30);
    });

    it('LK-04: Jami V=20, Base sum=100 -> Coeff=0%; Final=0', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            employee_id: 'emp-uuid-1',
            first_name: 'Test',
            last_name: 'User',
            volume: 20,
            weight: 1000,
            cargo_type: CargoType.LYUSTRA,
            created_at: new Date(),
          },
        ]),
      );

      const summary = await service.getLtlItemsSummary();
      const emp = summary.employees[0];
      expect(emp.volume_coefficient).toBe(0.0);
      expect(emp.final_ltl_kpi).toBe(0);
    });

    it('LK-05: Jami V=21, Base sum=100 -> Coeff=50%', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            employee_id: 'emp-uuid-1',
            first_name: 'Test',
            last_name: 'User',
            volume: 21,
            weight: 2100,
            cargo_type: CargoType.ODDIY,
            created_at: new Date(),
          },
        ]),
      );

      const summary = await service.getLtlItemsSummary();
      const emp = summary.employees[0];
      expect(emp.volume_coefficient).toBe(0.5);
    });

    it('LK-06: Jami V=80 -> Coeff=100%', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            employee_id: 'emp-uuid-1',
            first_name: 'Test',
            last_name: 'User',
            volume: 80,
            weight: 8000,
            cargo_type: CargoType.ODDIY,
            created_at: new Date(),
          },
        ]),
      );

      const summary = await service.getLtlItemsSummary();
      const emp = summary.employees[0];
      expect(emp.volume_coefficient).toBe(1.0);
    });

    it('LK-07: Jami V=80.01 -> Coeff=120%', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            employee_id: 'emp-uuid-1',
            first_name: 'Test',
            last_name: 'User',
            volume: 80.01,
            weight: 8001,
            cargo_type: CargoType.ODDIY,
            created_at: new Date(),
          },
        ]),
      );

      const summary = await service.getLtlItemsSummary();
      const emp = summary.employees[0];
      expect(emp.volume_coefficient).toBe(1.2);
    });
  });

  describe('FTL KPI Tests (FK-01 to FK-09)', () => {
    it('FK-01: Total profit=1499.99 -> Rate=0%', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            manager_id: 'mgr-uuid-1',
            first_name: 'Jasur',
            last_name: 'Manager',
            month: '2026-07',
            agent_price: 1000,
            sell_price: 2499.99,
            profit: 1499.99,
            planned_days: 20,
            actual_days: 20,
            kpi_received: false,
          },
        ]),
      );

      const res = await service.getFtlSummary('mgr-uuid-1', '2026-07');
      expect(res.summaries[0].monthly_kpi_rate).toBe(0);
    });

    it('FK-02: Total profit=1500 -> Rate=8%', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            manager_id: 'mgr-uuid-1',
            first_name: 'Jasur',
            last_name: 'Manager',
            month: '2026-07',
            agent_price: 1000,
            sell_price: 2500,
            profit: 1500,
            planned_days: 20,
            actual_days: 20,
            kpi_received: false,
          },
        ]),
      );

      const res = await service.getFtlSummary('mgr-uuid-1', '2026-07');
      expect(res.summaries[0].monthly_kpi_rate).toBe(0.08);
    });

    it('FK-03: Total profit=10000 -> Rate=24%', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            manager_id: 'mgr-uuid-1',
            first_name: 'Jasur',
            last_name: 'Manager',
            month: '2026-07',
            agent_price: 0,
            sell_price: 10000,
            profit: 10000,
            planned_days: 20,
            actual_days: 20,
            kpi_received: false,
          },
        ]),
      );

      const res = await service.getFtlSummary('mgr-uuid-1', '2026-07');
      expect(res.summaries[0].monthly_kpi_rate).toBe(0.24);
    });

    it('FK-04: Y=5 -> Multiplier=110%', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            manager_id: 'mgr-uuid-1',
            first_name: 'Jasur',
            last_name: 'Manager',
            month: '2026-07',
            agent_price: 1000,
            sell_price: 3000,
            profit: 2000,
            planned_days: 20,
            actual_days: 5,
            kpi_received: false,
          },
        ]),
      );

      const res = await service.getFtlSummary('mgr-uuid-1', '2026-07');
      expect(res.summaries[0].items[0].time_multiplier).toBe(1.1);
    });

    it('FK-05: B=20, Y=22 -> Delay=2; multiplier=100%', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            manager_id: 'mgr-uuid-1',
            first_name: 'Jasur',
            last_name: 'Manager',
            month: '2026-07',
            agent_price: 1000,
            sell_price: 3000,
            profit: 2000,
            planned_days: 20,
            actual_days: 22,
            kpi_received: false,
          },
        ]),
      );

      const res = await service.getFtlSummary('mgr-uuid-1', '2026-07');
      expect(res.summaries[0].items[0].time_multiplier).toBe(1.0);
    });

    it('FK-06: B=20, Y=23 -> Delay=3; multiplier=90%', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            manager_id: 'mgr-uuid-1',
            first_name: 'Jasur',
            last_name: 'Manager',
            month: '2026-07',
            agent_price: 1000,
            sell_price: 3000,
            profit: 2000,
            planned_days: 20,
            actual_days: 23,
            kpi_received: false,
          },
        ]),
      );

      const res = await service.getFtlSummary('mgr-uuid-1', '2026-07');
      expect(res.summaries[0].items[0].time_multiplier).toBe(0.9);
    });

    it('FK-07: Profit=1000, total monthly profit=6500 (rate=14%), B=20, Y=25 (delay=5 -> mult=90%) -> KPI=126 USD', async () => {
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: '1',
            manager_id: 'mgr-uuid-1',
            first_name: 'Jasur',
            last_name: 'Manager',
            month: '2026-07',
            agent_price: 1000,
            sell_price: 2000,
            profit: 1000,
            planned_days: 20,
            actual_days: 25,
            kpi_received: false,
          },
          {
            id: '2',
            manager_id: 'mgr-uuid-1',
            first_name: 'Jasur',
            last_name: 'Manager',
            month: '2026-07',
            agent_price: 0,
            sell_price: 5500,
            profit: 5500,
            planned_days: 20,
            actual_days: 20,
            kpi_received: false,
          },
        ]),
      );

      const res = await service.getFtlSummary('mgr-uuid-1', '2026-07');
      const item1 = res.summaries[0].items[0];
      expect(res.summaries[0].monthly_kpi_rate).toBe(0.14);
      expect(item1.individual_kpi).toBe(126);
    });
  });

  describe('ROP KPI Tests (RK-01 to RK-08)', () => {
    it('RK-01: Team sales=24999.99 -> Team rate=0%', async () => {
      mockKnex.mockImplementation((table: string) => {
        const qb = { ...mockQueryBuilder };
        if (table === 'rop_worker_sales') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                id: '1',
                employee_id: 'emp-1',
                first_name: 'Farrux',
                last_name: 'A',
                sales_amount: 24999.99,
              },
            ]),
          );
        } else {
          qb.then = jest.fn((resolve: any) => resolve([]));
        }
        return qb;
      });

      const res = await service.getRopSummary();
      expect(res.team_bonus_rate).toBe(0);
    });

    it('RK-02: Team sales=25000 -> Team rate=2%', async () => {
      mockKnex.mockImplementation((table: string) => {
        const qb = { ...mockQueryBuilder };
        if (table === 'rop_worker_sales') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                id: '1',
                employee_id: 'emp-1',
                first_name: 'Farrux',
                last_name: 'A',
                sales_amount: 25000,
              },
            ]),
          );
        } else {
          qb.then = jest.fn((resolve: any) => resolve([]));
        }
        return qb;
      });

      const res = await service.getRopSummary();
      expect(res.team_bonus_rate).toBe(0.02);
    });

    it('RK-03: Team sales=55000 -> Team rate=7%', async () => {
      mockKnex.mockImplementation((table: string) => {
        const qb = { ...mockQueryBuilder };
        if (table === 'rop_worker_sales') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                id: '1',
                employee_id: 'emp-1',
                first_name: 'Farrux',
                last_name: 'A',
                sales_amount: 55000,
              },
            ]),
          );
        } else {
          qb.then = jest.fn((resolve: any) => resolve([]));
        }
        return qb;
      });

      const res = await service.getRopSummary();
      expect(res.team_bonus_rate).toBe(0.07);
    });

    it('RK-04: 2 trucks -> Truck rate=1%', async () => {
      mockKnex.mockImplementation((table: string) => {
        const qb = { ...mockQueryBuilder };
        if (table === 'rop_worker_sales') {
          qb.then = jest.fn((resolve: any) => resolve([]));
        } else {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              { id: '1', truck_number: 'T1', profit: 1000 },
              { id: '2', truck_number: 'T2', profit: 1000 },
            ]),
          );
        }
        return qb;
      });

      const res = await service.getRopSummary();
      expect(res.truck_count_rate).toBe(0.01);
    });

    it('RK-08: 59k sales (27k + 32k) + 12k profit across 6 trucks -> Total ROP KPI = 4,960 USD', async () => {
      mockKnex.mockImplementation((table: string) => {
        const qb = { ...mockQueryBuilder };
        if (table === 'rop_worker_sales') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                id: '1',
                employee_id: 'emp-1',
                first_name: 'Farrux',
                last_name: 'A',
                sales_amount: 27000,
              },
              {
                id: '2',
                employee_id: 'emp-2',
                first_name: 'Sardor',
                last_name: 'B',
                sales_amount: 32000,
              },
            ]),
          );
        } else {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              { id: '1', truck_number: 'T1', profit: 2000 },
              { id: '2', truck_number: 'T2', profit: 2000 },
              { id: '3', truck_number: 'T3', profit: 2000 },
              { id: '4', truck_number: 'T4', profit: 2000 },
              { id: '5', truck_number: 'T5', profit: 2000 },
              { id: '6', truck_number: 'T6', profit: 2000 },
            ]),
          );
        }
        return qb;
      });

      const res = await service.getRopSummary();
      expect(res.currency).toBe(Currency.UZS);
      expect(res.worker_1pc_kpi).toBe(590);
      expect(res.team_bonus_kpi).toBe(4130);
      expect(res.truck_kpi).toBe(240);
      expect(res.rop_total_kpi).toBe(4960);
    });

    it('returns USD when currency=USD is requested for ROP summary', async () => {
      const res = await service.getRopSummary(Currency.USD);
      expect(res.currency).toBe(Currency.USD);
    });
  });

  describe('SEO KPI Tests', () => {
    it('Calculates 10% of net profit as SEO KPI', () => {
      const res = service.calculateSeoKpi({ net_profit: 15000 });
      expect(res.seo_kpi).toBe(1500);
      expect(res.seo_rate_percentage).toBe('10%');
    });
  });

  describe('Employee Plans Tests', () => {
    it('formats YYYY-MM period to YYYY-MM-01 when creating employee plan and defaults currency to USD', async () => {
      mockQueryBuilder.first.mockResolvedValue({ id: 'emp-uuid-1' });
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: 'plan-1',
            employee_id: 'emp-uuid-1',
            first_name: 'John',
            last_name: 'Doe',
            ltl_target_volume: 50,
            ftl_target_amount: 10000,
            target_amount: 10000,
            currency: 'USD',
            period: '2026-07-01',
          },
        ]),
      );

      await service.createEmployeePlan({
        employee_id: 'emp-uuid-1',
        ltl_target_volume: 50,
        ftl_target_amount: 10000,
        period: '2026-07',
      });

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          period: '2026-07-01',
          currency: 'USD',
          ltl_target_volume: 50,
          ftl_target_amount: 10000,
        }),
      );
    });

    it('creates employee plan with custom currency UZS', async () => {
      mockQueryBuilder.first.mockResolvedValue({ id: 'emp-uuid-1' });
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: 'plan-1',
            employee_id: 'emp-uuid-1',
            first_name: 'John',
            last_name: 'Doe',
            ltl_target_volume: 20,
            ftl_target_amount: 100000000,
            target_amount: 100000000,
            currency: 'UZS',
            period: '2026-07-01',
          },
        ]),
      );

      await service.createEmployeePlan({
        employee_id: 'emp-uuid-1',
        ltl_target_volume: 20,
        ftl_target_amount: 100000000,
        currency: 'UZS' as any,
        period: '2026-07-01',
      });

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'UZS',
          ltl_target_volume: 20,
          ftl_target_amount: 100000000,
        }),
      );
    });

    it('calculates employee plan progress from cargo_registrations for both LTL volume and FTL financial amount', async () => {
      mockKnex.mockImplementation((table: string) => {
        const qb = { ...mockQueryBuilder };
        if (table === 'employee_plans') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                id: 'plan-1',
                employee_id: 'emp-uuid-1',
                first_name: 'John',
                last_name: 'Doe',
                ltl_target_volume: 100,
                ftl_target_amount: 1000,
                currency: 'USD',
                period: '2026-07-01',
              },
            ]),
          );
        } else if (table === 'cargo_registrations') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                cargo_type: 'LTL',
                volume: 40,
                sell_price: 300,
                sell_currency: 'USD',
              },
              {
                cargo_type: 'LTL',
                volume: 35,
                sell_price: 250,
                sell_currency: 'USD',
              },
              {
                cargo_type: 'FTL',
                volume: null,
                sell_price: 500,
                sell_currency: 'USD',
              },
              {
                cargo_type: 'FTL',
                volume: null,
                sell_price: 250,
                sell_currency: 'USD',
              },
            ]),
          );
        } else {
          qb.then = jest.fn((resolve: any) => resolve([]));
        }
        return qb;
      });

      const res = await service.getEmployeePlansProgress();
      expect(res.total_plans).toBe(1);
      const plan = res.leaderboard[0];

      // LTL plan assertions
      expect(plan.ltl_plan.target_volume).toBe(100);
      expect(plan.ltl_plan.actual_volume).toBe(75);
      expect(plan.ltl_plan.remaining_volume).toBe(25);
      expect(plan.ltl_plan.completion_percentage).toBe(75);
      expect(plan.ltl_plan.is_completed).toBe(false);
      expect(plan.ltl_plan.cargo_count).toBe(2);

      // FTL plan assertions
      expect(plan.ftl_plan.target_amount).toBe(1000);
      expect(plan.ftl_plan.currency).toBe('USD');
      expect(plan.ftl_plan.actual_amount).toBe(750);
      expect(plan.ftl_plan.remaining_amount).toBe(250);
      expect(plan.ftl_plan.completion_percentage).toBe(75);
      expect(plan.ftl_plan.is_completed).toBe(false);
      expect(plan.ftl_plan.cargo_count).toBe(2);

      // Overall assertions
      expect(plan.total_cargos_count).toBe(4);
      expect(plan.overall_completion_percentage).toBe(75);
      expect(plan.is_completed).toBe(false);
      expect(plan.actual_sales).toBe(750);
      expect(plan.target_volume).toBe(100);
      expect(plan.actual_volume).toBe(75);
    });

    it('marks plan as completed when both LTL volume and FTL amount exceed targets', async () => {
      mockKnex.mockImplementation((table: string) => {
        const qb = { ...mockQueryBuilder };
        if (table === 'employee_plans') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                id: 'plan-1',
                employee_id: 'emp-uuid-1',
                first_name: 'John',
                last_name: 'Doe',
                ltl_target_volume: 50,
                ftl_target_amount: 500,
                currency: 'USD',
                period: '2026-07-01',
              },
            ]),
          );
        } else if (table === 'cargo_registrations') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                cargo_type: 'LTL',
                volume: 60,
                sell_price: 600,
                sell_currency: 'USD',
              },
              {
                cargo_type: 'FTL',
                volume: null,
                sell_price: 800,
                sell_currency: 'USD',
              },
            ]),
          );
        } else {
          qb.then = jest.fn((resolve: any) => resolve([]));
        }
        return qb;
      });

      const res = await service.getEmployeePlansProgress();
      const plan = res.leaderboard[0];
      expect(plan.ltl_plan.is_completed).toBe(true);
      expect(plan.ftl_plan.is_completed).toBe(true);
      expect(plan.is_completed).toBe(true);
      expect(plan.overall_completion_percentage).toBe(140); // (120% + 160%) / 2 = 140%
    });

    it('calculates FTL cargo progress using net yield (sell_price - purchase_price)', async () => {
      mockKnex.mockImplementation((table: string) => {
        const qb = { ...mockQueryBuilder };
        if (table === 'employee_plans') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                id: 'plan-1',
                employee_id: 'emp-uuid-1',
                first_name: 'Donyor',
                last_name: 'Nishonboyev',
                ltl_target_volume: 0,
                ftl_target_amount: 1000,
                currency: 'USD',
                period: '2026-08-01',
              },
            ]),
          );
        } else if (table === 'cargo_registrations') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                cargo_type: 'FTL',
                volume: null,
                purchase_price: 6000,
                purchase_currency: 'USD',
                sell_price: 6700,
                sell_currency: 'USD',
              },
              {
                cargo_type: 'FTL',
                volume: null,
                purchase_price: 8400,
                purchase_currency: 'USD',
                sell_price: 9300,
                sell_currency: 'USD',
              },
            ]),
          );
        } else {
          qb.then = jest.fn((resolve: any) => resolve([]));
        }
        return qb;
      });

      const res = await service.getEmployeePlansProgress({ period: '2026-08' });
      expect(res.total_plans).toBe(1);
      const plan = res.leaderboard[0];

      // Net yields: (6700 - 6000) = 700, (9300 - 8400) = 900 => Total = 1600
      expect(plan.ftl_plan.target_amount).toBe(1000);
      expect(plan.ftl_plan.actual_amount).toBe(1600);
      expect(plan.ftl_plan.remaining_amount).toBe(0);
      expect(plan.ftl_plan.completion_percentage).toBe(160);
      expect(plan.ftl_plan.is_completed).toBe(true);
      expect(plan.ftl_plan.cargo_count).toBe(2);
      expect(plan.actual_sales).toBe(1600);
    });

    it('updates employee plan targets and period', async () => {
      mockQueryBuilder.first.mockResolvedValue({
        id: 'plan-1',
        employee_id: 'emp-1',
      });
      mockQueryBuilder.then.mockImplementation((resolve: any) =>
        resolve([
          {
            id: 'plan-1',
            employee_id: 'emp-1',
            first_name: 'Jane',
            last_name: 'Smith',
            ltl_target_volume: 80,
            ftl_target_amount: 15000,
            currency: 'USD',
            period: '2026-08-01',
          },
        ]),
      );

      await service.updateEmployeePlan('plan-1', {
        ltl_target_volume: 80,
        ftl_target_amount: 15000,
        period: '2026-08',
      });

      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ltl_target_volume: 80,
          ftl_target_amount: 15000,
          period: '2026-08-01',
        }),
      );
    });

    it('deletes employee plan', async () => {
      mockQueryBuilder.delete.mockResolvedValue(1);
      mockQueryBuilder.then.mockImplementation((resolve: any) => resolve([]));

      const res = await service.deleteEmployeePlan('plan-1');
      expect(res.total_plans).toBe(0);
      expect(res.leaderboard).toEqual([]);
    });

    it('throws NotFoundException when creating plan for non-existent employee', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await expect(
        service.createEmployeePlan({
          employee_id: 'non-existent',
          period: '2026-07-01',
        }),
      ).rejects.toThrow();
    });

    it('throws NotFoundException when updating non-existent plan', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await expect(
        service.updateEmployeePlan('non-existent', {
          ftl_target_amount: 5000,
        }),
      ).rejects.toThrow();
    });
  });

  describe('Cargo Transactions & Statuses Tests', () => {
    it('creates cargo transaction with default status Waiting when status is omitted', async () => {
      mockQueryBuilder.first
        .mockResolvedValueOnce({ id: 'emp-1' })
        .mockResolvedValueOnce({ id: 'dept-1', name: 'sales' })
        .mockResolvedValueOnce({ id: 'client-1' })
        .mockResolvedValueOnce({
          id: 'tx-1',
          employee_id: 'emp-1',
          department_id: 'dept-1',
          client_id: 'client-1',
          buy_price: 100,
          sell_price: 200,
          margin: 100,
          kpi_percentage: 10,
          kpi_bonus: 10,
          currency: 'UZS',
          status: 'Waiting',
          transaction_date: '2026-07-27',
        });

      mockQueryBuilder.returning.mockResolvedValueOnce([{ id: 'tx-1' }]);

      const res = await service.createCargoTransaction({
        employee_id: 'emp-1',
        department_id: 'dept-1',
        client_id: 'client-1',
        buy_price: 100,
        sell_price: 200,
        transaction_date: '2026-07-27',
      });

      expect(res.status).toBe('Waiting');
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'Waiting',
        }),
      );
    });

    it('returns standardized { meta, data } response envelope in findAllCargoTransactions', async () => {
      const mockItems = [
        {
          id: 'tx-1',
          employee_id: 'emp-1',
          employee_first_name: 'Jasur',
          employee_last_name: 'Y',
          department_id: 'dept-1',
          department_name: 'Sales',
          client_id: 'client-1',
          client_first_name: 'A',
          client_last_name: 'B',
          client_company_name: 'Co',
          buy_price: 100,
          sell_price: 200,
          margin: 100,
          kpi_percentage: 10,
          kpi_bonus: 10,
          currency: 'UZS',
          status: 'In Transit',
          transaction_date: '2026-07-27',
        },
      ];

      mockKnex.mockImplementation(() => {
        const qb = { ...mockQueryBuilder };
        qb.then = jest.fn((resolve: any) => {
          if (
            qb.count.mock.calls.length > 0 &&
            qb.groupBy.mock.calls.length > 0
          ) {
            return resolve([{ status: 'In Transit', total: '1' }]);
          }
          if (qb.count.mock.calls.length > 0) {
            return resolve([{ total: '1' }]);
          }
          return resolve(mockItems);
        });
        return qb;
      });

      const res = await service.findAllCargoTransactions({});
      expect(res).toHaveProperty('meta');
      expect(res).toHaveProperty('data');
      expect(res.meta.total).toBe(1);
      expect(Array.isArray(res.data)).toBe(true);
      expect((res.data as any[])[0].status).toBe('In Transit');
    });

    it('returns status-grouped viewable response when group_by_status is true', async () => {
      const mockItems = [
        {
          id: 'tx-1',
          employee_id: 'emp-1',
          employee_first_name: 'Jasur',
          employee_last_name: 'Y',
          department_id: 'dept-1',
          department_name: 'Sales',
          client_id: 'client-1',
          buy_price: 100,
          sell_price: 200,
          margin: 100,
          kpi_percentage: 10,
          kpi_bonus: 10,
          status: 'Waiting',
          transaction_date: '2026-07-27',
        },
        {
          id: 'tx-2',
          employee_id: 'emp-1',
          employee_first_name: 'Jasur',
          employee_last_name: 'Y',
          department_id: 'dept-1',
          department_name: 'Sales',
          client_id: 'client-1',
          buy_price: 300,
          sell_price: 500,
          margin: 200,
          kpi_percentage: 10,
          kpi_bonus: 20,
          status: 'In Transit',
          transaction_date: '2026-07-27',
        },
      ];

      mockKnex.mockImplementation(() => {
        const qb = { ...mockQueryBuilder };
        qb.then = jest.fn((resolve: any) => {
          if (
            qb.count.mock.calls.length > 0 &&
            qb.groupBy.mock.calls.length > 0
          ) {
            return resolve([
              { status: 'Waiting', total: '1' },
              { status: 'In Transit', total: '1' },
            ]);
          }
          if (qb.count.mock.calls.length > 0) {
            return resolve([{ total: '2' }]);
          }
          return resolve(mockItems);
        });
        return qb;
      });

      const res = await service.findViewableCargoTransactions({});
      expect(res).toHaveProperty('meta');
      expect(res).toHaveProperty('data');
      expect(res.data).toHaveProperty('Waiting');
      expect(res.data).toHaveProperty('In Transit');
      expect(res.data).toHaveProperty('Border');
      expect(res.data).toHaveProperty('At Station');
      expect(res.data).toHaveProperty('Delivered');
      expect((res.data as any)['Waiting'].metrics.total_transactions).toBe(1);
      expect((res.data as any)['In Transit'].metrics.total_transactions).toBe(
        1,
      );
    });
  });

  describe('Employee Plans Statistics Tests', () => {
    it('calculates comprehensive aggregated plans statistics across all employees and departments', async () => {
      mockKnex.mockImplementation((table: string) => {
        const qb = { ...mockQueryBuilder };
        if (table === 'employee_plans') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                id: 'plan-1',
                employee_id: 'emp-1',
                first_name: 'Jasur',
                last_name: 'Yoldoshev',
                department_name: 'Sales',
                ltl_target_volume: 100,
                ftl_target_amount: 10000,
                currency: 'USD',
                period: '2026-08-01',
              },
              {
                id: 'plan-2',
                employee_id: 'emp-2',
                first_name: 'Aziz',
                last_name: 'Karimov',
                department_name: 'Sborniy',
                ltl_target_volume: 50,
                ftl_target_amount: 5000,
                currency: 'USD',
                period: '2026-08-01',
              },
            ]),
          );
        } else if (table === 'cargo_registrations') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                cargo_type: 'LTL',
                volume: 80,
                sell_price: 1000,
                sell_currency: 'USD',
              },
              {
                cargo_type: 'FTL',
                volume: null,
                sell_price: 9000,
                sell_currency: 'USD',
              },
            ]),
          );
        } else {
          qb.then = jest.fn((resolve: any) => resolve([]));
        }
        return qb;
      });

      const stats = await service.getEmployeePlansStatistics({
        period: '2026-08',
      });
      expect(stats).toHaveProperty('summary');
      expect(stats).toHaveProperty('ltl_statistics');
      expect(stats).toHaveProperty('ftl_statistics');
      expect(stats).toHaveProperty('leaderboard');
      expect(stats).toHaveProperty('department_breakdown');

      expect(stats.summary.total_plans).toBe(2);
      expect(stats.ltl_statistics.total_target_volume).toBe(150);
      expect(stats.ftl_statistics.total_target_amount).toBe(15000);
      expect(stats.currency).toBe('USD');
      expect(stats.leaderboard[0].rank).toBe(1);
    });

    it('returns personal employee plan statistics with lifetime totals and history', async () => {
      mockQueryBuilder.first.mockResolvedValue({
        id: 'emp-1',
        first_name: 'Jasur',
        last_name: 'Yoldoshev',
        department_name: 'Sales',
        color: '#00AAFF',
      });

      mockKnex.mockImplementation((table: string) => {
        const qb = { ...mockQueryBuilder };
        if (table === 'employee_plans') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                id: 'plan-1',
                employee_id: 'emp-1',
                first_name: 'Jasur',
                last_name: 'Yoldoshev',
                department_name: 'Sales',
                ltl_target_volume: 100,
                ftl_target_amount: 10000,
                currency: 'USD',
                period: '2026-08-01',
              },
            ]),
          );
        } else if (table === 'cargo_registrations') {
          qb.then = jest.fn((resolve: any) =>
            resolve([
              {
                cargo_type: 'LTL',
                volume: 110,
                sell_price: 1200,
                sell_currency: 'USD',
              },
              {
                cargo_type: 'FTL',
                volume: null,
                sell_price: 15000,
                sell_currency: 'USD',
              },
            ]),
          );
        } else {
          qb.then = jest.fn((resolve: any) => resolve([]));
        }
        return qb;
      });

      const personal = await service.getEmployeePlanPersonalStats('emp-1');
      expect(personal.employee.id).toBe('emp-1');
      expect(personal.employee.full_name).toBe('Jasur Yoldoshev');
      expect(personal.totals.total_plans_set).toBe(1);
      expect(personal.totals.plans_completed).toBe(1);
      expect(personal.current_plan.is_completed).toBe(true);
      expect(personal.totals.total_ltl_volume_achieved).toBe(110);
      expect(personal.totals.total_ftl_sales_achieved).toBe(15000);
    });
  });
});

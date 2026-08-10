import { KpiSummaryService } from './kpi-summary.service';
import { KpiSourceType } from './dto/kpi-query.dto';

describe('KpiSummaryService', () => {
  let service: KpiSummaryService;
  let mockKnex: any;

  beforeEach(() => {
    // Mock knex connection
    mockKnex = jest.fn();
    service = new KpiSummaryService(mockKnex);
  });

  describe('Helper logic and formulas', () => {
    it('should correctly calculate LTL base rates based on density and cargo type', () => {
      // Lyustra fixed rate
      expect((service as any).getLtlBaseRate(50, 'lyustra')).toBe(3);
      expect((service as any).getLtlBaseRate(800, 'lyustra')).toBe(3);

      // Oddiy rates
      expect((service as any).getLtlBaseRate(50, 'oddiy')).toBe(3);
      expect((service as any).getLtlBaseRate(150, 'oddiy')).toBe(4);
      expect((service as any).getLtlBaseRate(250, 'oddiy')).toBe(5);
      expect((service as any).getLtlBaseRate(350, 'oddiy')).toBe(6);
      expect((service as any).getLtlBaseRate(450, 'oddiy')).toBe(7);
      expect((service as any).getLtlBaseRate(600, 'oddiy')).toBe(8);
      expect((service as any).getLtlBaseRate(800, 'oddiy')).toBe(9);
      expect((service as any).getLtlBaseRate(1200, 'oddiy')).toBe(10);

      // Pod klyuch (+5 USD/m3)
      expect((service as any).getLtlBaseRate(50, 'pod_klyuch')).toBe(8);
      expect((service as any).getLtlBaseRate(150, 'pod_klyuch')).toBe(9);
      expect((service as any).getLtlBaseRate(1200, 'pod_klyuch')).toBe(15);
    });

    it('should correctly calculate LTL volume coefficients', () => {
      expect((service as any).getLtlVolumeCoefficient(10)).toBe(0.0);
      expect((service as any).getLtlVolumeCoefficient(25)).toBe(0.5);
      expect((service as any).getLtlVolumeCoefficient(50)).toBe(0.8);
      expect((service as any).getLtlVolumeCoefficient(70)).toBe(0.9);
      expect((service as any).getLtlVolumeCoefficient(78)).toBe(1.0);
      expect((service as any).getLtlVolumeCoefficient(85)).toBe(1.2);
    });

    it('should correctly calculate FTL monthly rates and delay multipliers', () => {
      expect((service as any).getFtlMonthlyRate(1000)).toBe(0.0);
      expect((service as any).getFtlMonthlyRate(2000)).toBe(0.08);
      expect((service as any).getFtlMonthlyRate(4500)).toBe(0.1);
      expect((service as any).getFtlMonthlyRate(12000)).toBe(0.24);

      expect((service as any).getFtlTimeMultiplier(4, 20)).toBe(1.1);
      expect((service as any).getFtlTimeMultiplier(21, 20)).toBe(1.0);
      expect((service as any).getFtlTimeMultiplier(28, 20)).toBe(0.9);
      expect((service as any).getFtlTimeMultiplier(45, 20)).toBe(0.5);
    });
  });

  describe('getKpiSummary', () => {
    it('returns structured { meta, pagination, data } summary response', async () => {
      const mockEmployees = [
        {
          id: 'emp-1',
          first_name: 'Jasur',
          last_name: 'Yoldoshev',
          department_id: 'dept-1',
          department_name: 'Logistics',
          career_level: 'MID',
          is_active: true,
        },
      ];

      const mockLtlItems = [
        {
          id: 'ltl-1',
          employee_id: 'emp-1',
          volume: 50,
          weight: 5000,
          cargo_type: 'oddiy',
          created_at: new Date('2026-08-05'),
        },
      ];

      const mockFtlItems: any[] = [];
      const mockRopSales: any[] = [];
      const mockSalesEvals: any[] = [];
      const mockTransactions: any[] = [];

      // Setup knex chain mock
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        orWhereRaw: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve(mockEmployees),
      };

      mockKnex.mockImplementation((tableName: string) => {
        if (tableName === 'employees') return mockQueryBuilder;
        if (tableName === 'ltl_cargo_items')
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            then: (r: any) => r(mockLtlItems),
          };
        if (tableName === 'ftl_fura_items')
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            then: (r: any) => r(mockFtlItems),
          };
        if (tableName === 'rop_worker_sales')
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            then: (r: any) => r(mockRopSales),
          };
        if (tableName === 'sales_manager_evaluations')
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            then: (r: any) => r(mockSalesEvals),
          };
        if (tableName === 'cargo_transactions')
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            then: (r: any) => r(mockTransactions),
          };
        return mockQueryBuilder;
      });

      const res = await service.getKpiSummary({ month: '2026-08' });

      expect(res).toHaveProperty('meta');
      expect(res).toHaveProperty('pagination');
      expect(res).toHaveProperty('data');
      expect(res.meta.month).toBe('2026-08');
      expect(res.meta.total).toBe(1);
      expect(res.data.length).toBe(1);

      const empSummary = res.data[0];
      expect(empSummary.employee_name).toBe('Jasur Yoldoshev');
      expect(empSummary.total_ltl_kpi).toBe(120); // 50m3 * $3 = 150 base KPI * 0.8 coeff = 120
      expect(empSummary.total_kpi).toBe(120);
      expect(res.meta.totals.grand_total_kpi).toBe(120);
    });
  });

  describe('getKpiHistory', () => {
    it('returns structured itemized provenance history list', async () => {
      const mockLtlJoined = [
        {
          id: 'ltl-1',
          employee_id: 'emp-1',
          first_name: 'Jasur',
          last_name: 'Yoldoshev',
          department_name: 'Logistics',
          volume: 50,
          weight: 5000,
          cargo_type: 'oddiy',
          created_at: new Date('2026-08-05'),
        },
      ];

      mockKnex.mockImplementation((tableName: string) => {
        const queryChain = {
          join: jest.fn().mockReturnThis(),
          leftJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          then: (resolve: any) => resolve([]),
        };

        if (tableName === 'ltl_cargo_items') {
          queryChain.then = (resolve: any) => resolve(mockLtlJoined);
        }
        return queryChain;
      });

      const res = await service.getKpiHistory({ month: '2026-08' });

      expect(res).toHaveProperty('meta');
      expect(res.meta.summary).toHaveProperty('total_kpi_amount');
      expect(res.meta.summary.count_by_source[KpiSourceType.LTL]).toBe(1);
      expect(res.data.length).toBe(1);
      expect(res.data[0].source_type).toBe(KpiSourceType.LTL);
      expect(res.data[0].description).toContain('LTL Cargo (oddiy)');
    });
  });
});

import {
  SalesManagerKpiService,
  CAREER_LEVEL_CONFIG,
} from './sales-manager-kpi.service';
import {
  CareerLevel,
  CargoPaymentStatus,
  EvaluationApprovalStatus,
} from './dto/sales-manager-kpi.dto';

describe('SalesManagerKpiService', () => {
  let service: SalesManagerKpiService;

  beforeEach(() => {
    service = new SalesManagerKpiService(null as any);
  });

  describe('getSalesBonusRate', () => {
    it('should return 0% for sales under $2,000', () => {
      expect(service.getSalesBonusRate(0)).toBe(0.0);
      expect(service.getSalesBonusRate(1500)).toBe(0.0);
      expect(service.getSalesBonusRate(1999.99)).toBe(0.0);
    });

    it('should return 10% for sales $2,000 - $3,999', () => {
      expect(service.getSalesBonusRate(2000)).toBe(0.1);
      expect(service.getSalesBonusRate(3500)).toBe(0.1);
      expect(service.getSalesBonusRate(3999.99)).toBe(0.1);
    });

    it('should return 15% for sales $4,000 - $5,999', () => {
      expect(service.getSalesBonusRate(4000)).toBe(0.15);
      expect(service.getSalesBonusRate(5600)).toBe(0.15);
      expect(service.getSalesBonusRate(5999.99)).toBe(0.15);
    });

    it('should return 20% for sales $6,000 - $7,999', () => {
      expect(service.getSalesBonusRate(6000)).toBe(0.2);
      expect(service.getSalesBonusRate(7200)).toBe(0.2);
      expect(service.getSalesBonusRate(7999.99)).toBe(0.2);
    });

    it('should return 22% for sales $8,000 - $9,999', () => {
      expect(service.getSalesBonusRate(8000)).toBe(0.22);
      expect(service.getSalesBonusRate(9500)).toBe(0.22);
      expect(service.getSalesBonusRate(9999.99)).toBe(0.22);
    });

    it('should return 25% for sales >= $10,000', () => {
      expect(service.getSalesBonusRate(10000)).toBe(0.25);
      expect(service.getSalesBonusRate(15000)).toBe(0.25);
      expect(service.getSalesBonusRate(25000)).toBe(0.25);
    });
  });

  describe('CAREER_LEVEL_CONFIG', () => {
    it('should have correct config for JUNIOR ($150 - $300 SR check)', () => {
      const cfg = CAREER_LEVEL_CONFIG[CareerLevel.JUNIOR];
      expect(cfg.fixedSalary).toBe(300);
      expect(cfg.planMin).toBe(0);
      expect(cfg.planMax).toBe(3000);
      expect(cfg.srCheckMin).toBe(150);
      expect(cfg.srCheckTarget).toBe(300);
      expect(cfg.promotionConsecutiveMonths).toBe(2);
    });

    it('should have correct config for MID ($200 - $400 SR check)', () => {
      const cfg = CAREER_LEVEL_CONFIG[CareerLevel.MID];
      expect(cfg.fixedSalary).toBe(500);
      expect(cfg.planMin).toBe(5000);
      expect(cfg.planMax).toBe(6000);
      expect(cfg.srCheckMin).toBe(200);
      expect(cfg.srCheckTarget).toBe(400);
      expect(cfg.promotionConsecutiveMonths).toBe(3);
      expect(cfg.demotionConsecutiveMonths).toBe(2);
    });

    it('should have correct config for SENIOR ($250 - $500 SR check)', () => {
      const cfg = CAREER_LEVEL_CONFIG[CareerLevel.SENIOR];
      expect(cfg.fixedSalary).toBe(700);
      expect(cfg.planMin).toBe(6001);
      expect(cfg.planMax).toBe(8000);
      expect(cfg.srCheckMin).toBe(250);
      expect(cfg.srCheckTarget).toBe(500);
      expect(cfg.menteeRequirement).toBe(1);
      expect(cfg.promotionConsecutiveMonths).toBe(4);
      expect(cfg.demotionConsecutiveMonths).toBe(2);
    });

    it('should have correct config for EXPERT ($300 - $600 SR check)', () => {
      const cfg = CAREER_LEVEL_CONFIG[CareerLevel.EXPERT];
      expect(cfg.fixedSalary).toBe(1000);
      expect(cfg.planMin).toBe(8001);
      expect(cfg.planMax).toBe(10000);
      expect(cfg.srCheckMin).toBe(300);
      expect(cfg.srCheckTarget).toBe(600);
      expect(cfg.menteeRequirement).toBe(3);
      expect(cfg.demotionConsecutiveMonths).toBe(3);
    });
  });

  describe('normalizePaymentStatus and getPaymentStatusLabel', () => {
    it('should normalize paid statuses correctly', () => {
      expect(service.normalizePaymentStatus('paid')).toBe(
        CargoPaymentStatus.PAID,
      );
      expect(service.normalizePaymentStatus("to'landi")).toBe(
        CargoPaymentStatus.PAID,
      );
      expect(service.normalizePaymentStatus("To'landi")).toBe(
        CargoPaymentStatus.PAID,
      );
      expect(service.normalizePaymentStatus('klient berdi')).toBe(
        CargoPaymentStatus.PAID,
      );
      expect(service.normalizePaymentStatus('olindi')).toBe(
        CargoPaymentStatus.PAID,
      );
      expect(service.getPaymentStatusLabel(CargoPaymentStatus.PAID)).toBe(
        "To'landi",
      );
    });

    it('should normalize unpaid statuses correctly', () => {
      expect(service.normalizePaymentStatus('unpaid')).toBe(
        CargoPaymentStatus.UNPAID,
      );
      expect(service.normalizePaymentStatus('klient_bermadi')).toBe(
        CargoPaymentStatus.UNPAID,
      );
      expect(service.normalizePaymentStatus('Klient bermadi')).toBe(
        CargoPaymentStatus.UNPAID,
      );
      expect(service.getPaymentStatusLabel(CargoPaymentStatus.UNPAID)).toBe(
        'Klient bermadi',
      );
    });

    it('should normalize waiting statuses correctly', () => {
      expect(service.normalizePaymentStatus('waiting')).toBe(
        CargoPaymentStatus.WAITING,
      );
      expect(service.normalizePaymentStatus('kutilmoqda')).toBe(
        CargoPaymentStatus.WAITING,
      );
      expect(service.normalizePaymentStatus('Kutilmoqda')).toBe(
        CargoPaymentStatus.WAITING,
      );
      expect(service.normalizePaymentStatus(null)).toBe(
        CargoPaymentStatus.WAITING,
      );
      expect(service.getPaymentStatusLabel(CargoPaymentStatus.WAITING)).toBe(
        'Kutilmoqda',
      );
    });
  });

  describe('SR Check (средний чек) Evaluation Logic', () => {
    it('Junior employee with average check >= $150 is approved automatically without ROP/CEO confirmation', async () => {
      const empId = 'emp-junior-1';
      const month = '2026-08';

      const mockEmployee = {
        id: empId,
        first_name: 'Jasur',
        last_name: 'Yoldoshev',
        career_level: CareerLevel.JUNIOR,
        is_active: true,
      };

      const mockDb: Record<string, any> = {
        sales_manager_evaluations: [],
      };

      const createQueryBuilder = (resultData: any) => {
        const qb: any = {
          where: jest.fn().mockReturnThis(),
          first: jest
            .fn()
            .mockImplementation(() =>
              Promise.resolve(mockDb.sales_manager_evaluations[0] || null),
            ),
          insert: jest.fn().mockImplementation((data) => {
            mockDb.sales_manager_evaluations.push(data);
            return Promise.resolve([data]);
          }),
          update: jest.fn().mockImplementation((data) => {
            if (mockDb.sales_manager_evaluations[0]) {
              Object.assign(mockDb.sales_manager_evaluations[0], data);
            }
            return Promise.resolve(1);
          }),
          then: jest.fn((resolve) => resolve(resultData)),
        };
        return qb;
      };

      const customKnex: any = jest.fn((table: string) => {
        if (table === 'employees') {
          return createQueryBuilder([mockEmployee]);
        }
        if (table === 'sales_manager_evaluations') {
          return createQueryBuilder(mockDb.sales_manager_evaluations);
        }
        return createQueryBuilder([]);
      });
      customKnex.fn = { now: jest.fn() };

      const testService = new SalesManagerKpiService(customKnex);
      jest
        .spyOn(testService, 'calculateEmployeeMonthlySales')
        .mockResolvedValue({
          totalSales: 2500, // Total Net Margin in USD
          paidSales: 2000,
          unpaidSales: 500,
          dealCount: 10, // Average Check = 2500 / 10 = $250 (>= $150 srCheckMin)
          paidDealCount: 8,
          unpaidDealCount: 2,
          waitingDealCount: 0,
          kpiConfirmedCount: 8,
          totalBuyPriceUsd: 20000,
          totalSellPriceUsd: 22500,
        });

      const result = await testService.calculateEvaluation({
        month,
        employee_id: empId,
      });

      expect(result.evaluations.length).toBe(1);
      const evaluation = result.evaluations[0];
      expect(evaluation.total_sales).toBe(2500);
      expect(evaluation.deal_count).toBe(10);
      expect(evaluation.average_check).toBe(250);
      expect(evaluation.is_plan_achieved).toBe(true);
      expect(evaluation.is_sr_check_achieved).toBe(true);
      expect(evaluation.approval_status).toBe(
        EvaluationApprovalStatus.APPROVED,
      );
      // Sales bonus = 2500 * 10% = 250
      expect(evaluation.sales_bonus_rate).toBe(10);
      expect(evaluation.sales_bonus_amount).toBe(250);
      expect(evaluation.kpi_bonus_amount).toBe(250);
      // Real expense from paid cargos = 2000 * 10% = 200
      expect(evaluation.paid_sales_bonus_amount).toBe(200);
      expect(evaluation.unpaid_sales_bonus_amount).toBe(50);
      // Total earnings = 300 (fixed) + 250 (sales bonus) = 550
      expect(evaluation.total_earnings).toBe(550);
    });

    it('flags PENDING_SR_CHECK_APPROVAL if plan achieved but average check is below srCheckMin', async () => {
      const empId = 'emp-senior-1';
      const month = '2026-08';

      const mockEmployee = {
        id: empId,
        first_name: 'Alisher',
        last_name: 'Rustamov',
        career_level: CareerLevel.SENIOR,
        is_active: true,
      };

      const mockDb: Record<string, any> = {
        sales_manager_evaluations: [],
      };

      const createQueryBuilder = (resultData: any) => {
        const qb: any = {
          where: jest.fn().mockReturnThis(),
          first: jest
            .fn()
            .mockImplementation(() =>
              Promise.resolve(mockDb.sales_manager_evaluations[0] || null),
            ),
          insert: jest.fn().mockImplementation((data) => {
            mockDb.sales_manager_evaluations.push(data);
            return Promise.resolve([data]);
          }),
          update: jest.fn().mockImplementation((data) => {
            if (mockDb.sales_manager_evaluations[0]) {
              Object.assign(mockDb.sales_manager_evaluations[0], data);
            }
            return Promise.resolve(1);
          }),
          then: jest.fn((resolve) => resolve(resultData)),
        };
        return qb;
      };

      const customKnex: any = jest.fn((table: string) => {
        if (table === 'employees') {
          return createQueryBuilder([mockEmployee]);
        }
        if (table === 'sales_manager_evaluations') {
          return createQueryBuilder(mockDb.sales_manager_evaluations);
        }
        return createQueryBuilder([]);
      });
      customKnex.fn = { now: jest.fn() };

      const testService = new SalesManagerKpiService(customKnex);
      // Senior planMin is $6001, srCheckMin is $250
      // Employee made $7000 (plan met), but in 35 deals -> average check = 7000 / 35 = $200 (< $250)
      jest
        .spyOn(testService, 'calculateEmployeeMonthlySales')
        .mockResolvedValue({
          totalSales: 7000,
          paidSales: 5000,
          unpaidSales: 2000,
          dealCount: 35,
          paidDealCount: 25,
          unpaidDealCount: 10,
          waitingDealCount: 0,
          kpiConfirmedCount: 25,
          totalBuyPriceUsd: 70000,
          totalSellPriceUsd: 77000,
        });

      const result = await testService.calculateEvaluation({
        month,
        employee_id: empId,
      });

      const evaluation = result.evaluations[0];
      expect(evaluation.total_sales).toBe(7000);
      expect(evaluation.average_check).toBe(200);
      expect(evaluation.is_plan_achieved).toBe(true);
      expect(evaluation.is_sr_check_achieved).toBe(false);
      expect(evaluation.approval_status).toBe(
        EvaluationApprovalStatus.PENDING_SR_CHECK_APPROVAL,
      );
      // Bonus rate for $7000 is 20%
      expect(evaluation.sales_bonus_rate).toBe(20);
      expect(evaluation.sales_bonus_amount).toBe(1400);
      expect(evaluation.paid_sales_bonus_amount).toBe(1000);
      expect(evaluation.unpaid_sales_bonus_amount).toBe(400);
    });
  });

  describe('getCargosMonitoring (Image 2 table structure)', () => {
    it('returns table rows with all Image 2 columns and summary metadata', async () => {
      const empId = 'emp-1';
      const month = '2026-08';

      const mockEmployee = {
        id: empId,
        first_name: 'Saidjon',
        last_name: 'Menejer',
        career_level: CareerLevel.EXPERT,
        department_name: 'Sales Dept',
      };

      const mockCargos = [
        {
          id: 'cargo-1',
          container_truck_id: '06 KG 762 AJW',
          cargo: 'Electronics',
          cargo_type: 'FTL',
          confirmed_date: '2026-08-01',
          purchase_price: 9657,
          purchase_currency: 'USD',
          sell_price: 9950,
          sell_currency: 'USD',
          payment_status: 'waiting',
          payment_deadline_days: 15,
          is_kpi_received: false,
          client_id: 'c-1',
          client_first_name: 'Saidjon',
          client_last_name: 'aka',
          client_company: 'Saidjon Co',
        },
        {
          id: 'cargo-2',
          container_truck_id: '06 KG 761 AJN',
          cargo: 'Fabrics',
          cargo_type: 'FTL',
          confirmed_date: '2026-08-05',
          purchase_price: 9630,
          purchase_currency: 'USD',
          sell_price: 10250,
          sell_currency: 'USD',
          payment_status: 'unpaid',
          payment_deadline_days: 15,
          is_kpi_received: false,
          client_id: 'c-2',
          client_first_name: 'Abduhamid',
          client_last_name: 'aka',
          client_company: 'Abduhamid Co',
        },
        {
          id: 'cargo-3',
          container_truck_id: '06 KG 814 ARI',
          cargo: 'Auto Parts',
          cargo_type: 'FTL',
          confirmed_date: '2026-08-10',
          purchase_price: 8891,
          purchase_currency: 'USD',
          sell_price: 9650,
          sell_currency: 'USD',
          payment_status: 'paid',
          payment_deadline_days: 15,
          is_kpi_received: true,
          client_id: 'c-1',
          client_first_name: 'Saidjon',
          client_last_name: 'aka',
          client_company: 'Saidjon Co',
        },
      ];

      const customKnex: any = jest.fn((table: string) => {
        if (table === 'employees') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(mockEmployee),
          };
        }
        if (
          table === 'cargo_registrations as cr' ||
          table === 'cargo_registrations'
        ) {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue(mockCargos),
          };
        }
        if (
          table === 'cargo_transactions as ct' ||
          table === 'cargo_transactions'
        ) {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([]),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue([]),
        };
      });
      customKnex.schema = {
        hasTable: jest.fn().mockResolvedValue(true),
      };

      const testService = new SalesManagerKpiService(customKnex);

      const result = await testService.getCargosMonitoring({
        employee_id: empId,
        month,
      });

      expect(result.meta).toBeDefined();
      expect(result.meta.employee_id).toBe(empId);
      expect(result.meta.total_cargos).toBe(3);
      // Cargo 1 profit = 9950 - 9657 = 293
      // Cargo 2 profit = 10250 - 9630 = 620
      // Cargo 3 profit = 9650 - 8891 = 759
      // Total profit = 293 + 620 + 759 = 1672
      expect(result.meta.total_profit).toBe(1672);
      expect(result.data.length).toBe(3);

      const row1 = result.data[0];
      expect(row1.index).toBe(1);
      expect(row1.container_truck_id).toBe('06 KG 762 AJW');
      expect(row1.client_name).toBe('Saidjon aka');
      expect(row1.buy_price).toBe(9657);
      expect(row1.sell_price).toBe(9950);
      expect(row1.profit).toBe(293);
      expect(row1.payment_status).toBe('waiting');
      expect(row1.payment_status_label).toBe('Kutilmoqda');
      expect(row1.is_paid).toBe(false);

      const row2 = result.data[1];
      expect(row2.payment_status).toBe('unpaid');
      expect(row2.payment_status_label).toBe('Klient bermadi');
      expect(row2.is_paid).toBe(false);

      const row3 = result.data[2];
      expect(row3.payment_status).toBe('paid');
      expect(row3.payment_status_label).toBe("To'landi");
      expect(row3.is_paid).toBe(true);
      expect(row3.is_kpi_received).toBe(true);
    });
  });

  describe('updateCargoPaymentStatus and confirmCargoKpi', () => {
    it('updates cargo payment status successfully', async () => {
      const cargoId = 'cargo-uuid-123';
      const customKnex: any = jest.fn((table: string) => {
        if (table === 'cargo_registrations') {
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(1),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue(0),
        };
      });
      customKnex.fn = { now: jest.fn() };

      const testService = new SalesManagerKpiService(customKnex);
      const res = await testService.updateCargoPaymentStatus(cargoId, {
        payment_status: "to'landi",
        payment_deadline_days: 20,
      });

      expect(res.id).toBe(cargoId);
      expect(res.payment_status).toBe(CargoPaymentStatus.PAID);
      expect(res.payment_status_label).toBe("To'landi");
      expect(res.payment_deadline_days).toBe(20);
      expect(res.updated).toBe(true);
    });

    it('confirms employee KPI bonus receipt for a cargo', async () => {
      const cargoId = 'cargo-uuid-123';
      const customKnex: any = jest.fn((table: string) => {
        if (table === 'cargo_registrations') {
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(1),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          update: jest.fn().mockResolvedValue(0),
        };
      });
      customKnex.fn = { now: jest.fn() };

      const testService = new SalesManagerKpiService(customKnex);
      const res = await testService.confirmCargoKpi(cargoId, {
        is_kpi_received: true,
        review_notes: 'Paid via bank card',
      });

      expect(res.id).toBe(cargoId);
      expect(res.is_kpi_received).toBe(true);
      expect(res.kpi_received_at).toBeDefined();
      expect(res.review_notes).toBe('Paid via bank card');
      expect(res.updated).toBe(true);
    });

    it('should account for internal_logistics_cost in sales manager cargo profit calculation', async () => {
      const customKnex: any = jest.fn((table: string) => {
        if (table === 'employees') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'emp-1',
              first_name: 'John',
              last_name: 'Doe',
              career_level: CareerLevel.JUNIOR,
            }),
          };
        }
        if (table === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([
              {
                id: 'cr-int-1',
                cargo_type: 'LTL',
                cargo: 'Shoes',
                sell_price: 2000,
                sell_currency: 'USD',
                purchase_price: 0,
                purchase_currency: 'USD',
                internal_logistics_cost: 300,
                internal_logistics_currency: 'USD',
                payment_status: 'paid',
                client_id: 'client-1',
                client_first_name: 'Alisher',
                client_last_name: 'Navoiy',
              },
            ]),
          };
        }
        if (table === 'cargo_transactions as ct') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([]),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
        };
      });
      customKnex.schema = {
        hasTable: jest.fn().mockResolvedValue(true),
      };
      customKnex.fn = { now: jest.fn() };

      const testService = new SalesManagerKpiService(customKnex);
      const res = await testService.getCargosMonitoring({
        employee_id: 'emp-1',
        month: '2026-08',
      });

      expect(res.data).toHaveLength(1);
      const c = res.data[0];
      expect(c.sell_price).toBe(2000);
      expect(c.buy_price).toBe(300); // from internal_logistics_cost
      expect(c.profit).toBe(1700); // 2000 - 300
      expect(c.internal_logistics_cost).toBe(300);
      expect(c.internal_logistics_currency).toBe('USD');
      expect(res.meta.total_buy_price).toBe(300);
      expect(res.meta.total_sell_price).toBe(2000);
      expect(res.meta.total_profit).toBe(1700);
    });
  });
});

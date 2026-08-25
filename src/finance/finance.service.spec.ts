import { Test, TestingModule } from '@nestjs/testing';
import { FinanceService } from './finance.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { ExpenseCategory } from './dto/create-expense.dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Currency } from '../currency/currency.types';

describe('FinanceService', () => {
  let service: FinanceService;
  let mockQueryBuilder: any;
  let mockKnex: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockResolvedValue(1),
      returning: jest.fn().mockResolvedValue([
        {
          id: 'exp-1',
          category: ExpenseCategory.TAX,
          amount: 500,
          currency: Currency.UZS,
          description: 'Tax payment',
          expense_date: '2026-07-15',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
      first: jest.fn(),
      count: jest.fn().mockReturnThis(),
      sum: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([{ total: '1' }])),
    };

    mockKnex = jest.fn().mockReturnValue(mockQueryBuilder);
    mockKnex.raw = jest.fn((sql) => sql);
    mockKnex.fn = { now: jest.fn() };
    mockKnex.transaction = jest.fn(async (cb) => await cb(mockKnex));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        {
          provide: KNEX_CONNECTION,
          useValue: mockKnex,
        },
      ],
    }).compile();

    service = module.get<FinanceService>(FinanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createExpense', () => {
    it('should insert and return formatted expense with default currency', async () => {
      const dto = {
        category: ExpenseCategory.TAX,
        amount: 500,
        description: 'Tax payment',
        expense_date: '2026-07-15',
      };

      const result = await service.createExpense(dto);
      expect(mockKnex).toHaveBeenCalledWith('expenses');
      expect(result.id).toEqual('exp-1');
      expect(result.amount).toEqual(500);
      expect(result.currency).toEqual(Currency.UZS);
      expect(result.category).toEqual(ExpenseCategory.TAX);
    });

    it('should throw BadRequestException for salary_payout without employee_id', async () => {
      const dto = {
        category: ExpenseCategory.SALARY_PAYOUT,
        amount: 1000,
        expense_date: '2026-07-15',
      };

      await expect(service.createExpense(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException for salary_payout when employee_id does not exist', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce(null);

      const dto = {
        category: ExpenseCategory.SALARY_PAYOUT,
        amount: 1000,
        employee_id: 'a0000000-0000-0000-0000-000000000001',
        expense_date: '2026-07-15',
      };

      await expect(service.createExpense(dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should insert salary_payout expense when valid employee_id is provided', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'a0000000-0000-0000-0000-000000000001',
        first_name: 'John',
        last_name: 'Doe',
      });
      mockQueryBuilder.returning.mockResolvedValueOnce([
        {
          id: 'exp-2',
          category: ExpenseCategory.SALARY_PAYOUT,
          amount: 1000,
          currency: Currency.UZS,
          employee_id: 'a0000000-0000-0000-0000-000000000001',
          description: 'July salary',
          expense_date: '2026-07-15',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const dto = {
        category: ExpenseCategory.SALARY_PAYOUT,
        amount: 1000,
        employee_id: 'a0000000-0000-0000-0000-000000000001',
        description: 'July salary',
        expense_date: '2026-07-15',
      };

      const result = await service.createExpense(dto);
      expect(result.id).toEqual('exp-2');
      expect(result.employee_id).toEqual(
        'a0000000-0000-0000-0000-000000000001',
      );
    });

    it('should insert and return KPI and FOOD expenses successfully', async () => {
      mockQueryBuilder.returning
        .mockResolvedValueOnce([
          {
            id: 'exp-kpi',
            category: ExpenseCategory.KPI,
            amount: 750,
            currency: Currency.USD,
            description: 'Top performer quarterly KPI bonus',
            expense_date: '2026-08-15',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'exp-food',
            category: ExpenseCategory.FOOD,
            amount: 120,
            currency: Currency.UZS,
            description: 'Team lunch and refreshments',
            expense_date: '2026-08-16',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ]);

      const kpiResult = await service.createExpense({
        category: ExpenseCategory.KPI,
        amount: 750,
        currency: Currency.USD,
        description: 'Top performer quarterly KPI bonus',
        expense_date: '2026-08-15',
      });
      expect(kpiResult.category).toEqual(ExpenseCategory.KPI);
      expect(kpiResult.amount).toEqual(750);
      expect(kpiResult.currency).toEqual(Currency.USD);

      const foodResult = await service.createExpense({
        category: ExpenseCategory.FOOD,
        amount: 120,
        currency: Currency.UZS,
        description: 'Team lunch and refreshments',
        expense_date: '2026-08-16',
      });
      expect(foodResult.category).toEqual(ExpenseCategory.FOOD);
      expect(foodResult.amount).toEqual(120);
      expect(foodResult.currency).toEqual(Currency.UZS);
    });
  });

  describe('findExpenseById', () => {
    it('should return expense when found', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'exp-1',
        category: ExpenseCategory.RENT,
        amount: 1200,
        currency: Currency.USD,
        description: 'Office rent',
        expense_date: '2026-07-01',
      });

      const result = await service.findExpenseById('exp-1');
      expect(result.id).toEqual('exp-1');
      expect(result.amount).toEqual(1200);
      expect(result.currency).toEqual(Currency.USD);
    });

    it('should throw NotFoundException when not found', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce(null);
      await expect(service.findExpenseById('exp-99')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateExpense', () => {
    it('should update and return expense', async () => {
      mockQueryBuilder.first
        .mockResolvedValueOnce({
          id: 'exp-1',
          category: ExpenseCategory.RENT,
          amount: 1200,
          currency: Currency.UZS,
          description: 'Office rent',
          expense_date: '2026-07-01',
        })
        .mockResolvedValueOnce({
          id: 'exp-1',
          category: ExpenseCategory.RENT,
          amount: 1500,
          currency: Currency.USD,
          description: 'Updated office rent',
          expense_date: '2026-07-01',
        });

      const result = await service.updateExpense('exp-1', {
        amount: 1500,
        currency: Currency.USD,
      });
      expect(result.amount).toEqual(1500);
      expect(result.currency).toEqual(Currency.USD);
    });

    it('should throw BadRequestException when updating to salary_payout without employee_id', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'exp-1',
        category: ExpenseCategory.RENT,
        amount: 1200,
        currency: Currency.UZS,
        expense_date: '2026-07-01',
      });

      await expect(
        service.updateExpense('exp-1', {
          category: ExpenseCategory.SALARY_PAYOUT,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteExpense', () => {
    it('should delete expense successfully', async () => {
      mockQueryBuilder.delete.mockResolvedValueOnce(1);
      const result = await service.deleteExpense('exp-1');
      expect(result.message).toEqual('Expense deleted successfully');
    });

    it('should throw NotFoundException if expense does not exist', async () => {
      mockQueryBuilder.delete.mockResolvedValueOnce(0);
      await expect(service.deleteExpense('exp-99')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getExpenseCategories', () => {
    it('should return all 8 expense categories breakdown with grand total', async () => {
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) =>
        resolve([
          { category: 'kpi', total: '400.00', currency: 'UZS', count: '2' },
          { category: 'food', total: '150.00', currency: 'UZS', count: '3' },
          { category: 'rent', total: '500.00', currency: 'UZS', count: '1' },
        ]),
      );

      const result = await service.getExpenseCategories('2026-08');
      expect(result.categories.length).toEqual(8);
      expect(result.grand_total).toEqual(1050);

      const kpiCat = result.categories.find(
        (c) => c.category === ExpenseCategory.KPI,
      );
      expect(kpiCat).toBeDefined();
      expect(kpiCat?.total_amount).toEqual(400);
      expect(kpiCat?.expense_count).toEqual(2);

      const foodCat = result.categories.find(
        (c) => c.category === ExpenseCategory.FOOD,
      );
      expect(foodCat).toBeDefined();
      expect(foodCat?.total_amount).toEqual(150);
      expect(foodCat?.expense_count).toEqual(3);
    });
  });

  describe('getEmployeeSalaries', () => {
    it('should aggregate fixed salaries per department', async () => {
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) =>
        resolve([
          {
            id: 'emp-1',
            first_name: 'Jasur',
            last_name: 'Yoldoshev',
            phone: '+998901234567',
            department_id: 'dept-1',
            department_name: 'Sborniy',
            fixed_salary: '1000.00',
            is_active: true,
            color: '#FF0000',
          },
          {
            id: 'emp-2',
            first_name: 'Rustam',
            last_name: 'Rasulov',
            phone: '+998907654321',
            department_id: 'dept-1',
            department_name: 'Sborniy',
            fixed_salary: '500.00',
            is_active: true,
            color: '#0000FF',
          },
        ]),
      );

      const result = await service.getEmployeeSalaries();
      expect(result.total_employees).toEqual(2);
      expect(result.total_monthly_salaries).toEqual(1500);
      expect(result.departments.length).toEqual(1);
      expect(result.departments[0].total_fixed_salary).toEqual(1500);
    });
  });

  describe('getFinanceSummary', () => {
    it('should compute net profit, 10% SEO share, flow diagram, and comparisons accurately in USD', async () => {
      // Mock cargo_registrations sell queries, purchase queries, expenses, employees
      mockKnex.mockImplementation((tableName: string) => {
        const qb: any = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          whereRaw: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          then: jest.fn((resolve) => {
            if (tableName === 'cargo_registrations') {
              return resolve([
                {
                  sell_price: '10000.00',
                  sell_currency: 'USD',
                  purchase_price: '6000.00',
                  purchase_currency: 'USD',
                  sell_date: '2026-08-10',
                  purchase_date: '2026-08-05',
                },
              ]);
            }
            if (tableName === 'expenses') {
              return resolve([
                {
                  category: 'utility',
                  amount: '100.00',
                  currency: 'USD',
                  expense_date: '2026-08-05',
                },
                {
                  category: 'rent',
                  amount: '500.00',
                  currency: 'USD',
                  expense_date: '2026-08-01',
                },
              ]);
            }
            if (tableName === 'employees') {
              return resolve([{ fixed_salary: '1500.00', currency: 'USD' }]);
            }
            if (tableName === 'cargo_transactions') {
              return resolve([]);
            }
            return resolve([]);
          }),
        };
        return qb;
      });

      const result = await service.getFinanceSummary({
        period: '2026-08',
        currency: Currency.USD,
      });

      expect(result.currency).toEqual('USD');
      expect(result.summary.gross_revenue).toEqual(10000);
      expect(result.summary.cost_of_goods_sold).toEqual(6000);
      expect(result.summary.gross_profit).toEqual(4000);
      expect(result.summary.operational_expenses).toEqual(600);
      expect(result.summary.fixed_salaries_expense).toEqual(1500);
      expect(result.summary.total_expenses).toEqual(2100);
      expect(result.summary.net_profit).toEqual(1900); // 4000 - 2100
      expect(result.summary.seo_cut_10pc).toEqual(190); // 1900 * 0.10

      // Flow diagram check
      expect(result.flow_diagram).toBeDefined();
      expect(result.flow_diagram.formula).toEqual('P_net = G - F_total (USD)');
      expect(result.flow_diagram.gross_margin).toEqual(4000);
      expect(result.flow_diagram.total_all_in_expenses).toEqual(2100);
      expect(result.flow_diagram.net_profit).toEqual(1900);

      // Expense distribution check
      expect(result.expense_distribution.length).toEqual(8);
      const rentCat = result.expense_distribution.find(
        (c: any) => c.category === 'rent',
      );
      expect(rentCat?.amount).toEqual(500);
      expect(result.expense_breakdown).toHaveProperty('kpi');
      expect(result.expense_breakdown).toHaveProperty('food');
    });

    it('should correctly decouple cargo registration purchase_date (July) and sell_date (August)', async () => {
      // Cargo purchased in July 2026, sold in August 2026
      const crossMonthCargo = {
        id: 'cargo-1',
        purchase_price: '4000.00',
        purchase_currency: 'USD',
        purchase_date: '2026-07-25',
        sell_price: '7000.00',
        sell_currency: 'USD',
        sell_date: '2026-08-10',
      };

      mockKnex.mockImplementation((tableName: string) => {
        const qb: any = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          _rawCalls: [],
          whereRaw: jest.fn((sql: string, params: any[]) => {
            qb._rawCalls.push({ sql, params });
            return qb;
          }),
          then: jest.fn((resolve) => {
            if (tableName === 'cargo_registrations') {
              const startCall = qb._rawCalls.find((c: any) =>
                c.sql.includes('>='),
              );
              const startDate = startCall?.params?.[0];
              const isSellQuery = qb._rawCalls.some((c: any) =>
                c.sql.includes('sell_date'),
              );
              const isPurchaseQuery = qb._rawCalls.some((c: any) =>
                c.sql.includes('purchase_date'),
              );

              // If querying July 2026 (2026-07-01)
              if (startDate === '2026-07-01') {
                if (isSellQuery) {
                  // Sell was in August -> 0 in July
                  return resolve([]);
                }
                if (isPurchaseQuery) {
                  // Purchase was in July -> returns crossMonthCargo
                  return resolve([crossMonthCargo]);
                }
              }
              // If querying August 2026 (2026-08-01)
              if (startDate === '2026-08-01') {
                if (isSellQuery) {
                  // Sell was in August -> returns crossMonthCargo
                  return resolve([crossMonthCargo]);
                }
                if (isPurchaseQuery) {
                  // Purchase was in July -> 0 in August
                  return resolve([]);
                }
              }
              return resolve([]);
            }
            if (tableName === 'expenses' || tableName === 'employees') {
              return resolve([]);
            }
            return resolve([]);
          }),
        };
        return qb;
      });

      // 1. Check July 2026: Cost should be 4000, Revenue 0, Gross Profit -4000
      const julyResult = await service.getFinanceSummary({
        period: '2026-07',
        currency: Currency.USD,
      });
      expect(julyResult.summary.gross_revenue).toEqual(0);
      expect(julyResult.summary.cost_of_goods_sold).toEqual(4000);
      expect(julyResult.summary.gross_profit).toEqual(-4000);

      // 2. Check August 2026: Revenue should be 7000, Cost 0, Gross Profit 7000
      const augResult = await service.getFinanceSummary({
        period: '2026-08',
        currency: Currency.USD,
      });
      expect(augResult.summary.gross_revenue).toEqual(7000);
      expect(augResult.summary.cost_of_goods_sold).toEqual(0);
      expect(augResult.summary.gross_profit).toEqual(7000);
    });

    it('should handle multi-currency conversions and KPI integration', async () => {
      mockKnex.mockImplementation((tableName: string) => {
        const qb: any = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          whereRaw: jest.fn().mockReturnThis(),
          then: jest.fn((resolve) => {
            if (tableName === 'cargo_registrations') {
              return resolve([
                {
                  sell_price: '800.00',
                  sell_currency: 'USD',
                  purchase_price: '4500000.00',
                  purchase_currency: 'UZS',
                  purchase_usd_rate: '11886.72',
                  sell_date: '2026-08-06',
                  purchase_date: '2026-08-01',
                },
              ]);
            }
            if (tableName === 'expenses') {
              return resolve([]);
            }
            if (tableName === 'employees') {
              return resolve([{ fixed_salary: '1000.00', currency: 'USD' }]);
            }
            if (tableName === 'ltl_cargo_items') {
              return resolve([
                {
                  employee_id: 'emp-1',
                  volume: '50',
                  weight: '5000',
                  cargo_type: 'oddiy',
                },
              ]);
            }
            return resolve([]);
          }),
        };
        return qb;
      });

      const result = await service.getFinanceSummary({
        period: '2026-08',
        currency: Currency.USD,
      });
      expect(result.summary.gross_revenue).toEqual(800);
      // 4,500,000 UZS / 11,886.72 = ~378.57 USD
      expect(result.summary.cost_of_goods_sold).toBeCloseTo(378.57, 1);
      expect(result.summary.gross_profit).toBeCloseTo(421.43, 1);
      expect(result.summary.kpi_bonuses_expense).toBeGreaterThan(0);
    });
  });
});

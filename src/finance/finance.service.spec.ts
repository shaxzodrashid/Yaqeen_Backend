import { Test, TestingModule } from '@nestjs/testing';
import { FinanceService } from './finance.service';
import { KNEX_CONNECTION } from '../database/database.module';
import {
  ExpenseCategory,
  ExpenseSection,
  FTL_EXPENSE_CATEGORIES,
  LTL_EXPENSE_CATEGORIES,
} from './dto/create-expense.dto';
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
          section: ExpenseSection.FTL,
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
    it('should insert and return formatted FTL expense with default section and currency', async () => {
      const dto = {
        section: ExpenseSection.FTL,
        category: ExpenseCategory.TAX,
        amount: 500,
        description: 'Tax payment',
        expense_date: '2026-07-15',
      };

      const result = await service.createExpense(dto);
      expect(mockKnex).toHaveBeenCalledWith('expenses');
      expect(result.id).toEqual('exp-1');
      expect(result.section).toEqual(ExpenseSection.FTL);
      expect(result.amount).toEqual(500);
      expect(result.currency).toEqual(Currency.UZS);
      expect(result.category).toEqual(ExpenseCategory.TAX);
    });

    it('should physically separate FTL Food and LTL Food expense registrations', async () => {
      mockQueryBuilder.returning
        .mockResolvedValueOnce([
          {
            id: 'exp-ftl-food',
            section: ExpenseSection.FTL,
            category: ExpenseCategory.FOOD,
            amount: 300,
            currency: Currency.USD,
            description: 'FTL Drivers & dispatch meal',
            expense_date: '2026-08-01',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'exp-ltl-food',
            section: ExpenseSection.LTL,
            category: ExpenseCategory.FOOD,
            amount: 600,
            currency: Currency.USD,
            description: 'LTL China warehouse team meals',
            expense_date: '2026-08-01',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ]);

      const ftlFood = await service.createExpense({
        section: ExpenseSection.FTL,
        category: ExpenseCategory.FOOD,
        amount: 300,
        currency: Currency.USD,
        description: 'FTL Drivers & dispatch meal',
        expense_date: '2026-08-01',
      });
      expect(ftlFood.section).toEqual(ExpenseSection.FTL);
      expect(ftlFood.category).toEqual(ExpenseCategory.FOOD);
      expect(ftlFood.amount).toEqual(300);

      const ltlFood = await service.createExpense({
        section: ExpenseSection.LTL,
        category: ExpenseCategory.FOOD,
        amount: 600,
        currency: Currency.USD,
        description: 'LTL China warehouse team meals',
        expense_date: '2026-08-01',
      });
      expect(ltlFood.section).toEqual(ExpenseSection.LTL);
      expect(ltlFood.category).toEqual(ExpenseCategory.FOOD);
      expect(ltlFood.amount).toEqual(600);
    });

    it('should correctly infer LTL section when LTL-specific category is provided', async () => {
      mockQueryBuilder.returning.mockResolvedValueOnce([
        {
          id: 'exp-china',
          section: ExpenseSection.LTL,
          category: ExpenseCategory.CHINA_WAREHOUSE,
          amount: 2500,
          currency: Currency.USD,
          description: 'Yiwu warehouse rent',
          expense_date: '2026-08-01',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const result = await service.createExpense({
        category: ExpenseCategory.CHINA_WAREHOUSE,
        amount: 2500,
        currency: Currency.USD,
        description: 'Yiwu warehouse rent',
        expense_date: '2026-08-01',
      });

      expect(result.section).toEqual(ExpenseSection.LTL);
      expect(result.category).toEqual(ExpenseCategory.CHINA_WAREHOUSE);
      expect(result.amount).toEqual(2500);
    });

    it('should create all LTL specific categories (china_warehouse, firm_service, declarant)', async () => {
      mockQueryBuilder.returning
        .mockResolvedValueOnce([
          {
            id: 'exp-firm',
            section: ExpenseSection.LTL,
            category: ExpenseCategory.FIRM_SERVICE,
            amount: 800,
            currency: Currency.USD,
            description: 'Customs clearance partner fee',
            expense_date: '2026-08-05',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'exp-declarant',
            section: ExpenseSection.LTL,
            category: ExpenseCategory.DECLARANT,
            amount: 300,
            currency: Currency.USD,
            description: 'Declarant fee',
            expense_date: '2026-08-06',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ]);

      const firmRes = await service.createExpense({
        section: ExpenseSection.LTL,
        category: ExpenseCategory.FIRM_SERVICE,
        amount: 800,
        currency: Currency.USD,
        expense_date: '2026-08-05',
      });
      expect(firmRes.category).toEqual(ExpenseCategory.FIRM_SERVICE);
      expect(firmRes.section).toEqual(ExpenseSection.LTL);

      const declarantRes = await service.createExpense({
        section: ExpenseSection.LTL,
        category: ExpenseCategory.DECLARANT,
        amount: 300,
        currency: Currency.USD,
        expense_date: '2026-08-06',
      });
      expect(declarantRes.category).toEqual(ExpenseCategory.DECLARANT);
      expect(declarantRes.section).toEqual(ExpenseSection.LTL);
    });

    it('should throw BadRequestException when category is not allowed in section (e.g. tax in LTL)', async () => {
      await expect(
        service.createExpense({
          section: ExpenseSection.LTL,
          category: ExpenseCategory.TAX,
          amount: 500,
          expense_date: '2026-08-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when category is not allowed in FTL (e.g. china_warehouse in FTL)', async () => {
      await expect(
        service.createExpense({
          section: ExpenseSection.FTL,
          category: ExpenseCategory.CHINA_WAREHOUSE,
          amount: 500,
          expense_date: '2026-08-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for salary_payout without employee_id', async () => {
      const dto = {
        section: ExpenseSection.FTL,
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
        section: ExpenseSection.LTL,
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
          section: ExpenseSection.LTL,
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
        section: ExpenseSection.LTL,
        category: ExpenseCategory.SALARY_PAYOUT,
        amount: 1000,
        employee_id: 'a0000000-0000-0000-0000-000000000001',
        description: 'July salary',
        expense_date: '2026-07-15',
      };

      const result = await service.createExpense(dto);
      expect(result.id).toEqual('exp-2');
      expect(result.section).toEqual(ExpenseSection.LTL);
      expect(result.employee_id).toEqual(
        'a0000000-0000-0000-0000-000000000001',
      );
    });
  });

  describe('findExpenseById', () => {
    it('should return expense when found', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'exp-1',
        section: ExpenseSection.FTL,
        category: ExpenseCategory.RENT,
        amount: 1200,
        currency: Currency.USD,
        description: 'Office rent',
        expense_date: '2026-07-01',
      });

      const result = await service.findExpenseById('exp-1');
      expect(result.id).toEqual('exp-1');
      expect(result.section).toEqual(ExpenseSection.FTL);
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
          section: ExpenseSection.FTL,
          category: ExpenseCategory.RENT,
          amount: 1200,
          currency: Currency.UZS,
          description: 'Office rent',
          expense_date: '2026-07-01',
        })
        .mockResolvedValueOnce({
          id: 'exp-1',
          section: ExpenseSection.FTL,
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
        section: ExpenseSection.FTL,
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

    it('should throw BadRequestException when updating to incompatible category for existing section', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'exp-1',
        section: ExpenseSection.FTL,
        category: ExpenseCategory.RENT,
        amount: 1200,
        currency: Currency.UZS,
        expense_date: '2026-07-01',
      });

      await expect(
        service.updateExpense('exp-1', {
          section: ExpenseSection.FTL,
          category: ExpenseCategory.CHINA_WAREHOUSE,
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
    it('should return FTL categories with separate Food amount when section=ftl is requested', async () => {
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) =>
        resolve([
          {
            section: 'ftl',
            category: 'food',
            total: '300.00',
            currency: 'UZS',
            count: '1',
          },
          {
            section: 'ftl',
            category: 'rent',
            total: '500.00',
            currency: 'UZS',
            count: '1',
          },
          {
            section: 'ltl',
            category: 'food',
            total: '600.00',
            currency: 'UZS',
            count: '2',
          },
        ]),
      );

      const result = await service.getExpenseCategories(
        ExpenseSection.FTL,
        '2026-08',
      );
      expect(result.section).toEqual(ExpenseSection.FTL);
      expect(result.categories.length).toEqual(FTL_EXPENSE_CATEGORIES.length);
      expect(result.grand_total).toEqual(800); // 300 food + 500 rent

      const foodCat = result.categories.find(
        (c) => c.category === ExpenseCategory.FOOD,
      );
      expect(foodCat).toBeDefined();
      expect(foodCat?.total_amount).toEqual(300);
      expect(foodCat?.label).toEqual('Pitaniya');
      expect(foodCat?.expense_count).toEqual(1);
    });

    it('should return LTL categories with separate Food amount when section=ltl is requested', async () => {
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) =>
        resolve([
          {
            section: 'ftl',
            category: 'food',
            total: '300.00',
            currency: 'UZS',
            count: '1',
          },
          {
            section: 'ltl',
            category: 'food',
            total: '600.00',
            currency: 'UZS',
            count: '2',
          },
          {
            section: 'ltl',
            category: 'china_warehouse',
            total: '1000.00',
            currency: 'UZS',
            count: '1',
          },
        ]),
      );

      const result = await service.getExpenseCategories(
        ExpenseSection.LTL,
        '2026-08',
      );
      expect(result.section).toEqual(ExpenseSection.LTL);
      expect(result.categories.length).toEqual(LTL_EXPENSE_CATEGORIES.length);
      expect(result.grand_total).toEqual(1600); // 600 food + 1000 china_warehouse

      const foodCat = result.categories.find(
        (c) => c.category === ExpenseCategory.FOOD,
      );
      expect(foodCat).toBeDefined();
      expect(foodCat?.total_amount).toEqual(600);
      expect(foodCat?.label).toEqual('Pitanya');
      expect(foodCat?.expense_count).toEqual(2);

      const chinaCat = result.categories.find(
        (c) => c.category === ExpenseCategory.CHINA_WAREHOUSE,
      );
      expect(chinaCat).toBeDefined();
      expect(chinaCat?.total_amount).toEqual(1000);
      expect(chinaCat?.label).toEqual('Xitoy sklad');
    });

    it('should return sections breakdown for overview tab when section is not specified', async () => {
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) =>
        resolve([
          {
            section: 'ftl',
            category: 'food',
            total: '300.00',
            currency: 'UZS',
            count: '1',
          },
          {
            section: 'ltl',
            category: 'food',
            total: '600.00',
            currency: 'UZS',
            count: '2',
          },
        ]),
      );

      const result = await service.getExpenseCategories(undefined, '2026-08');
      expect(result.sections).toBeDefined();
      expect(result.sections[ExpenseSection.FTL].total_amount).toEqual(300);
      expect(result.sections[ExpenseSection.LTL].total_amount).toEqual(600);
      expect(result.grand_total).toEqual(900);
    });
  });

  describe('getFinanceSummary with Incomes & Expenses Separation', () => {
    it('should compute separate FTL and LTL revenues, COGS, gross profits, expenses, and net profit', async () => {
      mockKnex.mockImplementation((tableName: string) => {
        const qb: any = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          whereRaw: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          then: jest.fn((resolve) => {
            if (tableName === 'cargo_registrations') {
              return resolve([
                // FTL cargo
                {
                  cargo_type: 'FTL',
                  sell_price: '10000.00',
                  sell_currency: 'USD',
                  purchase_price: '6000.00',
                  purchase_currency: 'USD',
                  sell_date: '2026-08-10',
                  purchase_date: '2026-08-05',
                },
                // LTL cargo
                {
                  cargo_type: 'LTL',
                  sell_price: '5000.00',
                  sell_currency: 'USD',
                  purchase_price: '3000.00',
                  purchase_currency: 'USD',
                  sell_date: '2026-08-12',
                  purchase_date: '2026-08-06',
                },
              ]);
            }
            if (tableName === 'expenses') {
              return resolve([
                {
                  section: 'ftl',
                  category: 'food',
                  amount: '300.00',
                  currency: 'USD',
                  expense_date: '2026-08-05',
                },
                {
                  section: 'ftl',
                  category: 'utility',
                  amount: '200.00',
                  currency: 'USD',
                  expense_date: '2026-08-05',
                },
                {
                  section: 'ltl',
                  category: 'food',
                  amount: '600.00',
                  currency: 'USD',
                  expense_date: '2026-08-05',
                },
                {
                  section: 'ltl',
                  category: 'china_warehouse',
                  amount: '1400.00',
                  currency: 'USD',
                  expense_date: '2026-08-03',
                },
              ]);
            }
            if (tableName === 'employees') {
              return resolve([{ fixed_salary: '1000.00', currency: 'USD' }]);
            }
            if (tableName === 'cargo_transactions') {
              return resolve([]);
            }
            return resolve([]);
          }),
        };
        return qb;
      });

      // 1. Overall Company Summary (All tabs overview)
      const overallRes = await service.getFinanceSummary({
        period: '2026-08',
        currency: Currency.USD,
      });

      expect(overallRes.summary.gross_revenue).toEqual(15000); // 10k FTL + 5k LTL
      expect(overallRes.summary.cost_of_goods_sold).toEqual(9000); // 6k FTL + 3k LTL
      expect(overallRes.summary.gross_profit).toEqual(6000); // 15k - 9k
      expect(overallRes.summary.ftl_operational_expenses).toEqual(500); // 300 food + 200 util
      expect(overallRes.summary.ltl_operational_expenses).toEqual(2000); // 600 food + 1400 china
      expect(overallRes.summary.operational_expenses).toEqual(2500);

      // Section breakdown verification
      expect(
        overallRes.sections_breakdown[ExpenseSection.FTL].gross_revenue,
      ).toEqual(10000);
      expect(
        overallRes.sections_breakdown[ExpenseSection.FTL].cost_of_goods_sold,
      ).toEqual(6000);
      expect(
        overallRes.sections_breakdown[ExpenseSection.FTL].gross_profit,
      ).toEqual(4000);
      expect(
        overallRes.sections_breakdown[ExpenseSection.FTL].operational_expenses,
      ).toEqual(500);

      expect(
        overallRes.sections_breakdown[ExpenseSection.LTL].gross_revenue,
      ).toEqual(5000);
      expect(
        overallRes.sections_breakdown[ExpenseSection.LTL].cost_of_goods_sold,
      ).toEqual(3000);
      expect(
        overallRes.sections_breakdown[ExpenseSection.LTL].gross_profit,
      ).toEqual(2000);
      expect(
        overallRes.sections_breakdown[ExpenseSection.LTL].operational_expenses,
      ).toEqual(2000);

      // 2. FTL Primary Tab Summary
      const ftlRes = await service.getFinanceSummary({
        section: ExpenseSection.FTL,
        period: '2026-08',
        currency: Currency.USD,
      });

      expect(ftlRes.section).toEqual(ExpenseSection.FTL);
      expect(ftlRes.summary.gross_revenue).toEqual(10000);
      expect(ftlRes.summary.cost_of_goods_sold).toEqual(6000);
      expect(ftlRes.summary.gross_profit).toEqual(4000);
      expect(ftlRes.summary.operational_expenses).toEqual(500);
      expect(ftlRes.expense_breakdown['food']).toEqual(300); // Strictly FTL food

      // 3. LTL Primary Tab Summary
      const ltlRes = await service.getFinanceSummary({
        section: ExpenseSection.LTL,
        period: '2026-08',
        currency: Currency.USD,
      });

      expect(ltlRes.section).toEqual(ExpenseSection.LTL);
      expect(ltlRes.summary.gross_revenue).toEqual(5000);
      expect(ltlRes.summary.cost_of_goods_sold).toEqual(3000);
      expect(ltlRes.summary.gross_profit).toEqual(2000);
      expect(ltlRes.summary.operational_expenses).toEqual(2000);
      expect(ltlRes.expense_breakdown['food']).toEqual(600); // Strictly LTL food
      expect(ltlRes.expense_breakdown['china_warehouse']).toEqual(1400);
    });

    it('should include internal_logistics_cost of LTL cargos in LTL COGS', async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table === 'cargo_registrations') {
          return {
            select: jest.fn().mockReturnThis(),
            whereRaw: jest.fn().mockReturnThis(),
            then: jest.fn((callback) =>
              callback([
                {
                  cargo_type: 'LTL',
                  purchase_price: 0,
                  purchase_currency: 'USD',
                  purchase_date: '2026-08-10',
                  purchase_usd_rate: 1,
                  additional_expense: 100,
                  additional_expense_currency: 'USD',
                  internal_logistics_cost: 400,
                  internal_logistics_currency: 'USD',
                },
              ]),
            ),
          };
        }
        if (table === 'cargo_transactions') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            then: jest.fn((callback) => callback([])),
          };
        }
        if (table === 'expenses') {
          return {
            where: jest.fn().mockReturnThis(),
            whereRaw: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ total: 0 }),
            select: jest.fn().mockReturnThis(),
            then: jest.fn((callback) => callback([])),
          };
        }
        if (table === 'employees') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ total: 0 }),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          then: jest.fn((callback) => callback([])),
        };
      });

      const res = await service.getFinanceSummary({
        section: ExpenseSection.LTL,
        period: '2026-08',
        currency: Currency.USD,
      });

      // LTL COGS should include additional_expense (100) + internal_logistics_cost (400) = 500 USD
      expect(res.summary.cost_of_goods_sold).toBe(500);
    });

    it('should allow creating an expense with category internal_logistics in LTL section', async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table === 'expenses') {
          return {
            insert: jest.fn().mockReturnThis(),
            returning: jest.fn().mockResolvedValue([
              {
                id: 'exp-int-1',
                section: ExpenseSection.LTL,
                category: ExpenseCategory.INTERNAL_LOGISTICS,
                amount: 300,
                currency: Currency.USD,
                description: 'Local China trucking to warehouse',
                expense_date: '2026-08-15',
              },
            ]),
          };
        }
        return {};
      });

      const exp = await service.createExpense({
        section: ExpenseSection.LTL,
        category: ExpenseCategory.INTERNAL_LOGISTICS,
        amount: 300,
        currency: Currency.USD,
        description: 'Local China trucking to warehouse',
        expense_date: '2026-08-15',
      });

      expect(exp).toBeDefined();
      expect(exp.category).toBe('internal_logistics');
      expect(exp.section).toBe('ltl');
    });
  });
});

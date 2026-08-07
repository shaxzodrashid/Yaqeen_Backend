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
      count: jest.fn().mockResolvedValue([{ total: '1' }]),
      sum: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([])),
    };

    mockKnex = jest.fn().mockReturnValue(mockQueryBuilder);
    mockKnex.raw = jest.fn((sql) => sql);
    mockKnex.fn = { now: jest.fn() };
    mockKnex.transaction = jest.fn(async (cb) => cb(mockKnex));

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
    it('should compute net profit, 10% SEO share, and comparisons accurately', async () => {
      // Mock cargo transactions query
      mockQueryBuilder.then
        .mockImplementationOnce((resolve: any) =>
          resolve([
            {
              sell_price: '10000.00',
              buy_price: '6000.00',
              margin: '4000.00',
              kpi_bonus: '400.00',
              currency: 'UZS',
            },
          ]),
        )
        .mockImplementationOnce((resolve: any) =>
          resolve([
            { category: 'utility', amount: '100.00', currency: 'UZS' },
            { category: 'rent', amount: '500.00', currency: 'UZS' },
          ]),
        )
        .mockImplementationOnce((resolve: any) =>
          resolve([
            {
              fixed_salary: '1500.00',
              currency: 'UZS',
            },
          ]),
        )
        .mockImplementationOnce((resolve: any) =>
          resolve([
            {
              sell_price: '8000.00',
              buy_price: '5000.00',
              margin: '3000.00',
              kpi_bonus: '300.00',
              currency: 'UZS',
            },
          ]),
        )
        .mockImplementationOnce((resolve: any) =>
          resolve([
            { category: 'utility', amount: '100.00', currency: 'UZS' },
            { category: 'rent', amount: '500.00', currency: 'UZS' },
          ]),
        )
        .mockImplementationOnce((resolve: any) =>
          resolve([
            {
              fixed_salary: '1500.00',
              currency: 'UZS',
            },
          ]),
        );

      const result = await service.getFinanceSummary({ period: '2026-07' });

      expect(result.summary.gross_revenue).toEqual(10000);
      expect(result.summary.gross_profit).toEqual(4000);
      expect(result.summary.operational_expenses).toEqual(600);
      expect(result.summary.fixed_salaries_expense).toEqual(1500);
      expect(result.summary.kpi_bonuses_expense).toEqual(400);
      expect(result.summary.total_expenses).toEqual(2500);
      expect(result.summary.net_profit).toEqual(1500); // 4000 - 2500
      expect(result.summary.seo_cut_10pc).toEqual(150); // 1500 * 0.10
    });
  });
});

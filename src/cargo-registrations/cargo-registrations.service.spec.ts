import { Test, TestingModule } from '@nestjs/testing';
import { CargoRegistrationsService } from './cargo-registrations.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { CurrencyService } from '../currency/currency.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ALLOWED_CONTAINER_TYPES } from './dto/cargo-registrations.dto';

describe('CargoRegistrationsService', () => {
  let service: CargoRegistrationsService;
  let knexMock: any;
  let currencyServiceMock: any;

  beforeEach(async () => {
    knexMock = jest.fn();
    knexMock.raw = jest.fn((str) => str);
    knexMock.fn = { now: jest.fn() };
    currencyServiceMock = {
      getRatesForDate: jest.fn().mockResolvedValue({
        USD: { currency: 'USD', rate: 11886.72, nominal: 1 },
        UZS: { currency: 'UZS', rate: 1, nominal: 1 },
        RUB: { currency: 'RUB', rate: 145, nominal: 1 },
        RMB: { currency: 'RMB', rate: 1815, nominal: 1 },
      }),
      getUsdRateForDate: jest.fn().mockResolvedValue(11886.72),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CargoRegistrationsService,
        {
          provide: KNEX_CONNECTION,
          useValue: knexMock,
        },
        {
          provide: CurrencyService,
          useValue: currencyServiceMock,
        },
      ],
    }).compile();

    service = module.get<CargoRegistrationsService>(CargoRegistrationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('LTL & FTL validation', () => {
    it('should throw BadRequestException for LTL cargo without volume', async () => {
      const user = { id: 'user-uuid-1', role: 'CEO' };

      // Mock user check & employee check
      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ role: 'CEO' }),
          };
        }
        if (tableName === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ employee_id: 'emp-uuid-1' }),
          };
        }
        if (tableName === 'employees') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ id: 'emp-uuid-1' }),
          };
        }
        if (tableName === 'clients') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ id: 'client-uuid-1' }),
          };
        }
        return {};
      });

      await expect(
        service.createCargoRegistration(user, {
          cargo_type: 'LTL',
          weight: 500,
          container_truck_id: 'TRK-001',
          agent_name: 'Agent X',
          cargo: 'Textiles',
          purchase_price: 1000,
          purchase_currency: 'USD',
          sell_price: 1500,
          sell_currency: 'USD',
          client_id: 'client-uuid-1',
          employee_id: 'emp-uuid-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for FTL cargo with invalid container type', async () => {
      const user = { id: 'user-uuid-1', role: 'CEO' };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ role: 'CEO' }),
          };
        }
        if (tableName === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ employee_id: 'emp-uuid-1' }),
          };
        }
        if (tableName === 'employees') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ id: 'emp-uuid-1' }),
          };
        }
        if (tableName === 'clients') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ id: 'client-uuid-1' }),
          };
        }
        return {};
      });

      await expect(
        service.createCargoRegistration(user, {
          cargo_type: 'FTL',
          container_type: 'INVALID_TYPE',
          container_truck_id: 'TRK-002',
          agent_name: 'Agent Y',
          cargo: 'Machinery',
          purchase_price: 2000,
          purchase_currency: 'USD',
          sell_price: 3000,
          sell_currency: 'USD',
          client_id: 'client-uuid-1',
          employee_id: 'emp-uuid-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow valid FTL container type from whitelist', () => {
      expect(ALLOWED_CONTAINER_TYPES).toContain('40HQ');
      expect(ALLOWED_CONTAINER_TYPES).toContain('Ref Fura');
      expect(ALLOWED_CONTAINER_TYPES).toContain('127 CBM');
    });
  });

  describe('RMB rate validation', () => {
    it('should throw BadRequestException if purchase_currency is RMB but usd_rmb_rate is missing', async () => {
      const user = { id: 'user-uuid-1', role: 'CEO' };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ role: 'CEO' }),
          };
        }
        if (tableName === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ employee_id: 'emp-uuid-1' }),
          };
        }
        if (tableName === 'employees') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ id: 'emp-uuid-1' }),
          };
        }
        if (tableName === 'clients') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ id: 'client-uuid-1' }),
          };
        }
        return {};
      });

      await expect(
        service.createCargoRegistration(user, {
          cargo_type: 'FTL',
          container_type: '40HQ',
          container_truck_id: 'TRK-003',
          agent_name: 'Agent Z',
          cargo: 'Electronics',
          purchase_price: 7000,
          purchase_currency: 'RMB',
          sell_price: 1200,
          sell_currency: 'USD',
          client_id: 'client-uuid-1',
          employee_id: 'emp-uuid-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Permissions: register_for_everyone', () => {
    it('should throw ForbiddenException if standard EMPLOYEE tries to register for another employee', async () => {
      const user = { id: 'user-employee-1', role: 'EMPLOYEE' };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              role: 'EMPLOYEE',
              permissions: JSON.stringify({
                cargo_registrations: { register_for_everyone: false },
              }),
            }),
          };
        }
        if (tableName === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ employee_id: 'emp-uuid-1' }),
          };
        }
        return {};
      });

      await expect(
        service.createCargoRegistration(user, {
          cargo_type: 'FTL',
          container_type: '40HQ',
          container_truck_id: 'TRK-004',
          agent_name: 'Agent A',
          cargo: 'Furniture',
          purchase_price: 1000,
          purchase_currency: 'USD',
          sell_price: 1500,
          sell_currency: 'USD',
          client_id: 'client-uuid-1',
          employee_id: 'emp-uuid-2', // Different employee!
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GET list response & metadata aggregations', () => {
    it('should return aggregated meta and structured data list', async () => {
      const paginatedData = [
        {
          id: 'cargo-1',
          cargo_type: 'LTL',
          volume: 12.5,
          weight: 1500.0,
          container_type: null,
          container_truck_id: 'TRK-100',
          agent_name: 'FastCargo',
          cargo: 'Computers',
          usd_rmb_rate: null,
          purchase_price: '1000.00',
          purchase_currency: 'USD',
          sell_price: '1500.00',
          sell_currency: 'USD',
          status: 'Waiting',
          confirmed_date: '2026-08-01',
          loaded_date: '2026-08-02',
          arrived_date: '2026-08-05',
          purchase_date: '2026-07-28',
          sell_date: '2026-08-03',
          created_at: '2026-08-01T10:00:00.000Z',
          updated_at: '2026-08-01T12:00:00.000Z',
          client_first_name: 'John',
          client_last_name: 'Doe',
          emp_first_name: 'Alice',
          emp_last_name: 'Smith',
        },
        {
          id: 'cargo-2',
          cargo_type: 'FTL',
          volume: null,
          weight: null,
          container_type: '40HQ',
          container_truck_id: 'TRK-200',
          agent_name: 'SinoLogistics',
          cargo: 'Solar Panels',
          usd_rmb_rate: '7.23',
          purchase_price: '7000.00',
          purchase_currency: 'RMB',
          sell_price: '1200.00',
          sell_currency: 'USD',
          status: 'In Transit',
          confirmed_date: '2026-08-02',
          loaded_date: '2026-08-04',
          arrived_date: null,
          purchase_date: '2026-07-30',
          sell_date: '2026-08-04',
          created_at: '2026-08-02T10:00:00.000Z',
          updated_at: '2026-08-02T12:00:00.000Z',
          client_first_name: 'Bob',
          client_last_name: 'Jones',
          emp_first_name: 'Alice',
          emp_last_name: 'Smith',
        },
      ];

      const aggChain: any = {
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          total_count: '2',
          gross_usd: 2700,
          gross_uzs: 0,
          gross_rub: 0,
          gross_rmb: 0,
          total_sell_usd: 2700,
          total_sell_uzs: 32094144,
          total_purchase_usd: 1968.19,
          total_purchase_uzs: 23395252.88,
        }),
      };

      const paginatedChain: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue(paginatedData),
      };

      const queryChain: any = {};
      queryChain.where = jest.fn().mockReturnValue(queryChain);

      let cloneCount = 0;
      queryChain.clone = jest.fn().mockImplementation(() => {
        cloneCount++;
        if (cloneCount === 1) return aggChain;
        return paginatedChain;
      });

      knexMock.mockReturnValue(queryChain);

      const result = await service.findAllCargoRegistrations({
        limit: '10',
        page: '1',
      });

      expect(result).toHaveProperty('meta');
      expect(result).toHaveProperty('data');
      expect(result.meta.total).toBe(2);
      expect(result.meta.gross_sales_revenue.USD).toBe(2700);
      expect(result.meta.calculated_net_yield.USD).toBe(731.81);
      expect(result.data.length).toBe(2);
      expect(result.data[0].cargo_type).toBe('LTL');
      expect(result.data[0].volume).toBe(12.5);
      expect(result.data[0].agent_name).toBe('FastCargo');
      expect(result.data[0].confirmed_date).toBe('2026-08-01');
      expect(result.data[0].loaded_date).toBe('2026-08-02');
      expect(result.data[0].arrived_date).toBe('2026-08-05');
      expect(result.data[0].purchase_date).toBe('2026-07-28');
      expect(result.data[0].sell_date).toBe('2026-08-03');
      expect(result.data[0].created_at).toBe('2026-08-01T10:00:00.000Z');
      expect(result.data[0].updated_at).toBe('2026-08-01T12:00:00.000Z');
      expect(result.data[0].purchase_price.amount).toBe(1000);
      expect(result.data[0].purchase_price.currency).toBe('USD');
      expect(result.data[1].cargo_type).toBe('FTL');
      expect(result.data[1].container_type).toBe('40HQ');
      expect(result.data[1].arrived_date).toBeNull();
    });

    it('should apply timestamp filters (confirmed, loaded, arrived) and creation date filters', async () => {
      const aggChain: any = {
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ total_count: '0' }),
      };

      const paginatedChain: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      };

      const queryChain: any = {};
      queryChain.where = jest.fn().mockReturnValue(queryChain);

      let cloneCount = 0;
      queryChain.clone = jest.fn().mockImplementation(() => {
        cloneCount++;
        if (cloneCount === 1) return aggChain;
        return paginatedChain;
      });

      knexMock.mockReturnValue(queryChain);

      await service.findAllCargoRegistrations({
        confirmed_start_date: '2026-08-01',
        confirmed_end_date: '2026-08-05',
        loaded_start_date: '2026-08-02',
        loaded_end_date: '2026-08-06',
        arrived_start_date: '2026-08-03',
        arrived_end_date: '2026-08-07',
        created_start_date: '2026-08-01',
        created_end_date: '2026-08-10',
      });

      expect(queryChain.where).toHaveBeenCalledWith(
        'cr.confirmed_date',
        '>=',
        '2026-08-01',
      );
      expect(queryChain.where).toHaveBeenCalledWith(
        'cr.confirmed_date',
        '<=',
        '2026-08-05',
      );
      expect(queryChain.where).toHaveBeenCalledWith(
        'cr.loaded_date',
        '>=',
        '2026-08-02',
      );
      expect(queryChain.where).toHaveBeenCalledWith(
        'cr.loaded_date',
        '<=',
        '2026-08-06',
      );
      expect(queryChain.where).toHaveBeenCalledWith(
        'cr.arrived_date',
        '>=',
        '2026-08-03',
      );
      expect(queryChain.where).toHaveBeenCalledWith(
        'cr.arrived_date',
        '<=',
        '2026-08-07',
      );
      expect(queryChain.where).toHaveBeenCalledWith(
        'cr.created_at',
        '>=',
        '2026-08-01T00:00:00.000Z',
      );
      expect(queryChain.where).toHaveBeenCalledWith(
        'cr.created_at',
        '<=',
        '2026-08-10T23:59:59.999Z',
      );
    });

    it('should apply cargo_type filter when provided in query', async () => {
      const aggChain: any = {
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ total_count: '0' }),
      };

      const paginatedChain: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      };

      const queryChain: any = {};
      queryChain.where = jest.fn().mockReturnValue(queryChain);

      let cloneCount = 0;
      queryChain.clone = jest.fn().mockImplementation(() => {
        cloneCount++;
        if (cloneCount === 1) return aggChain;
        return paginatedChain;
      });

      knexMock.mockReturnValue(queryChain);

      await service.findAllCargoRegistrations({
        cargo_type: 'LTL',
      });

      expect(queryChain.where).toHaveBeenCalledWith('cr.cargo_type', 'LTL');
    });

    it('should apply purchase_date and sell_date filters (range and exact)', async () => {
      const createMockQuery = () => {
        const aggChain: any = {
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ total_count: '0' }),
        };
        const paginatedChain: any = {
          leftJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockResolvedValue([]),
        };
        const queryChain: any = {};
        queryChain.where = jest.fn().mockReturnValue(queryChain);
        let cloneCount = 0;
        queryChain.clone = jest.fn().mockImplementation(() => {
          cloneCount++;
          if (cloneCount === 1) return aggChain;
          return paginatedChain;
        });
        return { queryChain, selectChain: paginatedChain };
      };

      // 1. Range test
      const { queryChain: q1 } = createMockQuery();
      knexMock.mockReturnValue(q1);

      await service.findAllCargoRegistrations({
        purchase_start_date: '2026-08-01',
        purchase_end_date: '2026-08-15',
        sell_start_date: '2026-08-05',
        sell_end_date: '2026-08-20',
      });

      expect(q1.where).toHaveBeenCalledWith(
        'cr.purchase_date',
        '>=',
        '2026-08-01',
      );
      expect(q1.where).toHaveBeenCalledWith(
        'cr.purchase_date',
        '<=',
        '2026-08-15',
      );
      expect(q1.where).toHaveBeenCalledWith('cr.sell_date', '>=', '2026-08-05');
      expect(q1.where).toHaveBeenCalledWith('cr.sell_date', '<=', '2026-08-20');

      // 2. Exact date test
      const { queryChain: q2 } = createMockQuery();
      knexMock.mockReturnValue(q2);

      await service.findAllCargoRegistrations({
        purchase_date: '2026-08-10',
        sell_date: '2026-08-12',
      });

      expect(q2.where).toHaveBeenCalledWith('cr.purchase_date', '2026-08-10');
      expect(q2.where).toHaveBeenCalledWith('cr.sell_date', '2026-08-12');
    });

    it('should apply dynamic sorting by purchase_date, sell_date, client name, employee name, and order ASC/DESC', async () => {
      const createMockQuery = () => {
        const aggChain: any = {
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ total_count: '2' }),
        };
        const paginatedChain: any = {
          leftJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockResolvedValue([]),
        };
        const queryChain: any = {};
        queryChain.where = jest.fn().mockReturnValue(queryChain);
        let cloneCount = 0;
        queryChain.clone = jest.fn().mockImplementation(() => {
          cloneCount++;
          if (cloneCount === 1) return aggChain;
          return paginatedChain;
        });
        return { queryChain, selectChain: paginatedChain };
      };

      // Test 1: sort by purchase_date ASC
      const { queryChain: q1, selectChain: s1 } = createMockQuery();
      knexMock.mockReturnValue(q1);
      await service.findAllCargoRegistrations({
        sort_by: 'purchase_date',
        sort_order: 'ASC',
      });
      expect(s1.orderBy).toHaveBeenCalledWith('cr.purchase_date', 'asc');

      // Test 2: sort by sell_date DESC
      const { queryChain: q2, selectChain: s2 } = createMockQuery();
      knexMock.mockReturnValue(q2);
      await service.findAllCargoRegistrations({
        sort_by: 'sell_date',
        sort_order: 'DESC',
      });
      expect(s2.orderBy).toHaveBeenCalledWith('cr.sell_date', 'desc');

      // Test 3: sort by client_name ASC
      const { queryChain: q3, selectChain: s3 } = createMockQuery();
      knexMock.mockReturnValue(q3);
      await service.findAllCargoRegistrations({
        sort_by: 'client_name',
        sort_order: 'ASC',
      });
      expect(s3.orderBy).toHaveBeenCalledWith('c.first_name', 'asc');
      expect(s3.orderBy).toHaveBeenCalledWith('c.last_name', 'asc');

      // Test 4: sort by employee_name DESC
      const { queryChain: q4, selectChain: s4 } = createMockQuery();
      knexMock.mockReturnValue(q4);
      await service.findAllCargoRegistrations({
        sort_by: 'employee_name',
        order: 'DESC',
      });
      expect(s4.orderBy).toHaveBeenCalledWith('e.first_name', 'desc');
      expect(s4.orderBy).toHaveBeenCalledWith('e.last_name', 'desc');

      // Test 5: sort by status ASC
      const { queryChain: q5, selectChain: s5 } = createMockQuery();
      knexMock.mockReturnValue(q5);
      await service.findAllCargoRegistrations({
        sort_by: 'status',
        sort_order: 'asc',
      });
      expect(s5.orderBy).toHaveBeenCalledWith('cr.status', 'asc');
    });
  });

  describe('findCargoRegistrationDetails', () => {
    it('should return formatted cargo registration details without querying non-existent columns', async () => {
      const mockRow = {
        id: 'cargo-uuid-1',
        cargo_type: 'FTL',
        volume: null,
        weight: null,
        container_type: '40HQ',
        container_truck_id: 'TRK-001',
        agent_name: 'Agent X',
        cargo: 'Textiles',
        confirmed_date: '2026-08-01',
        loaded_date: '2026-08-02',
        arrived_date: '2026-08-05',
        purchase_price: '1000.00',
        purchase_currency: 'USD',
        sell_price: '1500.00',
        sell_currency: 'USD',
        usd_rmb_rate: null,
        status: 'Waiting',
        description: 'Test cargo',
        client_id: 'client-uuid-1',
        employee_id: 'emp-uuid-1',
        client_first_name: 'John',
        client_last_name: 'Doe',
        client_company: 'ACME Corp',
        client_phone: '+998901234567',
        emp_first_name: 'Alice',
        emp_last_name: 'Smith',
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
      };

      const selectChain: any = {};
      selectChain.where = jest.fn().mockReturnValue(selectChain);
      selectChain.first = jest.fn().mockResolvedValue(mockRow);

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnValue(selectChain),
          };
        }
        return {};
      });

      const result = await service.findCargoRegistrationDetails('cargo-uuid-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('cargo-uuid-1');
      expect(result.client).toEqual({
        id: 'client-uuid-1',
        first_name: 'John',
        last_name: 'Doe',
        company_name: 'ACME Corp',
        phone: '+998901234567',
      });
      expect(result.employee).toEqual({
        id: 'emp-uuid-1',
        first_name: 'Alice',
        last_name: 'Smith',
      });
    });

    it('should throw NotFoundException when cargo registration does not exist', async () => {
      const selectChain: any = {};
      selectChain.where = jest.fn().mockReturnValue(selectChain);
      selectChain.first = jest.fn().mockResolvedValue(null);

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnValue(selectChain),
          };
        }
        return {};
      });

      await expect(
        service.findCargoRegistrationDetails('non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should correctly calculate multi-currency net yield for 4,500,000 UZS purchase and $800 USD sell', async () => {
      const mockRow = {
        id: 'cargo-uuid-1',
        cargo_type: 'FTL',
        container_truck_id: 'TRK-6447',
        agent_name: 'SilkRoad Express',
        cargo: 'General Goods',
        purchase_price: 4500000,
        purchase_currency: 'UZS',
        purchase_date: '2026-07-20',
        purchase_usd_rate: 11886.72,
        sell_price: 800,
        sell_currency: 'USD',
        sell_date: '2026-08-06',
        sell_usd_rate: 11886.72,
        status: 'In Transit',
        client_id: 'client-uuid-1',
        employee_id: 'emp-uuid-1',
        created_at: new Date('2026-07-20'),
      };

      const selectChain: any = {};
      selectChain.where = jest.fn().mockReturnValue(selectChain);
      selectChain.first = jest.fn().mockResolvedValue(mockRow);

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnValue(selectChain),
          };
        }
        return {};
      });

      const result = await service.findCargoRegistrationDetails('cargo-uuid-1');

      expect(result).toBeDefined();
      expect(result.purchase_price).toBe(4500000);
      expect(result.purchase_currency).toBe('UZS');
      expect(result.purchase_amount_usd).toBe(378.57);
      expect(result.sell_price).toBe(800);
      expect(result.sell_currency).toBe('USD');
      expect(result.sell_amount_usd).toBe(800);
      expect(result.net_yield).toBe(421.43);
      expect(result.net_yield_details.amount_usd).toBe(421.43);
    });

    it('should aggregate cargo registration statistics for LTL and FTL with financials', async () => {
      jest.spyOn(service, 'findAllCargoRegistrations').mockResolvedValue({
        meta: {
          total: 2,
          limit: 100000,
          offset: 0,
          calculated_net_yield: {
            USD: 800,
            UZS: 10280000,
            total_usd: 800,
            total_uzs: 10280000,
          },
          gross_sales_revenue: {
            UZS: 0,
            USD: 3000,
            RUB: 0,
            RMB: 0,
            total_usd_equivalent: 3000,
            total_uzs_equivalent: 38550000,
          },
        },
        data: [
          {
            id: 'c-1',
            cargo_type: 'LTL',
            volume: 25,
            weight: 3000,
            container_type: null,
            container_truck_id: 'TRUCK-1',
            agent_name: 'Agent A',
            client_full_name: 'Client A',
            cargo: 'Apparel',
            usd_rmb_rate: null,
            employee_full_name: 'John Doe',
            purchase_price: {
              amount: 800,
              currency: 'USD',
              amount_usd: 800,
              amount_uzs: 10280000,
              date: '2026-08-01',
            },
            sell_price: {
              amount: 1200,
              currency: 'USD',
              amount_usd: 1200,
              amount_uzs: 15420000,
              date: '2026-08-01',
            },
            net_yield: {
              amount: 400,
              currency: 'USD',
              amount_usd: 400,
              amount_uzs: 5140000,
              purchase_currency: 'USD',
              sell_currency: 'USD',
            },
            status: 'Delivered',
          },
          {
            id: 'c-2',
            cargo_type: 'FTL',
            volume: null,
            weight: 15000,
            container_type: '40HQ',
            container_truck_id: 'TRUCK-2',
            agent_name: 'Agent B',
            client_full_name: 'Client B',
            cargo: 'Electronics',
            usd_rmb_rate: null,
            employee_full_name: 'John Doe',
            purchase_price: {
              amount: 1400,
              currency: 'USD',
              amount_usd: 1400,
              amount_uzs: 17990000,
              date: '2026-08-01',
            },
            sell_price: {
              amount: 1800,
              currency: 'USD',
              amount_usd: 1800,
              amount_uzs: 23130000,
              date: '2026-08-01',
            },
            net_yield: {
              amount: 400,
              currency: 'USD',
              amount_usd: 400,
              amount_uzs: 5140000,
              purchase_currency: 'USD',
              sell_currency: 'USD',
            },
            status: 'In Transit',
          },
        ],
      } as any);

      const stats = await service.getCargoRegistrationStats({});
      expect(stats).toHaveProperty('summary');
      expect(stats).toHaveProperty('ltl_statistics');
      expect(stats).toHaveProperty('ftl_statistics');
      expect(stats).toHaveProperty('status_distribution');
      expect(stats).toHaveProperty('by_manager');

      expect(stats.ltl_statistics.total_count).toBe(1);
      expect(stats.ltl_statistics.total_volume_m3).toBe(25);
      expect(stats.ftl_statistics.total_count).toBe(1);
      expect(stats.ftl_statistics.container_type_distribution['40HQ']).toBe(1);
      expect(stats.status_distribution['Delivered']).toBe(1);
      expect(stats.status_distribution['In Transit']).toBe(1);
      expect(stats.by_manager[0].employee_name).toBe('John Doe');
      expect(stats.by_manager[0].gross_sales_usd).toBe(3000);
    });
  });

  describe('Performance & Redis Caching', () => {
    it('should serve findAllCargoRegistrations from Redis cache if available', async () => {
      const cachedResponse = {
        meta: {
          total: 1,
          limit: 10,
          offset: 0,
          calculated_net_yield: {
            USD: 100,
            UZS: 1200000,
            total_usd: 100,
            total_uzs: 1200000,
          },
          gross_sales_revenue: {
            UZS: 0,
            USD: 500,
            RUB: 0,
            RMB: 0,
            total_usd_equivalent: 500,
            total_uzs_equivalent: 6000000,
          },
        },
        data: [{ id: 'cargo-cached-1', status: 'Waiting' }],
      };

      const redisMock = {
        get: jest.fn().mockResolvedValue(JSON.stringify(cachedResponse)),
        set: jest.fn().mockResolvedValue('OK'),
        delByPattern: jest.fn().mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CargoRegistrationsService,
          { provide: KNEX_CONNECTION, useValue: knexMock },
          { provide: CurrencyService, useValue: currencyServiceMock },
          { provide: 'RedisService', useValue: redisMock },
        ],
      })
        .useMocker((token) => {
          if (
            token === 'RedisService' ||
            (token as any)?.name === 'RedisService'
          ) {
            return redisMock;
          }
        })
        .compile();

      const cachedService = module.get<CargoRegistrationsService>(
        CargoRegistrationsService,
      );
      (cachedService as any).redisService = redisMock;

      const result = await cachedService.findAllCargoRegistrations({
        limit: '10',
        page: '1',
      });
      expect(redisMock.get).toHaveBeenCalled();
      expect(result).toEqual(cachedResponse);
      expect(knexMock).not.toHaveBeenCalled();
    });

    it('should serve getCargoRegistrationStats from Redis cache if available', async () => {
      const cachedStats = {
        summary: { total_cargos: 5 },
        ltl_statistics: { total_count: 2 },
        ftl_statistics: { total_count: 3 },
      };

      const redisMock = {
        get: jest.fn().mockResolvedValue(JSON.stringify(cachedStats)),
        set: jest.fn().mockResolvedValue('OK'),
        delByPattern: jest.fn().mockResolvedValue(undefined),
      };

      const serviceWithRedis = new CargoRegistrationsService(
        knexMock,
        currencyServiceMock,
        redisMock as any,
      );

      const result = await serviceWithRedis.getCargoRegistrationStats({});
      expect(redisMock.get).toHaveBeenCalled();
      expect(result).toEqual(cachedStats);
    });

    it('should invalidate Redis cache pattern when invalidateCache is called', async () => {
      const redisMock = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        delByPattern: jest.fn().mockResolvedValue(undefined),
      };

      const serviceWithRedis = new CargoRegistrationsService(
        knexMock,
        currencyServiceMock,
        redisMock as any,
      );

      await serviceWithRedis.invalidateCache();
      expect(redisMock.delByPattern).toHaveBeenCalledWith(
        'cargo_registrations:*',
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { CargoConsolidationsService } from './cargo-consolidations.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { CurrencyService } from '../currency/currency.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateCargoConsolidationDto,
  UpdateCargoConsolidationDto,
} from './dto/cargo-consolidations.dto';

describe('CargoConsolidationsService', () => {
  let service: CargoConsolidationsService;
  let knexMock: any;
  let currencyServiceMock: any;

  beforeEach(async () => {
    knexMock = jest.fn();
    knexMock.raw = jest.fn((str) => str);
    knexMock.fn = { now: jest.fn() };

    currencyServiceMock = {
      getRatesForDate: jest.fn().mockResolvedValue({
        USD: { currency: 'USD', rate: 12850, nominal: 1 },
        UZS: { currency: 'UZS', rate: 1, nominal: 1 },
        RUB: { currency: 'RUB', rate: 145, nominal: 1 },
        RMB: { currency: 'RMB', rate: 1815, nominal: 1 },
      }),
      getLatestRates: jest.fn().mockResolvedValue({
        USD: { currency: 'USD', rate: 12850, nominal: 1 },
        UZS: { currency: 'UZS', rate: 1, nominal: 1 },
        RUB: { currency: 'RUB', rate: 145, nominal: 1 },
        RMB: { currency: 'RMB', rate: 1815, nominal: 1 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CargoConsolidationsService,
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

    service = module.get<CargoConsolidationsService>(
      CargoConsolidationsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateConsolidationCode', () => {
    it('should generate first sequence code CNS-YYYYMM-0001 when no prior code exists', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      knexMock.mockReturnValue(qb);

      const code = await service.generateConsolidationCode();
      expect(code).toMatch(/^CNS-\d{6}-0001$/);
    });

    it('should increment sequence number from existing latest code', async () => {
      const now = new Date();
      const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest
          .fn()
          .mockResolvedValue({ consolidation_code: `CNS-${ym}-0042` }),
      };
      knexMock.mockReturnValue(qb);

      const code = await service.generateConsolidationCode();
      expect(code).toBe(`CNS-${ym}-0043`);
    });
  });

  describe('createConsolidation', () => {
    it('should successfully create consolidation and attach initial cargos', async () => {
      const user = { id: 'user-uuid-1', role: 'CEO' };
      const dto: CreateCargoConsolidationDto = {
        container_truck_id: '01A777AA',
        container_type: '86m3',
        max_volume_capacity: 86,
        max_weight_capacity: 22000,
        carrier_name: 'Baytur Turkish',
        origin_place: 'Istanbul',
        destination_place: 'Tashkent',
        departure_date: '2026-08-25',
        total_carrier_cost: 3500,
        carrier_cost_currency: 'USD',
        cargo_registration_ids: ['cargo-uuid-1', 'cargo-uuid-2'],
      };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            first: jest.fn().mockImplementation(() => {
              return Promise.resolve({
                id: 'cons-uuid-1',
                consolidation_code: 'CNS-202608-0001',
                container_truck_id: '01A777AA',
                container_type: '86m3',
                max_volume_capacity: 86,
                max_weight_capacity: 22000,
                carrier_name: 'Baytur Turkish',
                origin_place: 'Istanbul',
                destination_place: 'Tashkent',
                total_carrier_cost: 3500,
                carrier_cost_currency: 'USD',
                status: 'Waiting',
              });
            }),
            insert: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ id: 'cons-uuid-1' }]),
            }),
          };
        }
        if (tableName === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([
              {
                id: 'cargo-uuid-1',
                cargo_type: 'LTL',
                cargo: 'Chemicals',
                volume: 12.5,
                weight: 2000,
                purchase_price: 1000,
                purchase_currency: 'USD',
                sell_price: 1500,
                sell_currency: 'USD',
                status: 'Waiting',
              },
            ]),
          };
        }
        if (tableName === 'cargo_registrations') {
          return {
            whereIn: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(2),
          };
        }
        return {};
      });

      const result = await service.createConsolidation(user, dto);

      expect(result).toBeDefined();
      expect(result.id).toBe('cons-uuid-1');
      expect(result.capacity.max_volume_m3).toBe(86);
      expect(result.capacity.assigned_volume_m3).toBe(12.5);
      expect(result.capacity.remaining_volume_m3).toBe(73.5);
      expect(result.capacity.volume_utilization_percent).toBe(14.53);
    });

    it('should throw BadRequestException if consolidation_code already exists', async () => {
      const user = { id: 'user-uuid-1', role: 'CEO' };
      const dto: CreateCargoConsolidationDto = {
        consolidation_code: 'CNS-DUPLICATE',
        container_truck_id: '01A777AA',
      };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'existing-id',
              consolidation_code: 'CNS-DUPLICATE',
            }),
          };
        }
        return {};
      });

      await expect(service.createConsolidation(user, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getActiveDropdownList', () => {
    it('should return formatted dropdown items with remaining volume and label', async () => {
      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations as cc') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            whereNotIn: jest.fn().mockReturnThis(),
            groupBy: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue([
              {
                id: 'cons-1',
                consolidation_code: 'CNS-202608-0001',
                container_truck_id: '01A777AA',
                container_type: '86m3',
                max_volume_capacity: 86.0,
                max_weight_capacity: 22000.0,
                origin_place: 'Istanbul',
                destination_place: 'Tashkent',
                status: 'Waiting',
                total_cargos_count: '2',
                total_assigned_volume: '30.0',
                total_assigned_weight: '7500.0',
              },
            ]),
          };
        }
        return {};
      });

      const dropdown = await service.getActiveDropdownList();

      expect(dropdown).toHaveLength(1);
      expect(dropdown[0].id).toBe('cons-1');
      expect(dropdown[0].remaining_volume).toBe(56.0);
      expect(dropdown[0].volume_utilization_percent).toBe(34.88);
      expect(dropdown[0].label).toContain('01A777AA [CNS-202608-0001]');
      expect(dropdown[0].label).toContain('30.0/86.0 m³');
    });
  });

  describe('findConsolidationDetails', () => {
    it('should throw NotFoundException if consolidation does not exist', async () => {
      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(null),
          };
        }
        return {};
      });

      await expect(
        service.findConsolidationDetails('non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should calculate accurate multi-currency profit margins and capacity', async () => {
      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'cons-1',
              consolidation_code: 'CNS-202608-0001',
              container_truck_id: '01A777AA',
              max_volume_capacity: 100,
              max_weight_capacity: 20000,
              total_carrier_cost: 2000,
              carrier_cost_currency: 'USD',
              status: 'On the way',
            }),
          };
        }
        if (tableName === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([
              {
                id: 'cargo-1',
                cargo_type: 'LTL',
                cargo: 'Textiles',
                volume: 40,
                weight: 8000,
                purchase_price: 3000,
                purchase_currency: 'USD',
                sell_price: 5000,
                sell_currency: 'USD',
                status: 'On the way',
                client_first_name: 'Alisher',
                emp_first_name: 'Jamshid',
              },
              {
                id: 'cargo-2',
                cargo_type: 'LTL',
                cargo: 'Electronics',
                volume: 20,
                weight: 4000,
                purchase_price: 1500,
                purchase_currency: 'USD',
                sell_price: 2500,
                sell_currency: 'USD',
                status: 'On the way',
                client_company: 'Techno LLC',
                emp_first_name: 'Farhod',
              },
            ]),
          };
        }
        return {};
      });

      const details = await service.findConsolidationDetails('cons-1');

      expect(details.capacity.assigned_volume_m3).toBe(60);
      expect(details.capacity.remaining_volume_m3).toBe(40);
      expect(details.capacity.volume_utilization_percent).toBe(60);
      expect(details.capacity.total_cargos_count).toBe(2);

      // Financials: Total Income (Sell) = $7500, Total Outcome (Expenses) = $2000 (Agent), Net Margin = $7500 - $2000 = $5500
      expect(details.financials.total_sell_usd).toBe(7500);
      expect(details.financials.total_income_usd).toBe(7500);
      expect(details.financials.total_outcome_usd).toBe(2000);
      expect(details.financials.total_purchase_usd).toBe(0);
      expect(details.financials.carrier_cost.amount_usd).toBe(2000);
      expect(details.expenses).toEqual({
        agent: { amount: 2000, currency: 'USD', amount_usd: 2000 },
        china_warehouse: { amount: 0, currency: 'USD', amount_usd: 0 },
        company_service: { amount: 0, currency: 'USD', amount_usd: 0 },
        customs_clearance_of_goods: {
          amount: 0,
          currency: 'USD',
          amount_usd: 0,
        },
        cct: { amount: 0, currency: 'USD', amount_usd: 0 },
        total_usd: 2000,
      });
      expect(details.financials.consolidated_net_margin).toEqual({
        amount: 5500,
        currency: 'USD',
      });
      expect(details.cargos).toHaveLength(2);
      expect(details.cargos[0].id).toBe('cargo-1');
      expect(details.cargos[0].client.name).toBe('Alisher');
      expect(details.cargos[0].employee.name).toBe('Jamshid');
      expect(details.cargos[1].id).toBe('cargo-2');
      expect(details.cargos[1].client.name).toBe('Techno LLC');
    });
  });

  describe('findAllConsolidations', () => {
    it('should return paginated consolidations list with all assigned cargos attached', async () => {
      const innerAggMock = {
        as: jest.fn().mockReturnValue('t'),
      };

      const qbAgg = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnValue(innerAggMock),
      };

      const qbPaginated = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([
          {
            id: 'cons-1',
            consolidation_code: 'CNS-202608-0001',
            container_truck_id: '01A777AA',
            container_type: '86m3',
            max_volume_capacity: 86.0,
            max_weight_capacity: 22000.0,
            status: 'Waiting',
            total_cargos_count: '1',
            total_assigned_volume: '15.0',
            total_assigned_weight: '3000.0',
            total_cargos_sell_usd: '2000.0',
            total_cargos_purchase_usd: '1200.0',
            total_carrier_cost: '500.0',
            agent: '500.0',
            china_warehouse: '0.0',
            company_service: '0.0',
            customs_clearance_of_goods: '0.0',
            cct: '0.0',
            carrier_cost_currency: 'USD',
          },
        ]),
      };

      let cloneCount = 0;
      const baseWhereMock = {
        clone: jest.fn().mockImplementation(() => {
          cloneCount++;
          if (cloneCount === 1) return qbAgg;
          return qbPaginated;
        }),
      };

      knexMock.mockImplementation((tableNameOrSubquery: any) => {
        if (tableNameOrSubquery === 'cargo_consolidations as cc') {
          return baseWhereMock;
        }
        if (
          tableNameOrSubquery === 't' ||
          tableNameOrSubquery === innerAggMock ||
          (tableNameOrSubquery && typeof tableNameOrSubquery === 'object')
        ) {
          return {
            select: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue({
                total_count: '1',
                total_active: '1',
                total_net_margin_usd: '1500.0',
                volume_capacity_total: '86.0',
                volume_capacity_used: '15.0',
              }),
            }),
          };
        }
        if (tableNameOrSubquery === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            whereIn: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([
              {
                id: 'cargo-1',
                consolidation_id: 'cons-1',
                cargo_type: 'LTL',
                cargo: 'Chemicals',
                volume: 15.0,
                weight: 3000.0,
                purchase_price: 1200.0,
                purchase_currency: 'USD',
                sell_price: 2000.0,
                sell_currency: 'USD',
                status: 'Waiting',
                client_first_name: 'Bobur',
                emp_first_name: 'Aziz',
              },
            ]),
          };
        }
        return {};
      });

      const result = await service.findAllConsolidations({});

      expect(result).toBeDefined();
      expect(result.meta.total).toBe(1);
      expect(result.meta.total_active).toBe(1);
      expect(result.meta.volume_capacity_total).toBe(86.0);
      expect(result.meta.volume_capacity_used).toBe(15.0);
      expect(result.meta.consolidated_net_margin).toEqual({
        USD: 1500,
        UZS: 19275000,
        RUB: 132931.03,
        RMB: 10619.83,
      });
      expect((result.meta as any).page).toBeUndefined();
      expect((result.meta as any).total_pages).toBeUndefined();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('cons-1');
      expect(result.data[0].financials.consolidated_net_margin).toEqual({
        amount: 1500,
        currency: 'USD',
      });
      expect(result.data[0].cargos).toHaveLength(1);
      expect(result.data[0].cargos[0].id).toBe('cargo-1');
      expect(result.data[0].cargos[0].cargo).toBe('Chemicals');
      expect(result.data[0].cargos[0].client.name).toBe('Bobur');
      expect(result.data[0].cargos[0].employee.name).toBe('Aziz');
      expect(result.data[0].cargos[0].net_yield_usd).toBe(800.0);
    });

    it('should handle empty results gracefully with zeros in consolidated_net_margin and volume capacities', async () => {
      const innerAggMock = {
        as: jest.fn().mockReturnValue('t'),
      };

      const qbAgg = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnValue(innerAggMock),
      };

      const baseWhereMock = {
        clone: jest.fn().mockReturnValue(qbAgg),
      };

      knexMock.mockImplementation((tableNameOrSubquery: any) => {
        if (tableNameOrSubquery === 'cargo_consolidations as cc') {
          return baseWhereMock;
        }
        if (
          tableNameOrSubquery === 't' ||
          tableNameOrSubquery === innerAggMock ||
          (tableNameOrSubquery && typeof tableNameOrSubquery === 'object')
        ) {
          return {
            select: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue({
                total_count: '0',
                total_active: '0',
                total_net_margin_usd: '0',
                volume_capacity_total: '0',
                volume_capacity_used: '0',
              }),
            }),
          };
        }
        return {};
      });

      const result = await service.findAllConsolidations({});

      expect(result).toBeDefined();
      expect(result.meta.total).toBe(0);
      expect(result.meta.total_active).toBe(0);
      expect(result.meta.volume_capacity_total).toBe(0);
      expect(result.meta.volume_capacity_used).toBe(0);
      expect(result.meta.consolidated_net_margin).toEqual({
        USD: 0,
        UZS: 0,
        RUB: 0,
        RMB: 0,
      });
      expect((result.meta as any).page).toBeUndefined();
      expect((result.meta as any).total_pages).toBeUndefined();
      expect(result.data).toEqual([]);
    });
  });

  describe('updateConsolidation & sync', () => {
    it('should sync status to attached cargo registrations when sync_status_to_cargos is true', async () => {
      const updateCargoMock = jest.fn().mockResolvedValue(3);

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'cons-1',
              consolidation_code: 'CNS-202608-0001',
              container_truck_id: '01A777AA',
            }),
            update: jest.fn().mockResolvedValue(1),
          };
        }
        if (tableName === 'cargo_registrations') {
          return {
            where: jest.fn().mockReturnThis(),
            update: updateCargoMock,
          };
        }
        if (tableName === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      const dto: UpdateCargoConsolidationDto = {
        status: 'Arrived',
        arrived_date: '2026-08-28',
        sync_status_to_cargos: true,
        sync_dates_to_cargos: true,
      };

      await service.updateConsolidation(
        'cons-1',
        { id: 'user-1', role: 'CEO' },
        dto,
      );

      expect(updateCargoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'Arrived',
          arrived_date: '2026-08-28',
        }),
      );
    });
  });

  describe('assignCargos and removeCargos', () => {
    it('should assign cargo IDs and sync truck plate number', async () => {
      const updateMock = jest.fn().mockResolvedValue(2);

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'cons-1',
              container_truck_id: 'TRK-9900',
              container_type: '120m3',
            }),
          };
        }
        if (tableName === 'cargo_registrations') {
          return {
            whereIn: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }]),
            update: updateMock,
          };
        }
        if (tableName === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      await service.assignCargos('cons-1', {
        cargo_registration_ids: ['c-1', 'c-2'],
      });

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          consolidation_id: 'cons-1',
          container_truck_id: 'TRK-9900',
          transport_types: ['auto'],
          agent_name: 'TRK-9900',
          purchase_price: 0,
        }),
      );
    });

    it('should remove cargo IDs by setting consolidation_id to null', async () => {
      const updateMock = jest.fn().mockResolvedValue(1);

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'cons-1',
              container_truck_id: 'TRK-9900',
            }),
          };
        }
        if (tableName === 'cargo_registrations') {
          return {
            where: jest.fn().mockReturnThis(),
            whereIn: jest.fn().mockReturnThis(),
            update: updateMock,
          };
        }
        if (tableName === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      await service.removeCargos('cons-1', {
        cargo_registration_ids: ['c-1'],
      });

      expect(updateMock).toHaveBeenCalledWith({
        consolidation_id: null,
      });
    });
  });

  describe('deleteConsolidation', () => {
    it('should unlink all cargos and delete the consolidation', async () => {
      const unlinkMock = jest.fn().mockResolvedValue(2);
      const delMock = jest.fn().mockResolvedValue(1);

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ id: 'cons-1' }),
            del: delMock,
          };
        }
        if (tableName === 'cargo_registrations') {
          return {
            where: jest.fn().mockReturnThis(),
            update: unlinkMock,
          };
        }
        return {};
      });

      const res = await service.deleteConsolidation('cons-1');

      expect(unlinkMock).toHaveBeenCalledWith({ consolidation_id: null });
      expect(delMock).toHaveBeenCalled();
      expect(res.deleted_id).toBe('cons-1');
    });
  });

  describe('CreateCargoConsolidationDto validation', () => {
    it('should pass validation with valid USD currency and user payload', async () => {
      const payload = {
        container_truck_id: 'TRK-00001',
        container_type: '120m3',
        max_volume_capacity: 120,
        max_weight_capacity: 25000,
        carrier_name: 'Alex',
        carrier_phone: '+7255293364',
        origin_place: 'Istanbul',
        destination_place: 'Tashkent',
        departure_date: '2026-08-21',
        estimated_arrival_date: '2026-08-29',
        loaded_date: '2026-08-23',
        total_carrier_cost: 3800,
        carrier_cost_currency: 'USD',
        status: 'Waiting',
      };

      const dto = plainToInstance(CreateCargoConsolidationDto, payload);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it.each([
      'Waiting',
      'Station',
      'On the way',
      'On the border',
      'Reload',
      'Arrived',
    ])('should accept valid consolidation status "%s"', async (validStatus) => {
      const payload = {
        container_truck_id: 'TRK-00001',
        status: validStatus,
      };
      const dto = plainToInstance(CreateCargoConsolidationDto, payload);
      const errors = await validate(dto);
      const statusError = errors.find((e) => e.property === 'status');
      expect(statusError).toBeUndefined();
    });

    it.each([
      'Planning',
      'Loading',
      'Completed',
      'In Transit',
      'Border',
      'Delivered',
      'InvalidStatus',
    ])(
      'should reject invalid/legacy consolidation status "%s"',
      async (invalidStatus) => {
        const payload = {
          container_truck_id: 'TRK-00001',
          status: invalidStatus,
        };
        const dto = plainToInstance(CreateCargoConsolidationDto, payload);
        const errors = await validate(dto);
        const statusError = errors.find((e) => e.property === 'status');
        expect(statusError).toBeDefined();
        expect(statusError?.constraints?.isIn).toContain(
          'status must be one of: Waiting, Station, On the way, On the border, Reload, Arrived',
        );
      },
    );

    it.each(['UZS', 'RUB', 'USD', 'RMB'])(
      'should accept valid currency %s',
      async (curr) => {
        const payload = {
          container_truck_id: 'TRK-00001',
          carrier_cost_currency: curr,
        };
        const dto = plainToInstance(CreateCargoConsolidationDto, payload);
        const errors = await validate(dto);
        const currencyError = errors.find(
          (e) => e.property === 'carrier_cost_currency',
        );
        expect(currencyError).toBeUndefined();
      },
    );

    it('should accept valid multiple transport types', async () => {
      const payload = {
        container_truck_id: 'TRK-00001',
        transport_types: ['railway', 'auto'],
      };
      const dto = plainToInstance(CreateCargoConsolidationDto, payload);
      const errors = await validate(dto);
      const transportError = errors.find(
        (e) => e.property === 'transport_types',
      );
      expect(transportError).toBeUndefined();
    });

    it('should reject invalid transport type', async () => {
      const payload = {
        container_truck_id: 'TRK-00001',
        transport_types: ['spaceship'],
      };
      const dto = plainToInstance(CreateCargoConsolidationDto, payload);
      const errors = await validate(dto);
      const transportError = errors.find(
        (e) => e.property === 'transport_types',
      );
      expect(transportError).toBeDefined();
    });
  });

  describe('inferTransportType', () => {
    it('should infer air transport from air keywords', () => {
      expect(service.inferTransportType('air-delivery')).toBe('air');
      expect(service.inferTransportType('avia freight')).toBe('air');
      expect(service.inferTransportType(null, null, 'AIR-001')).toBe('air');
    });

    it('should infer railway transport from container codes', () => {
      expect(service.inferTransportType('40HQ')).toBe('railway');
      expect(service.inferTransportType('20GP')).toBe('railway');
      expect(service.inferTransportType('train-cargo')).toBe('railway');
    });

    it('should infer sea transport from maritime keywords', () => {
      expect(service.inferTransportType('sea shipment')).toBe('sea');
      expect(service.inferTransportType('vessel-01')).toBe('sea');
    });

    it('should default to auto for other trucks', () => {
      expect(service.inferTransportType('120 CBM')).toBe('auto');
      expect(service.inferTransportType('Ref Fura')).toBe('auto');
      expect(service.inferTransportType(null)).toBe('auto');
    });
  });

  describe('consolidation date fields and cargo detail isolation', () => {
    it('should store load_date, border_arrival_date, tashkent_arrival_date on createConsolidation', async () => {
      const user = { id: 'user-uuid-1', role: 'CEO' };
      let insertedPayload: any = null;

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'cons-uuid-1',
              consolidation_code: 'CNS-202608-0001',
              container_truck_id: 'TRK-100',
              load_date: '2026-08-25',
              border_arrival_date: '2026-08-28',
              tashkent_arrival_date: '2026-09-02',
            }),
            insert: jest.fn((payload) => {
              insertedPayload = payload;
              return {
                returning: jest.fn().mockResolvedValue(['cons-uuid-1']),
              };
            }),
          };
        }
        if (tableName === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([
              {
                id: 'cargo-1',
                cargo_type: 'LTL',
                cargo: 'Fabrics',
                volume: 5,
                weight: 1000,
                load_code: 'LTL-777',
                is_turnkey: true,
                sell_price: 1500,
                sell_currency: 'USD',
                purchase_price: 1000,
                purchase_currency: 'USD',
              },
            ]),
          };
        }
        return {};
      });

      const res = await service.createConsolidation(user, {
        container_truck_id: 'TRK-100',
        load_date: '2026-08-25',
        border_arrival_date: '2026-08-28',
        tashkent_arrival_date: '2026-09-02',
      });

      expect(insertedPayload).toBeDefined();
      expect(insertedPayload.load_date).toBe('2026-08-25');
      expect(insertedPayload.border_arrival_date).toBe('2026-08-28');
      expect(insertedPayload.tashkent_arrival_date).toBe('2026-09-02');

      expect(res.load_date).toBe('2026-08-25');
      expect(res.border_arrival_date).toBe('2026-08-28');
      expect(res.tashkent_arrival_date).toBe('2026-09-02');
      expect(res.cargos[0].load_code).toBe('LTL-777');
      expect(res.cargos[0].is_turnkey).toBe(true);
    });

    it('should update load_date, border_arrival_date, tashkent_arrival_date on updateConsolidation', async () => {
      const user = { id: 'user-uuid-1', role: 'CEO' };
      let updatedPayload: any = null;

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations') {
          return {
            where: jest.fn().mockReturnThis(),
            whereNot: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'cons-uuid-1',
              consolidation_code: 'CNS-202608-0001',
              container_truck_id: 'TRK-100',
            }),
            update: jest.fn((payload) => {
              updatedPayload = payload;
              return Promise.resolve(1);
            }),
          };
        }
        if (tableName === 'cargo_registrations') {
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(1),
          };
        }
        if (tableName === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      await service.updateConsolidation('cons-uuid-1', user, {
        load_date: '2026-08-26',
        border_arrival_date: '2026-08-29',
        tashkent_arrival_date: '2026-09-03',
      });

      expect(updatedPayload).toBeDefined();
      expect(updatedPayload.load_date).toBe('2026-08-26');
      expect(updatedPayload.border_arrival_date).toBe('2026-08-29');
      expect(updatedPayload.tashkent_arrival_date).toBe('2026-09-03');
    });

    it('should cascade update of container_truck_id, carrier_name, transport_types, places, dates, and status to attached cargos', async () => {
      const user = { id: 'user-uuid-1', role: 'CEO' };
      let cargoUpdatesPayload: any = null;

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations') {
          return {
            where: jest.fn().mockReturnThis(),
            whereNot: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'cons-uuid-1',
              consolidation_code: 'CNS-202608-0001',
              container_truck_id: 'TRK-100',
              carrier_name: 'Old Carrier',
            }),
            update: jest.fn().mockResolvedValue(1),
          };
        }
        if (tableName === 'cargo_registrations') {
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn((payload) => {
              cargoUpdatesPayload = payload;
              return Promise.resolve(1);
            }),
          };
        }
        if (tableName === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      await service.updateConsolidation('cons-uuid-1', user, {
        container_truck_id: '01A999AA',
        carrier_name: 'Carrier Apex',
        transport_types: ['auto'],
        origin_place: 'Yiwu',
        destination_place: 'Tashkent',
        load_date: '2026-09-01',
        arrived_date: '2026-09-10',
        status: 'In Transit',
      });

      expect(cargoUpdatesPayload).toBeDefined();
      expect(cargoUpdatesPayload.container_truck_id).toBe('01A999AA');
      expect(cargoUpdatesPayload.agent_name).toBe('Carrier Apex');
      expect(cargoUpdatesPayload.transport_types).toEqual(['auto']);
      expect(cargoUpdatesPayload.origin_city).toBe('Yiwu');
      expect(cargoUpdatesPayload.destination_city).toBe('Tashkent');
      expect(cargoUpdatesPayload.loaded_date).toBe('2026-09-01');
      expect(cargoUpdatesPayload.arrived_date).toBe('2026-09-10');
      expect(cargoUpdatesPayload.status).toBe('In Transit');
    });
  });

  describe('consolidation expenses (outcomes) and LTL income calculations', () => {
    it('should compute complete breakdown of 5 expenses in multi-currency: agent in USD, china_warehouse in RMB, company_service in UZS, customs_clearance in USD, cct in UZS', () => {
      const row = {
        agent: 3000,
        agent_currency: 'USD',
        china_warehouse: 3600,
        china_warehouse_currency: 'RMB',
        company_service: 2570000,
        company_service_currency: 'UZS',
        customs_clearance_of_goods: 800,
        customs_clearance_of_goods_currency: 'USD',
        cct: 1285000,
        cct_currency: 'UZS',
        carrier_cost_currency: 'USD',
        carrier_cost_usd_rate: 1.0,
      };

      const rates = {
        USD: { currency: 'USD', rate: 12850, nominal: 1 },
        UZS: { currency: 'UZS', rate: 1, nominal: 1 },
        RUB: { currency: 'RUB', rate: 145, nominal: 1 },
        RMB: { currency: 'RMB', rate: 1815, nominal: 1 },
      };

      const exp = service.computeConsolidationExpenses(row, rates);
      expect(exp.agent).toBe(3000);
      expect(exp.agent_currency).toBe('USD');
      expect(exp.agent_usd).toBe(3000);

      expect(exp.china_warehouse).toBe(3600);
      expect(exp.china_warehouse_currency).toBe('RMB');
      expect(exp.china_warehouse_usd).toBe(508.48);

      expect(exp.company_service).toBe(2570000);
      expect(exp.company_service_currency).toBe('UZS');
      expect(exp.company_service_usd).toBe(200);

      expect(exp.customs_clearance_of_goods).toBe(800);
      expect(exp.customs_clearance_of_goods_currency).toBe('USD');
      expect(exp.customs_clearance_of_goods_usd).toBe(800);

      expect(exp.cct).toBe(1285000);
      expect(exp.cct_currency).toBe('UZS');
      expect(exp.cct_usd).toBe(100);

      expect(exp.total_usd).toBe(4608.48);
    });

    it('should store and calculate 5 expenses with currencies on createConsolidation and return net margin based on LTL income sum minus outcomes sum', async () => {
      const user = { id: 'user-uuid-1', role: 'CEO' };
      let insertedPayload: any = null;

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'cons-exp-1',
              consolidation_code: 'CNS-202608-0099',
              container_truck_id: 'TRK-EXP-1',
              agent: 3000,
              agent_currency: 'USD',
              china_warehouse: 500,
              china_warehouse_currency: 'USD',
              company_service: 200,
              company_service_currency: 'USD',
              customs_clearance_of_goods: 800,
              customs_clearance_of_goods_currency: 'USD',
              cct: 150,
              cct_currency: 'USD',
              carrier_cost_currency: 'USD',
              carrier_cost_usd_rate: 1.0,
            }),
            insert: jest.fn((payload) => {
              insertedPayload = payload;
              return {
                returning: jest.fn().mockResolvedValue(['cons-exp-1']),
              };
            }),
          };
        }
        if (tableName === 'cargo_registrations as cr') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockResolvedValue([
              {
                id: 'ltl-1',
                cargo_type: 'LTL',
                cargo: 'Goods A',
                volume: 20,
                weight: 5000,
                sell_price: 6000,
                sell_currency: 'USD',
              },
              {
                id: 'ltl-2',
                cargo_type: 'LTL',
                cargo: 'Goods B',
                volume: 30,
                weight: 7000,
                sell_price: 6000,
                sell_currency: 'USD',
              },
            ]),
          };
        }
        return {};
      });

      const res = await service.createConsolidation(user, {
        container_truck_id: 'TRK-EXP-1',
        agent: 3000,
        agent_currency: 'USD',
        china_warehouse: 500,
        china_warehouse_currency: 'USD',
        company_service: 200,
        company_service_currency: 'USD',
        customs_clearance_of_goods: 800,
        customs_clearance_of_goods_currency: 'USD',
        cct: 150,
        cct_currency: 'USD',
      });

      expect(insertedPayload.agent).toBe(3000);
      expect(insertedPayload.agent_currency).toBe('USD');
      expect(insertedPayload.china_warehouse).toBe(500);
      expect(insertedPayload.china_warehouse_currency).toBe('USD');
      expect(insertedPayload.company_service).toBe(200);
      expect(insertedPayload.company_service_currency).toBe('USD');
      expect(insertedPayload.customs_clearance_of_goods).toBe(800);
      expect(insertedPayload.customs_clearance_of_goods_currency).toBe('USD');
      expect(insertedPayload.cct).toBe(150);
      expect(insertedPayload.cct_currency).toBe('USD');

      // Income = $6000 + $6000 = $12000
      // Outcomes = $3000 + $500 + $200 + $800 + $150 = $4650
      // Net Profit / Margin = $12000 - $4650 = $7350
      expect(res.financials.income).toBe(12000);
      expect(res.financials.total_income_usd).toBe(12000);
      expect(res.financials.outcome).toBe(4650);
      expect(res.financials.total_outcome_usd).toBe(4650);
      expect(res.financials.total_purchase_usd).toBe(0);
      expect(res.financials.consolidated_net_margin.amount).toBe(7350);
      expect(res.financials.net_profit_usd).toBe(7350);
      expect(res.expenses).toEqual({
        agent: { amount: 3000, currency: 'USD', amount_usd: 3000 },
        china_warehouse: {
          amount: 500,
          currency: 'USD',
          amount_usd: 500,
        },
        company_service: {
          amount: 200,
          currency: 'USD',
          amount_usd: 200,
        },
        customs_clearance_of_goods: {
          amount: 800,
          currency: 'USD',
          amount_usd: 800,
        },
        cct: { amount: 150, currency: 'USD', amount_usd: 150 },
        total_usd: 4650,
      });
    });

    it('should validate DTO with all 5 expense fields and currencies', async () => {
      const payload = {
        container_truck_id: 'TRK-EXP-1',
        agent: 3000,
        agent_currency: 'USD',
        china_warehouse: 3600,
        china_warehouse_currency: 'RMB',
        company_service: 2500000,
        company_service_currency: 'UZS',
        customs_clearance_of_goods: 800,
        customs_clearance_of_goods_currency: 'USD',
        cct: 1500000,
        cct_currency: 'UZS',
      };

      const dto = plainToInstance(CreateCargoConsolidationDto, payload);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject negative values for expense fields', async () => {
      const payload = {
        container_truck_id: 'TRK-EXP-1',
        agent: -100,
        china_warehouse: -50,
      };

      const dto = plainToInstance(CreateCargoConsolidationDto, payload);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const agentErr = errors.find((e) => e.property === 'agent');
      const chinaWarehouseErr = errors.find(
        (e) => e.property === 'china_warehouse',
      );
      expect(agentErr).toBeDefined();
      expect(chinaWarehouseErr).toBeDefined();
    });
  });
});

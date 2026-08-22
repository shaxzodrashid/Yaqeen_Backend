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
                status: 'Planning',
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
                status: 'Loading',
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

      // Financials: Total Sell = $7500, Total Buy = $4500, Carrier Cost = $2000, Net Margin = $7500 - $4500 - $2000 = $1000
      expect(details.financials.total_sell_usd).toBe(7500);
      expect(details.financials.total_purchase_usd).toBe(4500);
      expect(details.financials.carrier_cost.amount_usd).toBe(2000);
      expect(details.financials.consolidated_net_margin_usd).toBe(1000);
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
      const qbCount = {
        clone: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ total: '1' }),
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
            status: 'Loading',
            total_cargos_count: '1',
            total_assigned_volume: '15.0',
            total_assigned_weight: '3000.0',
            total_cargos_sell_usd: '2000.0',
            total_cargos_purchase_usd: '1200.0',
            total_carrier_cost: '500.0',
            carrier_cost_currency: 'USD',
          },
        ]),
      };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'cargo_consolidations as cc') {
          return qbCount;
        }
        if (tableName === 'cargo_registrations as cr') {
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
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('cons-1');
      expect(result.data[0].cargos).toHaveLength(1);
      expect(result.data[0].cargos[0].id).toBe('cargo-1');
      expect(result.data[0].cargos[0].cargo).toBe('Chemicals');
      expect(result.data[0].cargos[0].client.name).toBe('Bobur');
      expect(result.data[0].cargos[0].employee.name).toBe('Aziz');
      expect(result.data[0].cargos[0].net_yield_usd).toBe(800.0);
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

      expect(updateMock).toHaveBeenCalledWith({
        consolidation_id: 'cons-1',
        container_truck_id: 'TRK-9900',
        container_type: '120m3',
      });
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
        status: 'Planning',
      };

      const dto = plainToInstance(CreateCargoConsolidationDto, payload);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

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

    it('should reject invalid currency with proper message', async () => {
      const payload = {
        container_truck_id: 'TRK-00001',
        carrier_cost_currency: 'EUR',
      };
      const dto = plainToInstance(CreateCargoConsolidationDto, payload);
      const errors = await validate(dto);
      const currencyError = errors.find(
        (e) => e.property === 'carrier_cost_currency',
      );
      expect(currencyError).toBeDefined();
      expect(currencyError?.constraints?.isIn).toBe(
        'carrier_cost_currency must be UZS, RUB, USD, or RMB',
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AgentsService } from './agents.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AgentsService', () => {
  let service: AgentsService;
  let knexMock: any;

  beforeEach(async () => {
    knexMock = jest.fn();
    knexMock.raw = jest.fn((str) => str);
    knexMock.fn = { now: jest.fn(() => new Date()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        {
          provide: KNEX_CONNECTION,
          useValue: knexMock,
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAgentDisplayName', () => {
    it('should format full name when both first and last names exist', () => {
      expect(
        service.getAgentDisplayName({
          first_name: 'Tie',
          last_name: 'Tie',
        }),
      ).toBe('Tie Tie');
    });

    it('should format company name if no person names exist', () => {
      expect(
        service.getAgentDisplayName({
          company_name: 'Silk Road Logistics',
        }),
      ).toBe('Silk Road Logistics');
    });

    it('should format full name with company name if both exist', () => {
      expect(
        service.getAgentDisplayName({
          first_name: 'Alex',
          last_name: 'Wang',
          company_name: 'SinoTrans',
        }),
      ).toBe('Alex Wang (SinoTrans)');
    });

    it('should fallback to Unnamed Agent if empty', () => {
      expect(service.getAgentDisplayName({})).toBe('Unnamed Agent');
    });
  });

  describe('createAgent', () => {
    it('should throw BadRequestException if neither first_name, last_name, nor company_name is provided', async () => {
      await expect(
        service.createAgent({
          phone_number: '+998901234567',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully create an agent and return formatted record', async () => {
      const mockInserted = {
        id: 'agent-uuid-1',
        first_name: 'Tie',
        last_name: 'Tie',
        phone_number: '+8612345678',
        email: 'tietie@example.com',
        company_name: 'TieTie Logistics',
        company_names: JSON.stringify(['TieTie Logistics']),
        notes: 'Main agent in Yiwu',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const chain = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockInserted]),
      };
      knexMock.mockReturnValue(chain);

      const result = await service.createAgent({
        first_name: 'Tie',
        last_name: 'Tie',
        phone_number: '+8612345678',
        email: 'tietie@example.com',
        company_name: 'TieTie Logistics',
      });

      expect(result.id).toBe('agent-uuid-1');
      expect(result.display_name).toBe('Tie Tie (TieTie Logistics)');
      expect(result.first_name).toBe('Tie');
      expect(result.last_name).toBe('Tie');
      expect(result.phone_number).toBe('+8612345678');
      expect(result.company_name).toBe('TieTie Logistics');
    });
  });

  describe('findAgentById', () => {
    it('should throw NotFoundException if agent does not exist', async () => {
      const chain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      knexMock.mockReturnValue(chain);

      await expect(service.findAgentById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return agent details with aggregated cargo metrics', async () => {
      const mockAgent = {
        id: 'agent-uuid-1',
        first_name: 'Tie',
        last_name: 'Tie',
        phone_number: '+8612345678',
        email: 'tietie@example.com',
        company_name: null,
        company_names: [],
        notes: null,
        is_active: true,
        created_at: '2026-08-01',
        updated_at: '2026-08-01',
      };

      const mockStats = {
        total_cargos_count: '15',
        active_cargos_count: '4',
        total_payable_amount: '12000',
      };

      const mockRecentCargos = [
        {
          id: 'cargo-1',
          cargo: 'Electronics',
          cargo_type: 'FTL',
          container_truck_id: 'TRUCK-99',
          status: 'On the way',
          purchase_price: '3000',
          purchase_currency: 'USD',
          confirmed_date: '2026-08-10',
          created_at: '2026-08-10',
        },
      ];

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'agents') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(mockAgent),
          };
        }
        if (tableName === 'cargo_registrations') {
          return {
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(mockStats),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue(mockRecentCargos),
          };
        }
        return {};
      });

      const res = await service.findAgentById('agent-uuid-1');
      expect(res.id).toBe('agent-uuid-1');
      expect(res.display_name).toBe('Tie Tie');
      expect(res.stats.total_cargos_count).toBe(15);
      expect(res.stats.active_cargos_count).toBe(4);
      expect(res.stats.total_payable_amount).toBe(12000);
      expect(res.recent_cargos.length).toBe(1);
    });
  });

  describe('updateAgent', () => {
    it('should update agent and sync display name on linked cargo registrations', async () => {
      let agentState: any = {
        id: 'agent-uuid-1',
        first_name: 'Tie',
        last_name: 'Tie',
        phone_number: null,
        company_name: null,
        company_names: [],
      };

      const updateMock = jest.fn().mockImplementation((payload) => {
        agentState = { ...agentState, ...payload };
        return Promise.resolve(1);
      });

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'agents') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest
              .fn()
              .mockImplementation(() => Promise.resolve(agentState)),
            update: updateMock,
          };
        }
        if (tableName === 'cargo_registrations') {
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(5),
            select: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ total_cargos_count: '5' }),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      const res = await service.updateAgent('agent-uuid-1', {
        company_name: 'TieTie Global',
      });

      expect(res.id).toBe('agent-uuid-1');
      expect(res.display_name).toBe('Tie Tie (TieTie Global)');
      expect(updateMock).toHaveBeenCalled();
    });
  });

  describe('deleteAgent', () => {
    it('should deactivate instead of hard delete when linked cargos exist', async () => {
      const agent = { id: 'agent-1' };
      const updateMock = jest.fn().mockResolvedValue(1);

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'agents') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(agent),
            update: updateMock,
          };
        }
        if (tableName === 'cargo_registrations') {
          return {
            where: jest.fn().mockReturnThis(),
            count: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ total: '3' }),
          };
        }
        return {};
      });

      const res = await service.deleteAgent('agent-1');
      expect(res.deactivated).toBe(true);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false }),
      );
    });

    it('should hard delete when no linked cargos exist', async () => {
      const agent = { id: 'agent-2' };
      const delMock = jest.fn().mockResolvedValue(1);

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'agents') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(agent),
            delete: delMock,
          };
        }
        if (tableName === 'cargo_registrations') {
          return {
            where: jest.fn().mockReturnThis(),
            count: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ total: '0' }),
          };
        }
        return {};
      });

      const res = await service.deleteAgent('agent-2');
      expect(res.deleted).toBe(true);
      expect(delMock).toHaveBeenCalled();
    });
  });

  describe('getDropdownAgents', () => {
    it('should return simplified list of active agents for select dropdown', async () => {
      const mockRows = [
        {
          id: 'agent-1',
          first_name: 'Tie',
          last_name: 'Tie',
          company_name: null,
          phone_number: '+861234',
        },
        {
          id: 'agent-2',
          first_name: null,
          last_name: null,
          company_name: 'Silk Road Freight',
          phone_number: '+99890',
        },
      ];

      const chain = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderByRaw: jest.fn().mockReturnThis(),
        then: jest.fn().mockImplementation((cb) => cb(mockRows)),
      };
      knexMock.mockReturnValue(chain);

      const dropdown = await service.getDropdownAgents();
      expect(dropdown.length).toBe(2);
      expect(dropdown[0].name).toBe('Tie Tie');
      expect(dropdown[1].name).toBe('Silk Road Freight');
    });
  });
});

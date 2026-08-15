import { Test, TestingModule } from '@nestjs/testing';
import { ClientsService } from './clients.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('ClientsService', () => {
  let service: ClientsService;
  let knexMock: any;

  beforeEach(async () => {
    knexMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        {
          provide: KNEX_CONNECTION,
          useValue: knexMock,
        },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkCanWorkWithAllClients', () => {
    it('should return true for CEO role', async () => {
      knexMock.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          role: 'CEO',
          role_name: 'CEO',
          permissions: {},
        }),
      });

      const result = await service.checkCanWorkWithAllClients({
        id: 'user-ceo-id',
        role: 'CEO',
      });
      expect(result).toBe(true);
    });

    it('should return true for ROP role', async () => {
      knexMock.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          role: 'ROP',
          role_name: 'ROP',
          permissions: {},
        }),
      });

      const result = await service.checkCanWorkWithAllClients({
        id: 'user-rop-id',
        role: 'ROP',
      });
      expect(result).toBe(true);
    });

    it('should return true when role has can_work_with_all_clients: true', async () => {
      knexMock.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          role: 'CUSTOM_MANAGER',
          role_name: 'Custom Manager',
          permissions: JSON.stringify({
            clients: {
              create: true,
              read: true,
              update: true,
              delete: true,
              can_work_with_all_clients: true,
            },
          }),
        }),
      });

      const result = await service.checkCanWorkWithAllClients({
        id: 'user-custom-id',
      });
      expect(result).toBe(true);
    });

    it('should return false when role has can_work_with_all_clients: false', async () => {
      knexMock.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          role: 'EMPLOYEE',
          role_name: 'Standard Employee',
          permissions: JSON.stringify({
            clients: {
              create: false,
              read: true,
              update: true,
              delete: false,
              can_work_with_all_clients: false,
            },
          }),
        }),
      });

      const result = await service.checkCanWorkWithAllClients({
        id: 'user-emp-id',
      });
      expect(result).toBe(false);
    });
  });

  describe('findAllClients', () => {
    it('should scope to assigned_employee_id when can_work_with_all_clients is false', async () => {
      const user = { id: 'user-emp-id', role: 'EMPLOYEE' };
      const employeeId = 'emp-uuid-1';

      const mockBaseQuery: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([
          {
            id: 'client-1',
            first_name: 'Ali',
            last_name: 'Valiyev',
            phone: '+998901112233',
            employee_id: employeeId,
            employee_first_name: 'Jasur',
            employee_last_name: 'Yoldoshev',
            employee_phone: '+998901234567',
            employee_color: '#FF0000',
          },
        ]),
      };

      const mockCountQuery: any = {
        leftJoin: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        then: jest.fn((cb) => Promise.resolve([{ total: '1' }]).then(cb)),
      };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              role: 'EMPLOYEE',
              role_name: 'EMPLOYEE',
              permissions: { clients: { can_work_with_all_clients: false } },
            }),
          };
        }
        if (tableName === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ employee_id: employeeId }),
          };
        }
        if (tableName === 'clients') {
          // First call baseQuery, second call countQuery
          if (!mockBaseQuery.called) {
            mockBaseQuery.called = true;
            return mockBaseQuery;
          }
          return mockCountQuery;
        }
        if (tableName === 'attachments') {
          return {
            where: jest.fn().mockReturnThis(),
            whereIn: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      const result = await service.findAllClients(
        { page: '1', limit: '20' },
        user,
      );
      expect(mockBaseQuery.where).toHaveBeenCalledWith(
        'clients.assigned_employee_id',
        employeeId,
      );
      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('should return empty data when user has no linked employee profile and can_work_with_all_clients is false', async () => {
      const user = { id: 'user-unlinked-id', role: 'EMPLOYEE' };

      const mockBaseQuery: any = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      };

      const mockCountQuery: any = {
        leftJoin: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        then: jest.fn((cb) => Promise.resolve([{ total: '0' }]).then(cb)),
      };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              role: 'EMPLOYEE',
              role_name: 'EMPLOYEE',
              permissions: { clients: { can_work_with_all_clients: false } },
            }),
          };
        }
        if (tableName === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ employee_id: null }),
          };
        }
        if (tableName === 'clients') {
          if (!mockBaseQuery.called) {
            mockBaseQuery.called = true;
            return mockBaseQuery;
          }
          return mockCountQuery;
        }
        if (tableName === 'attachments') {
          return {
            where: jest.fn().mockReturnThis(),
            whereIn: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      const result = await service.findAllClients(
        { page: '1', limit: '20' },
        user,
      );
      expect(mockBaseQuery.whereRaw).toHaveBeenCalledWith('1 = 0');
      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('findClientById', () => {
    it('should throw ForbiddenException if employee attempts to view client assigned to another employee', async () => {
      const user = { id: 'user-emp-id', role: 'EMPLOYEE' };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'clients') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'client-uuid-other',
              assigned_employee_id: 'emp-uuid-other',
              first_name: 'Other',
              last_name: 'Client',
            }),
          };
        }
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              role: 'EMPLOYEE',
              permissions: { clients: { can_work_with_all_clients: false } },
            }),
          };
        }
        if (tableName === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ employee_id: 'emp-uuid-my' }),
          };
        }
        return {};
      });

      await expect(
        service.findClientById('client-uuid-other', user),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return client if user has can_work_with_all_clients: true', async () => {
      const user = { id: 'user-ceo-id', role: 'CEO' };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'clients') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'client-uuid-1',
              assigned_employee_id: 'emp-uuid-other',
              first_name: 'Client',
              last_name: 'One',
            }),
          };
        }
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              role: 'CEO',
              role_name: 'CEO',
              permissions: {},
            }),
          };
        }
        if (tableName === 'attachments') {
          return {
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      const client = await service.findClientById('client-uuid-1', user);
      expect(client.id).toBe('client-uuid-1');
    });
  });

  describe('createClient', () => {
    it('should throw ForbiddenException if employee tries to assign client to another employee without permission', async () => {
      const user = { id: 'user-emp-id', role: 'EMPLOYEE' };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'clients') {
          return {
            whereRaw: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(null),
          };
        }
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              role: 'EMPLOYEE',
              permissions: { clients: { can_work_with_all_clients: false } },
            }),
          };
        }
        if (tableName === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ employee_id: 'emp-uuid-my' }),
          };
        }
        return {};
      });

      await expect(
        service.createClient(
          {
            first_name: 'Test',
            last_name: 'Client',
            phone: '+998901234567',
            company_name: 'Test Co',
            assigned_employee_id: 'emp-uuid-other',
          },
          user,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if user account is not linked to employee profile when permission is disabled', async () => {
      const user = { id: 'user-unlinked-id', role: 'EMPLOYEE' };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'clients') {
          return {
            whereRaw: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(null),
          };
        }
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              role: 'EMPLOYEE',
              permissions: { clients: { can_work_with_all_clients: false } },
            }),
          };
        }
        if (tableName === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ employee_id: null }),
          };
        }
        return {};
      });

      await expect(
        service.createClient(
          {
            first_name: 'Test',
            last_name: 'Client',
            phone: '+998901234567',
            company_name: 'Test Co',
          },
          user,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateClient', () => {
    it('should throw ForbiddenException if employee attempts to update client assigned to another employee', async () => {
      const user = { id: 'user-emp-id', role: 'EMPLOYEE' };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'clients') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'client-uuid-1',
              assigned_employee_id: 'emp-uuid-other',
            }),
          };
        }
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              role: 'EMPLOYEE',
              permissions: { clients: { can_work_with_all_clients: false } },
            }),
          };
        }
        if (tableName === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ employee_id: 'emp-uuid-my' }),
          };
        }
        return {};
      });

      await expect(
        service.updateClient(
          'client-uuid-1',
          { company_name: 'Updated Company' },
          user,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if employee attempts to reassign their client to another employee', async () => {
      const user = { id: 'user-emp-id', role: 'EMPLOYEE' };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'clients') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'client-uuid-1',
              assigned_employee_id: 'emp-uuid-my',
            }),
          };
        }
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              role: 'EMPLOYEE',
              permissions: { clients: { can_work_with_all_clients: false } },
            }),
          };
        }
        if (tableName === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ employee_id: 'emp-uuid-my' }),
          };
        }
        return {};
      });

      await expect(
        service.updateClient(
          'client-uuid-1',
          { assigned_employee_id: 'emp-uuid-other' },
          user,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteClient', () => {
    it('should throw ForbiddenException if employee attempts to delete client assigned to another employee', async () => {
      const user = { id: 'user-emp-id', role: 'EMPLOYEE' };

      knexMock.mockImplementation((tableName: string) => {
        if (tableName === 'clients') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'client-uuid-1',
              assigned_employee_id: 'emp-uuid-other',
            }),
          };
        }
        if (tableName === 'users as u') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              role: 'EMPLOYEE',
              permissions: { clients: { can_work_with_all_clients: false } },
            }),
          };
        }
        if (tableName === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ employee_id: 'emp-uuid-my' }),
          };
        }
        return {};
      });

      await expect(service.deleteClient('client-uuid-1', user)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});

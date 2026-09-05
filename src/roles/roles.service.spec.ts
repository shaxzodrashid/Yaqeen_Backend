import { Test, TestingModule } from '@nestjs/testing';
import { RolesService, SYSTEM_MODULES } from './roles.service';
import { KNEX_CONNECTION } from '../database/database.module';
describe('RolesService', () => {
  let service: RolesService;
  let mockKnex: any;

  beforeEach(async () => {
    mockKnex = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: KNEX_CONNECTION,
          useValue: mockKnex,
        },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getModulesTaxonomy', () => {
    it('should return system modules taxonomy', () => {
      const taxonomy = service.getModulesTaxonomy();
      expect(taxonomy).toEqual(SYSTEM_MODULES);
      expect(taxonomy.length).toBeGreaterThan(0);
    });
  });

  describe('normalizePermissions', () => {
    it('should fill default boolean flags for missing modules', () => {
      const result = service.normalizePermissions({
        clients: { create: true, read: true },
      });

      expect(result.clients).toEqual({
        create: true,
        read: true,
        update: false,
        delete: false,
        can_work_with_all_clients: false,
      });

      expect(result.employees).toEqual({
        create: false,
        read: false,
        update: false,
        delete: false,
      });

      expect(result.cargo_kpi).toEqual({
        create: false,
        read: false,
        update: false,
        delete: false,
        plan_settable: false,
      });
    });

    it('should preserve cargo_kpi.plan_settable when provided', () => {
      const result = service.normalizePermissions({
        cargo_kpi: {
          create: true,
          read: true,
          update: true,
          delete: false,
          plan_settable: true,
        },
      });

      expect(result.cargo_kpi.plan_settable).toBe(true);
    });
  });

  describe('createRole', () => {
    it('should support is_plan_settable flag and sync with cargo_kpi.plan_settable', async () => {
      mockKnex.schema = {
        hasColumn: jest.fn().mockResolvedValue(true),
      };

      const mockRoleRow = {
        id: 'role-123',
        name: 'Sales Manager',
        display_name: 'Sales Manager',
        is_system: false,
        is_plan_settable: true,
        permissions: {},
      };

      const mockInsertBuilder = {
        returning: jest.fn().mockResolvedValue([mockRoleRow]),
      };

      const mockQueryBuilder = {
        whereRaw: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
        insert: jest.fn().mockReturnValue(mockInsertBuilder),
      };

      mockKnex.mockImplementation(() => mockQueryBuilder);

      const created = await service.createRole({
        name: 'Sales Manager',
        display_name: 'Sales Manager',
        is_plan_settable: true,
      });

      expect(created.is_plan_settable).toBe(true);
      expect(created.permissions.cargo_kpi.plan_settable).toBe(true);
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sales Manager',
          is_plan_settable: true,
        }),
      );
    });

    it('should mark role as non-plan-settable when is_plan_settable is false (e.g. Accountant)', async () => {
      mockKnex.schema = {
        hasColumn: jest.fn().mockResolvedValue(true),
      };

      const mockRoleRow = {
        id: 'role-accountant',
        name: 'Accountant',
        display_name: 'Accountant',
        is_system: false,
        is_plan_settable: false,
        permissions: {},
      };

      const mockInsertBuilder = {
        returning: jest.fn().mockResolvedValue([mockRoleRow]),
      };

      const mockQueryBuilder = {
        whereRaw: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
        insert: jest.fn().mockReturnValue(mockInsertBuilder),
      };

      mockKnex.mockImplementation(() => mockQueryBuilder);

      const created = await service.createRole({
        name: 'Accountant',
        display_name: 'Accountant',
        is_plan_settable: false,
      });

      expect(created.is_plan_settable).toBe(false);
      expect(created.permissions.cargo_kpi.plan_settable).toBe(false);
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Accountant',
          is_plan_settable: false,
        }),
      );
    });
  });

  describe('updateRole', () => {
    it('should update is_plan_settable and sync cargo_kpi.plan_settable permission', async () => {
      mockKnex.schema = {
        hasColumn: jest.fn().mockResolvedValue(true),
      };
      mockKnex.fn = { now: jest.fn().mockReturnValue('NOW()') };

      const existingRole = {
        id: 'role-123',
        name: 'Custom Role',
        display_name: 'Custom Role',
        is_system: false,
        is_plan_settable: false,
        permissions: JSON.stringify({
          cargo_kpi: {
            create: false,
            read: true,
            update: false,
            delete: false,
            plan_settable: false,
          },
        }),
      };

      const updatedRole = {
        ...existingRole,
        is_plan_settable: true,
        permissions: JSON.stringify({
          cargo_kpi: {
            create: false,
            read: true,
            update: false,
            delete: false,
            plan_settable: true,
          },
        }),
      };

      let findRoleCalls = 0;
      mockKnex.mockImplementation((table: string) => {
        if (table === 'roles') {
          return {
            where: jest.fn(() => ({
              first: jest.fn().mockImplementation(() => {
                findRoleCalls++;
                return Promise.resolve(
                  findRoleCalls === 1 ? existingRole : updatedRole,
                );
              }),
              update: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([updatedRole]),
              }),
            })),
            whereRaw: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue(null),
            }),
          };
        }
        if (table === 'users') {
          return {
            where: jest.fn(() => ({
              count: jest.fn().mockReturnValue({
                first: jest.fn().mockResolvedValue({ count: '0' }),
              }),
            })),
          };
        }
        return {};
      });

      const updated = await service.updateRole('role-123', {
        is_plan_settable: true,
      });

      expect(updated.is_plan_settable).toBe(true);
      expect(updated.permissions.cargo_kpi.plan_settable).toBe(true);
    });
  });
});

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
    });
  });
});

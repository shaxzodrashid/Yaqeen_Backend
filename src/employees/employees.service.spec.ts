import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { MinioService } from '../minio/minio.service';
import { RedisService } from '../redis/redis.service';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let mockKnex: any;
  let mockMinioService: any;
  let mockRedisService: any;

  beforeEach(async () => {
    mockKnex = jest.fn();
    mockKnex.schema = {
      hasColumn: jest.fn().mockResolvedValue(true),
    };
    mockMinioService = {
      getPresignedUrl: jest.fn(),
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
    };
    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        {
          provide: KNEX_CONNECTION,
          useValue: mockKnex,
        },
        {
          provide: MinioService,
          useValue: mockMinioService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

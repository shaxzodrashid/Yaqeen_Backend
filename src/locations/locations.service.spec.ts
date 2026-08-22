import { Test, TestingModule } from '@nestjs/testing';
import { LocationsService, POPULAR_LOGISTICS_HUBS } from './locations.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

describe('LocationsService', () => {
  let service: LocationsService;
  let knexMock: any;
  let redisServiceMock: any;
  let configServiceMock: any;

  beforeEach(async () => {
    knexMock = jest.fn();
    knexMock.raw = jest.fn((str) => str);
    knexMock.schema = {
      hasTable: jest.fn().mockResolvedValue(true),
    };

    redisServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'geonames.username') return 'test_user';
        if (key === 'geonames.apiUrl') return 'http://api.geonames.org';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        {
          provide: KNEX_CONNECTION,
          useValue: knexMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: RedisService,
          useValue: redisServiceMock,
        },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPopularLogisticsHubs', () => {
    it('should return list of popular hubs with display names', async () => {
      const hubs = await service.getPopularLogisticsHubs();
      expect(hubs.length).toBeGreaterThan(0);
      expect(hubs[0]).toHaveProperty('display_name');
      expect(hubs[0]).toHaveProperty('name');
      expect(hubs[0]).toHaveProperty('geoname_id');
      const tashkent = hubs.find((h) => h.name === 'Tashkent');
      expect(tashkent).toBeDefined();
      expect(tashkent?.country_code).toBe('UZ');
    });
  });

  describe('searchCities', () => {
    it('should return popular hubs when query is empty', async () => {
      const results = await service.searchCities({ q: '   ' });
      expect(results.length).toBe(POPULAR_LOGISTICS_HUBS.length);
    });

    it('should return results from Redis cache if present', async () => {
      const cached = [
        {
          geoname_id: 1512569,
          name: 'Tashkent',
          country_name: 'Uzbekistan',
          country_code: 'UZ',
          display_name: 'Tashkent, Uzbekistan (UZ)',
        },
      ];
      redisServiceMock.get.mockResolvedValueOnce(JSON.stringify(cached));

      const results = await service.searchCities({ q: 'Tashkent' });
      expect(results).toEqual(cached);
      expect(redisServiceMock.get).toHaveBeenCalled();
    });

    it('should return results from local database if available', async () => {
      const dbRows = [
        {
          geoname_id: 1809858,
          name: 'Guangzhou',
          ascii_name: 'Guangzhou',
          country_name: 'China',
          country_code: 'CN',
          admin1_name: 'Guangdong',
          latitude: 23.12744,
          longitude: 113.25052,
          population: 18676605,
        },
      ];

      const queryBuilderMock: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderByRaw: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(dbRows),
      };

      knexMock.mockReturnValue(queryBuilderMock);

      const results = await service.searchCities({ q: 'Guang', limit: 1 });
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Guangzhou');
      expect(results[0].country_code).toBe('CN');
      expect(results[0].display_name).toContain('Guangzhou');
    });
  });

  describe('getCityByGeonameId', () => {
    it('should return city from database if exists', async () => {
      const dbRow = {
        geoname_id: 1512569,
        name: 'Tashkent',
        ascii_name: 'Tashkent',
        country_name: 'Uzbekistan',
        country_code: 'UZ',
      };

      knexMock.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(dbRow),
      });

      const city = await service.getCityByGeonameId(1512569);
      expect(city).toBeDefined();
      expect(city?.name).toBe('Tashkent');
      expect(city?.country_code).toBe('UZ');
    });

    it('should fallback to GeoNames API when ID is not in DB or popular hubs, then save to DB', async () => {
      knexMock.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      const fakeCityResponse = {
        geonameId: 9999999,
        name: 'NewUnseenCity',
        asciiName: 'NewUnseenCity',
        countryName: 'Germany',
        countryCode: 'DE',
        adminName1: 'Bavaria',
        lat: '48.137154',
        lng: '11.576124',
        population: 1500000,
      };

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(fakeCityResponse),
      } as any);

      try {
        const city = await service.getCityByGeonameId(9999999);
        expect(city).toBeDefined();
        expect(city?.geoname_id).toBe(9999999);
        expect(city?.name).toBe('NewUnseenCity');
        expect(city?.country_code).toBe('DE');
        expect(city?.country_name).toBe('Germany');
        expect(knexMock.raw).toHaveBeenCalled(); // verified DB upsert was triggered
        expect(redisServiceMock.set).toHaveBeenCalled(); // verified Redis cache
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('normalizeAndResolvePlace', () => {
    it('should resolve place by geoname_id from popular hubs or DB', async () => {
      const resolved = await service.normalizeAndResolvePlace({
        geoname_id: 1787687, // Yiwu
      });

      expect(resolved.city).toBe('Yiwu');
      expect(resolved.country_code).toBe('CN');
      expect(resolved.country).toBe('China');
      expect(resolved.geoname_id).toBe(1787687);
    });

    it('should match known city name and resolve its geoname_id and country', async () => {
      const resolved = await service.normalizeAndResolvePlace({
        city: '  tashkent  ',
      });

      expect(resolved.city).toBe('Tashkent');
      expect(resolved.country_code).toBe('UZ');
      expect(resolved.geoname_id).toBe(1512569);
    });

    it('should trim and preserve custom unlisted city gracefully', async () => {
      knexMock.mockReturnValue({
        whereRaw: jest.fn().mockReturnThis(),
        orderByRaw: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });

      const resolved = await service.normalizeAndResolvePlace({
        city: '  Custom Small Town  ',
        country: '  Some Country ',
        country_code: ' sc ',
      });

      expect(resolved.city).toBe('Custom Small Town');
      expect(resolved.country).toBe('Some Country');
      expect(resolved.country_code).toBe('SC');
      expect(resolved.geoname_id).toBeNull();
    });
  });

  describe('buildDisplayName', () => {
    it('should format full display name with city, admin, country and code', () => {
      const display = service.buildDisplayName({
        name: 'Guangzhou',
        admin1_name: 'Guangdong',
        country_name: 'China',
        country_code: 'CN',
      });
      expect(display).toBe('Guangzhou, Guangdong, China (CN)');
    });
  });
});

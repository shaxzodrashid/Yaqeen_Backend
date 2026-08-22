import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { RedisService } from '../redis/redis.service';
import { SearchCitiesQueryDto } from './dto/locations.dto';
import {
  CityDto,
  CityRecord,
  GeoNamesRawItem,
  GeoNamesSearchResponse,
} from './locations.types';

// Pre-seeded high-frequency logistics hubs in Central Asia, China, Turkey, Russia, Europe, Middle East
export const POPULAR_LOGISTICS_HUBS: Array<
  Partial<CityRecord> & { display_name: string }
> = [
  // Uzbekistan
  {
    geoname_id: 1512569,
    name: 'Tashkent',
    ascii_name: 'Tashkent',
    country_name: 'Uzbekistan',
    country_code: 'UZ',
    admin1_name: 'Toshkent Shahri',
    latitude: 41.26465,
    longitude: 69.21627,
    timezone: 'Asia/Tashkent',
    population: 1978028,
    display_name: 'Tashkent, Uzbekistan (UZ)',
  },
  {
    geoname_id: 1216265,
    name: 'Samarkand',
    ascii_name: 'Samarkand',
    country_name: 'Uzbekistan',
    country_code: 'UZ',
    admin1_name: 'Samarqand',
    latitude: 39.65417,
    longitude: 66.95972,
    timezone: 'Asia/Tashkent',
    population: 559000,
    display_name: 'Samarkand, Uzbekistan (UZ)',
  },
  {
    geoname_id: 1514589,
    name: 'Andijan',
    ascii_name: 'Andijan',
    country_name: 'Uzbekistan',
    country_code: 'UZ',
    admin1_name: 'Andijon',
    latitude: 40.78206,
    longitude: 72.34424,
    timezone: 'Asia/Tashkent',
    population: 440000,
    display_name: 'Andijan, Uzbekistan (UZ)',
  },
  {
    geoname_id: 1513157,
    name: 'Namangan',
    ascii_name: 'Namangan',
    country_name: 'Uzbekistan',
    country_code: 'UZ',
    admin1_name: 'Namangan',
    latitude: 40.9983,
    longitude: 71.67257,
    timezone: 'Asia/Tashkent',
    population: 640000,
    display_name: 'Namangan, Uzbekistan (UZ)',
  },
  {
    geoname_id: 1513886,
    name: 'Bukhara',
    ascii_name: 'Bukhara',
    country_name: 'Uzbekistan',
    country_code: 'UZ',
    admin1_name: 'Buxoro',
    latitude: 39.77472,
    longitude: 64.42861,
    timezone: 'Asia/Tashkent',
    population: 280000,
    display_name: 'Bukhara, Uzbekistan (UZ)',
  },
  // China (Major Logistics Origin Hubs)
  {
    geoname_id: 1809858,
    name: 'Guangzhou',
    ascii_name: 'Guangzhou',
    country_name: 'China',
    country_code: 'CN',
    admin1_name: 'Guangdong',
    latitude: 23.12744,
    longitude: 113.25052,
    timezone: 'Asia/Shanghai',
    population: 18676605,
    display_name: 'Guangzhou, Guangdong, China (CN)',
  },
  {
    geoname_id: 1787687,
    name: 'Yiwu',
    ascii_name: 'Yiwu',
    country_name: 'China',
    country_code: 'CN',
    admin1_name: 'Zhejiang',
    latitude: 29.31506,
    longitude: 120.07676,
    timezone: 'Asia/Shanghai',
    population: 1859390,
    display_name: 'Yiwu, Zhejiang, China (CN)',
  },
  {
    geoname_id: 1529102,
    name: 'Urumqi',
    ascii_name: 'Urumqi',
    country_name: 'China',
    country_code: 'CN',
    admin1_name: 'Xinjiang',
    latitude: 43.80096,
    longitude: 87.60046,
    timezone: 'Asia/Urumqi',
    population: 4054369,
    display_name: 'Urumqi, Xinjiang, China (CN)',
  },
  {
    geoname_id: 1796236,
    name: 'Shanghai',
    ascii_name: 'Shanghai',
    country_name: 'China',
    country_code: 'CN',
    admin1_name: 'Shanghai',
    latitude: 31.22222,
    longitude: 121.45806,
    timezone: 'Asia/Shanghai',
    population: 24870895,
    display_name: 'Shanghai, China (CN)',
  },
  {
    geoname_id: 1795565,
    name: 'Shenzhen',
    ascii_name: 'Shenzhen',
    country_name: 'China',
    country_code: 'CN',
    admin1_name: 'Guangdong',
    latitude: 22.54554,
    longitude: 114.0683,
    timezone: 'Asia/Shanghai',
    population: 17494398,
    display_name: 'Shenzhen, Guangdong, China (CN)',
  },
  {
    geoname_id: 1809076,
    name: 'Foshan',
    ascii_name: 'Foshan',
    country_name: 'China',
    country_code: 'CN',
    admin1_name: 'Guangdong',
    latitude: 23.02919,
    longitude: 113.11974,
    timezone: 'Asia/Shanghai',
    population: 9498863,
    display_name: 'Foshan, Guangdong, China (CN)',
  },
  {
    geoname_id: 1800627,
    name: 'Ningbo',
    ascii_name: 'Ningbo',
    country_name: 'China',
    country_code: 'CN',
    admin1_name: 'Zhejiang',
    latitude: 29.87819,
    longitude: 121.54945,
    timezone: 'Asia/Shanghai',
    population: 9404283,
    display_name: 'Ningbo, Zhejiang, China (CN)',
  },
  {
    geoname_id: 1816670,
    name: 'Beijing',
    ascii_name: 'Beijing',
    country_name: 'China',
    country_code: 'CN',
    admin1_name: 'Beijing',
    latitude: 39.9075,
    longitude: 116.39723,
    timezone: 'Asia/Shanghai',
    population: 21893095,
    display_name: 'Beijing, China (CN)',
  },
  // Turkey
  {
    geoname_id: 745044,
    name: 'Istanbul',
    ascii_name: 'Istanbul',
    country_name: 'Turkey',
    country_code: 'TR',
    admin1_name: 'Istanbul',
    latitude: 41.01384,
    longitude: 28.94966,
    timezone: 'Europe/Istanbul',
    population: 14804116,
    display_name: 'Istanbul, Turkey (TR)',
  },
  {
    geoname_id: 304905,
    name: 'Mersin',
    ascii_name: 'Mersin',
    country_name: 'Turkey',
    country_code: 'TR',
    admin1_name: 'Mersin',
    latitude: 36.8,
    longitude: 34.63333,
    timezone: 'Europe/Istanbul',
    population: 1040507,
    display_name: 'Mersin, Turkey (TR)',
  },
  // Kazakhstan
  {
    geoname_id: 1526384,
    name: 'Almaty',
    ascii_name: 'Almaty',
    country_name: 'Kazakhstan',
    country_code: 'KZ',
    admin1_name: 'Almaty Qalasy',
    latitude: 43.25654,
    longitude: 76.92848,
    timezone: 'Asia/Almaty',
    population: 2000000,
    display_name: 'Almaty, Kazakhstan (KZ)',
  },
  {
    geoname_id: 1526273,
    name: 'Astana',
    ascii_name: 'Astana',
    country_name: 'Kazakhstan',
    country_code: 'KZ',
    admin1_name: 'Astana Qalasy',
    latitude: 51.1801,
    longitude: 71.44598,
    timezone: 'Asia/Almaty',
    population: 1350000,
    display_name: 'Astana, Kazakhstan (KZ)',
  },
  // Russia
  {
    geoname_id: 524901,
    name: 'Moscow',
    ascii_name: 'Moscow',
    country_name: 'Russia',
    country_code: 'RU',
    admin1_name: 'Moscow',
    latitude: 55.75222,
    longitude: 37.61556,
    timezone: 'Europe/Moscow',
    population: 13010112,
    display_name: 'Moscow, Russia (RU)',
  },
  // UAE
  {
    geoname_id: 292223,
    name: 'Dubai',
    ascii_name: 'Dubai',
    country_name: 'United Arab Emirates',
    country_code: 'AE',
    admin1_name: 'Dubai',
    latitude: 25.0657,
    longitude: 55.17128,
    timezone: 'Asia/Dubai',
    population: 3331420,
    display_name: 'Dubai, United Arab Emirates (AE)',
  },
];

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);
  private readonly geonamesApiUrl: string;
  private readonly geonamesUsername: string;
  private readonly CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days cache

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly configService: ConfigService,
    @Optional() private readonly redisService?: RedisService,
  ) {
    this.geonamesUsername =
      this.configService.get<string>('geonames.username') ||
      process.env.GEONAMES_USERNAME ||
      'yaqeen_logistics';
    this.geonamesApiUrl =
      this.configService.get<string>('geonames.apiUrl') ||
      process.env.GEONAMES_API_URL ||
      'http://api.geonames.org';
  }

  /**
   * Builds formatted display name for a city (e.g. "Tashkent, Uzbekistan (UZ)" or "Yiwu, Zhejiang, China (CN)").
   */
  public buildDisplayName(city: Partial<CityRecord>): string {
    const parts: string[] = [];
    if (city.name) parts.push(city.name);
    if (city.admin1_name && city.admin1_name !== city.name) {
      parts.push(city.admin1_name);
    }
    if (city.country_name) {
      if (city.country_code) {
        parts.push(`${city.country_name} (${city.country_code})`);
      } else {
        parts.push(city.country_name);
      }
    } else if (city.country_code) {
      parts.push(city.country_code);
    }
    return parts.join(', ');
  }

  /**
   * Formats a raw or DB record into standard CityDto.
   */
  private formatCityDto(city: Partial<CityRecord>): CityDto {
    return {
      geoname_id: city.geoname_id ?? null,
      name: city.name || '',
      ascii_name: city.ascii_name || city.name || null,
      country_name: city.country_name || null,
      country_code: city.country_code ? city.country_code.toUpperCase() : null,
      admin1_name: city.admin1_name || null,
      latitude:
        city.latitude !== undefined && city.latitude !== null
          ? Number(city.latitude)
          : null,
      longitude:
        city.longitude !== undefined && city.longitude !== null
          ? Number(city.longitude)
          : null,
      timezone: city.timezone || null,
      population:
        city.population !== undefined && city.population !== null
          ? Number(city.population)
          : null,
      display_name: this.buildDisplayName(city),
    };
  }

  /**
   * Search cities using Redis cache -> Local Postgres Database -> GeoNames Web Service.
   */
  async searchCities(query: SearchCitiesQueryDto): Promise<CityDto[]> {
    const rawQ = (query.q || '').trim();
    if (!rawQ) {
      return this.getPopularLogisticsHubs();
    }

    const countryCode = query.country ? query.country.trim().toUpperCase() : '';
    const limit = Math.min(50, Math.max(1, query.limit || 15));
    const cacheKey = `locations:cities:search:${rawQ.toLowerCase()}:${countryCode || 'all'}:${limit}`;

    // 1. Try Redis cache
    if (this.redisService) {
      try {
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        this.logger.warn(`Redis get error: ${err.message}`);
      }
    }

    // 2. Query Local Database `cities` table
    let localMatches: CityRecord[] = [];
    try {
      const hasTable = await this.knex.schema.hasTable('cities');
      if (hasTable) {
        let dbQuery = this.knex('cities').where((builder) => {
          builder
            .whereILike('name', `${rawQ}%`)
            .orWhereILike('ascii_name', `${rawQ}%`)
            .orWhereILike('name', `%${rawQ}%`)
            .orWhereILike('ascii_name', `%${rawQ}%`)
            .orWhereILike('admin1_name', `%${rawQ}%`);
        });

        if (countryCode) {
          dbQuery = dbQuery.andWhere('country_code', countryCode);
        }

        localMatches = await dbQuery
          .orderByRaw(
            `
            CASE
              WHEN LOWER(name) = LOWER(?) THEN 1
              WHEN LOWER(ascii_name) = LOWER(?) THEN 2
              WHEN LOWER(name) LIKE LOWER(?) THEN 3
              WHEN LOWER(ascii_name) LIKE LOWER(?) THEN 4
              ELSE 5
            END,
            COALESCE(population, 0) DESC
          `,
            [rawQ, rawQ, `${rawQ}%`, `${rawQ}%`],
          )
          .limit(limit);
      }
    } catch (err) {
      this.logger.warn(`Local DB cities search error: ${err.message}`);
    }

    // If local matches have enough quality results, return them
    if (localMatches.length >= limit) {
      const formatted = localMatches.map((c) => this.formatCityDto(c));
      await this.cacheResults(cacheKey, formatted);
      return formatted;
    }

    // 3. Fallback to GeoNames Web Service if query length >= 2
    let geonamesCities: CityDto[] = [];
    if (rawQ.length >= 2) {
      try {
        geonamesCities = await this.fetchCitiesFromGeoNames(
          rawQ,
          countryCode,
          limit,
        );
        if (geonamesCities.length > 0) {
          // Asynchronously upsert fetched cities into local database
          this.upsertCitiesToDatabase(geonamesCities).catch((err) => {
            this.logger.warn(
              `Failed to persist fetched GeoNames cities: ${err.message}`,
            );
          });
        }
      } catch (err) {
        this.logger.warn(`GeoNames API search failed: ${err.message}`);
      }
    }

    // 4. Merge results (prioritize exact name matches, deduplicate by geoname_id or name+country_code)
    const combinedMap = new Map<string, CityDto>();

    for (const c of localMatches) {
      const key = c.geoname_id
        ? `gid:${c.geoname_id}`
        : `name:${(c.name || '').toLowerCase()}:${c.country_code || ''}`;
      combinedMap.set(key, this.formatCityDto(c));
    }

    for (const c of geonamesCities) {
      const key = c.geoname_id
        ? `gid:${c.geoname_id}`
        : `name:${(c.name || '').toLowerCase()}:${c.country_code || ''}`;
      if (!combinedMap.has(key)) {
        combinedMap.set(key, c);
      }
    }

    // If still empty, check popular hub seeds
    if (combinedMap.size === 0) {
      const matchingPopular = POPULAR_LOGISTICS_HUBS.filter(
        (h) =>
          h.name?.toLowerCase().includes(rawQ.toLowerCase()) ||
          h.ascii_name?.toLowerCase().includes(rawQ.toLowerCase()) ||
          h.country_name?.toLowerCase().includes(rawQ.toLowerCase()),
      );
      for (const h of matchingPopular) {
        const key = h.geoname_id
          ? `gid:${h.geoname_id}`
          : `name:${h.name?.toLowerCase()}:${h.country_code}`;
        combinedMap.set(key, this.formatCityDto(h));
      }
    }

    const finalResults = Array.from(combinedMap.values()).slice(0, limit);
    await this.cacheResults(cacheKey, finalResults);
    return finalResults;
  }

  /**
   * Fetches cities from GeoNames Web Service (searchJSON).
   */
  async fetchCitiesFromGeoNames(
    query: string,
    countryCode?: string,
    limit = 15,
  ): Promise<CityDto[]> {
    const url = new URL(`${this.geonamesApiUrl}/searchJSON`);
    url.searchParams.set('q', query);
    url.searchParams.set('maxRows', String(Math.max(limit, 20)));
    url.searchParams.set('featureClass', 'P'); // Populated places
    url.searchParams.set('cities', 'cities1000'); // Cities with population >= 1000
    url.searchParams.set('orderby', 'population');
    url.searchParams.set('style', 'FULL');
    url.searchParams.set('type', 'json');
    url.searchParams.set('username', this.geonamesUsername);

    if (countryCode) {
      url.searchParams.set('country', countryCode);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `GeoNames returned HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const data: GeoNamesSearchResponse = await response.json();

      if (!data.geonames || !Array.isArray(data.geonames)) {
        return [];
      }

      return data.geonames.map((item: GeoNamesRawItem) => {
        const lat = item.lat ? parseFloat(String(item.lat)) : null;
        const lng = item.lng ? parseFloat(String(item.lng)) : null;
        const population = item.population ? Number(item.population) : null;

        const cityPartial: Partial<CityRecord> = {
          geoname_id: item.geonameId,
          name: item.name || item.toponymName || '',
          ascii_name: item.asciiName || item.name || null,
          country_name: item.countryName || null,
          country_code: item.countryCode
            ? item.countryCode.toUpperCase()
            : null,
          admin1_name: item.adminName1 || null,
          latitude: isNaN(lat as number) ? null : lat,
          longitude: isNaN(lng as number) ? null : lng,
          timezone: item.timezone?.timeZoneId || null,
          population: isNaN(population as number) ? null : population,
        };

        return this.formatCityDto(cityPartial);
      });
    } catch (err) {
      clearTimeout(timeoutId);
      this.logger.warn(
        `GeoNames fetch error for query "${query}": ${err.message}`,
      );
      return [];
    }
  }

  /**
   * Lookup city details by GeoNames ID.
   * 1. Checks Redis cache
   * 2. Checks local database `cities` table
   * 3. Fallbacks to GeoNames API `getJSON` if city was never used/saved before
   * 4. Persists new city to `cities` table and caches in Redis
   */
  async getCityByGeonameId(geonameId: number): Promise<CityDto | null> {
    if (!geonameId || isNaN(geonameId)) return null;

    const cacheKey = `locations:cities:id:${geonameId}`;

    // 1. Check Redis cache
    if (this.redisService) {
      try {
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as CityDto;
        }
      } catch (err) {
        this.logger.warn(`Redis cache get error: ${err.message}`);
      }
    }

    // 2. Check Local Database `cities` table
    try {
      const hasTable = await this.knex.schema.hasTable('cities');
      if (hasTable) {
        const existing = await this.knex('cities')
          .where('geoname_id', geonameId)
          .first();
        if (existing) {
          const dto = this.formatCityDto(existing);
          if (this.redisService) {
            await this.redisService
              .set(cacheKey, JSON.stringify(dto), 604800)
              .catch(() => {});
          }
          return dto;
        }
      }
    } catch (err) {
      this.logger.warn(
        `DB check for geoname_id ${geonameId} failed: ${err.message}`,
      );
    }

    // 3. Check popular pre-seeded hubs
    const popularMatch = POPULAR_LOGISTICS_HUBS.find(
      (h) => h.geoname_id === geonameId,
    );
    if (popularMatch) {
      const dto = this.formatCityDto(popularMatch);
      await this.upsertCitiesToDatabase([dto]);
      if (this.redisService) {
        await this.redisService
          .set(cacheKey, JSON.stringify(dto), 604800)
          .catch(() => {});
      }
      return dto;
    }

    // 4. Fallback to GeoNames Web Service API `getJSON` for unused/new cities
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const url = `${this.geonamesApiUrl}/getJSON?geonameId=${geonameId}&username=${this.geonamesUsername}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const item: GeoNamesRawItem = await res.json();
        if (item && item.geonameId) {
          const lat = item.lat ? parseFloat(String(item.lat)) : null;
          const lng = item.lng ? parseFloat(String(item.lng)) : null;
          const dto = this.formatCityDto({
            geoname_id: item.geonameId,
            name: item.name || item.toponymName || '',
            ascii_name: item.asciiName || item.name || null,
            country_name: item.countryName || null,
            country_code: item.countryCode
              ? item.countryCode.toUpperCase()
              : null,
            admin1_name: item.adminName1 || null,
            latitude: isNaN(lat as number) ? null : lat,
            longitude: isNaN(lng as number) ? null : lng,
            timezone: item.timezone?.timeZoneId || null,
            population: item.population ? Number(item.population) : null,
          });

          // Save new city into local DB for future fast queries
          await this.upsertCitiesToDatabase([dto]);

          // Cache in Redis
          if (this.redisService) {
            await this.redisService
              .set(cacheKey, JSON.stringify(dto), 604800)
              .catch(() => {});
          }

          return dto;
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      this.logger.warn(
        `Failed to fetch city details from GeoNames for ID ${geonameId}: ${err.message}`,
      );
    }

    return null;
  }

  /**
   * Helper to normalize & resolve place inputs from create/update payloads.
   * Auto-standardizes names, cleans whitespace, resolves geoname_id & coordinates.
   */
  async normalizeAndResolvePlace(payload: {
    city?: string | null;
    country?: string | null;
    country_code?: string | null;
    geoname_id?: number | null;
    lat?: number | null;
    lng?: number | null;
  }): Promise<{
    city: string | null;
    country: string | null;
    country_code: string | null;
    geoname_id: number | null;
    lat: number | null;
    lng: number | null;
  }> {
    let city = payload.city ? payload.city.trim() : null;
    let country = payload.country ? payload.country.trim() : null;
    let countryCode = payload.country_code
      ? payload.country_code.trim().toUpperCase()
      : null;
    let geonameId = payload.geoname_id ? Number(payload.geoname_id) : null;
    let lat =
      payload.lat !== undefined && payload.lat !== null
        ? Number(payload.lat)
        : null;
    let lng =
      payload.lng !== undefined && payload.lng !== null
        ? Number(payload.lng)
        : null;

    // If geoname_id is provided, resolve canonical data
    if (geonameId && !isNaN(geonameId)) {
      const canonical = await this.getCityByGeonameId(geonameId);
      if (canonical) {
        city = canonical.name;
        country = canonical.country_name || country;
        countryCode = canonical.country_code || countryCode;
        if (canonical.latitude !== null && lat === null)
          lat = canonical.latitude;
        if (canonical.longitude !== null && lng === null)
          lng = canonical.longitude;
      }
    } else if (city) {
      // If only city name was typed, try to match known city in database or popular hubs
      try {
        const hasTable = await this.knex.schema.hasTable('cities');
        if (hasTable) {
          const match = await this.knex('cities')
            .whereRaw('LOWER(name) = ? OR LOWER(ascii_name) = ?', [
              city.toLowerCase(),
              city.toLowerCase(),
            ])
            .orderByRaw('COALESCE(population, 0) DESC')
            .first();

          if (match) {
            city = match.name;
            country = match.country_name || country;
            countryCode = match.country_code || countryCode;
            geonameId = match.geoname_id || null;
            if (match.latitude !== null && lat === null)
              lat = Number(match.latitude);
            if (match.longitude !== null && lng === null)
              lng = Number(match.longitude);
          }
        }
      } catch {
        // Fallback silently if table not yet migrated
      }

      if (!geonameId) {
        const popular = POPULAR_LOGISTICS_HUBS.find(
          (h) =>
            h.name?.toLowerCase() === city?.toLowerCase() ||
            h.ascii_name?.toLowerCase() === city?.toLowerCase(),
        );
        if (popular) {
          city = popular.name || city;
          country = popular.country_name || country;
          countryCode = popular.country_code || countryCode;
          geonameId = popular.geoname_id || null;
          if (popular.latitude !== undefined && lat === null)
            lat = popular.latitude;
          if (popular.longitude !== undefined && lng === null)
            lng = popular.longitude;
        }
      }
    }

    return {
      city,
      country,
      country_code: countryCode,
      geoname_id: geonameId,
      lat,
      lng,
    };
  }

  /**
   * Returns list of popular logistics hub cities for quick dropdown selection.
   */
  async getPopularLogisticsHubs(): Promise<CityDto[]> {
    try {
      const hasTable = await this.knex.schema.hasTable('cities');
      if (hasTable) {
        const geonameIds = POPULAR_LOGISTICS_HUBS.map(
          (h) => h.geoname_id,
        ).filter(Boolean) as number[];
        const dbHubs = await this.knex('cities')
          .whereIn('geoname_id', geonameIds)
          .orderBy('population', 'desc');

        if (dbHubs.length >= 10) {
          return dbHubs.map((h) => this.formatCityDto(h));
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch popular hubs from DB: ${err.message}`);
    }

    return POPULAR_LOGISTICS_HUBS.map((h) => this.formatCityDto(h));
  }

  /**
   * Persists fetched cities to the database with ON CONFLICT DO UPDATE.
   */
  private async upsertCitiesToDatabase(cities: CityDto[]): Promise<void> {
    try {
      const hasTable = await this.knex.schema.hasTable('cities');
      if (!hasTable || cities.length === 0) return;

      for (const city of cities) {
        if (!city.name) continue;

        if (city.geoname_id) {
          await this.knex.raw(
            `
            INSERT INTO cities (
              geoname_id, name, ascii_name, country_name, country_code,
              admin1_name, latitude, longitude, timezone, population,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            ON CONFLICT (geoname_id) DO UPDATE SET
              name = EXCLUDED.name,
              ascii_name = EXCLUDED.ascii_name,
              country_name = EXCLUDED.country_name,
              country_code = EXCLUDED.country_code,
              admin1_name = EXCLUDED.admin1_name,
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              timezone = EXCLUDED.timezone,
              population = EXCLUDED.population,
              updated_at = NOW()
          `,
            [
              city.geoname_id,
              city.name,
              city.ascii_name,
              city.country_name,
              city.country_code,
              city.admin1_name,
              city.latitude,
              city.longitude,
              city.timezone,
              city.population,
            ],
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to upsert cities: ${err.message}`);
    }
  }

  /**
   * Stores results in Redis cache.
   */
  private async cacheResults(key: string, data: CityDto[]): Promise<void> {
    if (this.redisService) {
      try {
        await this.redisService.set(
          key,
          JSON.stringify(data),
          this.CACHE_TTL_SECONDS,
        );
      } catch (err) {
        this.logger.warn(`Redis set cache error: ${err.message}`);
      }
    }
  }
}

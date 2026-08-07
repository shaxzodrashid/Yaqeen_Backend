import { Test, TestingModule } from '@nestjs/testing';
import { CommercialOffersService } from './commercial-offers.service';
import { KNEX_CONNECTION } from '../database/database.module';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Currency } from '../currency/currency.types';

describe('CommercialOffersService', () => {
  let service: CommercialOffersService;
  let mockQueryBuilder: any;
  let mockKnex: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereILike: jest.fn().mockReturnThis(),
      orWhereILike: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      orderByRaw: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
      delete: jest.fn().mockResolvedValue(1),
      returning: jest.fn().mockResolvedValue([{ id: 'mock-uuid-1' }]),
      first: jest.fn(),
      count: jest.fn().mockReturnThis(),
      sum: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([])),
    };

    mockKnex = jest.fn().mockReturnValue(mockQueryBuilder);
    mockKnex.raw = jest.fn((sql) => sql);
    mockKnex.fn = { now: jest.fn().mockReturnValue('now()') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommercialOffersService,
        {
          provide: KNEX_CONNECTION,
          useValue: mockKnex,
        },
      ],
    }).compile();

    service = module.get<CommercialOffersService>(CommercialOffersService);
  });

  describe('generateOfferNumber', () => {
    it('should generate YQ-YYYY-0001 when no previous offers exist', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);
      const result = await service.generateOfferNumber();
      const year = new Date().getFullYear();
      expect(result).toBe(`YQ-${year}-0001`);
    });

    it('should generate next sequential number when previous offers exist', async () => {
      const year = new Date().getFullYear();
      mockQueryBuilder.first.mockResolvedValue({
        offer_number: `YQ-${year}-0042`,
      });
      const result = await service.generateOfferNumber();
      expect(result).toBe(`YQ-${year}-0043`);
    });

    it('should pad numbers with leading zeros', async () => {
      const year = new Date().getFullYear();
      mockQueryBuilder.first.mockResolvedValue({
        offer_number: `YQ-${year}-0009`,
      });
      const result = await service.generateOfferNumber();
      expect(result).toBe(`YQ-${year}-0010`);
    });
  });

  describe('createOffer', () => {
    const validDto = {
      client_name: 'John Doe',
      client_company: 'ACME Corp',
      origin: 'Tashkent',
      destination: 'Shanghai',
      price_usd: 5000,
      price_local: 65000000,
    };

    it('should create an offer and return the result', async () => {
      // Mock generateOfferNumber
      mockQueryBuilder.first.mockResolvedValueOnce(null); // No existing offers
      mockQueryBuilder.returning.mockResolvedValueOnce([
        { id: 'new-offer-id' },
      ]);

      // Mock findOfferById
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'new-offer-id',
        offer_number: `YQ-${new Date().getFullYear()}-0001`,
        client_name: 'John Doe',
        client_company: 'ACME Corp',
        origin: 'Tashkent',
        destination: 'Shanghai',
        price_usd: '5000.00',
        price_local: '65000000.00',
        status: 'draft',
        inclusions: null,
        exclusions: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.createOffer(validDto, 'user-id-123');

      expect(result).toBeDefined();
      expect(result.status).toBe('draft');
      expect(mockKnex).toHaveBeenCalledWith('commercial_offers');
    });

    it('should auto-fill client info when client_id is provided', async () => {
      const dtoWithClient = {
        ...validDto,
        client_id: 'client-uuid-1',
      };

      // Mock client lookup
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'client-uuid-1',
        first_name: 'Ali',
        last_name: 'Karimov',
        company_name: 'Orient Cargo LLC',
      });

      // Mock generateOfferNumber
      mockQueryBuilder.first.mockResolvedValueOnce(null);
      mockQueryBuilder.returning.mockResolvedValueOnce([
        { id: 'new-offer-id' },
      ]);

      // Mock findOfferById
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'new-offer-id',
        offer_number: `YQ-${new Date().getFullYear()}-0001`,
        client_id: 'client-uuid-1',
        client_name: 'Ali Karimov',
        client_company: 'Orient Cargo LLC',
        origin: 'Tashkent',
        destination: 'Shanghai',
        price_usd: '5000.00',
        price_local: '65000000.00',
        status: 'draft',
        inclusions: null,
        exclusions: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.createOffer(dtoWithClient, 'user-id-123');

      expect(result).toBeDefined();
      expect(result.client_name).toBe('Ali Karimov');
      expect(result.client_company).toBe('Orient Cargo LLC');
    });

    it('should throw NotFoundException when client_id does not exist', async () => {
      const dtoWithBadClient = {
        ...validDto,
        client_id: 'nonexistent-uuid',
      };

      mockQueryBuilder.first.mockResolvedValueOnce(null); // Client not found

      await expect(
        service.createOffer(dtoWithBadClient, 'user-id-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOfferById', () => {
    it('should return a formatted offer when found', async () => {
      mockQueryBuilder.first.mockResolvedValue({
        id: 'offer-uuid-1',
        offer_number: 'YQ-2026-0001',
        client_name: 'John Doe',
        client_company: 'ACME Corp',
        origin: 'Tashkent',
        destination: 'Shanghai',
        price_usd: '5000.00',
        price_local: '65000000.00',
        cargo_weight: '1500.50',
        cargo_volume: '12.30',
        inclusions: ['Loading', 'Insurance'],
        exclusions: ['Customs clearance'],
        terms: 'Payment within 30 days',
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.findOfferById('offer-uuid-1');

      expect(result.id).toBe('offer-uuid-1');
      expect(result.offer_number).toBe('YQ-2026-0001');
      expect(result.price_usd).toBe(5000);
      expect(result.price_local).toBe(65000000);
      expect(result.cargo_weight).toBe(1500.5);
      expect(result.cargo_volume).toBe(12.3);
      expect(result.inclusions).toEqual(['Loading', 'Insurance']);
      expect(result.exclusions).toEqual(['Customs clearance']);
    });

    it('should throw NotFoundException when offer does not exist', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await expect(service.findOfferById('nonexistent-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateOfferStatus', () => {
    it('should allow transition from draft to sent', async () => {
      // Mock finding existing offer
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'offer-uuid-1',
        offer_number: 'YQ-2026-0001',
        status: 'draft',
      });

      // Mock the update
      mockQueryBuilder.update.mockResolvedValueOnce(1);

      // Mock findOfferById for result
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'offer-uuid-1',
        offer_number: 'YQ-2026-0001',
        client_name: 'John',
        client_company: 'Corp',
        origin: 'A',
        destination: 'B',
        price_usd: '100.00',
        price_local: '1200000.00',
        status: 'sent',
        inclusions: null,
        exclusions: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.updateOfferStatus('offer-uuid-1', 'sent');
      expect(result.status).toBe('sent');
    });

    it('should allow transition from sent to accepted', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'offer-uuid-1',
        offer_number: 'YQ-2026-0001',
        status: 'sent',
      });

      mockQueryBuilder.update.mockResolvedValueOnce(1);

      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'offer-uuid-1',
        offer_number: 'YQ-2026-0001',
        client_name: 'John',
        client_company: 'Corp',
        origin: 'A',
        destination: 'B',
        price_usd: '100.00',
        price_local: '1200000.00',
        status: 'accepted',
        inclusions: null,
        exclusions: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.updateOfferStatus(
        'offer-uuid-1',
        'accepted',
      );
      expect(result.status).toBe('accepted');
    });

    it('should reject invalid transition from accepted to sent', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'offer-uuid-1',
        offer_number: 'YQ-2026-0001',
        status: 'accepted',
      });

      await expect(
        service.updateOfferStatus('offer-uuid-1', 'sent'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid transition from rejected to accepted', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'offer-uuid-1',
        offer_number: 'YQ-2026-0001',
        status: 'rejected',
      });

      await expect(
        service.updateOfferStatus('offer-uuid-1', 'accepted'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow reopening: accepted to draft', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'offer-uuid-1',
        offer_number: 'YQ-2026-0001',
        status: 'accepted',
      });

      mockQueryBuilder.update.mockResolvedValueOnce(1);

      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'offer-uuid-1',
        offer_number: 'YQ-2026-0001',
        client_name: 'John',
        client_company: 'Corp',
        origin: 'A',
        destination: 'B',
        price_usd: '100.00',
        price_local: '1200000.00',
        status: 'draft',
        inclusions: null,
        exclusions: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.updateOfferStatus('offer-uuid-1', 'draft');
      expect(result.status).toBe('draft');
    });

    it('should throw NotFoundException for nonexistent offer', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce(null);

      await expect(
        service.updateOfferStatus('nonexistent-uuid', 'sent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('duplicateOffer', () => {
    it('should create a duplicate with new number and draft status', async () => {
      // Find existing offer
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'orig-offer-id',
        offer_number: 'YQ-2026-0005',
        client_id: 'client-1',
        client_name: 'John',
        client_company: 'Corp',
        origin: 'Tashkent',
        destination: 'Shanghai',
        cargo_description: 'Electronics',
        cargo_weight: '1000.00',
        cargo_volume: '5.00',
        price_usd: '3000.00',
        price_local: '39000000.00',
        inclusions: JSON.stringify(['Loading']),
        exclusions: JSON.stringify(['Insurance']),
        terms: 'Net 30',
        status: 'accepted',
      });

      // Mock generateOfferNumber
      mockQueryBuilder.first.mockResolvedValueOnce({
        offer_number: 'YQ-2026-0005',
      });

      // Mock insert
      mockQueryBuilder.returning.mockResolvedValueOnce([{ id: 'new-dup-id' }]);

      // Mock findOfferById
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'new-dup-id',
        offer_number: 'YQ-2026-0006',
        client_name: 'John',
        client_company: 'Corp',
        origin: 'Tashkent',
        destination: 'Shanghai',
        price_usd: '3000.00',
        price_local: '39000000.00',
        status: 'draft',
        inclusions: ['Loading'],
        exclusions: ['Insurance'],
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.duplicateOffer(
        'orig-offer-id',
        'user-id-123',
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('draft');
    });

    it('should throw NotFoundException for nonexistent offer', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce(null);

      await expect(
        service.duplicateOffer('nonexistent-uuid', 'user-id-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteOffer', () => {
    it('should delete an existing offer', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'offer-uuid-1',
        offer_number: 'YQ-2026-0001',
      });

      await expect(service.deleteOffer('offer-uuid-1')).resolves.not.toThrow();
    });

    it('should throw NotFoundException when deleting nonexistent offer', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce(null);

      await expect(service.deleteOffer('nonexistent-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getOffersSummary', () => {
    it('should return summary with correct structure', async () => {
      // Mock status counts
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) =>
        resolve([
          { status: 'draft', count: '3' },
          { status: 'sent', count: '2' },
          { status: 'accepted', count: '5' },
          { status: 'rejected', count: '1' },
        ]),
      );

      // Mock total accepted revenue
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) =>
        resolve([{ total_usd: '25000.00', total_local: '325000000.00' }]),
      );

      // Mock total count
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) =>
        resolve([{ total: '11' }]),
      );

      const result = await service.getOffersSummary();

      expect(result).toBeDefined();
      expect(result.currency).toBe('UZS');
      expect(result).toHaveProperty('total_offers');
      expect(result).toHaveProperty('by_status');
      expect(result).toHaveProperty('accepted_revenue');
      expect(result.accepted_revenue.amount).toBe(325000000);
      expect(result.by_status).toHaveProperty('draft');
      expect(result.by_status).toHaveProperty('sent');
      expect(result.by_status).toHaveProperty('accepted');
      expect(result.by_status).toHaveProperty('rejected');
    });

    it('should return accepted revenue in USD when currency=USD', async () => {
      // Mock status counts
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) =>
        resolve([{ status: 'accepted', count: '5' }]),
      );

      // Mock total accepted revenue
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) =>
        resolve([{ total_usd: '25000.00', total_local: '325000000.00' }]),
      );

      // Mock total count
      mockQueryBuilder.then.mockImplementationOnce((resolve: any) =>
        resolve([{ total: '5' }]),
      );

      const result = await service.getOffersSummary(Currency.USD);
      expect(result.currency).toBe(Currency.USD);
      expect(result.accepted_revenue.amount).toBe(25000);
    });
  });
});

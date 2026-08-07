import { Test, TestingModule } from '@nestjs/testing';
import {
  CommercialOffersPdfService,
  CommercialOfferPdfData,
} from './commercial-offers-pdf.service';

describe('CommercialOffersPdfService', () => {
  let service: CommercialOffersPdfService;

  const fullOfferData: CommercialOfferPdfData = {
    offer_number: 'YQ-2026-0001',
    client_name: 'Rustam Rasulov',
    client_company: 'Orient Cargo International LLC',
    origin: 'Tashkent, Uzbekistan',
    destination: 'Shanghai, China',
    cargo_description: 'Electronic components and spare parts',
    cargo_weight: 1500.5,
    cargo_volume: 12.3,
    price_usd: 5000,
    price_local: 65000000,
    inclusions: [
      'Loading at origin',
      'Freight transport',
      'Customs documentation',
      'Cargo insurance',
    ],
    exclusions: [
      'Customs duties at destination',
      'Unloading at destination',
      'Warehousing',
    ],
    terms:
      'Payment: 50% advance, 50% upon delivery. Delivery time: 15-20 business days. Prices quoted in USD. All disputes resolved under Uzbekistan commercial law.',
    status: 'draft',
    created_at: '2026-07-28T10:00:00.000Z',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommercialOffersPdfService],
    }).compile();

    service = module.get<CommercialOffersPdfService>(
      CommercialOffersPdfService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generatePdf', () => {
    it('should generate a PDF buffer with full offer data', async () => {
      const result = await service.generatePdf(fullOfferData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(1024); // PDF should be > 1KB
    });

    it('should produce a valid PDF starting with %PDF header', async () => {
      const result = await service.generatePdf(fullOfferData);
      const header = result.subarray(0, 5).toString('ascii');

      expect(header).toBe('%PDF-');
    });

    it('should generate PDF without optional cargo fields', async () => {
      const minimalData: CommercialOfferPdfData = {
        offer_number: 'YQ-2026-0002',
        client_name: 'Test Client',
        client_company: 'Test Company',
        origin: 'Moscow',
        destination: 'Tashkent',
        price_usd: 1000,
        price_local: 13000000,
        status: 'sent',
        created_at: new Date().toISOString(),
      };

      const result = await service.generatePdf(minimalData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(512);
    });

    it('should generate PDF without inclusions/exclusions', async () => {
      const noInclusionsData: CommercialOfferPdfData = {
        ...fullOfferData,
        inclusions: undefined,
        exclusions: undefined,
      };

      const result = await service.generatePdf(noInclusionsData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(512);
    });

    it('should generate PDF without terms', async () => {
      const noTermsData: CommercialOfferPdfData = {
        ...fullOfferData,
        terms: undefined,
      };

      const result = await service.generatePdf(noTermsData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(512);
    });

    it('should generate PDF with only inclusions (no exclusions)', async () => {
      const inclusionsOnlyData: CommercialOfferPdfData = {
        ...fullOfferData,
        exclusions: undefined,
      };

      const result = await service.generatePdf(inclusionsOnlyData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(512);
    });

    it('should generate PDF with only exclusions (no inclusions)', async () => {
      const exclusionsOnlyData: CommercialOfferPdfData = {
        ...fullOfferData,
        inclusions: undefined,
      };

      const result = await service.generatePdf(exclusionsOnlyData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(512);
    });

    it('should handle empty inclusions/exclusions arrays', async () => {
      const emptyArraysData: CommercialOfferPdfData = {
        ...fullOfferData,
        inclusions: [],
        exclusions: [],
      };

      const result = await service.generatePdf(emptyArraysData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(512);
    });

    it('should handle different statuses correctly', async () => {
      const statuses = ['draft', 'sent', 'accepted', 'rejected'];

      for (const status of statuses) {
        const data: CommercialOfferPdfData = {
          ...fullOfferData,
          status,
        };

        const result = await service.generatePdf(data);
        expect(result).toBeInstanceOf(Buffer);
        expect(result.length).toBeGreaterThan(512);
      }
    });

    it('should handle zero prices', async () => {
      const zeroPriceData: CommercialOfferPdfData = {
        ...fullOfferData,
        price_usd: 0,
        price_local: 0,
      };

      const result = await service.generatePdf(zeroPriceData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(512);
    });

    it('should handle very large prices', async () => {
      const largePriceData: CommercialOfferPdfData = {
        ...fullOfferData,
        price_usd: 999999.99,
        price_local: 12999999999.99,
      };

      const result = await service.generatePdf(largePriceData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(512);
    });

    it('should handle long text in all fields', async () => {
      const longTextData: CommercialOfferPdfData = {
        ...fullOfferData,
        client_name: 'A'.repeat(100),
        client_company: 'B'.repeat(200),
        origin: 'C'.repeat(100),
        destination: 'D'.repeat(100),
        cargo_description: 'E'.repeat(500),
        terms: 'F'.repeat(1000),
        inclusions: Array(10).fill('Long inclusion item text here'),
        exclusions: Array(10).fill('Long exclusion item text here'),
      };

      const result = await service.generatePdf(longTextData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(1024);
    });
  });
});

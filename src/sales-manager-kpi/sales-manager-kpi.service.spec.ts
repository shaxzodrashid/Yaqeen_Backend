import {
  SalesManagerKpiService,
  CAREER_LEVEL_CONFIG,
} from './sales-manager-kpi.service';
import { CareerLevel } from './dto/sales-manager-kpi.dto';

describe('SalesManagerKpiService', () => {
  let service: SalesManagerKpiService;

  beforeEach(() => {
    service = new SalesManagerKpiService(null as any);
  });

  describe('getSalesBonusRate', () => {
    it('should return 0% for sales under $2,000', () => {
      expect(service.getSalesBonusRate(0)).toBe(0.0);
      expect(service.getSalesBonusRate(1500)).toBe(0.0);
      expect(service.getSalesBonusRate(1999)).toBe(0.0);
    });

    it('should return 10% for sales $2,000 - $3,999', () => {
      expect(service.getSalesBonusRate(2000)).toBe(0.1);
      expect(service.getSalesBonusRate(3500)).toBe(0.1);
    });

    it('should return 15% for sales $4,000 - $5,999', () => {
      expect(service.getSalesBonusRate(4000)).toBe(0.15);
      expect(service.getSalesBonusRate(5600)).toBe(0.15);
    });

    it('should return 20% for sales $6,000 - $7,999', () => {
      expect(service.getSalesBonusRate(6000)).toBe(0.2);
      expect(service.getSalesBonusRate(7200)).toBe(0.2);
    });

    it('should return 22% for sales $8,000 - $9,999', () => {
      expect(service.getSalesBonusRate(8000)).toBe(0.22);
      expect(service.getSalesBonusRate(9500)).toBe(0.22);
    });

    it('should return 25% for sales >= $10,000', () => {
      expect(service.getSalesBonusRate(10000)).toBe(0.25);
      expect(service.getSalesBonusRate(15000)).toBe(0.25);
    });
  });

  describe('CAREER_LEVEL_CONFIG', () => {
    it('should have correct config for JUNIOR', () => {
      const cfg = CAREER_LEVEL_CONFIG[CareerLevel.JUNIOR];
      expect(cfg.fixedSalary).toBe(300);
      expect(cfg.planMin).toBe(0);
      expect(cfg.planMax).toBe(3000);
      expect(cfg.srCheckMin).toBe(150);
      expect(cfg.srCheckTarget).toBe(300);
      expect(cfg.promotionConsecutiveMonths).toBe(2);
    });

    it('should have correct config for MID', () => {
      const cfg = CAREER_LEVEL_CONFIG[CareerLevel.MID];
      expect(cfg.fixedSalary).toBe(500);
      expect(cfg.planMin).toBe(5000);
      expect(cfg.planMax).toBe(6000);
      expect(cfg.srCheckMin).toBe(200);
      expect(cfg.srCheckTarget).toBe(400);
      expect(cfg.promotionConsecutiveMonths).toBe(3);
      expect(cfg.demotionConsecutiveMonths).toBe(2);
    });

    it('should have correct config for SENIOR', () => {
      const cfg = CAREER_LEVEL_CONFIG[CareerLevel.SENIOR];
      expect(cfg.fixedSalary).toBe(700);
      expect(cfg.planMin).toBe(6001);
      expect(cfg.planMax).toBe(8000);
      expect(cfg.srCheckMin).toBe(250);
      expect(cfg.srCheckTarget).toBe(500);
      expect(cfg.menteeRequirement).toBe(1);
      expect(cfg.promotionConsecutiveMonths).toBe(4);
      expect(cfg.demotionConsecutiveMonths).toBe(2);
    });

    it('should have correct config for EXPERT', () => {
      const cfg = CAREER_LEVEL_CONFIG[CareerLevel.EXPERT];
      expect(cfg.fixedSalary).toBe(1000);
      expect(cfg.planMin).toBe(8001);
      expect(cfg.planMax).toBe(10000);
      expect(cfg.srCheckMin).toBe(300);
      expect(cfg.srCheckTarget).toBe(600);
      expect(cfg.menteeRequirement).toBe(3);
      expect(cfg.demotionConsecutiveMonths).toBe(3);
    });
  });
});

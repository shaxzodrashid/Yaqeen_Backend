import { KpiAlertsService } from './kpi-alerts.service';
import {
  KpiAlertDecisionType,
  KpiAlertDecisionAction,
} from './dto/kpi-alerts.dto';
import {
  CareerLevel,
  EvaluationApprovalStatus,
  PromotionReviewAction,
  DemotionReviewAction,
} from '../sales-manager-kpi/dto/sales-manager-kpi.dto';

describe('KpiAlertsService', () => {
  let service: KpiAlertsService;
  let mockSalesManagerKpiService: any;
  let mockKnex: any;

  beforeEach(() => {
    mockSalesManagerKpiService = {
      calculateEvaluation: jest.fn(),
      reviewPromotion: jest.fn(),
      reviewDemotion: jest.fn(),
      approveSrCheck: jest.fn(),
      getEvaluationById: jest.fn(),
    };

    mockKnex = jest.fn();
    mockKnex.fn = { now: jest.fn().mockReturnValue('2026-09-06T00:00:00Z') };

    service = new KpiAlertsService(mockKnex, mockSalesManagerKpiService);
  });

  describe('getMonthPeriodInfo', () => {
    it('should correctly identify the last week of a 30-day month (e.g. day 25 is last week)', () => {
      const date = new Date(2026, 8, 25); // September 25, 2026
      const info = service.getMonthPeriodInfo(date);

      expect(info.isLastWeek).toBe(true);
      expect(info.currentDay).toBe(25);
      expect(info.totalDays).toBe(30);
      expect(info.daysRemaining).toBe(5);
    });

    it('should correctly identify non-last week days (e.g. day 10 of a 30-day month)', () => {
      const date = new Date(2026, 8, 10); // September 10, 2026
      const info = service.getMonthPeriodInfo(date);

      expect(info.isLastWeek).toBe(false);
      expect(info.currentDay).toBe(10);
      expect(info.totalDays).toBe(30);
      expect(info.daysRemaining).toBe(20);
    });
  });

  describe('getPopupAlerts', () => {
    it('returns popup payload with real-time suggestions and employee KPI cards', async () => {
      const targetMonth = '2026-09';

      mockSalesManagerKpiService.calculateEvaluation.mockResolvedValue({
        month: targetMonth,
        evaluations_calculated: 2,
        evaluations: [
          {
            id: 'eval-1',
            employee_id: 'emp-1',
            career_level: CareerLevel.JUNIOR,
            fixed_salary: 300,
            total_sales: 3500,
            deal_count: 10,
            average_check: 350,
            plan_target_min: 3000,
            plan_target_max: 3000,
            is_plan_achieved: true,
            is_sr_check_achieved: true,
            sales_bonus_amount: 350,
            total_earnings: 650,
            consecutive_successes: 2,
            consecutive_failures: 0,
            approval_status: EvaluationApprovalStatus.PROMOTION_PENDING_REVIEW,
          },
          {
            id: 'eval-2',
            employee_id: 'emp-2',
            career_level: CareerLevel.MID,
            fixed_salary: 500,
            total_sales: 1000,
            deal_count: 5,
            average_check: 200,
            plan_target_min: 5000,
            plan_target_max: 6000,
            is_plan_achieved: false,
            is_sr_check_achieved: false,
            sales_bonus_amount: 0,
            total_earnings: 500,
            consecutive_successes: 0,
            consecutive_failures: 2,
            approval_status: EvaluationApprovalStatus.DEMOTION_PENDING_REVIEW,
          },
        ],
      });

      const mockEmployees = [
        {
          id: 'emp-1',
          first_name: 'Ali',
          last_name: 'Valiyev',
          phone: '+998901234567',
          career_level: CareerLevel.JUNIOR,
          fixed_salary: 300,
          mentees_count: 0,
          department_name: 'Sales Dept',
        },
        {
          id: 'emp-2',
          first_name: 'Bobur',
          last_name: 'Karimov',
          phone: '+998909876543',
          career_level: CareerLevel.MID,
          fixed_salary: 500,
          mentees_count: 0,
          department_name: 'Sales Dept',
        },
      ];

      mockKnex.mockImplementation((table: string) => {
        if (table === 'employees') {
          return {
            leftJoin: jest.fn().mockReturnThis(),
            whereIn: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue(mockEmployees),
          };
        }
        if (table === 'kpi_alerts') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(null),
            insert: jest.fn().mockResolvedValue([1]),
            update: jest.fn().mockResolvedValue(1),
            orderBy: jest.fn().mockResolvedValue([]),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
        };
      });

      const res = await service.getPopupAlerts({
        month: targetMonth,
        force_popup: true,
      });

      expect(res.month).toBe('2026-09');
      expect(res.should_popup).toBe(true);
      expect(res.summary.total_employees).toBe(2);
      expect(res.summary.pending_decisions_count).toBe(2);
      expect(res.summary.promotions_count).toBe(1);
      expect(res.summary.demotions_count).toBe(1);

      // Suggestions check
      expect(res.suggestions.length).toBe(2);
      const promoSuggestion = res.suggestions.find(
        (s) => s.decision_type === KpiAlertDecisionType.PROMOTION,
      );
      expect(promoSuggestion).toBeDefined();
      expect(promoSuggestion?.suggested_level).toBe(CareerLevel.MID);
      expect(promoSuggestion?.suggested_salary).toBe(500); // Standard salary for MID level

      const demoSuggestion = res.suggestions.find(
        (s) => s.decision_type === KpiAlertDecisionType.DEMOTION,
      );
      expect(demoSuggestion).toBeDefined();
      expect(demoSuggestion?.suggested_level).toBe(CareerLevel.JUNIOR);
      expect(demoSuggestion?.suggested_salary).toBe(300); // Standard salary for JUNIOR level
    });
  });

  describe('decideAlert', () => {
    it('executes promotion approval and triggers salary update', async () => {
      mockSalesManagerKpiService.reviewPromotion.mockResolvedValue({
        id: 'eval-1',
        career_level: CareerLevel.MID,
        fixed_salary: 500,
        approval_status: EvaluationApprovalStatus.PROMOTION_APPROVED,
      });

      const alertUpdateMock = jest.fn().mockResolvedValue(1);
      mockKnex.mockImplementation((table: string) => {
        if (table === 'kpi_alerts') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'alert-1',
              evaluation_id: 'eval-1',
            }),
            update: alertUpdateMock,
          };
        }
        return { where: jest.fn().mockReturnThis() };
      });

      const result = await service.decideAlert(
        {
          alert_id: 'alert-1',
          decision_type: KpiAlertDecisionType.PROMOTION,
          action: KpiAlertDecisionAction.APPROVE,
          update_salary: true,
          new_salary: 500,
          review_notes: 'Promoted by CEO with salary raise to $500',
        },
        'user-ceo-1',
      );

      expect(mockSalesManagerKpiService.reviewPromotion).toHaveBeenCalledWith(
        'eval-1',
        'user-ceo-1',
        {
          action: PromotionReviewAction.APPROVE_PROMOTION,
          update_salary: true,
          new_salary: 500,
          review_notes: 'Promoted by CEO with salary raise to $500',
        },
      );
      expect(result.action).toBe(KpiAlertDecisionAction.APPROVE);
    });

    it('executes demotion approval and triggers salary adjustment', async () => {
      mockSalesManagerKpiService.reviewDemotion.mockResolvedValue({
        id: 'eval-2',
        career_level: CareerLevel.JUNIOR,
        fixed_salary: 300,
        approval_status: EvaluationApprovalStatus.DEMOTION_APPROVED,
      });

      const alertUpdateMock = jest.fn().mockResolvedValue(1);
      mockKnex.mockImplementation((table: string) => {
        if (table === 'kpi_alerts') {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'alert-2',
              evaluation_id: 'eval-2',
            }),
            update: alertUpdateMock,
          };
        }
        return { where: jest.fn().mockReturnThis() };
      });

      const result = await service.decideAlert(
        {
          alert_id: 'alert-2',
          decision_type: KpiAlertDecisionType.DEMOTION,
          action: KpiAlertDecisionAction.APPROVE,
          update_salary: true,
          new_salary: 300,
          review_notes: 'Demoted by CEO with salary adjusted to $300',
        },
        'user-ceo-1',
      );

      expect(mockSalesManagerKpiService.reviewDemotion).toHaveBeenCalledWith(
        'eval-2',
        'user-ceo-1',
        {
          action: DemotionReviewAction.APPROVE_DEMOTION,
          update_salary: true,
          new_salary: 300,
          review_notes: 'Demoted by CEO with salary adjusted to $300',
        },
      );
      expect(result.action).toBe(KpiAlertDecisionAction.APPROVE);
    });
  });

  describe('bulkDecideAlerts', () => {
    it('processes batch of decisions in single transaction call', async () => {
      const decideAlertSpy = jest
        .spyOn(service, 'decideAlert')
        .mockResolvedValue({
          message: 'Success',
          decision_type: KpiAlertDecisionType.PROMOTION,
          action: KpiAlertDecisionAction.APPROVE,
        } as any);

      const bulkDto = {
        month: '2026-09',
        update_salaries: true,
        decisions: [
          {
            evaluation_id: 'eval-1',
            decision_type: KpiAlertDecisionType.PROMOTION,
            action: KpiAlertDecisionAction.APPROVE,
          },
          {
            evaluation_id: 'eval-2',
            decision_type: KpiAlertDecisionType.DEMOTION,
            action: KpiAlertDecisionAction.APPROVE,
          },
        ],
      };

      const result = await service.bulkDecideAlerts(bulkDto, 'user-ceo-1');

      expect(result.total_requested).toBe(2);
      expect(result.successful_count).toBe(2);
      expect(result.failed_count).toBe(0);
      expect(decideAlertSpy).toHaveBeenCalledTimes(2);
    });
  });
});

# KPI Calculation, Promotion & Demotion Alert System API Documentation

This document provides production-grade documentation for the **KPI Calculation, Promotion, and Demotion Alert System** in Yaqeen ERP Backend.

---

## 1. Overview & Business Workflow

The Alert System is designed to solve three critical executive governance needs:

1. **Month-End Pop-up Trigger**: In the **last week of each month** (calendar days 22–31 or the last 7 calendar days of the month), the system surfaces an interactive review pop-up for the CEO and ROP containing real-time KPI evaluations of all active employees.
2. **Live Updates ("Keep the updates on them")**: As ongoing shipments, deals, and client payment confirmations are recorded throughout the final week, the KPI figures, bonuses, and earnings stay dynamically up-to-date upon every query.
3. **Promotion & Demotion Suggestions with Direct CEO Decisions**:
   - **Promotion**: When an employee fulfills consecutive success goals, average check, and mentee quotas, a promotion recommendation is generated with a proposed new rank and standard/custom base salary.
   - **Demotion**: When an employee suffers consecutive failures, a demotion escalation is generated with a proposed lower rank and adjusted base salary.
   - **CEO Approval**: The CEO can directly approve or reject promotions, demotions, and average check exceptions with one click, **including explicit approval of the employee's updated fixed salary**.

---

## 2. Authentication & Authorization

All endpoints require JWT Bearer authentication and valid user permissions:

```http
Authorization: Bearer <access_token>
```

- **Guards**: `JwtAuthGuard`, `PermissionsGuard`
- **CEO Role**: Has global system override permissions and can approve/reject any decision directly.

---

## 3. Endpoints Reference

### 1. Month-End KPI Pop-up Data: `GET /api/v1/kpi-alerts/popup`

Returns real-time KPI metrics, period details, pending executive suggestions, and the full employee performance list.

#### Query Parameters:

| Param         | Type      | Required | Default             | Description                                                                      |
| :------------ | :-------- | :------- | :------------------ | :------------------------------------------------------------------------------- |
| `month`       | `string`  | No       | Current (`YYYY-MM`) | Target month format `YYYY-MM`.                                                   |
| `force_popup` | `boolean` | No       | `false`             | When `true`, forces `should_popup: true` even if outside the calendar last week. |

#### Response Schema:

```json
{
  "month": "2026-09",
  "is_last_week": true,
  "should_popup": true,
  "period": {
    "start_date": "2026-09-01",
    "end_date": "2026-09-30",
    "last_week_start": "2026-09-24",
    "current_day": 26,
    "total_days": 30,
    "days_remaining": 4
  },
  "summary": {
    "total_employees": 12,
    "total_kpi_bonus": 14250.0,
    "pending_decisions_count": 3,
    "promotions_count": 1,
    "demotions_count": 1,
    "sr_check_approvals_count": 1
  },
  "suggestions": [
    {
      "alert_id": "8b08ffae-967f-4f30-b384-e9185a49c6cb",
      "evaluation_id": "017830aa-b934-45e3-9975-ad38e9da32a3",
      "employee_id": "b9687e5b-b9b5-4b53-b09e-3d1223e7bfb5",
      "employee_name": "Aziz Rahimov",
      "department_name": "Sales Department",
      "phone": "+998901234567",
      "decision_type": "PROMOTION",
      "current_level": "JUNIOR",
      "suggested_level": "MID",
      "current_salary": 300.0,
      "suggested_salary": 500.0,
      "approval_status": "PROMOTION_PENDING_REVIEW",
      "consecutive_successes": 2,
      "consecutive_failures": 0,
      "mentees_count": 0,
      "mentees_required": 0,
      "metrics": {
        "total_sales": 3200.0,
        "deal_count": 10,
        "average_check": 320.0,
        "plan_target_min": 3000.0,
        "plan_target_max": 3000.0,
        "sales_bonus_amount": 320.0,
        "total_earnings": 620.0,
        "is_plan_achieved": true,
        "is_sr_check_achieved": true
      }
    },
    {
      "alert_id": "c1f7b09e-1111-4f4f-b888-abcdef123456",
      "evaluation_id": "99281726-ccbb-4112-a123-112233445566",
      "employee_id": "d8e7c6b5-a432-4111-b222-998877665544",
      "employee_name": "Jasur Bek",
      "department_name": "Sales Department",
      "phone": "+998909876543",
      "decision_type": "DEMOTION",
      "current_level": "MID",
      "suggested_level": "JUNIOR",
      "current_salary": 500.0,
      "suggested_salary": 300.0,
      "approval_status": "DEMOTION_PENDING_REVIEW",
      "consecutive_successes": 0,
      "consecutive_failures": 2,
      "mentees_count": 0,
      "mentees_required": 0,
      "metrics": {
        "total_sales": 1200.0,
        "deal_count": 4,
        "average_check": 300.0,
        "plan_target_min": 5000.0,
        "plan_target_max": 6000.0,
        "sales_bonus_amount": 0.0,
        "total_earnings": 500.0,
        "is_plan_achieved": false,
        "is_sr_check_achieved": false
      }
    }
  ],
  "employees_kpi": [
    {
      "evaluation_id": "017830aa-...",
      "employee_id": "b9687e5b-...",
      "employee_name": "Aziz Rahimov",
      "department_name": "Sales Department",
      "career_level": "JUNIOR",
      "fixed_salary": 300.0,
      "total_sales": 3200.0,
      "deal_count": 10,
      "average_check": 320.0,
      "plan_target_min": 3000.0,
      "plan_target_max": 3000.0,
      "plan_progress_percentage": 106.67,
      "is_plan_achieved": true,
      "is_sr_check_achieved": true,
      "sales_bonus_amount": 320.0,
      "paid_sales_bonus_amount": 250.0,
      "unpaid_sales_bonus_amount": 70.0,
      "additional_bonus_amount": 0.0,
      "total_earnings": 620.0,
      "consecutive_successes": 2,
      "consecutive_failures": 0,
      "approval_status": "PROMOTION_PENDING_REVIEW",
      "reviewed_by": null,
      "review_notes": null
    }
  ]
}
```

---

### 2. Single Decision Action: `POST /api/v1/kpi-alerts/decide`

Executes the CEO's decision directly from the pop-up modal.

#### Request Body:

| Field           | Type            | Required | Description                                                                                                                          |
| :-------------- | :-------------- | :------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `evaluation_id` | `string (UUID)` | Yes*     | Monthly evaluation ID (*or `alert_id`).                                                                                              |
| `alert_id`      | `string (UUID)` | Yes*     | Alert record ID.                                                                                                                     |
| `decision_type` | `string`        | Yes      | `PROMOTION`, `DEMOTION`, `SR_CHECK`, or `KPI`.                                                                                       |
| `action`        | `string`        | Yes      | `APPROVE`, `REJECT`, or `MAINTAIN`.                                                                                                  |
| `update_salary` | `boolean`       | No       | Default: `true`. Explicit approval to update the employee's `fixed_salary` in `employees`.                                           |
| `new_salary`    | `number`        | No       | Optional custom salary override. If omitted and `update_salary` is `true`, applies standard base salary for the target career level. |
| `review_notes`  | `string`        | No       | Reviewer notes logged in the audit trail.                                                                                            |

#### Example: Approve Promotion with Salary Raise

```http
POST /api/v1/kpi-alerts/decide
Content-Type: application/json

{
  "evaluation_id": "017830aa-b934-45e3-9975-ad38e9da32a3",
  "decision_type": "PROMOTION",
  "action": "APPROVE",
  "update_salary": true,
  "new_salary": 500.00,
  "review_notes": "Promoted to Mid level by CEO with $500 salary approved."
}
```

#### Example: Approve Demotion with Salary Adjustment

```http
POST /api/v1/kpi-alerts/decide
Content-Type: application/json

{
  "evaluation_id": "99281726-ccbb-4112-a123-112233445566",
  "decision_type": "DEMOTION",
  "action": "APPROVE",
  "update_salary": true,
  "new_salary": 300.00,
  "review_notes": "Demoted to Junior level by CEO with $300 salary adjusted."
}
```

---

### 3. Bulk Decisions: `POST /api/v1/kpi-alerts/bulk-decide`

Allows the CEO to process multiple or all pending recommendations in a single batch.

#### Request Body:

```json
{
  "month": "2026-09",
  "update_salaries": true,
  "decisions": [
    {
      "evaluation_id": "017830aa-b934-45e3-9975-ad38e9da32a3",
      "decision_type": "PROMOTION",
      "action": "APPROVE",
      "update_salary": true,
      "new_salary": 500.0,
      "review_notes": "Bulk approved by CEO"
    },
    {
      "evaluation_id": "99281726-ccbb-4112-a123-112233445566",
      "decision_type": "DEMOTION",
      "action": "MAINTAIN",
      "review_notes": "Given another chance by CEO"
    }
  ]
}
```

#### Response:

```json
{
  "total_requested": 2,
  "successful_count": 2,
  "failed_count": 0,
  "results": [ ... ],
  "errors": []
}
```

---

### 4. Dismiss Pop-up Alert: `POST /api/v1/kpi-alerts/:id/dismiss`

Marks an alert as dismissed so it does not repeatedly trigger the pop-up modal once acknowledged.

---

### 5. Dedicated Promotion Review: `POST /api/v1/sales-manager-kpi/evaluations/:id/review-promotion`

Dedicated endpoint on `SalesManagerKpiController`.

#### Request Body:

```json
{
  "action": "APPROVE_PROMOTION", // "APPROVE_PROMOTION" | "REJECT_PROMOTION"
  "update_salary": true,
  "new_salary": 500.0,
  "review_notes": "Approved by CEO"
}
```

---

### 6. Dedicated Demotion Review: `POST /api/v1/sales-manager-kpi/evaluations/:id/review-demotion`

Dedicated endpoint on `SalesManagerKpiController`.

#### Request Body:

```json
{
  "action": "APPROVE_DEMOTION", // "APPROVE_DEMOTION" | "MAINTAIN_LEVEL"
  "update_salary": true,
  "new_salary": 300.0,
  "review_notes": "Demoted with salary adjusted to $300"
}
```

---

## 4. Career Level & Base Salary Matrix

| Career Level | Standard Base Salary | Plan Target Min (Margin USD) | Plan Target Max | Sr Check Min | Promotion Consecutive Months Required | Demotion Consecutive Months Threshold | Next Level |
| :----------- | :------------------- | :--------------------------- | :-------------- | :----------- | :------------------------------------ | :------------------------------------ | :--------- |
| **`JUNIOR`** | **$300**             | $0                           | $3,000          | $150         | 2 months                              | N/A (Lowest)                          | `MID`      |
| **`MID`**    | **$500**             | $5,000                       | $6,000          | $200         | 3 months                              | 2 months                              | `SENIOR`   |
| **`SENIOR`** | **$700**             | $6,001                       | $8,000          | $250         | 4 months                              | 2 months                              | `EXPERT`   |
| **`EXPERT`** | **$1,000**           | $8,001                       | $10,000         | $300         | N/A (Highest)                         | 3 months                              | None       |

---

## 5. Automated Scheduler (`KpiAlertsSchedulerService`)

- **Cron Schedule**: `@Cron(CronExpression.EVERY_DAY_AT_9AM)` (Every day at 09:00 AM UTC).
- **Behavior**:
  - Automatically evaluates `isLastWeekOfMonth()`.
  - When in the month-end window (calendar days 22–31 or last 7 calendar days), triggers real-time recalculation of employee evaluations and synchronizes alert suggestions into the `kpi_alerts` table.
  - Emits detailed logs for monitoring.

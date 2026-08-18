# Employee Plan Setting & Cargo Registration Progress Tracking API Documentation

This document provides comprehensive documentation for the **Employee Plan Setting & Progress Tracking System** in the Yaqeen Backend ERP.

---

## 1. Overview & Architecture

Employee plans are set per employee and monthly period (`YYYY-MM` or `YYYY-MM-DD`). The plan setting operates in **two distinct directions**:

1. **Direction 1: LTL Volume Plan ($m^3$)**
   - **Metric**: Cubic meters ($m^3$).
   - **Target**: `ltl_target_volume` (or `target_volume`).
   - **Actual**: Aggregated sum of `volume` ($m^3$) from **`cargo_registrations`** where `cargo_type = 'LTL'` assigned to the employee in the plan period.
   - **Progress**: Evaluated on volume achieved vs. volume target.

2. **Direction 2: FTL Financial Value Plan**
   - **Metric**: Monetary value / Sales revenue.
   - **Target**: `ftl_target_amount` (or `target_amount`).
   - **Currency**: Specified currency (`USD`, `UZS`, `RUB`, `RMB`, `CNY`), **defaults to `USD`**.
   - **Actual**: Aggregated sum of `sell_price` from **`cargo_registrations`** where `cargo_type = 'FTL'` assigned to the employee in the plan period, converted to the plan currency using historical/current CBU and snapshot exchange rates.
   - **Progress**: Evaluated on financial revenue achieved vs. financial target.

3. **Data Source Dependency**:
   - Plan fulfillment **entirely depends on the `cargo_registrations` table** in PostgreSQL.
   - Cargo registrations are matched by `employee_id` and registration dates (`confirmed_date`, `created_at`, `sell_date`) falling within the plan month.

---

## 2. Authentication & Authorization

All endpoints require JWT Bearer authentication and valid module permissions:

```http
Authorization: Bearer <your_access_token>
```

### Module Permissions:

- `cargo_kpi:read`: View plans, progress leaderboard, personal stats, and aggregated statistics.
- `cargo_kpi:create`: Create employee plans.
- `cargo_kpi:update`: Update employee plan targets, currency, and period.
- `cargo_kpi:delete`: Delete employee plans.

---

## 3. Endpoints Summary

| Method   | Endpoint                                  | Description                                                                          |
| :------- | :---------------------------------------- | :----------------------------------------------------------------------------------- |
| `GET`    | **`/cargo-kpi/plans`**                    | Returns employee plans, two-direction progress tracking, and leaderboard.            |
| `POST`   | **`/cargo-kpi/plans`**                    | Creates a new employee plan (LTL volume target + FTL financial target).              |
| `PUT`    | **`/cargo-kpi/plans/:id`**                | Updates plan targets (LTL volume, FTL financial value, currency, period).            |
| `DELETE` | **`/cargo-kpi/plans/:id`**                | Deletes an employee plan.                                                            |
| `GET`    | **`/cargo-kpi/plans/stats`**              | Returns aggregated organizational plan statistics and department breakdown.          |
| `GET`    | **`/cargo-kpi/plans/employee/:id/stats`** | Returns personal plan statistics, lifetime totals, and month-by-month history.       |
| `GET`    | **`/cargo-registrations/stats`**          | Returns summary statistics for cargo registrations (LTL, FTL, financials, managers). |

---

## 4. Detailed Endpoint Specifications

### 4.1. Get Employee Plans Progress & Leaderboard

#### `GET /cargo-kpi/plans`

#### Query Parameters:

- `employee_id` (optional, UUID): Filter by employee ID.
- `period` (optional, string): Filter by period (`YYYY-MM` or `YYYY-MM-DD`).
- `search` (optional, string): Search employee name or department.

#### Response (200 OK):

```json
{
  "total_plans": 2,
  "leaderboard": [
    {
      "id": "e4a7b7a2-1111-4444-9999-000000000001",
      "employee_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "employee_name": "Jasur Yoldoshev",
      "department_name": "Sales",
      "color": "#336699",
      "period": "2026-08-01",
      "currency": "USD",
      "ltl_plan": {
        "target_volume": 100,
        "actual_volume": 85.5,
        "remaining_volume": 14.5,
        "completion_percentage": 85.5,
        "is_completed": false,
        "cargo_count": 6
      },
      "ftl_plan": {
        "target_amount": 50000,
        "currency": "USD",
        "actual_amount": 55000,
        "remaining_amount": 0,
        "completion_percentage": 110.0,
        "is_completed": true,
        "cargo_count": 4
      },
      "total_cargos_count": 10,
      "overall_completion_percentage": 97.75,
      "is_completed": false,
      "ltl_target_volume": 100,
      "ltl_actual_volume": 85.5,
      "ftl_target_amount": 50000,
      "ftl_actual_amount": 55000,
      "target_amount": 50000,
      "actual_sales": 55000,
      "remaining_amount": 0,
      "target_volume": 100,
      "actual_volume": 85.5,
      "remaining_volume": 14.5,
      "completion_percentage": 97.75
    }
  ]
}
```

---

### 4.2. Create Employee Plan

#### `POST /cargo-kpi/plans`

#### Request Body:

```json
{
  "employee_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "ltl_target_volume": 100,
  "ftl_target_amount": 50000,
  "currency": "USD",
  "period": "2026-08"
}
```

#### Fields Description:

- `employee_id` (string, required, UUID): Target employee ID.
- `ltl_target_volume` (number, optional, $\ge 0$): Volume target in $m^3$ for LTL cargos (default `0`).
- `ftl_target_amount` (number, optional, $\ge 0$): Financial sales target for FTL cargos (default `0`).
- `currency` (string, optional, enum: `USD`, `UZS`, `RUB`, `RMB`, `CNY`): FTL financial plan currency (default `USD`).
- `period` (string, required): Plan target month in `YYYY-MM` or `YYYY-MM-DD` format.

#### Response (201 Created):

Returns the updated plans progress and leaderboard response.

---

### 4.3. Update Employee Plan

#### `PUT /cargo-kpi/plans/:id`

#### Request Body (All fields optional):

```json
{
  "ltl_target_volume": 120,
  "ftl_target_amount": 60000,
  "currency": "USD",
  "period": "2026-08"
}
```

#### Response (200 OK):

Returns the updated plans progress and leaderboard response.

---

### 4.4. Delete Employee Plan

#### `DELETE /cargo-kpi/plans/:id`

#### Response (200 OK):

Returns the updated plans progress and leaderboard response.

---

### 4.5. Aggregated Plans Statistics & Department Breakdown

#### `GET /cargo-kpi/plans/stats` (or `GET /cargo-kpi/plans/statistics`)

#### Query Parameters:

- `period` (optional, string): Filter by month (`YYYY-MM`).
- `employee_id` (optional, UUID): Filter by employee.
- `search` (optional, string): Search by employee name or department.

#### Response (200 OK):

```json
{
  "period": "2026-08",
  "currency": "USD",
  "summary": {
    "total_plans": 12,
    "completed_plans_count": 5,
    "in_progress_plans_count": 7,
    "overall_completion_percentage": 88.4,
    "total_cargos_registered": 142
  },
  "ltl_statistics": {
    "total_target_volume": 1200,
    "total_actual_volume": 1050.4,
    "total_remaining_volume": 149.6,
    "completion_percentage": 87.53,
    "total_cargo_count": 86,
    "avg_volume_per_cargo": 12.21
  },
  "ftl_statistics": {
    "total_target_amount": 450000,
    "total_actual_amount": 420000,
    "total_remaining_amount": 30000,
    "completion_percentage": 93.33,
    "currency": "USD",
    "total_cargo_count": 56,
    "avg_amount_per_cargo": 7500.0
  },
  "leaderboard": [
    {
      "rank": 1,
      "id": "plan-uuid-1",
      "employee_id": "emp-uuid-1",
      "employee_name": "Jasur Yoldoshev",
      "department_name": "Sales",
      "color": "#336699",
      "period": "2026-08-01",
      "currency": "USD",
      "ltl_plan": {
        "target_volume": 100,
        "actual_volume": 120,
        "remaining_volume": 0,
        "completion_percentage": 120.0,
        "is_completed": true,
        "cargo_count": 8
      },
      "ftl_plan": {
        "target_amount": 50000,
        "currency": "USD",
        "actual_amount": 60000,
        "remaining_amount": 0,
        "completion_percentage": 120.0,
        "is_completed": true,
        "cargo_count": 5
      },
      "total_cargos_count": 13,
      "overall_completion_percentage": 120.0,
      "is_completed": true
    }
  ],
  "department_breakdown": [
    {
      "department_name": "Sales",
      "employees_count": 6,
      "ltl_target_volume": 600,
      "ltl_actual_volume": 580.5,
      "ftl_target_amount": 250000,
      "ftl_actual_amount": 240000,
      "total_cargos": 74,
      "ltl_completion_percentage": 96.75,
      "ftl_completion_percentage": 96.0,
      "currency": "USD"
    },
    {
      "department_name": "Sborniy",
      "employees_count": 4,
      "ltl_target_volume": 400,
      "ltl_actual_volume": 350,
      "ftl_target_amount": 100000,
      "ftl_actual_amount": 90000,
      "total_cargos": 42,
      "ltl_completion_percentage": 87.5,
      "ftl_completion_percentage": 90.0,
      "currency": "USD"
    }
  ]
}
```

---

### 4.6. Personal Employee Plan Performance & History

#### `GET /cargo-kpi/plans/employee/:id/stats`

#### Query Parameters:

- `period` (optional, string): Current period to inspect (`YYYY-MM`).

#### Response (200 OK):

```json
{
  "employee": {
    "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "first_name": "Jasur",
    "last_name": "Yoldoshev",
    "full_name": "Jasur Yoldoshev",
    "department_name": "Sales",
    "color": "#336699"
  },
  "current_plan": {
    "id": "plan-uuid-1",
    "employee_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "period": "2026-08-01",
    "currency": "USD",
    "ltl_plan": {
      "target_volume": 100,
      "actual_volume": 90,
      "remaining_volume": 10,
      "completion_percentage": 90.0,
      "is_completed": false,
      "cargo_count": 7
    },
    "ftl_plan": {
      "target_amount": 50000,
      "currency": "USD",
      "actual_amount": 48000,
      "remaining_amount": 2000,
      "completion_percentage": 96.0,
      "is_completed": false,
      "cargo_count": 4
    },
    "total_cargos_count": 11,
    "overall_completion_percentage": 93.0,
    "is_completed": false
  },
  "totals": {
    "total_plans_set": 6,
    "plans_completed": 5,
    "total_ltl_volume_achieved": 580.4,
    "total_ftl_sales_achieved": 310000.0,
    "currency": "USD",
    "total_cargos_registered": 68
  },
  "history": [/* Array of historical monthly plan items */]
}
```

---

### 4.7. Cargo Registrations Summary Statistics

#### `GET /cargo-registrations/stats` (or `GET /cargo-registrations/stats/summary`)

#### Query Parameters (All optional):

- `status` (string): Filter by order status (`Waiting`, `Station`, `On the way`, `On the border`, `Reload`, `Arrived`).
- `employee_id` (UUID): Filter by assigned sales manager.
- `client_id` (UUID): Filter by customer client.
- `cargo_type` (string): `LTL` or `FTL`.
- `created_start_date` / `created_end_date` (`YYYY-MM-DD`).

#### Response (200 OK):

```json
{
  "summary": {
    "total_cargos": 142,
    "gross_sales_revenue": {
      "UZS": 120000000,
      "USD": 450000,
      "RUB": 350000,
      "RMB": 80000,
      "total_usd_equivalent": 472500.0,
      "total_uzs_equivalent": 6071625000.0
    },
    "calculated_net_yield": {
      "USD": 75000.0,
      "UZS": 963750000.0,
      "total_usd": 75000.0,
      "total_uzs": 963750000.0
    }
  },
  "ltl_statistics": {
    "total_count": 86,
    "total_volume_m3": 1050.4,
    "total_weight_kg": 125000.0,
    "avg_volume_m3": 12.21,
    "avg_weight_kg": 1453.49
  },
  "ftl_statistics": {
    "total_count": 56,
    "container_type_distribution": {
      "40HQ": 32,
      "20GP": 14,
      "Ref Fura": 10
    }
  },
  "status_distribution": {
    "Waiting": 15,
    "Station": 20,
    "On the way": 45,
    "On the border": 12,
    "Reload": 5,
    "Arrived": 45
  },
  "by_manager": [
    {
      "employee_name": "Jasur Yoldoshev",
      "total_cargos": 35,
      "ltl_cargos": 20,
      "ltl_volume": 250.5,
      "ftl_cargos": 15,
      "gross_sales_usd": 125000.0,
      "net_yield_usd": 22000.0
    }
  ]
}
```

---

## 5. Database Schema & Migration

### Table: `employee_plans`

| Column              | Type            | Default              | Constraints                                               | Description                                     |
| :------------------ | :-------------- | :------------------- | :-------------------------------------------------------- | :---------------------------------------------- |
| `id`                | `UUID`          | `uuid_generate_v4()` | `PRIMARY KEY`                                             | Unique plan ID.                                 |
| `employee_id`       | `UUID`          | -                    | `NOT NULL`, `REFERENCES employees(id) ON DELETE CASCADE`  | Assigned employee reference.                    |
| `ltl_target_volume` | `DECIMAL(12,4)` | `0.0000`             | `NOT NULL`                                                | Direction 1 target volume in $m^3$ for LTL.     |
| `ftl_target_amount` | `DECIMAL(14,2)` | `0.00`               | `NOT NULL`                                                | Direction 2 target financial value for FTL.     |
| `target_amount`     | `DECIMAL(14,2)` | `0.00`               | `NULLABLE`                                                | Synchronized backward-compatible target column. |
| `currency`          | `VARCHAR(10)`   | `'USD'`              | `CHECK (currency IN ('UZS', 'USD', 'RUB', 'RMB', 'CNY'))` | Financial currency for FTL plan.                |
| `period`            | `DATE`          | -                    | `NOT NULL`                                                | First day of target month (`YYYY-MM-01`).       |
| `created_at`        | `TIMESTAMP`     | `NOW()`              | `NOT NULL`                                                | Creation timestamp.                             |
| `updated_at`        | `TIMESTAMP`     | `NOW()`              | `NOT NULL`                                                | Last update timestamp.                          |

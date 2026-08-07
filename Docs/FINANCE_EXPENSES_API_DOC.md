# Finance & Expenses Module API Documentation

This document provides complete technical documentation for the **Finance & Expenses Module** in the Yaqeen Backend ERP.

The module provides end-to-end management for operational expenses, department-based fixed employee salaries, gross/net profit analytics, SEO pure profit sharing (10%), and month-over-month (MoM) comparative growth metrics.

---

## 1. Authentication & Base URL

- **Base Path**: `/api/v1/finance`
- **Authentication**: All endpoints require a valid JWT Bearer token passed in the HTTP authorization header:
  ```http
  Authorization: Bearer <your_access_token>
  ```

---

## 2. Core Financial Engine & Equations

### Metrics & Formulas

1. **Gross Revenue ($R$)**:
   $$\text{Gross Revenue} = \sum \text{sell\_price (from cargo\_transactions for period)}$$

2. **Cost of Shipping/Goods ($COGS$)**:
   $$\text{COGS} = \sum \text{buy\_price (from cargo\_transactions for period)}$$

3. **Gross Margin / Gross Profit ($G$)**:
   $$\text{Gross Margin} = \sum \text{margin (from cargo\_transactions for period)}$$

4. **Total Operational Expenses ($E_{op}$)**:
   $$E_{op} = \sum \text{amount (from expenses table for period)}$$

5. **Fixed Salary Burden ($E_{sal}$)**:
   $$E_{sal} = \sum \text{fixed\_salary (for all active employees)}$$

6. **Cargo KPI Bonuses ($E_{kpi}$)**:
   $$E_{kpi} = \sum \text{kpi\_bonus (from cargo\_transactions for period)}$$

7. **Total All-In Expenses ($E_{total}$)**:
   $$E_{total} = E_{op} + E_{sal} + E_{kpi}$$

8. **Net Profit ($P_{net}$)**:
   $$P_{net} = G - E_{total}$$

9. **SEO Pure Profit Cut ($P_{seo}$ - 10%)**:
   $$P_{seo} = \begin{cases} P_{net} \times 0.10 & \text{if } P_{net} > 0 \\ 0 & \text{otherwise} \end{cases}$$

10. **Period Growth % ($G_{\%}$)**:
    $$G_{\%} = \frac{P_{net,\text{current}} - P_{net,\text{previous}}}{|P_{net,\text{previous}}|} \times 100$$

---

## 3. Expense Categories

The system categorizes operational costs into 6 predefined business expense categories:

| Category Key    | Display Label             | Description                                     |
| :-------------- | :------------------------ | :---------------------------------------------- |
| `tax`           | Taxes (Nalog)             | Government taxes, official fees, legal payments |
| `utility`       | Utilities (Svet/Kommunal) | Electricity, internet, water, office utilities  |
| `rent`          | Rent (Arenda)             | Office space rent, warehouse space rent         |
| `salary_payout` | Salary Payouts (Maosh)    | Manual cash or card salary payouts              |
| `cleaner`       | Cleaning (Uborshchitsa)   | Office cleaning services, sanitation supplies   |
| `other`         | Other Expenses (Prochiy)  | Miscellaneous unclassified operational costs    |

---

## 4. Endpoints Overview

### A. Finance Summary & Analytics

#### `GET /api/v1/finance/summary`

Calculates financial breakdown, net profit, SEO cut, expense breakdown by category, and period-over-period comparison.

**Query Parameters**:

- `period` (optional): `YYYY-MM` string (e.g. `2026-07`). Defaults to current calendar month if omitted.
- `start_date` (optional): `YYYY-MM-DD` string.
- `end_date` (optional): `YYYY-MM-DD` string.

**Example Response (200 OK)**:

```json
{
  "period": {
    "start_date": "2026-07-01",
    "end_date": "2026-07-31"
  },
  "summary": {
    "gross_revenue": 8000.0,
    "cost_of_goods_sold": 5000.0,
    "gross_profit": 3000.0,
    "operational_expenses": 700.0,
    "fixed_salaries_expense": 1500.0,
    "kpi_bonuses_expense": 300.0,
    "total_payroll_expense": 1800.0,
    "total_expenses": 2500.0,
    "net_profit": 500.0,
    "seo_cut_10pc": 50.0
  },
  "expense_breakdown": {
    "utility": 200.0,
    "rent": 500.0
  },
  "comparison": {
    "previous_period": {
      "start_date": "2026-06-01",
      "end_date": "2026-06-30",
      "gross_profit": 2000.0,
      "total_expenses": 1800.0,
      "net_profit": 200.0
    },
    "net_profit_change_amount": 300.0,
    "net_profit_growth_percentage": 150.0,
    "expenses_change_amount": 700.0,
    "expenses_change_percentage": 38.89
  }
}
```

---

### B. Expense Management (CRUD)

#### `POST /api/v1/finance/expenses`

Creates a new expense record.

> [!IMPORTANT]
> When `category` is set to `salary_payout` (Salary Payouts / Maosh), the `employee_id` field is **MANDATORY** and must belong to an existing employee record. For other categories (`tax`, `utility`, `rent`, `cleaner`, `other`), `employee_id` is optional.

**Request Body (Salary Payout Expense)**:

```json
{
  "category": "salary_payout",
  "amount": 1500.0,
  "currency": "UZS",
  "employee_id": "6cb65b0a-9113-4add-9d7b-02151dbc8d94",
  "description": "July monthly salary payout",
  "expense_date": "2026-07-24"
}
```

**Request Body (Standard Expense)**:

```json
{
  "category": "tax",
  "amount": 350.5,
  "description": "Quarterly corporate income tax payment",
  "expense_date": "2026-07-10"
}
```

**Response (201 Created)**:

```json
{
  "id": "2443d243-43e0-4ae4-83aa-0e045c78319d",
  "category": "salary_payout",
  "amount": 1500,
  "currency": "UZS",
  "employee_id": "6cb65b0a-9113-4add-9d7b-02151dbc8d94",
  "description": "July monthly salary payout",
  "expense_date": "2026-07-24",
  "created_at": "2026-07-24T12:35:08.339Z",
  "updated_at": "2026-07-24T12:35:08.339Z"
}
```

**Error Responses**:

- `400 Bad Request` if `category` is `salary_payout` and `employee_id` is omitted:
  ```json
  {
    "statusCode": 400,
    "message": "employee_id is required when category is salary_payout",
    "location": "employee_id_required"
  }
  ```
- `404 Not Found` if `employee_id` does not exist in the database:
  ```json
  {
    "statusCode": 404,
    "message": "Employee not found",
    "location": "employee_not_found"
  }
  ```

---

#### `GET /api/v1/finance/expenses`

Lists expenses with filtering, search, pagination, and total sum calculation.

**Query Parameters**:

- `category` (optional): Filter by category (`tax`, `utility`, `rent`, `salary_payout`, `cleaner`, `other`)
- `employee_id` (optional): Filter by specific employee UUID
- `start_date` (optional): Filter by `expense_date >= start_date`
- `end_date` (optional): Filter by `expense_date <= end_date`
- `search` (optional): Case-insensitive search inside description
- `page` (optional, default `1`): Page number
- `limit` (optional, default `20`): Page size
- `sort_by` (optional, default `expense_date`): Field to sort by (`expense_date`, `amount`, `category`, `created_at`)
- `order` (optional, default `desc`): Sort order (`asc`, `desc`)

**Response (200 OK)**:

```json
{
  "data": [
    {
      "id": "2443d243-43e0-4ae4-83aa-0e045c78319d",
      "category": "salary_payout",
      "amount": 1500,
      "currency": "UZS",
      "employee_id": "6cb65b0a-9113-4add-9d7b-02151dbc8d94",
      "description": "July monthly salary payout",
      "expense_date": "2026-07-24",
      "created_at": "2026-07-24T12:35:08.339Z",
      "updated_at": "2026-07-24T12:35:08.339Z"
    }
  ],
  "total_sum": 1500,
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

#### `GET /api/v1/finance/expenses/categories`

Returns summary breakdown for all 6 expense categories for a specified period.

**Query Parameters**:

- `period` (optional): `YYYY-MM`
- `start_date` (optional): `YYYY-MM-DD`
- `end_date` (optional): `YYYY-MM-DD`

**Response (200 OK)**:

```json
{
  "period_start": "2026-07-01",
  "period_end": "2026-07-31",
  "grand_total": 350.5,
  "categories": [
    {
      "category": "tax",
      "label": "Taxes (Nalog)",
      "description": "Government taxes, tax transfers, official fees",
      "total_amount": 350.5,
      "expense_count": 1
    },
    {
      "category": "utility",
      "label": "Utilities (Svet/Kommunal)",
      "description": "Electricity, internet, water, office utilities",
      "total_amount": 0,
      "expense_count": 0
    }
  ]
}
```

---

#### `GET /api/v1/finance/expenses/:id`

Gets single expense details by UUID.

**Response (200 OK)**:

```json
{
  "id": "2443d243-43e0-4ae4-83aa-0e045c78319d",
  "category": "salary_payout",
  "amount": 1500,
  "currency": "UZS",
  "employee_id": "6cb65b0a-9113-4add-9d7b-02151dbc8d94",
  "description": "July monthly salary payout",
  "expense_date": "2026-07-24",
  "created_at": "2026-07-24T12:35:08.339Z",
  "updated_at": "2026-07-24T12:35:08.339Z"
}
```

---

#### `PATCH /api/v1/finance/expenses/:id`

Updates an existing expense. If category is updated or maintained as `salary_payout`, `employee_id` must be present and valid.

**Request Body**:

```json
{
  "amount": 1600.0,
  "employee_id": "6cb65b0a-9113-4add-9d7b-02151dbc8d94"
}
```

**Response (200 OK)**: Returns updated expense object.

---

#### `DELETE /api/v1/finance/expenses/:id`

Deletes an expense.

**Response (200 OK)**:

```json
{
  "message": "Expense deleted successfully"
}
```

---

### C. Fixed Salary Management

#### `GET /api/v1/finance/salaries`

Retrieves fixed employee salaries grouped by department.

**Query Parameters**:

- `department_id` (optional): UUID of department to filter by.

**Response (200 OK)**:

```json
{
  "total_employees": 1,
  "total_active_employees": 1,
  "currency": "UZS",
  "total_monthly_salaries": 1500.0,
  "departments": [
    {
      "department_id": "6cb65b0a-9113-4add-9d7b-02151dbc8d94",
      "department_name": "Finance Test Dept",
      "employee_count": 1,
      "total_fixed_salary": 1500.0,
      "employees": [
        {
          "id": "6cb65b0a-9113-4add-9d7b-02151dbc8d94",
          "full_name": "Jasur Yoldoshev",
          "first_name": "Jasur",
          "last_name": "Yoldoshev",
          "phone": "+998901234567",
          "department_id": "6cb65b0a-9113-4add-9d7b-02151dbc8d94",
          "department_name": "Finance Test Dept",
          "fixed_salary": 1500.0,
          "currency": "UZS",
          "is_active": true,
          "color": "#FF0000"
        }
      ]
    }
  ]
}
```

---

#### `PATCH /api/v1/finance/salaries/:employee_id`

Updates single employee's fixed salary amount and/or currency.

**Request Body**:

```json
{
  "fixed_salary": 1200.0,
  "currency": "USD"
}
```

**Response (200 OK)**: Returns updated employee salary details.

---

#### `PATCH /api/v1/finance/salaries`

Batch updates fixed salaries and/or currencies for multiple employees in a single transaction.

**Request Body**:

```json
{
  "salaries": [
    {
      "employee_id": "6cb65b0a-9113-4add-9d7b-02151dbc8d94",
      "fixed_salary": 1500.0,
      "currency": "UZS"
    }
  ]
}
```

**Response (200 OK)**: Returns full updated employee salaries list.

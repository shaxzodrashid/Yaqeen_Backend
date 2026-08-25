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

The system categorizes operational costs into 8 predefined business expense categories:

| Category Key    | Display Label                     | Description                                           |
| :-------------- | :-------------------------------- | :---------------------------------------------------- |
| `tax`           | Taxes (Nalog)                     | Government taxes, official fees, legal payments       |
| `utility`       | Utilities (Svet/Kommunal)         | Electricity, internet, water, office utilities        |
| `rent`          | Rent (Arenda)                     | Office space rent, warehouse space rent               |
| `salary_payout` | Salary Payouts (Maosh)            | Manual cash or card salary payouts                    |
| `cleaner`       | Cleaning (Uborshchitsa)           | Office cleaning services, sanitation supplies         |
| `kpi`           | KPI & Bonuses (KPI/Mukofot)       | Employee KPI payouts, performance bonuses, incentives |
| `food`          | Food & Meals (Pitanie/Oziq-ovqat) | Staff meals, office tea/coffee, snacks, food supplies |
| `other`         | Other Expenses (Prochiy)          | Miscellaneous unclassified operational costs          |

---

## 4. Endpoints Overview

### A. Finance Summary & Analytics

#### `GET /api/v1/finance/summary`

Calculates complete financial breakdown, gross/net profit, SEO cut, financial engine flow diagram, 8-category operational expense distribution, KPI bonuses burden, and month-over-month (MoM) comparative growth.

> [!IMPORTANT]
> **Decoupled Purchase & Sell Date Financial Accounting**:
> Cargo registration purchase prices are accounted for on their `purchase_date` (or `confirmed_date`), and sell prices on their `sell_date`. When `purchase_date` (e.g. July) and `sell_date` (e.g. August) fall into different months, the purchase cost is recorded in the purchase month's COGS and the sell revenue in the sell month's Gross Revenue.

**Query Parameters**:

- `period` (optional): `YYYY-MM` string (e.g. `2026-08`). Defaults to current calendar month if omitted.
- `start_date` (optional): `YYYY-MM-DD` string.
- `end_date` (optional): `YYYY-MM-DD` string.
- `currency` (optional, default: `USD`): Target normalized currency (`USD`, `UZS`, `RUB`, `RMB`, `CNY`).

**Example Response (200 OK)**:

```json
{
  "currency": "USD",
  "normalized_currency_label": "USD (US DOLLAR)",
  "period": {
    "start_date": "2026-08-01",
    "end_date": "2026-08-31"
  },
  "cbu_rates": {
    "USD": {
      "currency": "USD",
      "code": "840",
      "nominal": 1,
      "rate": 11820.4,
      "diff": -36.95,
      "date": "2026-08-19"
    },
    "RUB": {
      "currency": "RUB",
      "code": "643",
      "nominal": 1,
      "rate": 139.05,
      "diff": -0.27,
      "date": "2026-08-19"
    },
    "RMB": {
      "currency": "RMB",
      "code": "156",
      "nominal": 1,
      "rate": 1753.12,
      "diff": -6.29,
      "date": "2026-08-19"
    }
  },
  "summary": {
    "gross_revenue": 12500.0,
    "cost_of_goods_sold": 7500.0,
    "gross_profit": 5000.0,
    "gross_margin": 5000.0,
    "operational_expenses": 1200.0,
    "fixed_salaries_expense": 8600.0,
    "kpi_bonuses_expense": 800.0,
    "total_payroll_expense": 9400.0,
    "total_expenses": 10600.0,
    "total_all_in_expenses": 10600.0,
    "net_profit": -5600.0,
    "seo_cut_10pc": 0.0,
    "seo_pure_profit_share": 0.0
  },
  "flow_diagram": {
    "formula": "P_net = G - F_total (USD)",
    "gross_margin": 5000.0,
    "total_all_in_expenses": 10600.0,
    "net_profit": -5600.0,
    "all_in_expense_breakdown": {
      "total": 10600.0,
      "operational_expenses": {
        "amount": 1200.0,
        "percentage": 11.32
      },
      "salaries": {
        "amount": 8600.0,
        "percentage": 81.13
      },
      "kpi_bonuses": {
        "amount": 800.0,
        "percentage": 7.55
      }
    }
  },
  "expense_distribution": [
    {
      "category": "tax",
      "label": "Taxes (Nalog)",
      "description": "Government taxes, tax transfers, official fees",
      "amount": 200.0,
      "percentage": 16.67,
      "count": 1
    },
    {
      "category": "utility",
      "label": "Utilities (Svet/Kommunal)",
      "description": "Electricity, internet, water, office utilities",
      "amount": 300.0,
      "percentage": 25.0,
      "count": 2
    },
    {
      "category": "rent",
      "label": "Rent (Arenda)",
      "description": "Office space rent, warehouse space rent",
      "amount": 500.0,
      "percentage": 41.67,
      "count": 1
    },
    {
      "category": "salary_payout",
      "label": "Salary Payouts (Maosh)",
      "description": "Manual cash or card salary payouts",
      "amount": 0.0,
      "percentage": 0.0,
      "count": 0
    },
    {
      "category": "cleaner",
      "label": "Cleaning (Uborshchitsa)",
      "description": "Office cleaning services, sanitation supplies",
      "amount": 100.0,
      "percentage": 8.33,
      "count": 1
    },
    {
      "category": "kpi",
      "label": "KPI & Bonuses (KPI/Mukofot)",
      "description": "Employee KPI payouts, performance bonuses, incentives",
      "amount": 50.0,
      "percentage": 4.17,
      "count": 1
    },
    {
      "category": "food",
      "label": "Food & Meals (Pitanie/Oziq-ovqat)",
      "description": "Staff meals, office tea/coffee, snacks, food supplies",
      "amount": 50.0,
      "percentage": 4.17,
      "count": 1
    },
    {
      "category": "other",
      "label": "Other Expenses (Prochiy)",
      "description": "Miscellaneous unclassified operational costs",
      "amount": 0.0,
      "percentage": 0.0,
      "count": 0
    }
  ],
  "expense_breakdown": {
    "tax": 200.0,
    "utility": 300.0,
    "rent": 500.0,
    "salary_payout": 0.0,
    "cleaner": 100.0,
    "kpi": 50.0,
    "food": 50.0,
    "other": 0.0
  },
  "comparison": {
    "previous_period": {
      "start_date": "2026-07-01",
      "end_date": "2026-07-31",
      "gross_revenue": 10000.0,
      "cost_of_goods_sold": 6000.0,
      "gross_profit": 4000.0,
      "operational_expenses": 1500.0,
      "fixed_salaries_expense": 8600.0,
      "kpi_bonuses_expense": 0.0,
      "total_expenses": 10100.0,
      "net_profit": -6100.0
    },
    "net_profit_change_amount": 500.0,
    "net_profit_growth_percentage": 8.2,
    "expenses_change_amount": 500.0,
    "expenses_change_percentage": 4.95,
    "gross_profit_change_amount": 1000.0,
    "gross_profit_growth_percentage": 25.0
  }
}
```

---

### B. Expense Management (CRUD)

#### `POST /api/v1/finance/expenses`

Creates a new expense record.

> [!IMPORTANT]
> When `category` is set to `salary_payout` (Salary Payouts / Maosh), the `employee_id` field is **MANDATORY** and must belong to an existing employee record. For other categories (`tax`, `utility`, `rent`, `cleaner`, `kpi`, `food`, `other`), `employee_id` is optional.

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

- `category` (optional): Filter by category (`tax`, `utility`, `rent`, `salary_payout`, `cleaner`, `kpi`, `food`, `other`)
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

Returns summary breakdown for all 8 expense categories for a specified period.

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
    },
    {
      "category": "rent",
      "label": "Rent (Arenda)",
      "description": "Office space rent, warehouse rent",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "salary_payout",
      "label": "Salary Payouts (Maosh)",
      "description": "Manual cash or card salary payouts to staff",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "cleaner",
      "label": "Cleaning (Uborshchitsa)",
      "description": "Cleaning services, office supplies",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "kpi",
      "label": "KPI & Bonuses (KPI/Mukofot)",
      "description": "Employee KPI payouts, performance bonuses, incentives",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "food",
      "label": "Food & Meals (Pitanie/Oziq-ovqat)",
      "description": "Staff meals, office tea/coffee, snacks and food expenses",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "other",
      "label": "Other Expenses (Prochiy)",
      "description": "Miscellaneous operational expenses",
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

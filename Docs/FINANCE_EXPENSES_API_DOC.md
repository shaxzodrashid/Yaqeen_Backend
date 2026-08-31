# Finance & Expenses Module API Documentation

This document provides complete technical documentation for the **Finance & Expenses Module** in the Yaqeen Backend ERP.

The module provides end-to-end management for operational expenses segregated into **FTL** and **LTL** business sections, department-based fixed employee salaries, gross/net profit analytics, SEO pure profit sharing (10%), and month-over-month (MoM) comparative growth metrics.

---

## 1. Authentication & Base URL

- **Base Path**: `/api/v1/finance`
- **Authentication**: All endpoints require a valid JWT Bearer token passed in the HTTP authorization header:
  ```http
  Authorization: Bearer <your_access_token>
  ```

---

## 2. Core Financial Engine & Business Sections (FTL vs LTL)

The financial engine treats **FTL (Full Truck Load)** and **LTL (Less Than Truckload / Groupage)** as **two independent financial streams** with separate incomes (Gross Revenues), separate costs of goods sold (COGS), separate operational expense registrations, and separate net profits.

```
Total Company Incomes  = Gross Revenue (FTL) + Gross Revenue (LTL)
Total Company COGS     = COGS (FTL) + COGS (LTL)
Total Operational Exp  = Op Expenses (FTL) + Op Expenses (LTL)
Total Net Profit       = Net Profit (FTL) + Net Profit (LTL) - Company Shared Burden
```

---

## 3. Expense Sections & Categories

Every expense in the system is a **distinct physical record** strictly bound to either `section: 'ftl'` or `section: 'ltl'`.

> [!NOTE]
> Categories that exist in both sections (such as `Arenda`, `Oylik`, and `Pitaniya`) are **completely separate physical records**. For instance:
>
> - Spending \$300 on `food` under **FTL** is registered with `section: 'ftl'`, `category: 'food'`.
> - Spending \$600 on `food` under **LTL** is registered with `section: 'ltl'`, `category: 'food'`.
>
> They do not merge or interfere with each other; their stats, totals, and distributions appear strictly within their respective section tab.

### A. FTL Section Categories (`section: 'ftl'`)

| Category Key    | Display Label (UI) | Description                                           |
| :-------------- | :----------------- | :---------------------------------------------------- |
| `tax`           | **Nalog**          | Government taxes, official fees, legal payments       |
| `utility`       | **Komunalka**      | Electricity, internet, water, office utilities        |
| `rent`          | **Arenda**         | FTL office space rent, parking, operational rent      |
| `salary_payout` | **Oylik**          | Manual salary payouts (_`employee_id` mandatory_)     |
| `cleaner`       | **Cleaning**       | Office cleaning services, sanitation supplies         |
| `kpi`           | **KPI bonus**      | Employee KPI payouts, performance bonuses, incentives |
| `food`          | **Pitaniya**       | Staff meals, office tea/coffee, snacks, food supplies |
| `other`         | **Prochiy**        | Miscellaneous unclassified operational costs          |

### B. LTL Section Categories (`section: 'ltl'`)

| Category Key      | Display Label (UI) | Description                                            |
| :---------------- | :----------------- | :----------------------------------------------------- |
| `rent`            | **Arenda**         | LTL warehouse and consolidation facilities rent        |
| `salary_payout`   | **Oylik**          | Manual salary payouts (_`employee_id` mandatory_)      |
| `china_warehouse` | **Xitoy sklad**    | China consolidation warehouse storage & handling costs |
| `firm_service`    | **Firma usluga**   | Third-party agency fees, brokerage, partner firm fees  |
| `food`            | **Pitanya**        | Staff meals, office tea/coffee, snacks, food supplies  |
| `declarant`       | **Deklarant**      | Customs declaration processing and declarant fees      |

---

## 4. Endpoints Overview

### A. Finance Summary & Analytics

#### `GET /api/v1/finance/summary`

Calculates complete financial breakdown, gross/net profit, SEO cut, financial engine flow diagram, FTL and LTL operational expense distributions, KPI bonuses burden, and month-over-month (MoM) comparative growth.

**Query Parameters**:

- `section` (optional): Filter summary by section:
  - `?section=ftl` -> Computes metrics strictly for the **FTL** primary tab (FTL revenue, FTL COGS, FTL gross profit, FTL expenses, FTL net profit).
  - `?section=ltl` -> Computes metrics strictly for the **LTL** primary tab (LTL revenue, LTL COGS, LTL gross profit, LTL expenses, LTL net profit).
  - Omitted (or `?section=all`) -> Computes overall company total AND returns `sections_breakdown` containing both FTL and LTL sub-summaries.
- `period` (optional): `YYYY-MM` string (e.g. `2026-08`). Defaults to current calendar month if omitted.
- `start_date` (optional): `YYYY-MM-DD` string.
- `end_date` (optional): `YYYY-MM-DD` string.
- `currency` (optional, default: `USD`): Target normalized currency (`USD`, `UZS`, `RUB`, `RMB`, `CNY`).

**Example Response for FTL Tab (`GET /api/v1/finance/summary?section=ftl`)**:

```json
{
  "currency": "USD",
  "section": "ftl",
  "normalized_currency_label": "USD (US DOLLAR)",
  "period": {
    "start_date": "2026-08-01",
    "end_date": "2026-08-31"
  },
  "summary": {
    "gross_revenue": 10000.0,
    "cost_of_goods_sold": 6000.0,
    "gross_profit": 4000.0,
    "gross_margin": 4000.0,
    "operational_expenses": 1200.0,
    "ftl_operational_expenses": 1200.0,
    "ltl_operational_expenses": 0.0,
    "fixed_salaries_expense": 1000.0,
    "kpi_bonuses_expense": 400.0,
    "total_payroll_expense": 1400.0,
    "total_expenses": 2600.0,
    "total_all_in_expenses": 2600.0,
    "net_profit": 1400.0,
    "seo_cut_10pc": 140.0,
    "seo_pure_profit_share": 140.0
  },
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
  "expense_distribution": [
    {
      "category": "tax",
      "section": "ftl",
      "label": "Nalog",
      "amount": 200.0,
      "percentage": 16.67,
      "count": 1
    }
  ]
}
```

**Example Response for Overall Summary (All Sections Overview)**:

```json
{
  "currency": "USD",
  "section": "all",
  "summary": {
    "gross_revenue": 15000.0,
    "cost_of_goods_sold": 9000.0,
    "gross_profit": 6000.0,
    "operational_expenses": 3200.0,
    "ftl_operational_expenses": 1200.0,
    "ltl_operational_expenses": 2000.0,
    "total_expenses": 5200.0,
    "net_profit": 800.0
  },
  "sections_breakdown": {
    "ftl": {
      "section": "ftl",
      "label": "FTL (Full Truck Load)",
      "gross_revenue": 10000.0,
      "cost_of_goods_sold": 6000.0,
      "gross_profit": 4000.0,
      "operational_expenses": 1200.0,
      "kpi_bonuses_expense": 400.0,
      "total_expenses": 1600.0,
      "net_profit": 2400.0,
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
      "expense_distribution": [...]
    },
    "ltl": {
      "section": "ltl",
      "label": "LTL (Less Than Truckload / Groupage)",
      "gross_revenue": 5000.0,
      "cost_of_goods_sold": 3000.0,
      "gross_profit": 2000.0,
      "operational_expenses": 2000.0,
      "kpi_bonuses_expense": 300.0,
      "total_expenses": 2300.0,
      "net_profit": -300.0,
      "expense_breakdown": {
        "rent": 0.0,
        "salary_payout": 0.0,
        "china_warehouse": 1500.0,
        "firm_service": 300.0,
        "food": 600.0,
        "declarant": 200.0
      },
      "expense_distribution": [...]
    }
  }
}
```

---

### B. Expense Management (CRUD)

#### `POST /api/v1/finance/expenses`

Creates a new expense record in either `ftl` or `ltl` section.

**Request Body (FTL Expense Registration Example)**:

```json
{
  "section": "ftl",
  "category": "food",
  "amount": 300.0,
  "currency": "USD",
  "description": "Drivers and FTL team meals",
  "expense_date": "2026-08-10"
}
```

**Request Body (LTL Expense Registration Example)**:

```json
{
  "section": "ltl",
  "category": "food",
  "amount": 600.0,
  "currency": "USD",
  "description": "China warehouse staff meals",
  "expense_date": "2026-08-10"
}
```

**Request Body (Salary Payout Expense)**:

```json
{
  "section": "ftl",
  "category": "salary_payout",
  "amount": 1500.0,
  "currency": "UZS",
  "employee_id": "6cb65b0a-9113-4add-9d7b-02151dbc8d94",
  "description": "August monthly salary payout",
  "expense_date": "2026-08-24"
}
```

**Response (201 Created)**:

```json
{
  "id": "2443d243-43e0-4ae4-83aa-0e045c78319d",
  "section": "ltl",
  "category": "food",
  "amount": 600,
  "currency": "USD",
  "employee_id": null,
  "description": "China warehouse staff meals",
  "expense_date": "2026-08-10",
  "created_at": "2026-08-10T12:35:08.339Z",
  "updated_at": "2026-08-10T12:35:08.339Z"
}
```

---

#### `GET /api/v1/finance/expenses`

Lists expenses with filtering by `section`, `category`, date range, search, pagination, and total sum calculation.

**Query Parameters**:

- `section` (optional): Filter by section (`ftl` or `ltl`). Ideal for tab switching on frontend.
- `category` (optional): Filter by specific category.
- `employee_id` (optional): Filter by specific employee UUID.
- `start_date` (optional): `YYYY-MM-DD`.
- `end_date` (optional): `YYYY-MM-DD`.
- `search` (optional): Case-insensitive search in description.
- `page` (optional, default `1`): Page number.
- `limit` (optional, default `20`): Page size.
- `sort_by` (optional, default `expense_date`): (`expense_date`, `amount`, `category`, `section`, `created_at`).
- `order` (optional, default `desc`): `asc` or `desc`.

---

#### `GET /api/v1/finance/expenses/categories`

Returns category breakdown for a specified period and section.

**Query Parameters**:

- `section` (optional): `ftl` or `ltl`.
- `period` (optional): `YYYY-MM`.
- `start_date` (optional): `YYYY-MM-DD`.
- `end_date` (optional): `YYYY-MM-DD`.

**Response when `section=ftl` (200 OK)**:

```json
{
  "section": "ftl",
  "period_start": "2026-08-01",
  "period_end": "2026-08-31",
  "base_currency": "UZS",
  "grand_total": 300.0,
  "categories": [
    {
      "category": "tax",
      "section": "ftl",
      "label": "Nalog",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "utility",
      "section": "ftl",
      "label": "Komunalka",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "rent",
      "section": "ftl",
      "label": "Arenda",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "salary_payout",
      "section": "ftl",
      "label": "Oylik",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "cleaner",
      "section": "ftl",
      "label": "Cleaning",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "kpi",
      "section": "ftl",
      "label": "KPI bonus",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "food",
      "section": "ftl",
      "label": "Pitaniya",
      "total_amount": 300.0,
      "expense_count": 1
    },
    {
      "category": "other",
      "section": "ftl",
      "label": "Prochiy",
      "total_amount": 0,
      "expense_count": 0
    }
  ]
}
```

**Response when `section=ltl` (200 OK)**:

```json
{
  "section": "ltl",
  "period_start": "2026-08-01",
  "period_end": "2026-08-31",
  "base_currency": "UZS",
  "grand_total": 600.0,
  "categories": [
    {
      "category": "rent",
      "section": "ltl",
      "label": "Arenda",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "salary_payout",
      "section": "ltl",
      "label": "Oylik",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "china_warehouse",
      "section": "ltl",
      "label": "Xitoy sklad",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "firm_service",
      "section": "ltl",
      "label": "Firma usluga",
      "total_amount": 0,
      "expense_count": 0
    },
    {
      "category": "food",
      "section": "ltl",
      "label": "Pitanya",
      "total_amount": 600.0,
      "expense_count": 1
    },
    {
      "category": "declarant",
      "section": "ltl",
      "label": "Deklarant",
      "total_amount": 0,
      "expense_count": 0
    }
  ]
}
```

---

#### `GET /api/v1/finance/expenses/:id`

Gets single expense details by UUID.

---

#### `PATCH /api/v1/finance/expenses/:id`

Updates an existing expense, allowing changes to section, category, amount, currency, and date.

---

#### `DELETE /api/v1/finance/expenses/:id`

Deletes an expense record.

---

### C. Fixed Salary Management

#### `GET /api/v1/finance/salaries`

#### `PATCH /api/v1/finance/salaries/:employee_id`

#### `PATCH /api/v1/finance/salaries`

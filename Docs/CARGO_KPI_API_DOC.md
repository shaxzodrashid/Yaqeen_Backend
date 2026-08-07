# Cargo & KPI Module API Documentation

This document provides complete documentation for the **Cargo & KPI Module** in the Yaqeen Backend ERP. All employee references across the sub-systems strictly require and operate with **Employee UUIDs** (`employee_id` / `manager_id`) referencing the `employees` database table.

The module implements all 7 sub-systems specified in the functional specification:

1. **LTL Calculator** (`/api/cargo-kpi/ltl/calculate`)
2. **LTL KPI Module** (`/api/cargo-kpi/ltl/items`)
3. **FTL KPI Module** (`/api/cargo-kpi/ftl/*`)
4. **ROP KPI Module** (`/api/cargo-kpi/rop/*`)
5. **SEO KPI Module** (`/api/cargo-kpi/seo/calculate`)
6. **Employee Plans & Progress** (`/api/cargo-kpi/plans`)
7. **Cargo Transactions** (`/api/cargo-kpi/transactions`)
8. **Global Reset** (`/api/cargo-kpi/reset-all`)

---

## 1. Authentication

All endpoints require JWT Bearer authentication:

```http
Authorization: Bearer <your_access_token>
```

---

## 2. LTL Calc (Narx Kalkulyatori)

### `POST /api/cargo-kpi/ltl/calculate`

Calculates transport price based on volume ($V$ in $m^3$) and weight ($W$ in $kg$).

#### Density Calculation Formula:

$$Density (D) = \frac{Weight (kg)}{Volume (m^3)}$$

#### Rate Selection Rules:

| Density Condition  | Calculation Basis | Rate | Unit      | Price Formula   |
| :----------------- | :---------------- | :--- | :-------- | :-------------- |
| $D > 1000$         | Weight (`vazn`)   | 0.30 | USD/kg    | $W \times 0.30$ |
| $700 < D \le 1000$ | Weight (`vazn`)   | 0.40 | USD/kg    | $W \times 0.40$ |
| $D \le 100$        | Volume (`hajm`)   | 100  | USD/$m^3$ | $V \times 100$  |
| $100 < D \le 200$  | Volume (`hajm`)   | 110  | USD/$m^3$ | $V \times 110$  |
| $200 < D \le 300$  | Volume (`hajm`)   | 130  | USD/$m^3$ | $V \times 130$  |
| $300 < D \le 400$  | Volume (`hajm`)   | 140  | USD/$m^3$ | $V \times 140$  |
| $400 < D \le 500$  | Volume (`hajm`)   | 160  | USD/$m^3$ | $V \times 160$  |
| $500 < D \le 700$  | Volume (`hajm`)   | 180  | USD/$m^3$ | $V \times 180$  |

#### Request Body:

```json
{
  "volume": 2,
  "weight": 400
}
```

#### Response (200 OK):

```json
{
  "volume": 2,
  "weight": 400,
  "density": 200,
  "basis": "hajm",
  "rate": 110,
  "unit": "USD/m3",
  "total_price": 220
}
```

---

## 3. LTL KPI Module

### `GET /api/cargo-kpi/ltl/items`

Returns all LTL cargo items grouped by `employee_id`, joining full employee name from `employees` table, calculating per-item density/base rate, employee total volume, volume coefficient, and retroactive final LTL KPI.

#### LTL Cargo Rates ($Rate_i$):

- **Lyustra**: Fixed **3 USD/$m^3$** regardless of density.
- **Oddiy (Logistika)**:
  - $D \le 100 \implies 3$ USD/$m^3$
  - $100 < D \le 200 \implies 4$ USD/$m^3$
  - $200 < D \le 300 \implies 5$ USD/$m^3$
  - $300 < D \le 400 \implies 6$ USD/$m^3$
  - $400 < D \le 500 \implies 7$ USD/$m^3$
  - $500 < D \le 700 \implies 8$ USD/$m^3$
  - $700 < D \le 1000 \implies 9$ USD/$m^3$
  - $D > 1000 \implies 10$ USD/$m^3$
- **Pod klyuch**: Oddiy rate + 5 USD/$m^3$ ($D \le 100 \implies 8$, $100 < D \le 200 \implies 9$, etc.).

#### Volume Coefficient Tiers ($Volume\_coeff$):

- $V_{total} < 21 \implies 0.00$ (0%)
- $21 \le V_{total} \le 40 \implies 0.50$ (50%)
- $40 < V_{total} \le 60 \implies 0.80$ (80%)
- $60 < V_{total} \le 74 \implies 0.90$ (90%)
- $74 < V_{total} \le 80 \implies 1.00$ (100%)
- $V_{total} > 80 \implies 1.20$ (120%)

#### Final Formula:

$$\text{Final LTL KPI} = \left(\sum \text{Base KPI}_i\right) \times \text{Volume\_coeff}$$

#### Response (200 OK):

```json
{
  "total_items": 1,
  "employees": [
    {
      "employee_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "employee_name": "Jasur Yoldoshev",
      "total_volume": 50,
      "total_weight": 5000,
      "total_base_kpi": 300,
      "volume_coefficient": 0.8,
      "volume_coefficient_percentage": "80%",
      "final_ltl_kpi": 240,
      "items": [
        {
          "id": "item-uuid-string",
          "employee_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          "employee_name": "Jasur Yoldoshev",
          "volume": 50,
          "weight": 5000,
          "cargo_type": "oddiy",
          "density": 100,
          "base_rate": 3,
          "base_kpi": 150,
          "created_at": "2026-07-21T10:00:00.000Z"
        }
      ]
    }
  ]
}
```

### `POST /api/cargo-kpi/ltl/items`

Creates a new LTL cargo item. Strictly requires `employee_id` (UUID).

#### Request Body:

```json
{
  "employee_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "volume": 10,
  "weight": 1000,
  "cargo_type": "oddiy"
}
```

### `PUT /api/cargo-kpi/ltl/items/:id`

Updates an existing LTL cargo item. Accepts optional `employee_id`, `volume`, `weight`, `cargo_type`.

### `DELETE /api/cargo-kpi/ltl/items/:id`

Deletes an LTL cargo item.

### `POST /api/cargo-kpi/ltl/reset`

Clears all LTL cargo items.

---

## 4. FTL KPI Module

### `GET /api/cargo-kpi/ftl/summary`

Calculates manager FTL KPIs filtered by optional `manager_id` (UUID) and `month` (`YYYY-MM`).

#### Query Parameters:

- `manager_id` (optional, UUID)
- `month` (optional, `YYYY-MM`)

#### FTL Monthly Profit Rate Tiers:

| Total Monthly Profit (USD) | Monthly Rate |
| :------------------------- | :----------- |
| $< 1,500$                  | 0%           |
| $1,500 - 3,999.99$         | 8%           |
| $4,000 - 4,999.99$         | 10%          |
| $5,000 - 5,999.99$         | 12%          |
| $6,000 - 6,999.99$         | 14%          |
| $7,000 - 7,999.99$         | 16%          |
| $8,000 - 9,999.99$         | 18%          |
| $\ge 10,000$               | 24%          |

#### Time Multipliers ($Multiplier_i$):

- $Y \le 5 \implies 1.10$ (110%)
- $Y > 5$ and $Y - B \le 2 \implies 1.00$ (100%)
- $2 < Y - B \le 10 \implies 0.90$ (90%)
- $10 < Y - B \le 15 \implies 0.85$ (85%)
- $15 < Y - B \le 20 \implies 0.75$ (75%)
- $Y - B > 20 \implies 0.50$ (50%)

#### Individual Truck KPI Formula:

$$\text{KPI}_i = \text{Profit}_i \times \text{Monthly\_rate} \times \text{Time\_multiplier}_i$$

### `POST /api/cargo-kpi/ftl/items`

Creates FTL fura entries. Strictly requires `manager_id` (UUID). Supports batch insertion via optional `"qty"` field.

#### Request Body:

```json
{
  "manager_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "month": "2026-07",
  "agent_price": 1000,
  "sell_price": 2000,
  "planned_days": 20,
  "actual_days": 25,
  "kpi_received": false,
  "qty": 1
}
```

### `PATCH /api/cargo-kpi/ftl/items/:id/toggle-kpi`

Toggles `kpi_received` status (true/false) for an FTL fura record.

---

## 5. ROP KPI Module

### `GET /api/cargo-kpi/rop/summary`

Calculates ROP Total KPI joining employee names from `employees` table:
$$\text{ROP Total KPI} = \text{Worker 1\% KPI} + \text{Team Bonus} + \text{Truck KPI}$$

#### Team Bonus Rate Tiers:

- $< 25,000 \implies 0\%$
- $25,000 - 29,999.99 \implies 2\%$
- $30,000 - 34,999.99 \implies 2.5\%$
- $35,000 - 39,999.99 \implies 3\%$
- $40,000 - 44,999.99 \implies 4.5\%$
- $45,000 - 54,999.99 \implies 6\%$
- $\ge 55,000 \implies 7\%$

#### Truck Count Rate Tiers:

- $0 \text{ trucks} \implies 0\%$
- $1-2 \text{ trucks} \implies 1\%$
- $3-5 \text{ trucks} \implies 1.5\%$
- $6-9 \text{ trucks} \implies 2\%$
- $\ge 10 \text{ trucks} \implies 2.5\%$

### `POST /api/cargo-kpi/rop/workers`

Creates a ROP worker sales record. Strictly requires `employee_id` (UUID).

#### Request Body:

```json
{
  "employee_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "sales_amount": 27000,
  "month": "2026-07"
}
```

---

## 6. SEO KPI Module

### `POST /api/cargo-kpi/seo/calculate`

Calculates 10% pure net profit KPI for SEO managers.

#### Request Body:

```json
{
  "net_profit": 15000
}
```

#### Response (200 OK):

```json
{
  "net_profit": 15000,
  "seo_rate": 0.1,
  "seo_rate_percentage": "10%",
  "seo_kpi": 1500
}
```

---

## 7. Employee Plans & Progress

### `GET /api/cargo-kpi/plans`

Returns employee target plans, currency, actual sales accumulated from cargo transactions/incomes (converted to plan currency if different), remaining target amount, completion percentage, and employee leaderboard ratings.

#### Response (200 OK):

```json
{
  "total_plans": 1,
  "leaderboard": [
    {
      "id": "plan-uuid-string",
      "employee_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "employee_name": "Jasur Yoldoshev",
      "department_name": "Logistics",
      "color": "#336699",
      "period": "2026-07-01",
      "target_amount": 10000,
      "currency": "USD",
      "actual_sales": 7500,
      "remaining_amount": 2500,
      "completion_percentage": 75,
      "is_completed": false
    }
  ]
}
```

### `POST /api/cargo-kpi/plans`

Creates a new employee plan with target amount, optional currency (`UZS`, `USD`, `RUB`, default `UZS`), and target period (`YYYY-MM` or `YYYY-MM-DD`).

#### Request Body:

```json
{
  "employee_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "target_amount": 10000,
  "currency": "USD",
  "period": "2026-07"
}
```

### `PUT /api/cargo-kpi/plans/:id`

Updates an existing employee plan's `target_amount`, `currency`, or `period`.

---

## 8. Cargo Transactions Ledger

### `GET /api/cargo-kpi/transactions`

List cargo transactions with pagination and filters (`employee_id`, `department_id`, `status`, `statuses`, `start_date`, `end_date`, `search`, `limit`, `offset`, `page`).

Adheres to the standardized `{ meta, data }` response envelope structure and provides exact status breakdown counts (`status_counts`):

```json
{
  "meta": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "page": 1,
    "totalPages": 5,
    "status_counts": {
      "Waiting": 20,
      "In Transit": 10,
      "Border": 5,
      "At Station": 30,
      "Delivered": 35
    }
  },
  "data": [
    {
      "id": "c7a77f42-2f13-4b8e-b8cb-7d5f2c82fbbb",
      "employee_id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "employee_name": "Jasur Yoldoshev",
      "department_id": "b1111111-2222-3333-4444-555555555555",
      "department_name": "Cargo KPI Dept",
      "client_id": "e3f21102-1234-4567-89ab-cdef01234567",
      "client_name": "Jasur Yoldoshev",
      "client_company": "Yaqeen Client Co",
      "description": "Shipment #101",
      "buy_price": 3000,
      "sell_price": 5000,
      "margin": 2000,
      "kpi_percentage": 10,
      "kpi_bonus": 200,
      "currency": "UZS",
      "status": "In Transit",
      "transaction_date": "2026-07-15",
      "created_at": "2026-07-15T00:00:00.000Z"
    }
  ]
}
```

### `GET /api/cargo-kpi/transactions/viewable`

Returns cargo transactions pre-grouped by status (`Waiting`, `In Transit`, `Border`, `At Station`, `Delivered`) for board view. Each status group includes `metrics.total_transactions` (total count in DB for that status stage) and `metrics.loaded_transactions` (count of items in current loaded page):

```json
{
  "meta": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "page": 1,
    "totalPages": 5,
    "status_counts": {
      "Waiting": 20,
      "In Transit": 10,
      "Border": 5,
      "At Station": 30,
      "Delivered": 35
    }
  },
  "data": {
    "Waiting": {
      "metrics": {
        "total_transactions": 20,
        "loaded_transactions": 5,
        "total_sell_price": 10000,
        "total_buy_price": 7000,
        "total_margin": 3000,
        "total_kpi_bonus": 300
      },
      "transactions": [/* Array of Cargo Transactions */]
    },
    "In Transit": {
      "metrics": {
        "total_transactions": 10,
        "loaded_transactions": 10,
        "total_sell_price": 25000,
        "total_buy_price": 18000,
        "total_margin": 7000,
        "total_kpi_bonus": 700
      },
      "transactions": [/* Array of Cargo Transactions */]
    },
    "Border": {
      "metrics": {
        "total_transactions": 5,
        "loaded_transactions": 5,
        "total_sell_price": 6000,
        "total_buy_price": 4000,
        "total_margin": 2000,
        "total_kpi_bonus": 200
      },
      "transactions": []
    },
    "At Station": {
      "metrics": {
        "total_transactions": 30,
        "loaded_transactions": 0,
        "total_sell_price": 8000,
        "total_buy_price": 5500,
        "total_margin": 2500,
        "total_kpi_bonus": 250
      },
      "transactions": []
    },
    "Delivered": {
      "metrics": {
        "total_transactions": 35,
        "loaded_transactions": 0,
        "total_sell_price": 9000,
        "total_buy_price": 6000,
        "total_margin": 3000,
        "total_kpi_bonus": 300
      },
      "transactions": []
    }
  }
}
```

### `POST /api/cargo-kpi/transactions`

Creates a cargo transaction record with automatic margin and KPI bonus calculation. Strictly requires `employee_id` (UUID) and `department_id` (UUID). Accepts optional `status` (`'Waiting'`, `'In Transit'`, `'Border'`, `'At Station'`, `'Delivered'`), defaulting to `'Waiting'`.

The `kpi_percentage` is hardcoded based on the transaction's department name (resolved from the database via `department_id`):

- `sborniy` (Sborniy) / LTL: **10%**
- `sales` (Sales): **10%**
- `marketing` (Marketing): **10%**
- `translator` (Tarjimon): **10%**
- `declarant` (Deklarant): **10%**
- `bookkeeper` (Buxgalter): **10%**
- `seo` (SEO): **10%**
- Default / fallback: **10%**

Any manually provided `kpi_percentage` in `POST` (create) or `PUT` (update) payloads is deprecated and ignored.

$$\text{Margin} = \text{sell\_price} - \text{buy\_price}$$
$$\text{KPI Bonus} = \text{Margin} \times \frac{\text{kpi\_percentage}}{100}$$

---

## 9. Global Reset

### `POST /api/cargo-kpi/reset-all`

Resets all LTL, FTL, and ROP data across the Cargo & KPI sub-modules.

# Cargo Registrations Multi-Currency & Historical Rate Documentation

This document details the multi-currency calculation engine, historical rate snapshotting, and decoupled price registration date features in the **Cargo Registrations Module** of the Yaqeen Backend ERP.

---

## 1. Executive Summary

In cargo logistics management, cargo purchase prices (e.g. carrier costs in UZS, RUB, or RMB) and sell prices (e.g. client charges in USD) can be recorded at different dates and in different currencies.

### Key Features Implemented:

1. **Accurate Multi-Currency Net Yield**: Converts all purchase and sell prices into standardized base currencies (USD & UZS) using exact exchange rates before calculating profit (`net_yield`).
2. **Decoupled Purchase & Sell Timestamps**: Allows `purchase_date` and `sell_date` to be specified independently (e.g., when sell prices are agreed upon days or weeks after purchase registration).
3. **Historical Exchange Rate Snapshotting**: Fetches and records official Central Bank of Uzbekistan (CBU) exchange rates (or user-defined custom exchange rates) for the exact registration date of each price.
4. **Cross-Rate Support**: Supports USD, UZS, RUB, RMB/CNY, and custom cross-rates such as `usd_rmb_rate`.

---

## 2. Core Financial Engine & Equations

### Conversion Formulas

Let $R_{USD}(d)$ be the exchange rate of 1 USD in UZS on date $d$, and $R_{CNY}(d)$, $R_{RUB}(d)$ be the respective CBU rates in UZS on date $d$.

#### Purchase Price Conversion to USD ($P_{USD}$):

$$ P_{USD} = \begin{cases}
P_{buy} & \text{if currency is USD} \\
\frac{P_{buy}}{R_{USD}(d_{buy})} & \text{if currency is UZS} \\
\frac{P_{buy}}{\text{usd\_rmb\_rate}} & \text{if currency is RMB/CNY} \\
\frac{P_{buy} \times R_{RUB}(d_{buy})}{R_{USD}(d_{buy})} & \text{if currency is RUB}
\end{cases}$$

#### Purchase Price Conversion to UZS ($P_{UZS}$):
$$P_{UZS} = P_{USD} \times R_{USD}(d_{buy})$$

#### Sell Price Conversion to USD ($S_{USD}$):
$$S_{USD} = \begin{cases}
S_{sell} & \text{if currency is USD} \\
\frac{S_{sell}}{R_{USD}(d_{sell})} & \text{if currency is UZS} \\
\frac{S_{sell}}{\text{usd\_rmb\_rate}} & \text{if currency is RMB/CNY} \\
\frac{S_{sell} \times R_{RUB}(d_{sell})}{R_{USD}(d_{sell})} & \text{if currency is RUB}
\end{cases}$$

#### Sell Price Conversion to UZS ($S_{UZS}$):
$$S_{UZS} = S_{sell} \times R_{USD}(d_{sell})$$

#### Net Yield Calculation ($Y_{net}$):
$$Y_{net, \text{USD}} = S_{USD} - P_{USD}$$
$$Y_{net, \text{UZS}} = S_{UZS} - P_{UZS}$$

---

## 3. Database Schema

The `cargo_registrations` table includes the following columns for currency date and rate snapshotting:

| Column | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `purchase_price` | `decimal(14,2)` | NO | Nominal purchase price amount |
| `purchase_currency` | `varchar(10)` | NO | `UZS`, `USD`, `RUB`, or `RMB` |
| `purchase_date` | `date` | YES | Date when purchase price was set/registered (defaults to `confirmed_date` or creation date) |
| `purchase_usd_rate` | `decimal(14,4)` | YES | Rate of 1 USD in UZS snapshot at `purchase_date` |
| `purchase_custom_rate` | `decimal(14,4)` | YES | Optional custom rate override provided in payload |
| `sell_price` | `decimal(14,2)` | NO | Nominal sell price amount |
| `sell_currency` | `varchar(10)` | NO | `UZS`, `USD`, `RUB`, or `RMB` |
| `sell_date` | `date` | YES | Date when sell price was set/registered (defaults to creation date or today) |
| `sell_usd_rate` | `decimal(14,4)` | YES | Rate of 1 USD in UZS snapshot at `sell_date` |
| `sell_custom_rate` | `decimal(14,4)` | YES | Optional custom rate override provided in payload |
| `usd_rmb_rate` | `decimal(14,4)` | YES | Custom USD to RMB cross-rate (required if currency is RMB) |

---

## 4. API Endpoints Specification

### Base Path: `/api/v1/cargo-registrations`

---

### A. Create Cargo Registration

#### `POST /api/v1/cargo-registrations`

Registers a new cargo transaction.

**Request Body (JSON)**:
```json
{
  "cargo_type": "FTL",
  "container_truck_id": "TRK-6447",
  "agent_name": "SilkRoad Express",
  "cargo": "General Goods",
  "confirmed_date": "2026-07-20",
  "purchase_price": 4500000,
  "purchase_currency": "UZS",
  "purchase_date": "2026-07-20",
  "sell_price": 800,
  "sell_currency": "USD",
  "sell_date": "2026-08-06",
  "client_id": "8e3b4a21-9951-40ef-a442-123456789abc",
  "status": "In Transit"
}
```

**Optional Payload Rate Fields**:
- `purchase_date` (string, `YYYY-MM-DD`): If omitted, uses `confirmed_date` or current date.
- `sell_date` (string, `YYYY-MM-DD`): If omitted, uses current date.
- `purchase_exchange_rate` (number): Optional custom exchange rate override for purchase price.
- `sell_exchange_rate` (number): Optional custom exchange rate override for sell price.
- `usd_rmb_rate` (number): Required if `purchase_currency` or `sell_currency` is `RMB`.

**Example Response (201 Created)**:
```json
{
  "id": "7a06df8a-384c-4c8d-9932-57db348a3451",
  "cargo_type": "FTL",
  "volume": null,
  "weight": null,
  "container_type": null,
  "container_truck_id": "TRK-6447",
  "agent_name": "SilkRoad Express",
  "cargo": "General Goods",
  "confirmed_date": "2026-07-20",
  "loaded_date": null,
  "arrived_date": null,
  "purchase_price": 4500000,
  "purchase_currency": "UZS",
  "purchase_date": "2026-07-20",
  "purchase_usd_rate": 11886.72,
  "purchase_amount_usd": 378.57,
  "purchase_amount_uzs": 4500000,
  "sell_price": 800,
  "sell_currency": "USD",
  "sell_date": "2026-08-06",
  "sell_usd_rate": 11886.72,
  "sell_amount_usd": 800,
  "sell_amount_uzs": 9509376,
  "net_yield": 421.43,
  "net_yield_details": {
    "amount_usd": 421.43,
    "amount_uzs": 5009376
  },
  "usd_rmb_rate": null,
  "status": "In Transit",
  "description": null,
  "client_id": "8e3b4a21-9951-40ef-a442-123456789abc",
  "client": {
    "id": "8e3b4a21-9951-40ef-a442-123456789abc",
    "first_name": "Jasur",
    "last_name": "Aliyev",
    "company_name": "Silk Logistics LLC",
    "phone": "+998901234567"
  },
  "employee_id": "11111111-2222-3333-4444-555555555555",
  "employee": {
    "id": "11111111-2222-3333-4444-555555555555",
    "first_name": "Shaxzod",
    "last_name": "Rashidov"
  },
  "created_at": "2026-08-06T13:00:00.000Z",
  "updated_at": "2026-08-06T13:00:00.000Z"
}
```

---

### B. List Cargo Registrations

#### `GET /api/v1/cargo-registrations`

Retrieves a paginated list of cargo registrations with search, multi-timestamp filters, creation date filters, and multi-currency aggregate totals.

**Query Parameters**:
- `page` (optional, default: 1): Page number.
- `limit` (optional, default: 10): Items per page.
- `offset` (optional): Direct offset override.
- `status` (optional): Filter by cargo status (`Waiting`, `In Transit`, `Border`, `At Station`, `Delivered`).
- `cargo_type` (optional): Filter by cargo type (`LTL` | `FTL`).
- `container_type` (optional): Filter by container type.
- `client_id` (optional, UUID): Filter by client UUID.
- `employee_id` (optional, UUID): Filter by assigned employee UUID.
- `search` (optional): Case-insensitive search on `container_truck_id` or `cargo`.
- `sort_by` (optional, default: `created_at`): Column / property to sort by:
  - Dates: `purchase_date`, `sell_date`, `confirmed_date`, `loaded_date`, `arrived_date`, `created_at`, `updated_at`
  - Client: `client_name`, `client_first_name`, `client_last_name`, `client_company`
  - Employee: `employee_name`, `emp_first_name`, `emp_last_name`
  - Cargo & Logistics: `cargo`, `container_truck_id`, `agent_name`, `cargo_type`, `container_type`, `volume`, `weight`, `status`, `purchase_price`, `sell_price`, `usd_rmb_rate`
- `sort_order` / `order` (optional, default: `DESC`): Sort direction (`ASC` | `DESC` | `asc` | `desc`).

**Timestamp & Creation Date Filters**:
- `purchase_start_date` / `purchase_end_date` (optional, `YYYY-MM-DD`): Date range filter on `purchase_date` (also supports `purchase_date` for exact date).
- `sell_start_date` / `sell_end_date` (optional, `YYYY-MM-DD`): Date range filter on `sell_date` (also supports `sell_date` for exact date).
- `confirmed_start_date` / `confirmed_end_date` (optional, `YYYY-MM-DD`): Date range filter on `confirmed_date`.
- `loaded_start_date` / `loaded_end_date` (optional, `YYYY-MM-DD`): Date range filter on `loaded_date`.
- `arrived_start_date` / `arrived_end_date` (optional, `YYYY-MM-DD`): Date range filter on `arrived_date`.
- `created_start_date` / `created_at_start` (optional, `YYYY-MM-DD` or ISO timestamp): Start range filter on registration creation date (`created_at`).
- `created_end_date` / `created_at_end` (optional, `YYYY-MM-DD` or ISO timestamp): End range filter on registration creation date (`created_at`).

**Example Request**:
```http
GET /api/v1/cargo-registrations?status=In%20Transit&purchase_start_date=2026-08-01&purchase_end_date=2026-08-31&sort_by=purchase_date&sort_order=DESC&limit=20 HTTP/1.1
Authorization: Bearer <JWT_TOKEN>
```

**Example Response (200 OK)**:
```json
{
  "meta": {
    "total": 1,
    "limit": 10,
    "offset": 0,
    "calculated_net_yield": {
      "USD": 421.43,
      "UZS": 5009376,
      "total_usd": 421.43,
      "total_uzs": 5009376
    },
    "gross_sales_revenue": {
      "UZS": 0,
      "USD": 800,
      "RUB": 0,
      "RMB": 0,
      "total_usd_equivalent": 800,
      "total_uzs_equivalent": 9509376
    }
  },
  "data": [
    {
      "id": "7a06df8a-384c-4c8d-9932-57db348a3451",
      "cargo_type": "FTL",
      "volume": null,
      "weight": null,
      "container_type": "40HQ",
      "container_truck_id": "TRK-6447",
      "agent_name": "SilkRoad Express",
      "client_full_name": "Jasur Aliyev",
      "cargo": "General Goods",
      "confirmed_date": "2026-07-20",
      "loaded_date": "2026-07-22",
      "arrived_date": null,
      "purchase_date": "2026-07-20",
      "sell_date": "2026-08-06",
      "usd_rmb_rate": null,
      "employee_full_name": "Shaxzod Rashidov",
      "purchase_price": {
        "amount": 4500000,
        "currency": "UZS",
        "amount_usd": 378.57,
        "amount_uzs": 4500000,
        "date": "2026-07-20"
      },
      "sell_price": {
        "amount": 800,
        "currency": "USD",
        "amount_usd": 800,
        "amount_uzs": 9509376,
        "date": "2026-08-06"
      },
      "net_yield": {
        "amount": 421.43,
        "currency": "USD",
        "amount_usd": 421.43,
        "amount_uzs": 5009376,
        "purchase_currency": "UZS",
        "sell_currency": "USD"
      },
      "status": "In Transit",
      "created_at": "2026-07-20T10:00:00.000Z",
      "updated_at": "2026-07-20T10:00:00.000Z"
    }
  ]
}
```

---

### C. Update Cargo Registration

#### `PATCH /api/v1/cargo-registrations/:id`

Updates an existing cargo registration. Re-calculates rate snapshots if price, currency, or dates are modified.

**Request Body (JSON)**:
```json
{
  "sell_price": 850,
  "sell_date": "2026-08-06"
}
```

---

## 5. Central Bank Exchange Rate Integration

The system automatically fetches and caches daily exchange rates from the Central Bank of Uzbekistan (CBU) open JSON endpoint:
- **Latest Rates**: `https://cbu.uz/uz/arkhiv-kursov-valyut/json/`
- **Historical Archive Rates**: `https://cbu.uz/uz/arkhiv-kursov-valyut/json/all/YYYY-MM-DD/`

Historical rates fetched from CBU are automatically cached in Redis and persisted in the local `currency_rates` table to maximize performance and ensure offline resilience.

---

## 6. Performance Architecture & Optimization Strategy

To ensure `GET /api/v1/cargo-registrations` responds in milliseconds even with high concurrent load and large datasets, three core performance optimizations are implemented:

### A. Concurrent Batch Currency Rate Resolution
- **Problem**: Previously, calculating financial metrics for $N$ matching records executed $2N$ sequential database queries for exchange rates inside a JavaScript loop.
- **Solution**: The service pre-extracts all unique date strings (`purchase_date`, `sell_date`, `confirmed_date`, `created_at`) from the dataset and resolves rates concurrently via `Promise.all`. This reduces $O(N)$ sequential network/DB operations to $O(1)$ batch lookups.

### B. In-Memory Historical Rate Caching
- **`CurrencyService` Optimization**: Historical currency exchange rates for past dates do not change. The `CurrencyService` maintains an in-memory `historicalRatesCache` map. After the first lookup of a historical date rate, subsequent calls are served instantly (0ms latency).

### C. Database Indexing
- Database migration `20260812120000_add_date_indexes_to_cargo_registrations.ts` adds B-tree indexes to the PostgreSQL `cargo_registrations` table:
  - Index on `confirmed_date`
  - Index on `loaded_date`
  - Index on `arrived_date`
  - Index on `created_at`
- These indexes enable Index Range Scans for all date-filtered query requests, avoiding full table scans.
$$

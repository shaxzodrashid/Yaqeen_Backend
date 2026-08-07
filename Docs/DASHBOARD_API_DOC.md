# Dashboard & Analytics Module API Documentation

This document provides comprehensive, production-grade documentation for the **Dashboard & Analytics Module** (`/dashboard/*`) in the Yaqeen Backend ERP.

The module provides executive analytical overviews, donut/pie chart data, manager and client leaderboards, and a line graph endpoint with timeframe period filters (`1D`, `5D`, `1M`, `6M`, `YTD`, `1Y`, `5Y`, `MAX`, `CUSTOM`), continuous zero-filled time buckets, running cumulative sales trajectory, and period-over-period growth rates.

All data aggregations operate exclusively on the **`cargo_registrations`** table in PostgreSQL.

---

## 1. Authentication & Security

All endpoints require JWT Bearer authentication and valid user permissions:

```http
Authorization: Bearer <your_access_token>
```

### Guards Applied:

- **`JwtAuthGuard`**: Validates JWT token signature and expiration.
- **`PermissionsGuard`**: Ensures authenticated user account is active.

---

## 2. Endpoints Overview

| Endpoint                            | Method | Description                                                                                                                          |
| :---------------------------------- | :----- | :----------------------------------------------------------------------------------------------------------------------------------- |
| **`/dashboard/sales-progress`**     | `GET`  | Sales progress line graph data with period filters, continuous zero-filled time buckets, cumulative trendlines, and growth metrics.  |
| **`/dashboard/summary`**            | `GET`  | Executive KPI cards summary (Total Revenue, Total Purchase Cost, Net Profit Margin, Order Counts, Volume, Weight, and Growth rates). |
| **`/dashboard/cargo-distribution`** | `GET`  | Pie/Donut chart distribution metrics (Cargo Type: LTL vs FTL, and Order Statuses).                                                   |
| **`/dashboard/top-performers`**     | `GET`  | Bar chart leaderboard metrics for Top Sales Managers and Top Clients.                                                                |

---

## 3. Data Source & Entity Mapping

All analytics metrics are derived from the `cargo_registrations` table:

| Column Name      | Data Type       | Usage in Dashboard Analytics                                                  |
| :--------------- | :-------------- | :---------------------------------------------------------------------------- |
| `id`             | `UUID`          | Count of registered cargo orders (`orderCount`).                              |
| `created_at`     | `TIMESTAMP`     | Primary timestamp used for date range filtering and time-bucket slotting.     |
| `confirmed_date` | `DATE`          | Fallback registration date if `created_at` is null.                           |
| `sell_price`     | `DECIMAL(14,2)` | Gross revenue / sales amount (`totalSales`).                                  |
| `purchase_price` | `DECIMAL(14,2)` | Cost of goods sold / carrier price (`totalPurchaseCost`).                     |
| `status`         | `VARCHAR(50)`   | Status filtering & distribution (`Completed`, `Waiting`, `In Transit`, etc.). |
| `cargo_type`     | `VARCHAR(10)`   | Cargo classification (`LTL` vs `FTL`).                                        |
| `volume`         | `DECIMAL(12,4)` | Total volume metric ($m^3$).                                                  |
| `weight`         | `DECIMAL(12,4)` | Total weight metric ($kg$).                                                   |
| `employee_id`    | `UUID`          | Sales manager reference for filtering and leaderboards.                       |
| `client_id`      | `UUID`          | Customer client reference for filtering and leaderboards.                     |

---

## 4. Timeframe Period Filters & Rules

The `GET /dashboard/sales-progress` endpoint accepts a `period` parameter. All timeframe boundaries are calculated deterministically using UTC dates.

| Period Code  | Description      | Range Formula                                           | Default Granularity         | Preceding Range for Growth %          |
| :----------- | :--------------- | :------------------------------------------------------ | :-------------------------- | :------------------------------------ |
| **`1D`**     | Current Day      | Today `00:00:00.000 UTC` to `23:59:59.999 UTC`          | **`hour`** (24 buckets)     | Previous calendar day                 |
| **`5D`**     | Last 5 Days      | `Current Date - 4 Days` (00:00:00) to Today (23:59:59)  | **`day`** (5 buckets)       | 5 days prior to start date            |
| **`1M`**     | Last 1 Month     | `Current Date - 30 Days` (00:00:00) to Today (23:59:59) | **`day`** (31 buckets)      | 30 days prior to start date           |
| **`6M`**     | Last 6 Months    | `Current Date - 6 Months` to Today                      | **`month`** (6-7 buckets)   | 6 months prior to start date          |
| **`YTD`**    | Year To Date     | `Jan 1st` of Current Year to Today                      | **`month`** (Jan – Current) | Jan 1st of previous year to same date |
| **`1Y`**     | Last 1 Year      | `Current Date - 1 Year` to Today                        | **`month`** (12-13 buckets) | 1 year prior to start date            |
| **`5Y`**     | Last 5 Years     | `Current Date - 5 Years` to Today                       | **`year`** (5-6 buckets)    | 5 years prior to start date           |
| **`MAX`**    | System Inception | Earliest DB `created_at` date to Today                  | **Auto-detected**           | `null`                                |
| **`CUSTOM`** | Custom Range     | User-specified `start_date` to `end_date`               | **Auto-detected**           | Equal preceding span                  |

### Custom Granularity Auto-Detection Rules:

When `granularity` is not explicitly provided in request query:

- Total span $\le 2$ days $\implies$ **`hour`**
- Total span $3 \le \text{days} \le 60$ $\implies$ **`day`**
- Total span $61 \le \text{days} \le 730$ $\implies$ **`month`**
- Total span $> 730$ days $\implies$ **`year`**

---

## 5. Mathematical & Algorithmic Specifications

### 1. Net Margin & Margin Percentage:

$$\text{Margin} = \text{Sales} - \text{Purchase Cost}$$
$$\text{Margin \%} = \begin{cases} \left(\frac{\text{Margin}}{\text{Sales}}\right) \times 100 & \text{if Sales} > 0 \\ 0 & \text{if Sales} = 0 \end{cases}$$

### 2. Continuous Time-Series Gap Filling:

To ensure UI line graphs (Recharts, ApexCharts, Chart.js) render continuous lines without broken segments, the backend generates an unbroken sequence of time bucket slots from `startDate` to `endDate`. Any bucket without sales in DB is zero-filled:

```typescript
sales: 0,
purchaseCost: 0,
margin: 0,
orderCount: 0
```

### 3. Running Cumulative Trajectory:

For each time bucket $i \in [0, N-1]$:
$$\text{cumulativeSales}_i = \sum_{k=0}^{i} \text{sales}_k$$
$$\text{cumulativeMargin}_i = \sum_{k=0}^{i} \text{margin}_k$$

### 4. Period-over-Period Growth Rate (%):

$$\text{growthRateSales} = \begin{cases} \left(\frac{\text{totalSales}_{\text{current}} - \text{totalSales}_{\text{prev}}}{\text{totalSales}_{\text{prev}}}\right) \times 100 & \text{if } \text{totalSales}_{\text{prev}} > 0 \\ 100 & \text{if } \text{totalSales}_{\text{prev}} = 0 \text{ and } \text{totalSales}_{\text{current}} > 0 \\ \text{null} & \text{otherwise} \end{cases}$$

---

## 6. API Reference & Universal Schemas

### 1. Sales Progress Line Graph Endpoint

`GET /api/dashboard/sales-progress`

#### Query Parameters:

| Parameter     | Type     | Required            | Enum / Format                                               | Default | Description                          |
| :------------ | :------- | :------------------ | :---------------------------------------------------------- | :------ | :----------------------------------- |
| `period`      | `string` | No                  | `1D`, `5D`, `1M`, `6M`, `YTD`, `1Y`, `5Y`, `MAX`, `CUSTOM`  | `1M`    | Timeframe period preset.             |
| `granularity` | `string` | No                  | `hour`, `day`, `week`, `month`, `year`                      | Auto    | Overrides default time bucket size.  |
| `start_date`  | `string` | **Yes (if CUSTOM)** | ISO 8601 string (`YYYY-MM-DD`)                              | None    | Custom start date boundary.          |
| `end_date`    | `string` | **Yes (if CUSTOM)** | ISO 8601 string (`YYYY-MM-DD`)                              | None    | Custom end date boundary.            |
| `employee_id` | `UUID`   | No                  | UUID v4                                                     | None    | Filter by sales manager employee ID. |
| `client_id`   | `UUID`   | No                  | UUID v4                                                     | None    | Filter by client ID.                 |
| `status`      | `string` | No                  | `Waiting`, `In Transit`, `Border`, `Delivered`, `Completed` | None    | Filter by cargo status.              |
| `cargo_type`  | `string` | No                  | `LTL`, `FTL`                                                | None    | Filter by cargo type.                |

#### Universal Response (200 OK):

```json
{
  "meta": {
    "period": "1M",
    "startDate": "2026-07-07T00:00:00.000Z",
    "endDate": "2026-08-06T23:59:59.999Z",
    "granularity": "day",
    "totalBuckets": 31,
    "currency": "USD"
  },
  "summary": {
    "totalSales": 48500.0,
    "totalPurchaseCost": 32100.0,
    "totalMargin": 16400.0,
    "marginPercentage": 33.81,
    "totalOrders": 14,
    "averageOrderValue": 3464.29,
    "completedOrders": 10,
    "pendingOrders": 4,
    "growthRateSales": 14.52,
    "growthRateMargin": 18.35
  },
  "dataPoints": [
    {
      "index": 0,
      "bucketStart": "2026-07-07T00:00:00.000Z",
      "bucketEnd": "2026-07-07T23:59:59.999Z",
      "dateKey": "2026-07-07",
      "label": "07 Jul",
      "sales": 0,
      "purchaseCost": 0,
      "margin": 0,
      "orderCount": 0,
      "cumulativeSales": 0,
      "cumulativeMargin": 0
    },
    {
      "index": 30,
      "bucketStart": "2026-08-06T00:00:00.000Z",
      "bucketEnd": "2026-08-06T23:59:59.999Z",
      "dateKey": "2026-08-06",
      "label": "06 Aug",
      "sales": 5000.0,
      "purchaseCost": 3500.0,
      "margin": 1500.0,
      "orderCount": 2,
      "cumulativeSales": 48500.0,
      "cumulativeMargin": 16400.0
    }
  ]
}
```

---

### 2. Executive Dashboard Summary KPI Cards Endpoint

`GET /api/dashboard/summary`

#### Query Parameters:

Supports `period`, `start_date`, `end_date`, `employee_id`, `client_id`, `cargo_type`.

#### Response (200 OK):

```json
{
  "totalSales": 48500.0,
  "totalPurchaseCost": 32100.0,
  "totalMargin": 16400.0,
  "marginPercentage": 33.81,
  "totalOrders": 14,
  "completedOrders": 10,
  "waitingOrders": 4,
  "averageOrderValue": 3464.29,
  "totalVolume": 184.5,
  "totalWeight": 8450.0,
  "ltlOrderCount": 6,
  "ftlOrderCount": 8,
  "salesGrowthVsPriorPeriod": 14.52,
  "marginGrowthVsPriorPeriod": 18.35
}
```

---

### 3. Donut / Pie Chart Cargo Distribution Endpoint

`GET /api/dashboard/cargo-distribution`

#### Query Parameters:

Supports `period`, `start_date`, `end_date`, `employee_id`, `client_id`, `cargo_type`.

#### Response (200 OK):

```json
{
  "cargoTypeDistribution": [
    {
      "category": "FTL",
      "count": 8,
      "totalSales": 34000.0,
      "percentage": 57.14
    },
    {
      "category": "LTL",
      "count": 6,
      "totalSales": 14500.0,
      "percentage": 42.86
    }
  ],
  "statusDistribution": [
    {
      "category": "Completed",
      "count": 10,
      "totalSales": 38000.0,
      "percentage": 71.43
    },
    {
      "category": "Waiting",
      "count": 4,
      "totalSales": 10500.0,
      "percentage": 28.57
    }
  ]
}
```

---

### 4. Bar Chart Leaderboards Endpoint (Top Managers & Clients)

`GET /api/dashboard/top-performers`

#### Query Parameters:

- `limit`: `number` (default `5`, max `50`).
- Supports `period`, `start_date`, `end_date`, `employee_id`, `client_id`, `cargo_type`.

#### Response (200 OK):

```json
{
  "topManagers": [
    {
      "employeeId": "e4a215b4-7b1b-4d92-93cb-33d31b0142fa",
      "employeeName": "Ali Valiyev",
      "departmentName": "Sales Department",
      "totalSales": 25000.0,
      "totalMargin": 8500.0,
      "orderCount": 7
    }
  ],
  "topClients": [
    {
      "clientId": "c1f8832a-5e2b-4c12-881b-9f93120d5102",
      "clientName": "OOO Global Express",
      "companyName": "Global Logistics LLC",
      "totalSales": 18000.0,
      "totalMargin": 6200.0,
      "orderCount": 5
    }
  ]
}
```

---

## 7. Error Handling & Validation Rules

| HTTP Status        | Exception Type          | Cause                                                             | Sample Error Response                                                                          |
| :----------------- | :---------------------- | :---------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| `400 Bad Request`  | `BadRequestException`   | Invalid `period` or missing `start_date`/`end_date` for `CUSTOM`. | `{"statusCode": 400, "message": "start_date and end_date are required when period is CUSTOM"}` |
| `400 Bad Request`  | `BadRequestException`   | `start_date` occurs after `end_date`.                             | `{"statusCode": 400, "message": "start_date cannot be after end_date"}`                        |
| `401 Unauthorized` | `UnauthorizedException` | Missing or invalid Bearer token.                                  | `{"statusCode": 401, "message": "Unauthorized"}`                                               |

---

## 8. Frontend Chart Integration Example (React + Recharts)

```tsx
import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

export const SalesProgressChart = ({ period = '1M' }) => {
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    fetch(`/api/dashboard/sales-progress?period=${period}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((res) => res.json())
      .then((res) => {
        setData(res.dataPoints);
        setSummary(res.summary);
      });
  }, [period]);

  return (
    <div>
      <h3>
        Sales Progress (
        {summary?.growthRateSales ? `+${summary.growthRateSales}%` : ''})
      </h3>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
          <Line
            type="monotone"
            dataKey="sales"
            stroke="#2563eb"
            name="Sales Revenue"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="cumulativeSales"
            stroke="#10b981"
            name="Cumulative Sales"
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
```

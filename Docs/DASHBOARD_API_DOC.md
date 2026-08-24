# Dashboard & Analytics Module API Documentation

This document provides comprehensive, production-grade documentation for the **Dashboard & Analytics Module** (`/dashboard/*`) in the Yaqeen Backend ERP.

The module powers:

1. **Asosiy KPI bloklari (Yuqori kassetalar)**:
   - **Umumiy daromad va sof foyda**: Oylik va yillik tushum, sof foyda va ularning o'tgan davrga nisbatan o'sish foizi (`revenueGrowthRate`, `netProfitGrowthRate`).
   - **Faol va yakunlangan yuklar**: Yo'lda bo'lgan (`inTransitOrders`), stansiyada/chegarada yuklanayotgan (`waitingOrders`) va yetkazib berilgan (`completedOrders`) yuklar soni hamda to'liq `statusCounts`.
   - **Qarzdorlik (Debitor / Kreditor)**: Mijozlarning to'lanmagan hisoblari (`accountsReceivable`), tashuvchi/agentlarga qarzdorliklar (`accountsPayable`) va sof balans (`netBalance`).
2. **Analytics va Grafika bloklari**:
   - **Yo'nalishlar va transport turlari tahlili (Pie / Donut Chart)**: Avto, Temir yo'l, Havo, Dengiz transportlari ulushi (`/dashboard/cargo-distribution`), hamda Xitoy – O'zbekiston, Turkiya – O'zbekiston va h.k. yo'nalishlar tahlili (`/dashboard/route-analytics`).
   - **Tushum va xarajatlar dinamikasi (Line Chart)**: Kunlik yoki oylik daromad, xarajatlar va sof foydaning parallel o'sish/tushish grafigi (`/dashboard/sales-progress`).
   - **Menejerlar va sotuv ko'rsatkichlari (Bar Chart)**: Menejerlarning buyurtmalar soni, daromadi, sof marjasi, yuk hajmi/og'irligi va konversiyasi (`/dashboard/top-performers`).
   - **Yuk yetkazish vaqti va samaradorlik (Status Tracking)**: O'rtacha yetkazish kunlari, o'z vaqtida yetkazish foizi (`onTimeRatePercentage`) va yo'nalishlar bo'yicha transit muddatlari (`/dashboard/delivery-efficiency`).

---

## 1. Authentication & Security

All endpoints require JWT Bearer authentication and valid user permissions:

```http
Authorization: Bearer <your_access_token>
```

### Guards Applied:

- **`JwtAuthGuard`**: Validates JWT token signature and expiration.
- **`PermissionsGuard`**: Ensures authenticated user account is active and authorized.

---

## 2. Endpoints Overview

| Endpoint                             | Method | Description                                                                                                               |
| :----------------------------------- | :----- | :------------------------------------------------------------------------------------------------------------------------ |
| **`/dashboard/summary`**             | `GET`  | Yuqori KPI kassetalari (Oylik/Yillik daromad, sof foyda, o'sish %, faol/yakunlangan yuklar, debitor/kreditor qarzdorlik). |
| **`/dashboard/sales-progress`**      | `GET`  | Tushum, xarajat va sof foyda dinamikasi grafigi (Line Chart) bilan period filtrlari, doimiy zero-filled vaqt bucketlari.  |
| **`/dashboard/cargo-distribution`**  | `GET`  | Transport turlari (Avto, Temir yo'l, Havo, Dengiz), yuk turlari (LTL vs FTL) va statuslar ulushi (Pie/Donut Chart).       |
| **`/dashboard/route-analytics`**     | `GET`  | Yo'nalishlar va davlatlar kesimidagi hajm va tushum tahlili (Xitoy – O'zbekiston, Turkiya va h.k.).                       |
| **`/dashboard/top-performers`**      | `GET`  | Menejerlar va eng yirik mijozlar ko'rsatkichlari (Bar Chart leaderboards).                                                |
| **`/dashboard/delivery-efficiency`** | `GET`  | Yuk yetkazish vaqtlari (o'rtacha transit kunlari, on-time rate %, yo'nalishlar bo'yicha tezlik).                          |
| **`/dashboard/debt-summary`**        | `GET`  | Debitor (Mijozlar qarzi) va Kreditor (Tashuvchilar oldidagi qarz) balansi va eng katta qarzdorlar ro'yxati.               |

---

## 3. Timeframe Period Filters & Rules

All timeframe boundaries are calculated deterministically in UTC:

| Period Code  | Description      | Range Formula                                            | Default Granularity         |
| :----------- | :--------------- | :------------------------------------------------------- | :-------------------------- |
| **`1D`**     | Current Day      | Bugun `00:00:00.000 UTC` dan `23:59:59.999 UTC` gacha    | **`hour`** (24 buckets)     |
| **`5D`**     | Last 5 Days      | `Bugun - 4 kun` dan Bugun `23:59:59` gacha               | **`day`** (5 buckets)       |
| **`1M`**     | Last 1 Month     | `Bugun - 30 kun` dan Bugun `23:59:59` gacha              | **`day`** (31 buckets)      |
| **`6M`**     | Last 6 Months    | `Bugun - 6 oy` dan Bugun `23:59:59` gacha                | **`month`** (6-7 buckets)   |
| **`YTD`**    | Year To Date     | Joriy yilning `1-Yanvar`idan Bugungacha                  | **`month`** (Jan – Joriy)   |
| **`1Y`**     | Last 1 Year      | `Bugun - 1 yil` dan Bugun `23:59:59` gacha               | **`month`** (12-13 buckets) |
| **`5Y`**     | Last 5 Years     | `Bugun - 5 yil` dan Bugun `23:59:59` gacha               | **`year`** (5-6 buckets)    |
| **`MAX`**    | System Inception | Baza boshidan Bugungacha bo'lgan barcha vaqt             | **Auto-detected**           |
| **`CUSTOM`** | Custom Range     | Foydalanuvchi tanlagan `start_date` dan `end_date` gacha | **Auto-detected**           |

---

## 4. API Endpoints Reference

### 1. Asosiy KPI bloklari: `GET /dashboard/summary`

Executive KPI kassetalarini bitta so'rovda qaytaradi:

#### Query Parametrlari:

- `period` (optional, default: `1M`): `1D`, `5D`, `1M`, `6M`, `YTD`, `1Y`, `5Y`, `MAX`, `CUSTOM`
- `currency` (optional, default: `UZS`): `UZS`, `USD`, `RUB`, `RMB`, `CNY`
- `employee_id`, `client_id`, `cargo_type`
- `transport_type` (single enum: `AUTO`, `RAILWAY`, `AIR`, `SEA`, `OTHER`) or `transport_types` (multimodal array / comma-separated string: `railway,auto`)

#### Universal Response:

```json
{
  "currency": "USD",
  "totalSales": 128500.0,
  "totalPurchaseCost": 92300.0,
  "totalMargin": 36200.0,
  "marginPercentage": 28.17,
  "totalOrders": 42,
  "completedOrders": 28,
  "inTransitOrders": 9,
  "waitingOrders": 5,
  "activeOrders": 14,
  "averageOrderValue": 861.9,
  "totalVolume": 450.5,
  "totalWeight": 18200.0,
  "ltlOrderCount": 18,
  "ftlOrderCount": 24,
  "salesGrowthVsPriorPeriod": 16.4,
  "marginGrowthVsPriorPeriod": 21.8,
  "statusCounts": {
    "waiting": 2,
    "station": 2,
    "on_the_way": 9,
    "on_the_border": 1,
    "reload": 0,
    "arrived": 28
  },
  "monthly": {
    "revenue": 54200.0,
    "purchaseCost": 38900.0,
    "netProfit": 15300.0,
    "marginPercentage": 28.23,
    "revenueGrowthRate": 12.5,
    "netProfitGrowthRate": 18.2,
    "orderCount": 18
  },
  "yearly": {
    "revenue": 348000.0,
    "purchaseCost": 252000.0,
    "netProfit": 96000.0,
    "marginPercentage": 27.59,
    "revenueGrowthRate": 34.8,
    "netProfitGrowthRate": 41.2,
    "orderCount": 115
  },
  "debtSummary": {
    "currency": "USD",
    "accountsReceivable": 24500.0,
    "accountsPayable": 17800.0,
    "netBalance": 6700.0,
    "debtorClientCount": 8,
    "creditorCarrierCount": 5
  },
  "deliveryEfficiency": {
    "averageTransitDays": 11.4,
    "minTransitDays": 4,
    "maxTransitDays": 22,
    "totalDeliveredCount": 28,
    "totalInTransitCount": 9,
    "totalActiveCount": 14,
    "onTimeDeliveriesCount": 26,
    "delayedDeliveriesCount": 2,
    "onTimeRatePercentage": 92.86
  }
}
```

---

### 2. Tushum va xarajatlar dinamikasi (Line Chart): `GET /dashboard/sales-progress`

Parallel o'sish/tushish grafiki uchun uzluksiz vaqt oraliqlari (kunlik, soatlik, oylik):

#### Query Parametrlari:

- `period`, `granularity`, `start_date`, `end_date`, `currency`
- `include_expenses` (`boolean`, default: `false`): Agar `true` bo'lsa, operatsion xarajatlar (`expenses` jadvalidan) ham parallel qo'shib hisoblanadi.
- `transport_type` (single enum: `AUTO`, `RAILWAY`, `AIR`, `SEA`, `OTHER`) or `transport_types` (multimodal array / comma-separated string: `railway,auto`)

#### Universal Response:

```json
{
  "meta": {
    "period": "1M",
    "startDate": "2026-07-24T00:00:00.000Z",
    "endDate": "2026-08-23T23:59:59.999Z",
    "granularity": "day",
    "totalBuckets": 31,
    "currency": "USD"
  },
  "summary": {
    "totalSales": 128500.0,
    "totalPurchaseCost": 92300.0,
    "totalOperationalExpenses": 4500.0,
    "totalExpenses": 96800.0,
    "totalMargin": 36200.0,
    "totalNetProfit": 31700.0,
    "marginPercentage": 28.17,
    "totalOrders": 42,
    "averageOrderValue": 861.9,
    "completedOrders": 28,
    "pendingOrders": 5,
    "inTransitOrders": 9,
    "growthRateSales": 16.4,
    "growthRateMargin": 21.8,
    "growthRateNetProfit": 19.5
  },
  "dataPoints": [
    {
      "index": 0,
      "bucketStart": "2026-07-24T00:00:00.000Z",
      "bucketEnd": "2026-07-24T23:59:59.999Z",
      "dateKey": "2026-07-24",
      "label": "24 Jul",
      "sales": 4500.0,
      "purchaseCost": 3200.0,
      "operationalExpenses": 150.0,
      "totalExpenses": 3350.0,
      "margin": 1300.0,
      "netProfit": 1150.0,
      "orderCount": 2,
      "cumulativeSales": 4500.0,
      "cumulativeMargin": 1300.0,
      "cumulativeNetProfit": 1150.0
    }
  ]
}
```

---

### 3. Yo'nalishlar va transport turlari tahlili (Pie/Donut Chart): `GET /dashboard/cargo-distribution`

Transport turlari ulushi (Avto, Temir yo'l, Havo, Dengiz) va yuk statuslari taqsimoti:

#### Response:

```json
{
  "currency": "USD",
  "transportTypeDistribution": [
    {
      "type": "AUTO",
      "name": "Avtotransport (Fura / Yuk mashinasi)",
      "count": 22,
      "percentage": 52.38,
      "totalSales": 68000.0,
      "totalMargin": 19500.0,
      "totalVolume": 280.0,
      "totalWeight": 11000.0
    },
    {
      "type": "RAILWAY",
      "name": "Temir yo'l (Konteyner / Vagon)",
      "count": 14,
      "percentage": 33.33,
      "totalSales": 42500.0,
      "totalMargin": 12000.0,
      "totalVolume": 140.0,
      "totalWeight": 6500.0
    },
    {
      "type": "AIR",
      "name": "Havo transporti (Avia)",
      "count": 4,
      "percentage": 9.52,
      "totalSales": 14000.0,
      "totalMargin": 3800.0,
      "totalVolume": 20.5,
      "totalWeight": 450.0
    },
    {
      "type": "SEA",
      "name": "Dengiz transporti (Kema / Port)",
      "count": 2,
      "percentage": 4.76,
      "totalSales": 4000.0,
      "totalMargin": 900.0,
      "totalVolume": 10.0,
      "totalWeight": 250.0
    }
  ],
  "cargoTypeDistribution": [
    {
      "category": "FTL",
      "count": 24,
      "totalSales": 82000.0,
      "percentage": 57.14
    },
    {
      "category": "LTL",
      "count": 18,
      "totalSales": 46500.0,
      "percentage": 42.86
    }
  ],
  "statusDistribution": [
    {
      "category": "Arrived",
      "count": 28,
      "totalSales": 89000.0,
      "percentage": 66.67
    },
    {
      "category": "On the way",
      "count": 9,
      "totalSales": 27500.0,
      "percentage": 21.43
    },
    {
      "category": "Station",
      "count": 3,
      "totalSales": 7800.0,
      "percentage": 7.14
    },
    {
      "category": "Waiting",
      "count": 2,
      "totalSales": 4200.0,
      "percentage": 4.76
    }
  ]
}
```

---

### 4. Yo'nalishlar va davlatlar tahlili: `GET /dashboard/route-analytics`

Qaysi davlat/yo'nalishlar bo'yicha yuk tashish hajmi yuqoriligi (Xitoy – O'zbekiston, Turkiya, Yevropa):

#### Query Parametrlari:

- `period`, `limit` (default: `10`), `currency`

#### Universal Response:

```json
{
  "currency": "USD",
  "topRoutes": [
    {
      "route": "China – O'zbekiston",
      "originCountry": "China",
      "originCity": "Guangzhou",
      "destinationCountry": "O'zbekiston",
      "destinationCity": "Tashkent",
      "count": 24,
      "percentage": 57.14,
      "totalSales": 76000.0,
      "totalMargin": 21500.0,
      "totalVolume": 260.0,
      "totalWeight": 10500.0
    },
    {
      "route": "Turkey – O'zbekiston",
      "originCountry": "Turkey",
      "originCity": "Istanbul",
      "destinationCountry": "O'zbekiston",
      "destinationCity": "Tashkent",
      "count": 12,
      "percentage": 28.57,
      "totalSales": 38000.0,
      "totalMargin": 10800.0,
      "totalVolume": 130.0,
      "totalWeight": 5200.0
    }
  ],
  "originCountries": [
    {
      "countryName": "China",
      "count": 24,
      "percentage": 57.14,
      "totalSales": 76000.0,
      "totalVolume": 260.0,
      "totalWeight": 10500.0
    },
    {
      "countryName": "Turkey",
      "count": 12,
      "percentage": 28.57,
      "totalSales": 38000.0,
      "totalVolume": 130.0,
      "totalWeight": 5200.0
    }
  ],
  "destinationCountries": [
    {
      "countryName": "O'zbekiston",
      "count": 42,
      "percentage": 100.0,
      "totalSales": 128500.0,
      "totalVolume": 450.5,
      "totalWeight": 18200.0
    }
  ]
}
```

---

### 5. Menejerlar va sotuv ko'rsatkichlari (Bar Chart): `GET /dashboard/top-performers`

Har bir sotuv/logistika menejerining bajargan buyurtmalari hajmi, keltirgan foydasi va konversiyasi:

#### Universal Response:

```json
{
  "currency": "USD",
  "topManagers": [
    {
      "employeeId": "e4a215b4-7b1b-4d92-93cb-33d31b0142fa",
      "employeeName": "Ali Valiyev",
      "departmentName": "Sotuv Bo'limi",
      "totalSales": 64000.0,
      "totalPurchaseCost": 46000.0,
      "totalMargin": 18000.0,
      "orderCount": 20,
      "totalVolume": 210.5,
      "totalWeight": 8500.0,
      "averageOrderValue": 3200.0,
      "completedOrdersCount": 15,
      "activeOrdersCount": 5,
      "conversionRate": 75.0
    }
  ],
  "topClients": [
    {
      "clientId": "c1f8832a-5e2b-4c12-881b-9f93120d5102",
      "clientName": "OOO Global Express",
      "companyName": "Global Express LLC",
      "totalSales": 34000.0,
      "totalPurchaseCost": 24000.0,
      "totalMargin": 10000.0,
      "orderCount": 11,
      "totalVolume": 120.0,
      "totalWeight": 4800.0,
      "averageOrderValue": 3090.91
    }
  ]
}
```

---

### 6. Yuk yetkazish vaqti va samaradorlik: `GET /dashboard/delivery-efficiency`

Yuk yetkazish vaqti, on-time rate foizi va yo'nalishlar bo'yicha o'rtacha kunlar:

#### Universal Response:

```json
{
  "averageTransitDays": 11.4,
  "minTransitDays": 4,
  "maxTransitDays": 22,
  "totalDeliveredCount": 28,
  "totalInTransitCount": 9,
  "totalActiveCount": 14,
  "onTimeDeliveriesCount": 26,
  "delayedDeliveriesCount": 2,
  "onTimeRatePercentage": 92.86,
  "statusBreakdown": [
    {
      "status": "Arrived",
      "label": "Arrived",
      "count": 28,
      "percentage": 66.67,
      "totalSales": 89000.0,
      "totalVolume": 290.0,
      "totalWeight": 12000.0
    },
    {
      "status": "On the way",
      "label": "On the way",
      "count": 9,
      "percentage": 21.43,
      "totalSales": 27500.0,
      "totalVolume": 100.0,
      "totalWeight": 4200.0
    }
  ],
  "routeTransitTimes": [
    {
      "route": "China – O'zbekiston",
      "averageTransitDays": 12.8,
      "count": 18
    },
    {
      "route": "Turkey – O'zbekiston",
      "averageTransitDays": 8.5,
      "count": 10
    }
  ]
}
```

---

### 7. Qarzdorlik (Debitor / Kreditor) balansi: `GET /dashboard/debt-summary`

Mijozlarning to'lanmagan hisoblari va tashuvchilarga bo'lgan qarzdorliklar balansi:

#### Universal Response:

```json
{
  "currency": "USD",
  "accountsReceivable": 24500.0,
  "accountsPayable": 17800.0,
  "netBalance": 6700.0,
  "debtorClientCount": 8,
  "creditorCarrierCount": 5,
  "topDebtorClients": [
    {
      "clientId": "c1f8832a-5e2b-4c12-881b-9f93120d5102",
      "clientName": "OOO Global Express",
      "companyName": "Global Express LLC",
      "amount": 12000.0,
      "orderCount": 4
    }
  ],
  "topCreditorCarriers": [
    {
      "agentName": "Silk Road Logistics",
      "amount": 9500.0,
      "orderCount": 3
    }
  ]
}
```

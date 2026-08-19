# Comprehensive KPI Analysis & Cargo Audit Documentation: Donyor Nishonboyev (August 2026)

**Production Server:** `https://backend-yaqeen.uz`  
**API Base URL:** `https://backend-yaqeen.uz/api/v1`  
**Target Period:** August 2026 (`2026-08-01` to `2026-08-31`)  
**Generated At:** 2026-08-19  
**Status:** **Audited & Verified against Live Production Database**

---

## 1. Executive Summary & Employee Profile

This document provides an exhaustive, mathematical, and technical breakdown of the August 2026 Key Performance Indicator (KPI) figures for **Donyor Nishonboyev** from the Sales Department.

| Parameter                    | Production Value                       | Description                                        |
| :--------------------------- | :------------------------------------- | :------------------------------------------------- |
| **Employee Full Name**       | **Donyor Nishonboyev**                 | Assigned Sales Manager / Cargo Operator            |
| **Employee ID**              | `5e9daa65-53b6-4ee2-a441-09ca75df9f65` | UUID in `employees` table                          |
| **Department**               | **sales**                              | Linked to `departments` table                      |
| **User Color Tag**           | `#C8A96A`                              | UI Identification Badge Color                      |
| **Employee Plan ID**         | `5c5a3330-1822-4af0-952a-8b3a5f063991` | UUID in `employee_plans` table                     |
| **Plan Target Period**       | `2026-08-01` (`2026-08`)               | Active monthly target window                       |
| **Plan Currency**            | **USD ($)**                            | Baseline target evaluation currency                |
| **Target FTL Sales**         | **$6,000.00 USD**                      | Required financial sales threshold                 |
| **Target LTL Volume**        | **0.00 m³**                            | No LTL volume quota set                            |
| **Achieved FTL Sales**       | **$44,300.00 USD**                     | Cumulative gross sales of qualifying shipments     |
| **Achieved LTL Volume**      | **0.00 m³**                            | No LTL shipments registered                        |
| **Overall Completion**       | **738.33%**                            | Target exceeded by **+638.33% ($38,300.00 USD)**   |
| **Company Leaderboard Rank** | **#4**                                 | Rank in company-wide sales leaderboard             |
| **Total Cargos in KPI**      | **5 Shipments**                        | All 5 are Full Truck Load (FTL) / Container orders |
| **Total Net Yield (Profit)** | **$3,152.00 USD**                      | Net gross profit margin earned for company         |

---

## 2. KPI Calculation Engine & Filtering Rules

The KPI calculation endpoint `GET /api/v1/cargo-kpi/plans` evaluates each employee plan in `employee_plans` by querying all records in `cargo_registrations`.

### 2.1 Backend Implementation Logic

In [`CargoKpiService.getEmployeePlansProgress`](file:///D:/Shakhzod/Javascript/Yaqeen_Backend/src/cargo-kpi/cargo-kpi.service.ts#L1022-L1046):

```typescript
// 1. Determine the Month Range for Period 2026-08
const dateRange = {
  startDate: '2026-08-01',
  endDate: '2026-08-31',
};

// 2. Query Cargo Registrations with Fallback Filtering
let regQuery = knex('cargo_registrations')
  .where('employee_id', '5e9daa65-53b6-4ee2-a441-09ca75df9f65')
  .where((builder) => {
    builder
      // Condition A: Confirmed Date within target month
      .whereBetween('confirmed_date', ['2026-08-01', '2026-08-31'])
      // Condition B: Fallback to created_at ONLY if confirmed_date IS NULL
      .orWhere((b2) => {
        b2.whereNull('confirmed_date').whereBetween('created_at', [
          '2026-08-01T00:00:00.000Z',
          '2026-08-31T23:59:59.999Z',
        ]);
      })
      // Condition C: Sell Date within target month
      .orWhereBetween('sell_date', ['2026-08-01', '2026-08-31']);
  });
```

### 2.2 Qualification Criteria Rules

1. **Cargo Ownership:** `cargo_registrations.employee_id` must match `employee_plans.employee_id`.
2. **Date Alignment (OR Condition):**
   - **`confirmed_date`** is in range `[2026-08-01, 2026-08-31]`, **OR**
   - **`created_at`** is in range `[2026-08-01T00:00:00.000Z, 2026-08-31T23:59:59.999Z]` **only when `confirmed_date` is `NULL`**, **OR**
   - **`sell_date`** is in range `[2026-08-01, 2026-08-31]`.
3. **Cargo Classification:**
   - **LTL:** Adds `volume` ($m^3$) to `actual_volume`.
   - **FTL:** Converts net yield (`sell_price - purchase_price`) to the plan currency (`USD`) and adds to `actual_amount`.

---

## 3. High-Level Performance Summary

```
+---------------------------------------------------------------------------------------------------+
| TARGET: $6,000.00 USD (FTL)                                                                       |
| ACTUAL: $44,300.00 USD (FTL)                                                                      |
| PROGRESS: [====================================================================] 738.33%          |
| SURPLUS: +$38,300.00 USD (+638.33%)                                                               |
+---------------------------------------------------------------------------------------------------+
```

### Mathematical Breakdown:

$$\text{FTL Target Amount} = \$6,000.00\text{ USD}$$

$$\text{FTL Actual Sales} = \$8,100.00 + \$9,300.00 + \$9,300.00 + \$6,800.00 + \$10,800.00 = \mathbf{\$44,300.00\text{ USD}}$$

$$\text{FTL Remaining Amount} = \max(0, \$6,000.00 - \$44,300.00) = \mathbf{\$0.00\text{ USD}}$$

$$\text{FTL Completion Percentage} = \frac{\$44,300.00}{\$6,000.00} \times 100\% = \mathbf{738.33\%}$$

$$\text{Net Yield Generated} = \$400.00 + \$900.00 + \$900.00 + \$252.00 + \$700.00 = \mathbf{\$3,152.00\text{ USD}}$$

---

## 4. Item-by-Item Detailed Audit of Every Cargo

There are **7 total cargo registrations** recorded in the database under Donyor Nishonboyev. Below is an exhaustive audit of each record, verifying why it was included or excluded from the August 2026 KPI.

```
                    ┌────────────────────────────────────────────────────────┐
                    │       All 7 Cargos Registered Under Donyor             │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 │                                                             │
                 ▼                                                             ▼
   ┌───────────────────────────┐                                 ┌───────────────────────────┐
   │  5 Qualifying Shipments   │                                 │   2 Excluded Shipments    │
   │  Total: $44,300.00 USD    │                                 │   Total: $10,950.00 USD   │
   ├───────────────────────────┤                                 ├───────────────────────────┤
   │ 1. FCIU9250546 ($ 8,100)  │                                 │ 1. CICU1766070 ($7,850)   │
   │ 2. FSCU7075280 ($ 9,300)  │                                 │ 2. TRACK11    ($3,100)    │
   │ 3. FSCU7064259 ($ 9,300)  │                                 └───────────────────────────┘
   │ 4. TEMU6395367 ($ 6,800)  │
   │ 5. 686DNA17    ($10,800)  │
   └───────────────────────────┘
```

---

### Cargo #1: `FCIU9250546` (Contributing)

- **Registration UUID:** `a0189cde-e363-4d4c-97ad-17a1a96b00a1`
- **Cargo Classification:** `FTL`
- **Container / Vehicle ID:** `FCIU9250546`
- **Container Specifications:** `40HQ` Container
- **Cargo Description:** `Uskuna`
- **Assigned Agent:** `Tie Tie`
- **Client Information:**
  - **Client Name:** Abdulaziz aka Plast
  - **Client UUID:** `7a39efaf-5d1f-495a-855f-2dfdc0de6aba`
  - **Company:** company 23
  - **Phone Number:** `+998909250950`
- **Shipment Status:** `Waiting`
- **Date Audit:**
  - `confirmed_date`: `2026-07-07` _(July 2026)_
  - `loaded_date`: `2026-07-07`
  - `arrived_date`: `null`
  - `purchase_date`: `2026-08-19`
  - **`sell_date`:** **`2026-08-19`** $\rightarrow$ **MATCHES August 2026 range [`2026-08-01`, `2026-08-31`]**
  - `created_at`: `2026-08-19T08:55:09.009Z`
- **Financial Ledger:**
  - Purchase Price: `$7,700.00 USD` ($91,017,080.00\text{ UZS}$ @ rate $11,820.40$)
  - **Sell Price (KPI Contribution):** **`$8,100.00 USD`** ($95,745,240.00\text{ UZS}$ @ rate $11,820.40$)
  - **Net Yield (Margin):** **`$400.00 USD`** ($4,728,160.00\text{ UZS}$)
- **KPI Decision:** **INCLUDED** (via `sell_date = 2026-08-19`).

---

### Cargo #2: `FSCU7075280` (Contributing)

- **Registration UUID:** `a084a83c-672b-4cdc-a75f-6012425f921c`
- **Cargo Classification:** `FTL`
- **Container / Vehicle ID:** `FSCU7075280`
- **Container Specifications:** `45HQ` Container
- **Cargo Description:** `Uskuna`
- **Assigned Agent:** `Tie Tie`
- **Client Information:**
  - **Client Name:** Abdulaziz aka Plast
  - **Client UUID:** `7a39efaf-5d1f-495a-855f-2dfdc0de6aba`
  - **Company:** company 23
  - **Phone Number:** `+998909250950`
- **Shipment Status:** `Waiting`
- **Date Audit:**
  - `confirmed_date`: `2026-07-07` _(July 2026)_
  - `loaded_date`: `2026-07-08`
  - `arrived_date`: `null`
  - `purchase_date`: `2026-08-19`
  - **`sell_date`:** **`2026-08-19`** $\rightarrow$ **MATCHES August 2026 range [`2026-08-01`, `2026-08-31`]**
  - `created_at`: `2026-08-19T08:52:56.722Z`
- **Financial Ledger:**
  - Purchase Price: `$8,400.00 USD` ($99,291,360.00\text{ UZS}$ @ rate $11,820.40$)
  - **Sell Price (KPI Contribution):** **`$9,300.00 USD`** ($109,929,720.00\text{ UZS}$ @ rate $11,820.40$)
  - **Net Yield (Margin):** **`$900.00 USD`** ($10,638,360.00\text{ UZS}$)
- **KPI Decision:** **INCLUDED** (via `sell_date = 2026-08-19`).

---

### Cargo #3: `FSCU7064259` (Contributing)

- **Registration UUID:** `984887da-6e33-4082-a108-c5149e23f3d3`
- **Cargo Classification:** `FTL`
- **Container / Vehicle ID:** `FSCU7064259`
- **Container Specifications:** `45HQ` Container
- **Cargo Description:** `Uskuna`
- **Assigned Agent:** `Tie Tie`
- **Client Information:**
  - **Client Name:** Abdulaziz aka Plast
  - **Client UUID:** `7a39efaf-5d1f-495a-855f-2dfdc0de6aba`
  - **Company:** company 23
  - **Phone Number:** `+998909250950`
- **Shipment Status:** `Waiting`
- **Date Audit:**
  - `confirmed_date`: `2026-07-07` _(July 2026)_
  - `loaded_date`: `2026-08-07`
  - `arrived_date`: `null`
  - `purchase_date`: `2026-08-19`
  - **`sell_date`:** **`2026-08-19`** $\rightarrow$ **MATCHES August 2026 range [`2026-08-01`, `2026-08-31`]**
  - `created_at`: `2026-08-19T08:51:40.003Z`
- **Financial Ledger:**
  - Purchase Price: `$8,400.00 USD` ($99,291,360.00\text{ UZS}$ @ rate $11,820.40$)
  - **Sell Price (KPI Contribution):** **`$9,300.00 USD`** ($109,929,720.00\text{ UZS}$ @ rate $11,820.40$)
  - **Net Yield (Margin):** **`$900.00 USD`** ($10,638,360.00\text{ UZS}$)
- **KPI Decision:** **INCLUDED** (via `sell_date = 2026-08-19`).

---

### Cargo #4: `TEMU6395367` (Contributing)

- **Registration UUID:** `78c0756a-3b0b-4a67-a705-812662a72aa7`
- **Cargo Classification:** `FTL`
- **Container / Vehicle ID:** `TEMU6395367`
- **Container Specifications:** `40HQ` Container
- **Cargo Description:** `Uskuna`
- **Assigned Agent:** `Deyzi`
- **Client Information:**
  - **Client Name:** Abdulaziz aka Plast
  - **Client UUID:** `7a39efaf-5d1f-495a-855f-2dfdc0de6aba`
  - **Company:** company 23
  - **Phone Number:** `+998909250950`
- **Shipment Status:** `Arrived`
- **Date Audit:**
  - `confirmed_date`: `2026-06-02` _(June 2026)_
  - `loaded_date`: `2026-06-03`
  - `arrived_date`: `2026-07-09` _(July 2026)_
  - `purchase_date`: `2026-08-09`
  - **`sell_date`:** **`2026-08-09`** $\rightarrow$ **MATCHES August 2026 range [`2026-08-01`, `2026-08-31`]**
  - `created_at`: `2026-08-10T11:13:58.119Z`
- **Financial Ledger:**
  - Purchase Price: `$6,548.00 USD` ($78,023,610.72\text{ UZS}$ @ rate $11,915.64$)
  - **Sell Price (KPI Contribution):** **`$6,800.00 USD`** ($81,026,352.00\text{ UZS}$ @ rate $11,915.64$)
  - **Net Yield (Margin):** **`$252.00 USD`** ($3,002,741.28\text{ UZS}$)
- **KPI Decision:** **INCLUDED** (via `sell_date = 2026-08-09`).

---

### Cargo #5: `686DNA17` (Contributing)

- **Registration UUID:** `ead465be-dea4-4518-b4ce-15b509132041`
- **Cargo Classification:** `FTL`
- **Container / Vehicle ID:** `686DNA17`
- **Vehicle Specifications:** `120m³` Auto / Truck
- **Cargo Description:** `Pechka`
- **Assigned Agent:** `Kai`
- **Client Information:**
  - **Client Name:** Azamat aka Urganch
  - **Client UUID:** `94938084-18f7-43e5-80f4-e76395c61e73`
  - **Company:** company 28
  - **Phone Number:** `+998331506666`
- **Shipment Status:** `Arrived`
- **Date Audit:**
  - **`confirmed_date`:** **`2026-08-09`** $\rightarrow$ **MATCHES August 2026 range [`2026-08-01`, `2026-08-31`]**
  - `loaded_date`: `2026-06-03`
  - `arrived_date`: `2026-07-09`
  - `purchase_date`: `2026-06-02`
  - **`sell_date`:** **`2026-08-09`** $\rightarrow$ **MATCHES August 2026 range [`2026-08-01`, `2026-08-31`]**
  - `created_at`: `2026-08-10T11:10:45.341Z`
- **Financial Ledger:**
  - Purchase Price: `$10,100.00 USD` ($120,685,203.00\text{ UZS}$ @ rate $11,949.03$)
  - **Sell Price (KPI Contribution):** **`$10,800.00 USD`** ($128,688,912.00\text{ UZS}$ @ rate $11,915.64$)
  - **Net Yield (Margin):** **`$700.00 USD`** ($8,003,709.00\text{ UZS}$)
- **KPI Decision:** **INCLUDED** (matched via BOTH `confirmed_date = 2026-08-09` and `sell_date = 2026-08-09`).

---

### Cargo #6: `CICU1766070` (Excluded)

- **Registration UUID:** `b7e3bd0c-5a4d-4f58-b51a-de8d1a753389`
- **Cargo Classification:** `FTL` (`40HQ` Container)
- **Cargo Description:** `USKUNA`
- **Assigned Agent:** `Rick`
- **Client:** Abdulaziz aka Plast (`+998909250950`)
- **Shipment Status:** `Arrived`
- **Date Audit:**
  - `confirmed_date`: `2026-06-18` _(June 2026)_
  - `loaded_date`: `2026-06-27`
  - `arrived_date`: `2026-08-01` _(August 2026)_
  - `purchase_date`: `2026-06-25`
  - `sell_date`: `2026-06-25` _(June 2026)_
  - `created_at`: `2026-08-13T08:22:38.964Z`
- **Financial Details:** Sell Price = `$7,850.00 USD`
- **Technical Exclusion Reason:**
  - `confirmed_date` is not null (`2026-06-18`), so fallback `created_at` condition is not activated.
  - Neither `confirmed_date` (`2026-06-18`) nor `sell_date` (`2026-06-25`) falls within August 2026 (`2026-08-01` to `2026-08-31`).
  - `arrived_date` (`2026-08-01`) is an operational tracking date and is **not** used by the KPI plan calculation engine.
- **KPI Decision:** **EXCLUDED**.

---

### Cargo #7: `TRACK11` (Excluded)

- **Registration UUID:** `6e348254-4bd7-48e0-a8b9-df6feff30be9`
- **Cargo Classification:** `FTL` (`96m³` Auto / Truck)
- **Cargo Description:** `duralayt lampa`
- **Assigned Agent:** `BARAKA`
- **Client:** Shaxzod aka Voltus (`+998939223900`)
- **Shipment Status:** `On the way`
- **Date Audit:**
  - `confirmed_date`: `2026-06-19` _(June 2026)_
  - `loaded_date`: `2026-06-20`
  - `arrived_date`: `2026-07-25`
  - `purchase_date`: `2026-06-19`
  - `sell_date`: `2026-06-19` _(June 2026)_
  - `created_at`: `2026-08-13T07:44:30.048Z`
- **Financial Details:** Sell Price = `$3,100.00 USD`
- **Technical Exclusion Reason:**
  - Both `confirmed_date` and `sell_date` are recorded in June 2026 (`2026-06-19`).
  - `confirmed_date` is populated, so `created_at` is bypassed.
- **KPI Decision:** **EXCLUDED**.

---

## 5. Master Comparative Matrix

|   #   | Container / Truck ID | Client Name         | Cargo Item     | Confirmed Date |  Sell Date   |  Created At  | FTL Sell Price (USD) | Net Yield (USD) |    KPI Inclusion Status     | Match Condition                       |
| :---: | :------------------- | :------------------ | :------------- | :------------: | :----------: | :----------: | -------------------: | --------------: | :-------------------------: | :------------------------------------ |
| **1** | `FCIU9250546`        | Abdulaziz aka Plast | Uskuna         |  `2026-07-07`  | `2026-08-19` | `2026-08-19` |      **`$8,100.00`** |       `$400.00` |        **INCLUDED**         | `sell_date` in Aug                    |
| **2** | `FSCU7075280`        | Abdulaziz aka Plast | Uskuna         |  `2026-07-07`  | `2026-08-19` | `2026-08-19` |      **`$9,300.00`** |       `$900.00` |        **INCLUDED**         | `sell_date` in Aug                    |
| **3** | `FSCU7064259`        | Abdulaziz aka Plast | Uskuna         |  `2026-07-07`  | `2026-08-19` | `2026-08-19` |      **`$9,300.00`** |       `$900.00` |        **INCLUDED**         | `sell_date` in Aug                    |
| **4** | `TEMU6395367`        | Abdulaziz aka Plast | Uskuna         |  `2026-06-02`  | `2026-08-09` | `2026-08-10` |      **`$6,800.00`** |       `$252.00` |        **INCLUDED**         | `sell_date` in Aug                    |
| **5** | `686DNA17`           | Azamat aka Urganch  | Pechka         |  `2026-08-09`  | `2026-08-09` | `2026-08-10` |     **`$10,800.00`** |       `$700.00` |        **INCLUDED**         | `confirmed_date` & `sell_date` in Aug |
|   6   | `CICU1766070`        | Abdulaziz aka Plast | USKUNA         |  `2026-06-18`  | `2026-06-25` | `2026-08-13` |          `$7,850.00` |       `$369.00` |        **EXCLUDED**         | Dates in June 2026                    |
|   7   | `TRACK11`            | Shaxzod aka Voltus  | duralayt lampa |  `2026-06-19`  | `2026-06-19` | `2026-08-13` |          `$3,100.00` |       `$550.00` |        **EXCLUDED**         | Dates in June 2026                    |
|   —   | **TOTALS**           | —                   | —              |       —        |      —       |      —       |     **`$44,300.00`** | **`$3,152.00`** | **5 Included / 2 Excluded** | —                                     |

---

## 6. Verification API Endpoints

To reproduce and verify these figures against the live production server, execute the following API calls with an authorized Bearer token:

### 1. Employee Plan & Leaderboard Progress

```http
GET /api/v1/cargo-kpi/plans?period=2026-08
Host: backend-yaqeen.uz
Authorization: Bearer <ACCESS_TOKEN>
```

### 2. Donyor Nishonboyev's Personal Plan Statistics

```http
GET /api/v1/cargo-kpi/plans/employee/5e9daa65-53b6-4ee2-a441-09ca75df9f65/stats?period=2026-08
Host: backend-yaqeen.uz
Authorization: Bearer <ACCESS_TOKEN>
```

### 3. Cargo Registrations for Donyor

```http
GET /api/v1/cargo-registrations?employee_id=5e9daa65-53b6-4ee2-a441-09ca75df9f65&limit=100
Host: backend-yaqeen.uz
Authorization: Bearer <ACCESS_TOKEN>
```

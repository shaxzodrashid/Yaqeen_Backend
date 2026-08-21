# Comprehensive KPI Analysis & Cargo Audit: Jamshid Atxamov (August 2026)

**Production Server:** `https://backend-yaqeen.uz`  
**API Endpoint:** `GET https://backend-yaqeen.uz/api/v1/cargo-kpi/plans?period=2026-08`  
**Target Period:** August 2026 (`2026-08-01` to `2026-08-31`)  
**Employee:** **Jamshid Atxamov** (Sales Department)  
**Audit Timestamp:** 2026-08-21T14:34:00+05:00  
**Verification Status:** **100% Audited & Mathematically Verified against Live Production Data**

---

## 1. Executive Summary & Performance Overview

In August 2026, **Jamshid Atxamov** achieved the **#1 Rank (Leaderboard Winner)** across the organization with **$19,248.00 USD** in actual FTL financial performance against a monthly target of **$6,000.00 USD**, achieving an outstanding completion rate of **320.80%** across **32 qualifying shipments**.

| Parameter                     | Production Database Value              | Details & Description                                          |
| :---------------------------- | :------------------------------------- | :------------------------------------------------------------- |
| **Employee Name**             | **Jamshid Atxamov**                    | Key Sales Manager / Account Operator                           |
| **Employee ID (UUID)**        | `634fecba-06ee-41f7-b92d-ce724cc79bed` | Unique identifier in `employees` table                         |
| **Department**                | **sales**                              | Linked to `departments` table                                  |
| **Employee Badge Color**      | `#10B981` (Emerald Green)              | Identification tag in UI leaderboard                           |
| **Employee Plan ID**          | `be153c2b-1d35-4ac6-9b5a-163730e033a1` | Record UUID in `employee_plans` table                          |
| **Plan Target Period**        | `2026-08-01` (`2026-08`)               | Target month                                                   |
| **Target Currency**           | **USD ($)**                            | Baseline target evaluation currency                            |
| **Target FTL Sales / Yield**  | **$6,000.00 USD**                      | Required financial sales KPI threshold                         |
| **Target LTL Volume**         | **0.00 m³**                            | No LTL volume quota set                                        |
| **Achieved FTL Fact (Yield)** | **$19,248.00 USD**                     | **Cumulative Net Yield Margin across 32 qualifying shipments** |
| **Achieved Gross Sales**      | **$310,580.00 USD**                    | Total gross revenue from 32 qualifying shipments               |
| **Total Cargo Purchase Cost** | **$291,332.00 USD**                    | Total supplier/carrier purchase cost                           |
| **Total Registered Cargos**   | **63 Shipments**                       | Total lifetime shipments assigned to Jamshid                   |
| **Qualifying August Cargos**  | **32 Shipments**                       | Met August 2026 date qualification criteria                    |
| **Excluded Cargos**           | **31 Shipments**                       | Dates belong to June/July 2026                                 |
| **Plan Completion Rate**      | **320.80%**                            | Plan exceeded by **+220.80% (+$13,248.00 USD)**                |
| **Company Leaderboard Rank**  | **#1 (Gold Medalist)**                 | Highest performing sales employee in August 2026               |

---

## 2. KPI Calculation Engine & Business Logic

According to the backend KPI calculation service (`CargoKpiService.getEmployeePlansProgress` and `calculateFtlCargoNetYield`), the fact amount for an employee plan in period `2026-08` is determined using rigorous business rules:

```
                                  ┌─────────────────────────────────────────┐
                                  │   All 63 Shipments Assigned to Jamshid  │
                                  └────────────────────┬────────────────────┘
                                                       │
                      ┌────────────────────────────────┴────────────────────────────────┐
                      ▼                                                                 ▼
     ┌──────────────────────────────────┐                              ┌──────────────────────────────────┐
     │      32 Qualifying Shipments     │                              │       31 Excluded Shipments      │
     │      August 2026 KPI Scope       │                              │        Past Periods (June)       │
     ├──────────────────────────────────┤                              ├──────────────────────────────────┤
     │ Gross Sales:    $310,580.00 USD  │                              │ Gross Sales:    $260,622.00 USD  │
     │ Purchase Cost:  $291,332.00 USD  │                              │ Purchase Cost:  $248,030.00 USD  │
     │ Net Fact/Yield:  $19,248.00 USD  │                              │ Net Yield:       $12,592.00 USD  │
     └──────────────────────────────────┘                              └──────────────────────────────────┘
```

### 2.1 Technical Filter Criteria

A shipment record in `cargo_registrations` is included in the August 2026 KPI calculation if and only if:

1. `employee_id` equals `634fecba-06ee-41f7-b92d-ce724cc79bed` (Jamshid Atxamov).
2. **Date Rule:** Any of the following three conditions evaluate to true:
   - **Condition A (`confirmed_date`):** Falls within `[2026-08-01, 2026-08-31]`.
   - **Condition B (`created_at` Fallback):** `confirmed_date` is `NULL` AND `created_at` falls within August 2026.
   - **Condition C (`sell_date`):** Falls within `[2026-08-01, 2026-08-31]`.

### 2.2 Financial Calculation Formula

For FTL shipments, the employee's KPI actual fact is calculated as the **Net Yield (Margin)**:

$$\text{Net Yield (USD)} = \text{Sell Price (USD)} - \text{Purchase Price (USD)}$$

$$\mathbf{\text{August 2026 Total Fact}} = \sum_{i=1}^{32} \text{Net Yield}_i = \mathbf{\$19,248.00\text{ USD}}$$

$$\mathbf{\text{Completion Percentage}} = \frac{\$19,248.00}{\$6,000.00} \times 100\% = \mathbf{320.80\%}$$

---

## 3. High-Level Aggregations & Distribution Analysis

### 3.1 Breakdown by Client

Jamshid generated his **$19,248.00 USD** profit fact across 4 major clients:

| Client Name        | Qualifying Cargos | Gross Sell (USD) | Purchase Cost (USD) | Net Yield / Fact (USD) | % of Total Yield |
| :----------------- | :---------------: | ---------------: | ------------------: | ---------------------: | :--------------: |
| **Saidjon aka**    |      **18**       |      $156,180.00 |         $146,009.00 |         **$10,171.00** |      52.84%      |
| **Shamsiddin aka** |      **12**       |      $131,350.00 |         $123,841.00 |          **$7,509.00** |      39.01%      |
| **Ahror aka**      |       **1**       |       $12,800.00 |          $11,852.00 |            **$948.00** |      4.93%       |
| **Abdulhamid aka** |       **1**       |       $10,250.00 |           $9,630.00 |            **$620.00** |      3.22%       |
| **TOTALS**         |      **32**       |  **$310,580.00** |     **$291,332.00** |         **$19,248.00** |   **100.00%**    |

### 3.2 Breakdown by Logistics Agent / Forwarder

| Agent / Carrier      | Qualifying Cargos | Gross Sell (USD) | Purchase Cost (USD) | Net Yield / Fact (USD) | % of Total Yield |
| :------------------- | :---------------: | ---------------: | ------------------: | ---------------------: | :--------------: |
| **SilkRoad Express** |      **22**       |      $231,850.00 |         $217,025.00 |         **$14,825.00** |      76.99%      |
| **Rick**             |       **6**       |       $37,380.00 |          $35,166.00 |          **$2,214.00** |      11.50%      |
| **Muxtor**           |       **4**       |       $41,350.00 |          $39,141.00 |          **$2,209.00** |      11.51%      |
| **TOTALS**           |      **32**       |  **$310,580.00** |     **$291,332.00** |         **$19,248.00** |   **100.00%**    |

### 3.3 Breakdown by Shipment Operational Status

| Operational Status | Qualifying Cargos | Total Net Yield / Fact (USD) | Notes                                             |
| :----------------- | :---------------: | ---------------------------: | :------------------------------------------------ |
| **Arrived**        |        22         |                   $13,218.00 | Successfully delivered and settled in August      |
| **Station**        |         4         |                    $3,580.00 | Arrived at destination rail/customs station       |
| **Waiting**        |         4         |                    $1,376.00 | Waiting at terminal/customs                       |
| **On the way**     |         1         |                      $537.00 | In transit with confirmed/settled August deal     |
| **On the border**  |         1         |                      $537.00 | Border clearance stage with confirmed August deal |
| **TOTALS**         |      **32**       |               **$19,248.00** | —                                                 |

---

## 4. Master Itemized Ledger: All 32 Contributing Shipments

Below is the complete, line-by-line breakdown of every single one of the 32 shipments that comprise the **$19,248.00 USD** fact.

|   #    | Container / Truck ID      |  Type  | Cargo Item    | Client         | Agent            |     Status      | Confirmed Date |  Sell Date   |  Purchase (USD) | Sell Price (USD) | Net Yield (USD) | Match Rule                                                                     |
| :----: | :------------------------ | :----: | :------------ | :------------- | :--------------- | :-------------: | :------------: | :----------: | --------------: | ---------------: | --------------: | :----------------------------------------------------------------------------- |
| **1**  | `06KG761AJN`              | 145m3  | General Cargo | Abdulhamid aka | Muxtor           |    `Arrived`    |  `2026-06-01`  | `2026-08-08` |       $9,630.00 |   **$10,250.00** |     **$620.00** | `sell_date (2026-08-08) in Aug 2026`                                           |
| **2**  | `EITU0053072`             |  20GP  | Alyumin Falga | Saidjon aka    | Rick             |    `Waiting`    |  `2026-06-01`  | `2026-08-09` |       $5,186.00 |    **$5,545.00** |     **$359.00** | `sell_date (2026-08-09) in Aug 2026`                                           |
| **3**  | `06KG814ARI`              | 130m3  | Uskuna        | Saidjon aka    | Muxtor           |    `Arrived`    |  `2026-06-02`  | `2026-08-09` |       $8,891.00 |    **$9,650.00** |     **$759.00** | `sell_date (2026-08-09) in Aug 2026`                                           |
| **4**  | `06KG762AJW`              | 96 CBM | Alyumin Falga | Saidjon aka    | Muxtor           |    `Arrived`    |  `2026-06-01`  | `2026-08-10` |       $9,657.00 |    **$9,950.00** |     **$293.00** | `sell_date (2026-08-10) in Aug 2026`                                           |
| **5**  | `EITU0110362`             |  20GP  | Alyumin Falga | Saidjon aka    | Rick             |    `Arrived`    |  `2026-06-01`  | `2026-08-10` |       $5,186.00 |    **$5,545.00** |     **$359.00** | `sell_date (2026-08-10) in Aug 2026`                                           |
| **6**  | `EISU2133403`             |  20GP  | Alyumin Falga | Saidjon aka    | Rick             |    `Arrived`    |  `2026-06-01`  | `2026-08-10` |       $5,086.00 |    **$5,545.00** |     **$459.00** | `sell_date (2026-08-10) in Aug 2026`                                           |
| **7**  | `HNKU6436939`             |  40HQ  | Uskuna        | Saidjon aka    | Rick             |    `Waiting`    |  `2026-06-04`  | `2026-08-10` |       $7,261.00 |    **$7,600.00** |     **$339.00** | `sell_date (2026-08-10) in Aug 2026`                                           |
| **8**  | `HNKU6436501`             |  40HQ  | Uskuna        | Saidjon aka    | Rick             |    `Waiting`    |  `2026-06-04`  | `2026-08-10` |       $7,261.00 |    **$7,600.00** |     **$339.00** | `sell_date (2026-08-10) in Aug 2026`                                           |
| **9**  | `06KG246APQ`              | 145m3  | General Cargo | Shamsiddin aka | SilkRoad Express |    `Arrived`    |  `2026-07-29`  | `2026-08-10` |       $6,370.00 |    **$7,400.00** |   **$1,030.00** | `sell_date (2026-08-10) in Aug 2026`                                           |
| **10** | `EMCU6079530`             |  20GP  | Alyumin falga | Saidjon aka    | Rick             |    `Arrived`    |  `2026-06-03`  | `2026-08-14` |       $5,186.00 |    **$5,545.00** |     **$359.00** | `sell_date (2026-08-14) in Aug 2026`                                           |
| **11** | `KZ381BLM02`              | 145m3  | General Cargo | Shamsiddin aka | SilkRoad Express |    `Arrived`    |  `2026-07-02`  | `2026-08-15` |      $11,000.00 |   **$11,550.00** |     **$550.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **12** | `KZ622BVI02`              | 145m3  | General Cargo | Shamsiddin aka | SilkRoad Express |    `Arrived`    |  `2026-07-02`  | `2026-08-15` |      $10,544.00 |   **$11,450.00** |     **$906.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **13** | `KZ919KAR19`              | 130m3  | General Cargo | Shamsiddin aka | SilkRoad Express |    `Arrived`    |  `2026-07-03`  | `2026-08-15` |      $10,444.00 |   **$11,000.00** |     **$556.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **14** | `KZ042AFA19`              | 130m3  | General Cargo | Shamsiddin aka | SilkRoad Express |    `Arrived`    |  `2026-07-04`  | `2026-08-15` |      $10,593.00 |   **$11,050.00** |     **$457.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **15** | `TEMU6496640`             |  40HQ  | General Cargo | Saidjon aka    | SilkRoad Express |    `Arrived`    |  `2026-07-04`  | `2026-08-15` |       $7,800.00 |    **$8,700.00** |     **$900.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **16** | `HMCU3052760-EITU0345897` |  20GP  | General Cargo | Saidjon aka    | SilkRoad Express |    `Station`    |  `2026-07-04`  | `2026-08-15` |      $11,660.00 |   **$12,600.00** |     **$940.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **17** | `EMCU6006235-EITU321853`  |  20GP  | General Cargo | Saidjon aka    | SilkRoad Express |    `Station`    |  `2026-07-04`  | `2026-08-15` |      $11,660.00 |   **$12,600.00** |     **$940.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **18** | `KZ797ARS`                | 145m3  | General Cargo | Ahror aka      | SilkRoad Express |    `Arrived`    |  `2026-07-07`  | `2026-08-15` |      $11,852.00 |   **$12,800.00** |     **$948.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **19** | `KZ995BPY05`              | 145m3  | General Cargo | Shamsiddin aka | SilkRoad Express |    `Arrived`    |  `2026-07-08`  | `2026-08-15` |      $10,444.00 |   **$11,000.00** |     **$556.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **20** | `KZ062BDK05`              | 145m3  | General Cargo | Shamsiddin aka | SilkRoad Express |    `Arrived`    |  `2026-07-15`  | `2026-08-15` |      $10,593.00 |   **$11,100.00** |     **$507.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **21** | `KZ518AAD`                | 145m3  | General Cargo | Shamsiddin aka | SilkRoad Express |    `Arrived`    |  `2026-07-15`  | `2026-08-15` |      $10,593.00 |   **$11,100.00** |     **$507.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **22** | `KZ726ACH`                | 145m3  | General Cargo | Shamsiddin aka | SilkRoad Express |    `Arrived`    |  `2026-07-15`  | `2026-08-15` |      $10,593.00 |   **$11,400.00** |     **$807.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **23** | `TCNU7986106`             |  40HQ  | General Cargo | Saidjon aka    | SilkRoad Express |    `Arrived`    |  `2026-07-16`  | `2026-08-15` |       $8,970.00 |    **$9,400.00** |     **$430.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **24** | `PONU1873735`             |  40GP  | General Cargo | Saidjon aka    | SilkRoad Express |    `Arrived`    |  `2026-07-15`  | `2026-08-15` |      $10,444.00 |   **$11,000.00** |     **$556.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **25** | `1`                       | 145m3  | General Cargo | Shamsiddin aka | SilkRoad Express | `On the border` |  `2026-08-21`  | `2026-08-15` |      $10,963.00 |   **$11,500.00** |     **$537.00** | `confirmed_date (2026-08-21) in Aug 2026 & sell_date (2026-08-15) in Aug 2026` |
| **26** | `WEDU4065234`             |  40GP  | General Cargo | Saidjon aka    | SilkRoad Express |    `Arrived`    |  `2026-07-23`  | `2026-08-15` |      $10,000.00 |   **$10,550.00** |     **$550.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **27** | `KZ070CGG`                | 145m3  | General Cargo | Shamsiddin aka | SilkRoad Express |    `Arrived`    |  `2026-07-20`  | `2026-08-15` |      $10,741.00 |   **$11,300.00** |     **$559.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **28** | `BMOU3003880`             |  40HQ  | General Cargo | Saidjon aka    | SilkRoad Express |    `Arrived`    |  `2026-07-28`  | `2026-08-15` |      $10,000.00 |   **$10,550.00** |     **$550.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **29** | `TGHU5162296`             |  40GP  | General Cargo | Saidjon aka    | SilkRoad Express |    `Station`    |  `2026-07-27`  | `2026-08-15` |       $7,500.00 |    **$8,300.00** |     **$800.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **30** | `YMLU5131326`             |  40GP  | General Cargo | Saidjon aka    | SilkRoad Express |    `Station`    |  `2026-07-28`  | `2026-08-15` |       $7,000.00 |    **$7,900.00** |     **$900.00** | `sell_date (2026-08-15) in Aug 2026`                                           |
| **31** | `HNKU6437133`             |  40HQ  | Uskuna        | Saidjon aka    | SilkRoad Express |    `Waiting`    |  `2026-06-05`  | `2026-08-19` |       $7,261.00 |    **$7,600.00** |     **$339.00** | `sell_date (2026-08-19) in Aug 2026`                                           |
| **32** | `KZ323BHT05`              | 145m3  | Fancoil       | Shamsiddin aka | Muxtor           |  `On the way`   |  `2026-07-21`  | `2026-08-19` |      $10,963.00 |   **$11,500.00** |     **$537.00** | `sell_date (2026-08-19) in Aug 2026`                                           |
|   —    | **TOTALS (32 CARGOS)**    |   —    | —             | —              | —                |        —        |       —        |      —       | **$291,332.00** |  **$310,580.00** |  **$19,248.00** | —                                                                              |

---

## 5. Detailed Audit Cards for Every Single Qualifying Shipment

Below is the full technical and financial record for each individual cargo.

### Shipment #1: `06KG761AJN` (General Cargo)

- **Registration UUID:** `2b74c891-0d2b-46f8-92ba-5679a50f7f6b`
- **Container / Vehicle ID:** `06KG761AJN` (145m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Abdulhamid aka**
- **Logistics Agent / Forwarder:** **Muxtor**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-06-01`
  - **Loaded Date:** `2026-06-05`
  - **Arrived Date:** `2026-07-13`
  - **Purchase Date:** `2026-08-08`
  - **Sell Date:** `2026-08-08`
  - **Created At:** `2026-08-10T11:17:02.550Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$9,630.00** (114,747,613.20 UZS)
  - **Sell Price (Gross):** **$10,250.00** (122,135,310.00 UZS)
  - **Net Yield (KPI Contribution):** **$620.00** (7,387,696.80 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-08) in Aug 2026`

---

### Shipment #2: `EITU0053072` (Alyumin Falga)

- **Registration UUID:** `5bb01589-311f-433f-9e6f-f47b9f6a2e4e`
- **Container / Vehicle ID:** `EITU0053072` (20GP)
- **Cargo Description:** **Alyumin Falga**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **Rick**
- **Operational Status:** `Waiting`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-06-01`
  - **Loaded Date:** `2026-06-01`
  - **Arrived Date:** `2026-07-20`
  - **Purchase Date:** `2026-08-09`
  - **Sell Date:** `2026-08-09`
  - **Created At:** `2026-08-10T10:00:42.530Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$5,186.00** (61,300,594.40 UZS)
  - **Sell Price (Gross):** **$5,545.00** (65,544,118.00 UZS)
  - **Net Yield (KPI Contribution):** **$359.00** (4,243,523.60 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-09) in Aug 2026`

---

### Shipment #3: `06KG814ARI` (Uskuna)

- **Registration UUID:** `8857b6b4-2718-4ed7-8ca9-4730cf07e564`
- **Container / Vehicle ID:** `06KG814ARI` (130m3)
- **Cargo Description:** **Uskuna**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **Muxtor**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-06-02`
  - **Loaded Date:** `2026-08-04`
  - **Arrived Date:** `2026-07-08`
  - **Purchase Date:** `2026-08-09`
  - **Sell Date:** `2026-08-09`
  - **Created At:** `2026-08-11T05:00:04.854Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$8,891.00** (105,095,176.40 UZS)
  - **Sell Price (Gross):** **$9,650.00** (114,066,860.00 UZS)
  - **Net Yield (KPI Contribution):** **$759.00** (8,971,683.60 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-09) in Aug 2026`

---

### Shipment #4: `06KG762AJW` (Alyumin Falga)

- **Registration UUID:** `c88ed102-0c6a-4199-9d6f-f560b2a06efe`
- **Container / Vehicle ID:** `06KG762AJW` (96 CBM)
- **Cargo Description:** **Alyumin Falga**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **Muxtor**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-06-01`
  - **Loaded Date:** `2026-06-01`
  - **Arrived Date:** `2026-06-25`
  - **Purchase Date:** `2026-08-10`
  - **Sell Date:** `2026-08-10`
  - **Created At:** `2026-08-10T09:49:34.239Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$9,657.00** (115,421,429.70 UZS)
  - **Sell Price (Gross):** **$9,950.00** (118,923,395.00 UZS)
  - **Net Yield (KPI Contribution):** **$293.00** (3,501,965.30 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-10) in Aug 2026`

---

### Shipment #5: `EITU0110362` (Alyumin Falga)

- **Registration UUID:** `eeeba03a-2dbb-48da-a5f3-effb65bd31fc`
- **Container / Vehicle ID:** `EITU0110362` (20GP)
- **Cargo Description:** **Alyumin Falga**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **Rick**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-06-01`
  - **Loaded Date:** `2026-06-02`
  - **Arrived Date:** `2026-07-20`
  - **Purchase Date:** `2026-08-10`
  - **Sell Date:** `2026-08-10`
  - **Created At:** `2026-08-10T10:03:41.745Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$5,186.00** (61,794,509.04 UZS)
  - **Sell Price (Gross):** **$5,545.00** (66,072,223.80 UZS)
  - **Net Yield (KPI Contribution):** **$359.00** (4,277,714.76 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-10) in Aug 2026`

---

### Shipment #6: `EISU2133403` (Alyumin Falga)

- **Registration UUID:** `63e7a05d-ce88-4f52-b108-db191f2daf8e`
- **Container / Vehicle ID:** `EISU2133403` (20GP)
- **Cargo Description:** **Alyumin Falga**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **Rick**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-06-01`
  - **Loaded Date:** `2026-06-02`
  - **Arrived Date:** `2026-07-20`
  - **Purchase Date:** `2026-08-10`
  - **Sell Date:** `2026-08-10`
  - **Created At:** `2026-08-10T10:50:28.343Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$5,086.00** (60,788,380.60 UZS)
  - **Sell Price (Gross):** **$5,545.00** (66,274,394.50 UZS)
  - **Net Yield (KPI Contribution):** **$459.00** (5,486,013.90 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-10) in Aug 2026`

---

### Shipment #7: `HNKU6436939` (Uskuna)

- **Registration UUID:** `4d33f0d5-71ce-4268-b702-c1001354c9cd`
- **Container / Vehicle ID:** `HNKU6436939` (40HQ)
- **Cargo Description:** **Uskuna**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **Rick**
- **Operational Status:** `Waiting`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-06-04`
  - **Loaded Date:** `2026-06-04`
  - **Arrived Date:** `2026-07-14`
  - **Purchase Date:** `2026-08-10`
  - **Sell Date:** `2026-08-10`
  - **Created At:** `2026-08-11T05:44:08.140Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$7,261.00** (86,784,198.10 UZS)
  - **Sell Price (Gross):** **$7,600.00** (90,835,960.00 UZS)
  - **Net Yield (KPI Contribution):** **$339.00** (4,051,761.90 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-10) in Aug 2026`

---

### Shipment #8: `HNKU6436501` (Uskuna)

- **Registration UUID:** `1d4aaf77-c509-49b1-a6ed-d6ed030aea31`
- **Container / Vehicle ID:** `HNKU6436501` (40HQ)
- **Cargo Description:** **Uskuna**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **Rick**
- **Operational Status:** `Waiting`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-06-04`
  - **Loaded Date:** `2026-06-04`
  - **Arrived Date:** `2026-07-14`
  - **Purchase Date:** `2026-08-10`
  - **Sell Date:** `2026-08-10`
  - **Created At:** `2026-08-11T05:49:03.988Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$7,261.00** (86,784,198.10 UZS)
  - **Sell Price (Gross):** **$7,600.00** (90,835,960.00 UZS)
  - **Net Yield (KPI Contribution):** **$339.00** (4,051,761.90 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-10) in Aug 2026`

---

### Shipment #9: `06KG246APQ` (General Cargo)

- **Registration UUID:** `1c362c22-7ab6-4078-b78c-eefeaaaaaf43`
- **Container / Vehicle ID:** `06KG246APQ` (145m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Shamsiddin aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-29`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-08-10`
  - **Purchase Date:** `2026-07-29`
  - **Sell Date:** `2026-08-10`
  - **Created At:** `2026-08-15T06:08:37.224Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$6,370.00** (76,760,665.80 UZS)
  - **Sell Price (Gross):** **$7,400.00** (88,175,736.00 UZS)
  - **Net Yield (KPI Contribution):** **$1,030.00** (11,415,070.20 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-10) in Aug 2026`

---

### Shipment #10: `EMCU6079530` (Alyumin falga)

- **Registration UUID:** `9e85ca23-9e8d-4dd6-85eb-eeebeb1e0e9b`
- **Container / Vehicle ID:** `EMCU6079530` (20GP)
- **Cargo Description:** **Alyumin falga**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **Rick**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-06-03`
  - **Loaded Date:** `2026-06-03`
  - **Arrived Date:** `2026-07-20`
  - **Purchase Date:** `2026-08-14`
  - **Sell Date:** `2026-08-14`
  - **Created At:** `2026-08-14T06:37:19.756Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$5,186.00** (61,909,897.54 UZS)
  - **Sell Price (Gross):** **$5,545.00** (66,195,600.05 UZS)
  - **Net Yield (KPI Contribution):** **$359.00** (4,285,702.51 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-14) in Aug 2026`

---

### Shipment #11: `KZ381BLM02` (General Cargo)

- **Registration UUID:** `888a6fed-fa6c-4218-bb1e-dd84fcfd6ab0`
- **Container / Vehicle ID:** `KZ381BLM02` (145m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Shamsiddin aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-02`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-07-17`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:41:13.424Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$11,000.00** (131,316,790.00 UZS)
  - **Sell Price (Gross):** **$11,550.00** (137,882,629.50 UZS)
  - **Net Yield (KPI Contribution):** **$550.00** (6,565,839.50 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #12: `KZ622BVI02` (General Cargo)

- **Registration UUID:** `471c815c-1fb5-421d-9ede-3d5173d3b952`
- **Container / Vehicle ID:** `KZ622BVI02` (145m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Shamsiddin aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-02`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-07-22`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:43:07.116Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,544.00** (125,873,112.16 UZS)
  - **Sell Price (Gross):** **$11,450.00** (136,688,840.50 UZS)
  - **Net Yield (KPI Contribution):** **$906.00** (10,815,728.34 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #13: `KZ919KAR19` (General Cargo)

- **Registration UUID:** `14d87465-5b1b-467c-b156-5252cf085b77`
- **Container / Vehicle ID:** `KZ919KAR19` (130m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Shamsiddin aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-03`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-07-23`
  - **Purchase Date:** `2026-07-03`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:44:29.930Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,444.00** (124,384,489.04 UZS)
  - **Sell Price (Gross):** **$11,000.00** (131,316,790.00 UZS)
  - **Net Yield (KPI Contribution):** **$556.00** (6,932,300.96 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #14: `KZ042AFA19` (General Cargo)

- **Registration UUID:** `75452f65-f507-4be6-8448-aebd8cf37464`
- **Container / Vehicle ID:** `KZ042AFA19` (130m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Shamsiddin aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-04`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-07-27`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:45:45.629Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,593.00** (126,458,068.77 UZS)
  - **Sell Price (Gross):** **$11,050.00** (131,913,684.50 UZS)
  - **Net Yield (KPI Contribution):** **$457.00** (5,455,615.73 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #15: `TEMU6496640` (General Cargo)

- **Registration UUID:** `16642fd8-8f04-425e-a4ec-4e90ede7b074`
- **Container / Vehicle ID:** `TEMU6496640` (40HQ)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-04`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-07-28`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:47:12.857Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$7,800.00** (93,115,542.00 UZS)
  - **Sell Price (Gross):** **$8,700.00** (103,859,643.00 UZS)
  - **Net Yield (KPI Contribution):** **$900.00** (10,744,101.00 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #16: `HMCU3052760-EITU0345897` (General Cargo)

- **Registration UUID:** `3a261163-7b24-4908-9ee8-b57bae56c028`
- **Container / Vehicle ID:** `HMCU3052760-EITU0345897` (20GP)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Station`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-04`
  - **Loaded Date:** `null`
  - **Arrived Date:** `null`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:48:59.100Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$11,660.00** (139,195,797.40 UZS)
  - **Sell Price (Gross):** **$12,600.00** (150,417,414.00 UZS)
  - **Net Yield (KPI Contribution):** **$940.00** (11,221,616.60 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #17: `EMCU6006235-EITU321853` (General Cargo)

- **Registration UUID:** `3d5c0ec3-df00-4bc2-9184-a12447d2de19`
- **Container / Vehicle ID:** `EMCU6006235-EITU321853` (20GP)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Station`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-04`
  - **Loaded Date:** `null`
  - **Arrived Date:** `null`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:50:04.393Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$11,660.00** (139,195,797.40 UZS)
  - **Sell Price (Gross):** **$12,600.00** (150,417,414.00 UZS)
  - **Net Yield (KPI Contribution):** **$940.00** (11,221,616.60 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #18: `KZ797ARS` (General Cargo)

- **Registration UUID:** `67d69f84-9805-4885-9871-1eda5f7c3aaf`
- **Container / Vehicle ID:** `KZ797ARS` (145m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Ahror aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-07`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-08-06`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:52:20.599Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$11,852.00** (141,487,872.28 UZS)
  - **Sell Price (Gross):** **$12,800.00** (152,804,992.00 UZS)
  - **Net Yield (KPI Contribution):** **$948.00** (11,317,119.72 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #19: `KZ995BPY05` (General Cargo)

- **Registration UUID:** `dad774c4-3652-4536-96fb-c0d4dc42d956`
- **Container / Vehicle ID:** `KZ995BPY05` (145m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Shamsiddin aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-08`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-08-06`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:53:41.565Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,444.00** (124,679,323.16 UZS)
  - **Sell Price (Gross):** **$11,000.00** (131,316,790.00 UZS)
  - **Net Yield (KPI Contribution):** **$556.00** (6,637,466.84 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #20: `KZ062BDK05` (General Cargo)

- **Registration UUID:** `47d03059-7e9c-453f-a12e-513621969535`
- **Container / Vehicle ID:** `KZ062BDK05` (145m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Shamsiddin aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-15`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-08-10`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:54:49.987Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,593.00** (126,458,068.77 UZS)
  - **Sell Price (Gross):** **$11,100.00** (132,510,579.00 UZS)
  - **Net Yield (KPI Contribution):** **$507.00** (6,052,510.23 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #21: `KZ518AAD` (General Cargo)

- **Registration UUID:** `a3cfc263-4786-4e3b-9daa-f384964303b4`
- **Container / Vehicle ID:** `KZ518AAD` (145m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Shamsiddin aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-15`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-08-13`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:56:09.691Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,593.00** (126,458,068.77 UZS)
  - **Sell Price (Gross):** **$11,100.00** (132,510,579.00 UZS)
  - **Net Yield (KPI Contribution):** **$507.00** (6,052,510.23 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #22: `KZ726ACH` (General Cargo)

- **Registration UUID:** `071cb1c3-653a-4cbc-b6a5-9c1e6e546eac`
- **Container / Vehicle ID:** `KZ726ACH` (145m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Shamsiddin aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-15`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-08-13`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:57:26.942Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,593.00** (126,458,068.77 UZS)
  - **Sell Price (Gross):** **$11,400.00** (136,091,946.00 UZS)
  - **Net Yield (KPI Contribution):** **$807.00** (9,633,877.23 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #23: `TCNU7986106` (General Cargo)

- **Registration UUID:** `e71ce122-2bf5-4087-ba7d-b383d417f279`
- **Container / Vehicle ID:** `TCNU7986106` (40HQ)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-16`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-08-08`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:58:53.042Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$8,970.00** (107,082,873.30 UZS)
  - **Sell Price (Gross):** **$9,400.00** (112,216,166.00 UZS)
  - **Net Yield (KPI Contribution):** **$430.00** (5,133,292.70 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #24: `PONU1873735` (General Cargo)

- **Registration UUID:** `f52c02f9-0a8d-451f-9b23-16e8b5f5debd`
- **Container / Vehicle ID:** `PONU1873735` (40GP)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-15`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-08-18`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T05:59:52.315Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,444.00** (124,679,323.16 UZS)
  - **Sell Price (Gross):** **$11,000.00** (131,316,790.00 UZS)
  - **Net Yield (KPI Contribution):** **$556.00** (6,637,466.84 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #25: `1` (General Cargo)

- **Registration UUID:** `03a042f9-6406-4104-9073-0c3b0b1973f0`
- **Container / Vehicle ID:** `1` (145m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Shamsiddin aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `On the border`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-08-21`
  - **Loaded Date:** `null`
  - **Arrived Date:** `null`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T06:00:50.280Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,963.00** (130,875,088.07 UZS)
  - **Sell Price (Gross):** **$11,500.00** (137,285,735.00 UZS)
  - **Net Yield (KPI Contribution):** **$537.00** (6,410,646.93 UZS)
- **KPI Qualification Condition:** `confirmed_date (2026-08-21) in Aug 2026 & sell_date (2026-08-15) in Aug 2026`

---

### Shipment #26: `WEDU4065234` (General Cargo)

- **Registration UUID:** `e6a3d798-6c55-4bd5-899e-3ed467142e44`
- **Container / Vehicle ID:** `WEDU4065234` (40GP)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-23`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-08-17`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T06:01:46.713Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,000.00** (119,378,900.00 UZS)
  - **Sell Price (Gross):** **$10,550.00** (125,944,739.50 UZS)
  - **Net Yield (KPI Contribution):** **$550.00** (6,565,839.50 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #27: `KZ070CGG` (General Cargo)

- **Registration UUID:** `5c5dd5a7-84e4-4067-93be-6b694f92e1d3`
- **Container / Vehicle ID:** `KZ070CGG` (145m3)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Shamsiddin aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-20`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-08-09`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T06:03:33.331Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,741.00** (128,224,876.49 UZS)
  - **Sell Price (Gross):** **$11,300.00** (134,898,157.00 UZS)
  - **Net Yield (KPI Contribution):** **$559.00** (6,673,280.51 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #28: `BMOU3003880` (General Cargo)

- **Registration UUID:** `0b4b1869-1813-4fbd-8221-9a168c6d8cfb`
- **Container / Vehicle ID:** `BMOU3003880` (40HQ)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Arrived`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-28`
  - **Loaded Date:** `null`
  - **Arrived Date:** `2026-08-20`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T06:04:38.816Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,000.00** (119,378,900.00 UZS)
  - **Sell Price (Gross):** **$10,550.00** (125,944,739.50 UZS)
  - **Net Yield (KPI Contribution):** **$550.00** (6,565,839.50 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #29: `TGHU5162296` (General Cargo)

- **Registration UUID:** `8fa1960f-2a5f-4b99-9c4d-922384fe0289`
- **Container / Vehicle ID:** `TGHU5162296` (40GP)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Station`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-27`
  - **Loaded Date:** `null`
  - **Arrived Date:** `null`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T06:05:46.196Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$7,500.00** (89,534,175.00 UZS)
  - **Sell Price (Gross):** **$8,300.00** (99,084,487.00 UZS)
  - **Net Yield (KPI Contribution):** **$800.00** (9,550,312.00 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #30: `YMLU5131326` (General Cargo)

- **Registration UUID:** `7f6134c1-0cc3-4db7-8f04-cba2c4cb1d59`
- **Container / Vehicle ID:** `YMLU5131326` (40GP)
- **Cargo Description:** **General Cargo**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Station`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-28`
  - **Loaded Date:** `null`
  - **Arrived Date:** `null`
  - **Purchase Date:** `2026-08-15`
  - **Sell Date:** `2026-08-15`
  - **Created At:** `2026-08-15T06:06:42.565Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$7,000.00** (83,565,230.00 UZS)
  - **Sell Price (Gross):** **$7,900.00** (94,309,331.00 UZS)
  - **Net Yield (KPI Contribution):** **$900.00** (10,744,101.00 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-15) in Aug 2026`

---

### Shipment #31: `HNKU6437133` (Uskuna)

- **Registration UUID:** `086a4f33-4db1-438e-b400-b46ce239f27f`
- **Container / Vehicle ID:** `HNKU6437133` (40HQ)
- **Cargo Description:** **Uskuna**
- **Client Information:**
  - **Client Name:** **Saidjon aka**
- **Logistics Agent / Forwarder:** **SilkRoad Express**
- **Operational Status:** `Waiting`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-06-05`
  - **Loaded Date:** `2026-06-08`
  - **Arrived Date:** `2026-07-20`
  - **Purchase Date:** `2026-08-19`
  - **Sell Date:** `2026-08-19`
  - **Created At:** `2026-08-19T05:29:49.432Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$7,261.00** (85,827,924.40 UZS)
  - **Sell Price (Gross):** **$7,600.00** (89,835,040.00 UZS)
  - **Net Yield (KPI Contribution):** **$339.00** (4,007,115.60 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-19) in Aug 2026`

---

### Shipment #32: `KZ323BHT05` (Fancoil)

- **Registration UUID:** `a5d0f47e-084c-462d-9ac7-36824a186a9c`
- **Container / Vehicle ID:** `KZ323BHT05` (145m3)
- **Cargo Description:** **Fancoil**
- **Client Information:**
  - **Client Name:** **Shamsiddin aka**
- **Logistics Agent / Forwarder:** **Muxtor**
- **Operational Status:** `On the way`
- **Milestone Dates:**
  - **Confirmed Date:** `2026-07-21`
  - **Loaded Date:** `2026-07-28`
  - **Arrived Date:** `null`
  - **Purchase Date:** `2026-08-19`
  - **Sell Date:** `2026-08-19`
  - **Created At:** `2026-08-19T10:54:00.923Z`
- **Financial Breakdown:**
  - **Purchase Price:** **$10,963.00** (129,587,045.20 UZS)
  - **Sell Price (Gross):** **$11,500.00** (135,934,600.00 UZS)
  - **Net Yield (KPI Contribution):** **$537.00** (6,347,554.80 UZS)
- **KPI Qualification Condition:** `sell_date (2026-08-19) in Aug 2026`

---

## 6. Audit of the 31 Excluded Shipments (Outside August 2026)

Jamshid Atxamov has 31 additional registered shipments in the system. All 31 were correctly excluded from the August 2026 KPI because their operational confirmation and sales settlement dates took place in **June/July 2026**, prior to the active August 2026 window.

|  #  | Container / Truck ID | Cargo Item      | Client         | Confirmed Date |  Sell Date   | Sell Price (USD) | Net Yield (USD) | Reason for Exclusion        |
| :-: | :------------------- | :-------------- | :------------- | :------------: | :----------: | ---------------: | --------------: | :-------------------------- |
|  1  | `HNKU6437128`        | uskuna          | Saidjon aka    |  `2026-06-04`  | `2026-06-04` |        $7,600.00 |         $339.00 | Confirmed & Sold in 2026-06 |
|  2  | `HNKU6436538`        | Uskuna          | Saidjon aka    |  `2026-06-04`  | `2026-06-04` |        $7,600.00 |         $339.00 | Confirmed & Sold in 2026-06 |
|  3  | `HNKU6436590`        | Uskuna          | Saidjon aka    |  `2026-06-04`  | `2026-06-04` |        $7,600.00 |         $339.00 | Confirmed & Sold in 2026-06 |
|  4  | `HNKU6436672`        | Uskuna          | Saidjon aka    |  `2026-06-04`  | `2026-06-04` |        $7,600.00 |         $339.00 | Confirmed & Sold in 2026-06 |
|  5  | `HNKU6436040`        | Uskuna          | Saidjon aka    |  `2026-06-04`  | `2026-06-04` |        $7,600.00 |         $339.00 | Confirmed & Sold in 2026-06 |
|  6  | `HNKU6436060`        | Kley            | Saidjon aka    |  `2026-06-04`  | `2026-06-04` |        $7,600.00 |         $339.00 | Confirmed & Sold in 2026-06 |
|  7  | `HNKU6436055`        | Uskuna          | Saidjon aka    |  `2026-06-05`  | `2026-06-05` |        $7,600.00 |         $339.00 | Confirmed & Sold in 2026-06 |
|  8  | `HNKU6436076`        | Uskuna          | Saidjon aka    |  `2026-06-05`  | `2026-06-05` |        $7,600.00 |         $339.00 | Confirmed & Sold in 2026-06 |
|  9  | `AF1580`             | quyosh panel    | Shamsiddin aka |  `2026-06-09`  | `2026-06-09` |       $10,700.00 |         $626.00 | Confirmed & Sold in 2026-06 |
| 10  | `LTL`                | manitor         | Shamsiddin aka |  `2026-06-10`  | `2026-06-10` |        $1,722.00 |         $122.00 | Confirmed & Sold in 2026-06 |
| 11  | `P17323`             | uskuna          | Saidjon aka    |  `2026-06-13`  | `2026-06-13` |       $10,700.00 |         $848.00 | Confirmed & Sold in 2026-06 |
| 12  | `06KG564AUD`         | chiller         | Shamsiddin aka |  `2026-06-13`  | `2026-06-13` |       $10,900.00 |         $600.00 | Confirmed & Sold in 2026-06 |
| 13  | `P16095`             | uskuna          | Saidjon aka    |  `2026-06-15`  | `2026-06-15` |       $11,000.00 |         $480.00 | Confirmed & Sold in 2026-06 |
| 14  | `969BAI05--05AME05`  | facoil          | Shamsiddin aka |  `2026-06-16`  | `2026-06-16` |       $11,300.00 |         $780.00 | Confirmed & Sold in 2026-06 |
| 15  | `HNKU6437473`        | kley            | Saidjon aka    |  `2026-06-17`  | `2026-06-17` |        $9,400.00 |         $450.00 | Confirmed & Sold in 2026-06 |
| 16  | `06KG070XXL`         | fancoil         | Shamsiddin aka |  `2026-06-17`  | `2026-06-17` |       $10,200.00 |         $644.00 | Confirmed & Sold in 2026-06 |
| 17  | `06KG550XAH`         | chiller         | Shamsiddin aka |  `2026-06-17`  | `2026-06-17` |       $10,600.00 |         $526.00 | Confirmed & Sold in 2026-06 |
| 18  | `CAIU4065233`        | uskuna          | Saidjon aka    |  `2026-06-19`  | `2026-06-19` |        $8,800.00 |         $450.00 | Confirmed & Sold in 2026-06 |
| 19  | `CLHU4479320`        | uskuna          | Saidjon aka    |  `2026-06-19`  | `2026-06-19` |        $8,800.00 |         $180.00 | Confirmed & Sold in 2026-06 |
| 20  | `EITU0151382`        | Alyuminiy falga | Saidjon aka    |  `2026-06-22`  | `2026-06-22` |        $5,600.00 |         $165.00 | Confirmed & Sold in 2026-06 |
| 21  | `EITU0277283`        | Alyuminiy falga | Saidjon aka    |  `2026-06-22`  | `2026-06-22` |        $5,600.00 |         $415.00 | Confirmed & Sold in 2026-06 |
| 22  | `505AQM05`           | fancoil         | Shamsiddin aka |  `2026-06-24`  | `2026-06-24` |       $11,700.00 |         $500.00 | Confirmed & Sold in 2026-06 |
| 23  | `06KG807AVD`         | Chiller         | Shamsiddin aka |  `2026-06-24`  | `2026-06-24` |       $10,950.00 |         $400.00 | Confirmed & Sold in 2026-06 |
| 24  | `KZ133AAE19`         | Chiller         | Shamsiddin aka |  `2026-06-25`  | `2026-06-25` |       $10,900.00 |         $456.00 | Confirmed & Sold in 2026-06 |
| 25  | `EITU0368510`        | Alyuminiy falga | Saidjon aka    |  `2026-06-26`  | `2026-06-26` |        $5,600.00 |         $228.00 | Confirmed & Sold in 2026-06 |
| 26  | `EITU0402030`        | Alyuminiy falga | Saidjon aka    |  `2026-06-26`  | `2026-06-26` |        $5,600.00 |         $378.00 | Confirmed & Sold in 2026-06 |
| 27  | `EMCU600258`         | Alyuminiy falga | Saidjon aka    |  `2026-06-27`  | `2026-06-27` |        $5,600.00 |         $228.00 | Confirmed & Sold in 2026-06 |
| 28  | `EISU2010414`        | Alyuminiy falga | Saidjon aka    |  `2026-06-27`  | `2026-06-27` |        $5,600.00 |         $378.00 | Confirmed & Sold in 2026-06 |
| 29  | `KZ85AFI19`          | chiller         | Shamsiddin aka |  `2026-06-27`  | `2026-06-27` |       $11,100.00 |         $507.00 | Confirmed & Sold in 2026-06 |
| 30  | `881AGG`             | chiller         | Shamsiddin aka |  `2026-06-27`  | `2026-06-27` |        $7,500.00 |         $340.00 | Confirmed & Sold in 2026-06 |
| 31  | `06KG220AAB`         | chiller         | Shamsiddin aka |  `2026-07-07`  | `2026-06-07` |        $9,950.00 |         $179.00 | Confirmed & Sold in 2026-07 |

---

## 7. How to Re-Verify Live on Production Server

To reproduce and verify these exact figures against the live production server at any time:

### Step 1: Authenticate

```http
POST /api/v1/auth/login HTTP/1.1
Host: backend-yaqeen.uz
Content-Type: application/json

{
  "phone_number": "+998330094112",
  "password": "azm2shA08"
}
```

### Step 2: Query August 2026 KPI Plan

```http
GET /api/v1/cargo-kpi/plans?period=2026-08 HTTP/1.1
Host: backend-yaqeen.uz
Authorization: Bearer <ACCESS_TOKEN>
```

### Step 3: Query Jamshid's Complete Cargo Ledger

```http
GET /api/v1/cargo-registrations?employee_id=634fecba-06ee-41f7-b92d-ce724cc79bed&limit=500 HTTP/1.1
Host: backend-yaqeen.uz
Authorization: Bearer <ACCESS_TOKEN>
```

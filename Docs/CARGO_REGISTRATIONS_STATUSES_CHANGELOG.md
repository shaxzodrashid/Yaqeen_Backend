# Cargo Registrations Status List Update - Changelog & Implementation Guide

## 1. Overview & Objective

This document records the architectural and business logic changes implemented to update the allowed lifecycle statuses for **Cargo Registrations** in the Yaqeen Backend ERP.

The cargo registration status list was updated to align with logistics workflows:

- **Previous Statuses**: `Waiting`, `In Transit`, `Border`, `At Station`, `Delivered`
- **New Statuses**:
  1. `Waiting`
  2. `Station`
  3. `On the way`
  4. `On the border`
  5. `Reload`
  6. `Arrived`

---

## 2. Updated Status Lifecycle & Mapping

| Status              | Stage Meaning                                                       | Default / Transition                        |
| :------------------ | :------------------------------------------------------------------ | :------------------------------------------ |
| **`Waiting`**       | Registration created and awaiting loading / dispatch.               | Default initial status upon cargo creation. |
| **`Station`**       | Cargo is stationed at a hub / terminal station.                     | Replaces previous `At Station`.             |
| **`On the way`**    | Cargo is currently in transit along its route.                      | Replaces previous `In Transit`.             |
| **`On the border`** | Cargo has arrived at the customs checkpoint / border.               | Replaces previous `Border`.                 |
| **`Reload`**        | Cargo is undergoing reloading / transfer between containers/trucks. | New dedicated logistics stage.              |
| **`Arrived`**       | Cargo has reached the final destination.                            | Replaces previous `Delivered`.              |

---

## 3. Codebase Changes & File Modifications

### 3.1. DTO & Validation Layer

- **File**: [`src/cargo-registrations/dto/cargo-registrations.dto.ts`](file:///D:/Shakhzod/Javascript/Yaqeen_Backend/src/cargo-registrations/dto/cargo-registrations.dto.ts)
  - Updated `CARGO_STATUSES` constant:
    ```typescript
    export const CARGO_STATUSES = [
      'Waiting',
      'Station',
      'On the way',
      'On the border',
      'Reload',
      'Arrived',
    ] as const;

    export type CargoStatus = (typeof CARGO_STATUSES)[number];
    ```
  - `CreateCargoRegistrationDto`: Validates that optional `status` matches one of the 6 allowed values using `@IsIn(CARGO_STATUSES)`.
  - `UpdateCargoRegistrationDto`: Validates `status` updates against `CARGO_STATUSES`.
  - `QueryCargoRegistrationDto`: Accepts `status` string query parameter for filtering.

### 3.2. Service & Aggregation Layer

- **File**: [`src/cargo-registrations/cargo-registrations.service.ts`](file:///D:/Shakhzod/Javascript/Yaqeen_Backend/src/cargo-registrations/cargo-registrations.service.ts)
  - Updated `getCargoRegistrationStats()` to initialize the status distribution with all 6 status keys:
    ```typescript
    const statusDistribution: Record<string, number> = {
      Waiting: 0,
      Station: 0,
      'On the way': 0,
      'On the border': 0,
      Reload: 0,
      Arrived: 0,
    };
    ```
  - Ensures accurate count distributions across all 6 status stages.

### 3.3. Database Migration

- **File**: [`database/migrations/20260818120000_update_cargo_registrations_statuses.ts`](file:///D:/Shakhzod/Javascript/Yaqeen_Backend/database/migrations/20260818120000_update_cargo_registrations_statuses.ts)
  - `up`: Safely migrates existing records from old statuses to new equivalents:
    - `'In Transit'` $\to$ `'On the way'`
    - `'Border'` $\to$ `'On the border'`
    - `'At Station'` $\to$ `'Station'`
    - `'Delivered'` $\to$ `'Arrived'`
  - `down`: Provides reversible rollback mechanism restoring historical status labels.

### 3.4. Unit & Integration Testing

- **File**: [`src/cargo-registrations/cargo-registrations.service.spec.ts`](file:///D:/Shakhzod/Javascript/Yaqeen_Backend/src/cargo-registrations/cargo-registrations.service.spec.ts)
  - Added test suite `Cargo Statuses & Validation`:
    - Validates that `CARGO_STATUSES` contains the exact 6 statuses.
    - Validates class-validator acceptance of all 6 statuses on `CreateCargoRegistrationDto` and `UpdateCargoRegistrationDto`.
    - Verifies rejection of invalid or legacy status names (`In Transit`, `Border`, `At Station`, `Delivered`, `Pending`, etc.).
    - Verifies multi-status distribution calculation across all 6 statuses in `getCargoRegistrationStats`.

### 3.5. Documentation

- Updated [`Docs/CARGO_REGISTRATIONS_MULTI_CURRENCY_DOC.md`](file:///D:/Shakhzod/Javascript/Yaqeen_Backend/Docs/CARGO_REGISTRATIONS_MULTI_CURRENCY_DOC.md)
- Updated [`Docs/DASHBOARD_API_DOC.md`](file:///D:/Shakhzod/Javascript/Yaqeen_Backend/Docs/DASHBOARD_API_DOC.md)
- Updated [`Docs/EMPLOYEE_PLAN_SETTING_DOC.md`](file:///D:/Shakhzod/Javascript/Yaqeen_Backend/Docs/EMPLOYEE_PLAN_SETTING_DOC.md)

---

## 4. Verification & Validation Summary

| Test Suite                                                    | Total Tests     | Result       |
| :------------------------------------------------------------ | :-------------- | :----------- |
| `src/cargo-registrations/cargo-registrations.service.spec.ts` | 24              | **PASS**     |
| Full Project Test Suite (`npm test`)                          | 174 (13 suites) | **PASS**     |
| TypeScript Typecheck (`npm run typecheck`)                    | -               | **0 Errors** |

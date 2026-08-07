# API Reference: `GET /api/v1/repair-orders/viewable`

This document provides a comprehensive technical specification of the response shape, payload schema, nested data models, and field-level metadata for the `GET /api/v1/repair-orders/viewable` endpoint.

---

## 1. Overview & Endpoint Metadata

| Attribute            | Specification                                                                                                      |
| :------------------- | :----------------------------------------------------------------------------------------------------------------- |
| **HTTP Method**      | `GET`                                                                                                              |
| **Endpoint URL**     | `/api/v1/repair-orders/viewable`                                                                                   |
| **Authentication**   | Required (`Bearer <JWT>` Admin Token)                                                                              |
| **Rate Limiting**    | Admin rate-limited (configured in `AdminRateLimitedRoutes`)                                                        |
| **Response Headers** | `Cache-Control: private, no-cache, must-revalidate`<br>`Vary: Authorization`<br>`Server-Timing: viewable;dur=<ms>` |

> [!NOTE]
> This endpoint is optimized for high-performance board rendering (Kanban style). Repair orders are returned pre-grouped by status ID, allowing immediate frontend rendering without secondary grouping operations.

---

## 2. Request Parameters (Query DTO)

The endpoint accepts `FindViewableRepairOrdersQueryDto` query parameters:

| Parameter                  | Type                                                   | Required |   Default    | Description                                                                     |
| :------------------------- | :----------------------------------------------------- | :------: | :----------: | :------------------------------------------------------------------------------ |
| `branch_ids`               | `string[]` (UUIDs)                                     | **Yes**  |      —       | Target branch IDs. Must contain at least one valid UUID.                        |
| `status_ids`               | `string[]` (UUIDs)                                     |    No    | All viewable | Array of status UUIDs to filter cards for.                                      |
| `offset`                   | `number`                                               |    No    |     `0`      | Zero-based pagination offset per status group.                                  |
| `limit`                    | `number`                                               |    No    |     `20`     | Maximum number of items per status group.                                       |
| `sort_by`                  | `'sort' \| 'priority' \| 'created_at' \| 'updated_at'` |    No    |   `'sort'`   | Field used for sorting cards inside each status group.                          |
| `sort_order`               | `'asc' \| 'desc'`                                      |    No    |   `'asc'`    | Direction of sorting.                                                           |
| `search`                   | `string`                                               |    No    |      —       | Smart search across phone number, customer name, device model, or order number. |
| `customer_name`            | `string`                                               |    No    |      —       | Partial search by customer name.                                                |
| `phone_number`             | `string`                                               |    No    |      —       | Search by customer phone number.                                                |
| `device_model`             | `string`                                               |    No    |      —       | Partial search by device model.                                                 |
| `order_number`             | `string`                                               |    No    |      —       | Filter by numeric order ID.                                                     |
| `imei`                     | `string`                                               |    No    |      —       | IMEI search (exact 15-digit or prefix search on child branches).                |
| `source_types`             | `string[]`                                             |    No    |      —       | Filter by reception sources (e.g., `["Sug'urta", "Telegram"]`).                 |
| `priorities`               | `string[]`                                             |    No    |      —       | Priority filter (e.g., `["High", "Highest"]`).                                  |
| `delivery_methods`         | `string[]`                                             |    No    |      —       | Filter by delivery methods (`["Self", "Delivery"]`).                            |
| `pickup_methods`           | `string[]`                                             |    No    |      —       | Filter by pickup methods (`["Self", "Pickup"]`).                                |
| `assigned_admin_ids`       | `string[]` (UUIDs)                                     |    No    |      —       | Filter by assigned admin user IDs.                                              |
| `assigned_filter`          | `'Mine'`                                               |    No    |      —       | Quick filter for orders assigned to the requesting admin.                       |
| `start_time` / `date_from` | `string` (ISO 8601)                                    |    No    |      —       | Creation date range start boundary.                                             |
| `end_time` / `date_to`     | `string` (ISO 8601)                                    |    No    |      —       | Creation date range end boundary.                                               |
| `reject_cause`             | `string[]` (UUIDs)                                     |    No    |      —       | Filter by reject cause UUIDs.                                                   |

---

## 3. High-Level Response Architecture

The response adheres to the standardized `{ meta, data }` response envelope structure.

```typescript
interface ViewableRepairOrdersResponse {
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
  data: Record<string, ViewableStatusGroup>;
}

interface ViewableStatusGroup {
  metrics: {
    total_repair_orders: number;
  };
  repair_orders: ViewableRepairOrderListItem[];
}
```

```json
{
  "meta": {
    "total": 357,
    "limit": 20,
    "offset": 0
  },
  "data": {
    "a9bf2d77-2f13-4b8e-b8cb-7d5f2c82f111": {
      "metrics": {
        "total_repair_orders": 13
      },
      "repair_orders": [/* Array of ViewableRepairOrderListItem */]
    }
  }
}
```

---

## 4. `ViewableRepairOrderListItem` Field Dictionary

Each item inside `data.<status_id>.repair_orders` represents a compact card object optimized for board views.

| Field                    | Type                                 | Nullable | Description                                                               | Example                                                                    |
| :----------------------- | :----------------------------------- | :------: | :------------------------------------------------------------------------ | :------------------------------------------------------------------------- |
| `id`                     | `string` (UUID)                      |    No    | Unique identifier of the repair order                                     | `"c7a77f42-2f13-4b8e-b8cb-7d5f2c82fbbb"`                                   |
| `number_id`              | `number`                             |    No    | Sequential numeric ID displayed to users                                  | `12901`                                                                    |
| `status_id`              | `string` (UUID)                      |    No    | Current status UUID of the repair order                                   | `"a9bf2d77-2f13-4b8e-b8cb-7d5f2c82f111"`                                   |
| `name`                   | `string`                             | **Yes**  | Resolved customer full name                                               | `"Alisher Odilov"`                                                         |
| `phone_number`           | `string`                             | **Yes**  | Resolved primary contact phone number                                     | `"+998900000612"`                                                          |
| `agreed_date`            | `string`                             | **Yes**  | Agreed completion date formatted as `YYYY-MM-DD HH:mm`                    | `"2026-04-16 10:00"`                                                       |
| `pickup_method`          | `'Self' \| 'Pickup'`                 |    No    | Method of how device was received                                         | `"Pickup"`                                                                 |
| `delivery_method`        | `'Self' \| 'Delivery'`               |    No    | Method of how device will be delivered                                    | `"Delivery"`                                                               |
| `reject_cause`           | `RepairOrderRejectCause`             |    No    | Reject cause details (object with nullable fields)                        | `{ "id": null, "name": null }`                                             |
| `source`                 | `string`                             | **Yes**  | Source channel of order creation                                          | `"Telegram"`                                                               |
| `call_count`             | `number`                             |    No    | Total outward customer calls logged                                       | `12`                                                                       |
| `missed_call_count`      | `number`                             |    No    | Total missed customer calls                                               | `2`                                                                        |
| `comments_count`         | `number`                             |    No    | Count of manual and history comments                                      | `28`                                                                       |
| `unread_comments`        | `number`                             |    No    | Count of unread inbound support comments for current admin                | `4`                                                                        |
| `lead_indicator`         | `RepairOrderLeadIndicator`           | **Yes**  | Visual indicator for overdue/missed call status                           | `{ "type": "deadline_reached", "color": "yellow", "triggered_at": "..." }` |
| `created_at`             | `string` (ISO 8601)                  |    No    | Timestamp when the order was created                                      | `"2026-03-24T09:00:00.000Z"`                                               |
| `phone_category`         | `RepairOrderLookup`                  |    No    | Multi-lingual device category/model details                               | `{ "id": "...", "name_uz": "...", "name_ru": "...", "name_en": "..." }`    |
| `repair_order_status`    | `RepairOrderLookup`                  |    No    | Multi-lingual current status details                                      | `{ "id": "...", "name_uz": "...", "name_ru": "...", "name_en": "..." }`    |
| `branch`                 | `RepairOrderLookup`                  |    No    | Multi-lingual branch details                                              | `{ "id": "...", "name_uz": "...", "name_ru": "...", "name_en": "..." }`    |
| `assigned_admins`        | `ViewableRepairOrderAssignedAdmin[]` |    No    | List of admin users assigned to this repair order                         | `[...]`                                                                    |
| `is_mothers`             | `boolean`                            |    No    | Legacy compatibility flag (true if Mother Branch order in child view)     | `false`                                                                    |
| `is_mother_branch_order` | `boolean`                            |    No    | Explicit indicator if order currently belongs to Mother Branch            | `true`                                                                     |
| `is_taken_from_mother`   | `boolean`                            |    No    | True if order originated in Mother Branch and transferred to child branch | `true`                                                                     |

---

## 5. Nested Data Models

### 5.1 `RepairOrderLookup`

Used for multi-lingual reference objects (`phone_category`, `repair_order_status`, `branch`).

```typescript
interface RepairOrderLookup {
  id: string | null;
  name_uz: string | null;
  name_ru: string | null;
  name_en: string | null;
}
```

### 5.2 `RepairOrderRejectCause`

Details of order cancellation or rejection.

```typescript
interface RepairOrderRejectCause {
  id: string | null;
  name: string | null;
}
```

### 5.3 `RepairOrderLeadIndicator`

Surfaces visual SLA and communication indicators on board cards.

```typescript
interface RepairOrderLeadIndicator {
  type:
    | 'deadline_reached'
    | 'missed_customer_call'
    | 'customer_no_answer_deadline_missed'
    | null;
  color: 'yellow' | 'red' | null;
  triggered_at: string | null;
}
```

> [!IMPORTANT]
>
> - `deadline_reached`: Color is `'yellow'`.
> - `missed_customer_call` & `customer_no_answer_deadline_missed`: Color is `'red'`.
> - Indicator is automatically cleared when an admin updates the repair order.

### 5.4 `ViewableRepairOrderAssignedAdmin`

Admin user assigned to handle the repair order card.

```typescript
interface ViewableRepairOrderAssignedAdmin {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  created_at: string;
}
```

---

## 6. Business Rules & Flag Semantics

> [!TIP]
>
> ### Mother Branch Order Visibility (`is_mother_branch_order` & `is_mothers`)
>
> When performing searches from a child branch view:
>
> - Mother Branch orders are surfaced **only** when an exact match occurs on normalized phone number, full customer name, device model, numeric order ID, or full 15-digit IMEI.
> - Such cards set `is_mother_branch_order: true` (and `is_mothers: true` for legacy compatibility).

> [!TIP]
>
> ### Mother Origin History (`is_taken_from_mother`)
>
> Indicates whether an order was initially logged in the Mother Branch and later transferred to a child branch.
>
> - Set to `false` if the order reaches a status configured with `suppress_is_taken_from_mother = true` or historically passed through one.

> [!TIP]
>
> ### Unread Comments Count (`unread_comments`)
>
> - Dynamically calculated per requesting admin (`req.admin.id`).
> - Counts open inbound client support comments (`comment_type = 'support'`, `author_type = 'user'`) that have no corresponding entry in `repair_order_comment_reads` for the authenticated admin.

---

## 7. Complete Example JSON Response

```json
{
  "meta": {
    "total": 1,
    "limit": 20,
    "offset": 0
  },
  "data": {
    "a9bf2d77-2f13-4b8e-b8cb-7d5f2c82f111": {
      "metrics": {
        "total_repair_orders": 1
      },
      "repair_orders": [
        {
          "id": "c7a77f42-2f13-4b8e-b8cb-7d5f2c82fbbb",
          "number_id": 12901,
          "status_id": "a9bf2d77-2f13-4b8e-b8cb-7d5f2c82f111",
          "name": "Alisher Odilov",
          "phone_number": "+998900000612",
          "agreed_date": "2026-04-16 10:00",
          "pickup_method": "Pickup",
          "delivery_method": "Delivery",
          "reject_cause": {
            "id": null,
            "name": null
          },
          "source": "Telegram",
          "call_count": 12,
          "missed_call_count": 2,
          "comments_count": 28,
          "unread_comments": 4,
          "lead_indicator": {
            "type": "deadline_reached",
            "color": "yellow",
            "triggered_at": "2026-05-29T10:00:00.000Z"
          },
          "created_at": "2026-03-24T09:00:00.000Z",
          "phone_category": {
            "id": "e3f21102-1234-4567-89ab-cdef01234567",
            "name_uz": "iPhone 13 Pro Max",
            "name_ru": "iPhone 13 Pro Max",
            "name_en": "iPhone 13 Pro Max"
          },
          "repair_order_status": {
            "id": "a9bf2d77-2f13-4b8e-b8cb-7d5f2c82f111",
            "name_uz": "Diagnostikada",
            "name_ru": "На диагностике",
            "name_en": "In Diagnosis"
          },
          "branch": {
            "id": "b1111111-2222-3333-4444-555555555555",
            "name_uz": "Chilonzor filiali",
            "name_ru": "Чиланзарский филиал",
            "name_en": "Chilonzor Branch"
          },
          "assigned_admins": [
            {
              "id": "d8e9f0a1-b2c3-4d5e-6f7a-8b9c0d1e2f3a",
              "first_name": "Alisher",
              "last_name": "Odilov",
              "phone_number": "+998901234567",
              "created_at": "2026-03-24T09:00:00.000Z"
            }
          ],
          "is_mothers": false,
          "is_mother_branch_order": false,
          "is_taken_from_mother": true
        }
      ]
    }
  }
}
```

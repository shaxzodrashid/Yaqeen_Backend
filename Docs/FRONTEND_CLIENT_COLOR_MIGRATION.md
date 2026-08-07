# Frontend Integration Guide: Client & Employee Color Tag Unification

**Target Audience:** Frontend Developers (Web & Mobile Apps)  
**Date:** July 23, 2026  
**Module:** Clients & Employee Management

---

## 1. Overview of Changes

To simplify client workflow and prevent conflicting color tags, **client color tags have been unified with employee color tags**.

### Key Rules

1. **Inherited Color Tag**: When a client is assigned to a responsible employee, the client automatically shares that employee's color tag (`color`).
2. **Default Unassigned Color Tag (`#808080`)**: If no employee is assigned to a client (`assigned_employee_id` is `null`), the client automatically defaults to **Unassigned Gray (`#808080`)**.
3. **No Direct Client Color Inputs**: Client registration and update forms **must ask for a responsible employee** (`assigned_employee_id`) instead of a color tag. The backend no longer accepts or stores a standalone client `color` property.

---

## 2. Frontend UI/UX Changes Required

### 2.1. Registration Form (`POST /clients`)

- **Remove**: Color picker / hex input field.
- **Add / Emphasize**: "Responsible Employee" dropdown selector (`assigned_employee_id`).
  - Dropdown options should list active employees retrieved from `GET /employees`.
  - Display employee name along with their color tag badge (e.g., `Rustam Rasulov` with color tag `#FF0000`).
  - Allow selecting "None / Unassigned" (sets `assigned_employee_id: null`).

### 2.2. Edit Client Form (`PUT /clients/:id`)

- **Remove**: Color picker / hex input field.
- **Update**: Changing the "Responsible Employee" selection automatically updates the client's `effective_color` tag in API responses.

### 2.3. Client Lists, Cards & Badges

- **Field to Render**: Always use **`effective_color`** returned in `GET /clients` and `GET /clients/:id` responses for badge background, avatar border, or tag chips.
- **Fallback Logic**: If for any reason `effective_color` is missing, fallback to `#808080` (Unassigned Gray).

---

## 3. API Payload Specifications

### 3.1. Register Client (`POST /clients`)

#### OLD Payload (Deprecated ❌)

```json
{
  "first_name": "Jasur",
  "last_name": "Yoldoshev",
  "phone": "+998901234567",
  "company_name": "Global Cargo Logistics LLC",
  "assigned_employee_id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
  "color": "#FF0000" // ❌ REMOVED
}
```

#### NEW Payload (Required ✅)

```json
{
  "first_name": "Jasur",
  "last_name": "Yoldoshev",
  "phone": "+998901234567",
  "company_name": "Global Cargo Logistics LLC",
  "address": "Tashkent city, Yunusabad district",
  "assigned_employee_id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890", // Optional: UUID of responsible employee
  "is_active": true
}
```

---

### 3.2. Response Structure (`GET /clients`, `POST /clients`, `PUT /clients/:id`)

#### Assigned Client Response Example

```json
{
  "id": "a3b1c2d4-e5f6-7890-abcd-ef1234567890",
  "first_name": "Jasur",
  "last_name": "Yoldoshev",
  "phone": "+998901234567",
  "company_name": "Global Cargo Logistics LLC",
  "assigned_employee_id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
  "is_active": true,
  "created_at": "2026-07-20T12:00:00.000Z",
  "updated_at": "2026-07-20T12:00:00.000Z",
  "effective_color": "#FF0000", // ✅ Color tag inherited from assigned employee
  "assigned_employee": {
    "id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
    "first_name": "Rustam",
    "last_name": "Rasulov",
    "phone": "+998909876543",
    "color": "#FF0000"
  },
  "attachments": []
}
```

#### Unassigned Client Response Example

```json
{
  "id": "c4d3b2a1-e5f6-7890-abcd-ef1234567890",
  "first_name": "Anvar",
  "last_name": "Karimov",
  "phone": "+998909998877",
  "company_name": "Unassigned Co LLC",
  "assigned_employee_id": null,
  "is_active": true,
  "created_at": "2026-07-23T10:00:00.000Z",
  "updated_at": "2026-07-23T10:00:00.000Z",
  "effective_color": "#808080", // ✅ Default Unassigned Gray
  "assigned_employee": null,
  "attachments": []
}
```

---

## 4. Color Distribution Stats (`GET /clients/stats/color-distribution`)

The statistics endpoint groups active clients by their effective color code and assigned employees.

```json
{
  "total_clients": 300,
  "by_color": [
    {
      "color": "#FF0000",
      "count": 200
    },
    {
      "color": "#808080",
      "count": 100 // Unassigned clients count
    }
  ],
  "by_employee": [
    {
      "employee_id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
      "employee_name": "Rustam Rasulov",
      "default_color": "#FF0000",
      "count": 200
    },
    {
      "employee_id": null,
      "employee_name": "Unassigned",
      "default_color": "#808080",
      "count": 100
    }
  ]
}
```

---

## 5. Frontend Migration Checklist

- [ ] **Remove Color Picker Component** from Client Add & Edit dialogs/screens.
- [ ] **Add/Update Responsible Employee Field** with employee select dropdown.
- [ ] **Remove `color` payload key** from client POST & PUT API service calls.
- [ ] **Bind UI Color Badges** to `client.effective_color`.
- [ ] **Update Filter Controls**: Searching/filtering by color tag (`GET /clients?color=...`) now works with employee colors and `#808080` (Unassigned Gray).

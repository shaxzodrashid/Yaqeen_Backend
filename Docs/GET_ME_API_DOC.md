# Yaqeen Backend - GET /employees/me API Documentation

This document provides the complete API specifications for the unified user profile retrieval endpoint, including user account credentials, employee profile information, department details, assigned role metadata, and normalized RBAC permission maps.

---

## 1. Get Current User's Profile

Retrieve the complete profile details of the currently authenticated user session. This endpoint powers the initial app boot flow on the frontend by supplying identity, display avatar presigned URLs, and active permissions.

- **Route:** `/employees/me` (Alias: `/emloyees/me`)
- **Method:** `GET`
- **Access:** `Private (Requires Bearer JWT token)`
- **Permitted Roles:** Any valid authenticated user (`CEO`, `ROP`, `EMPLOYEE`, or custom roles)
- **Success HTTP Status:** `200 OK`

---

## 2. Success Response Schema

The endpoint returns a unified JSON payload supporting both flat fields (for backward compatibility with legacy API consumers and e2e test suites) and modern nested objects (`user`, `employee`, `role_details`, `permissions`).

```json
{
  "id": "1d63b635-8933-45d1-a233-d6902e3b27f1",
  "first_name": "Shaxzod",
  "last_name": "Rashidov",
  "phone": "+998330094112",
  "phone_number": "998330094112",
  "secondary_phone": null,
  "address": null,
  "department_id": "07d223ca-4167-47f7-a929-61d47a3628a7",
  "fixed_salary": 0,
  "currency": "UZS",
  "color": "#CCCCCC",
  "picture_url": "http://127.0.0.1:9000/yaqeen-attachments/avatars/employee_1d63b635-8933-45d1-a233-d6902e3b27f1_1784618035_a1b2c3.png?X-Amz-Algorithm=AWS4-HMAC-SHA256...",
  "is_active": true,
  "created_at": "2026-07-19T13:22:58.587Z",
  "updated_at": "2026-07-19T13:22:58.587Z",
  "department_name": "sales",
  "department_display_name": "Sales",
  "user_id": "d36cd0fe-bf3b-448d-964c-5b214eef86e4",
  "username": "998330094112",
  "user_role": "EMPLOYEE",
  "user_status": "Open",
  "role_id": "e38a293c-8291-4e78-9b88-518293746ab1",
  "permissions": {
    "clients": {
      "create": false,
      "read": true,
      "update": true,
      "delete": false
    },
    "employees": {
      "create": false,
      "read": true,
      "update": false,
      "delete": false
    },
    "departments": {
      "create": false,
      "read": true,
      "update": false,
      "delete": false
    },
    "cargo_kpi": {
      "create": false,
      "read": true,
      "update": false,
      "delete": false
    },
    "finance": {
      "create": false,
      "read": false,
      "update": false,
      "delete": false
    },
    "commercial_offers": {
      "create": true,
      "read": true,
      "update": false,
      "delete": false
    },
    "tasks": { "create": true, "read": true, "update": true, "delete": false },
    "currency": {
      "create": false,
      "read": true,
      "update": false,
      "delete": false
    },
    "attachments": {
      "create": true,
      "read": true,
      "update": false,
      "delete": false
    },
    "roles": {
      "create": false,
      "read": false,
      "update": false,
      "delete": false
    }
  },
  "user": {
    "id": "d36cd0fe-bf3b-448d-964c-5b214eef86e4",
    "phone_number": "998330094112",
    "username": "998330094112",
    "role": "EMPLOYEE",
    "role_id": "e38a293c-8291-4e78-9b88-518293746ab1",
    "status": "Open",
    "is_active": true,
    "role_details": {
      "id": "e38a293c-8291-4e78-9b88-518293746ab1",
      "name": "EMPLOYEE",
      "display_name": "Standard Employee",
      "description": "Standard operational user access",
      "is_system": true,
      "permissions": {
        "clients": {
          "create": false,
          "read": true,
          "update": true,
          "delete": false
        },
        "employees": {
          "create": false,
          "read": true,
          "update": false,
          "delete": false
        },
        "departments": {
          "create": false,
          "read": true,
          "update": false,
          "delete": false
        },
        "cargo_kpi": {
          "create": false,
          "read": true,
          "update": false,
          "delete": false
        },
        "finance": {
          "create": false,
          "read": false,
          "update": false,
          "delete": false
        },
        "commercial_offers": {
          "create": true,
          "read": true,
          "update": false,
          "delete": false
        },
        "tasks": {
          "create": true,
          "read": true,
          "update": true,
          "delete": false
        },
        "currency": {
          "create": false,
          "read": true,
          "update": false,
          "delete": false
        },
        "attachments": {
          "create": true,
          "read": true,
          "update": false,
          "delete": false
        },
        "roles": {
          "create": false,
          "read": false,
          "update": false,
          "delete": false
        }
      }
    },
    "permissions": {
      "clients": {
        "create": false,
        "read": true,
        "update": true,
        "delete": false
      },
      "employees": {
        "create": false,
        "read": true,
        "update": false,
        "delete": false
      },
      "departments": {
        "create": false,
        "read": true,
        "update": false,
        "delete": false
      },
      "cargo_kpi": {
        "create": false,
        "read": true,
        "update": false,
        "delete": false
      },
      "finance": {
        "create": false,
        "read": false,
        "update": false,
        "delete": false
      },
      "commercial_offers": {
        "create": true,
        "read": true,
        "update": false,
        "delete": false
      },
      "tasks": {
        "create": true,
        "read": true,
        "update": true,
        "delete": false
      },
      "currency": {
        "create": false,
        "read": true,
        "update": false,
        "delete": false
      },
      "attachments": {
        "create": true,
        "read": true,
        "update": false,
        "delete": false
      },
      "roles": {
        "create": false,
        "read": false,
        "update": false,
        "delete": false
      }
    }
  },
  "employee": {
    "id": "1d63b635-8933-45d1-a233-d6902e3b27f1",
    "first_name": "Shaxzod",
    "last_name": "Rashidov",
    "phone": "+998330094112",
    "secondary_phone": null,
    "address": null,
    "color": "#CCCCCC",
    "picture_url": "http://127.0.0.1:9000/yaqeen-attachments/avatars/employee_1d63b635-8933-45d1-a233-d6902e3b27f1_1784618035_a1b2c3.png?X-Amz-Algorithm=AWS4-HMAC-SHA256...",
    "fixed_salary": 0,
    "currency": "UZS",
    "is_active": true,
    "department": {
      "id": "07d223ca-4167-47f7-a929-61d47a3628a7",
      "name": "sales",
      "display_name": "Sales"
    }
  }
}
```

---

## 3. Response Fields Description

### 3.1. Primary & Compatibility Fields

- `id` (string, UUID): Employee profile unique identifier.
- `first_name` (string): Employee's first name.
- `last_name` (string): Employee's last name.
- `phone` (string): Employee's direct phone number string.
- `phone_number` (string): User account normalized phone digits.
- `department_id` (string, UUID): Associated department ID.
- `fixed_salary` (number): Monthly fixed salary of employee.
- `currency` (string): Currency of the fixed salary (`'UZS'`, `'USD'`, `'RUB'`).
- `color` (string): Hex color code assigned to the employee for avatar background or calendar tags.
- `picture_url` (string, nullable): MinIO 15-minute presigned URL (cached in Redis with 14m TTL), or `null`.
- `is_active` (boolean): Flag indicating if the employee profile is active.
- `department_name` (string): Department machine name (e.g. `'sales'`).
- `department_display_name` (string): Department human-readable label (e.g. `'Sales'`).
- `user_id` (string, UUID): Linked user authentication ID.
- `username` (string): User account username.
- `user_role` (string): Effective user role machine name (`'CEO' | 'ROP' | 'EMPLOYEE'` or custom role name).
- `user_status` (string): Account status (`'Pending' | 'Open' | 'Banned' | 'Deleted'`).
- `role_id` (string, UUID): Foreign key pointing to `roles.id`.
- `permissions` (object): Normalized map of module CRUD permission flags for the authenticated user.

### 3.2. Nested Structured Fields

- `user` (object): Complete user security details, status flags, assigned `role_id`, nested `role_details`, and normalized `permissions`.
- `employee` (object): Complete employee data with their nested department metadata and `picture_url`.

---

## 4. Permissions Map & Detailed Definitions

The `permissions` object returned in both the root payload and under `user.permissions` represents the exact operational capabilities granted to the current logged-in user across all 10 system modules.

> [!IMPORTANT]
> For users assigned the **`CEO`** role, the backend automatically overrides all module actions (`create`, `read`, `update`, `delete`) to `true`.

### Permission Structure Format

Every module key contains four explicit boolean flags:

```typescript
interface ModulePermissionAction {
  create: boolean; // Permission to perform POST operations
  read: boolean; // Permission to perform GET operations
  update: boolean; // Permission to perform PUT/PATCH operations
  delete: boolean; // Permission to perform DELETE operations
}
```

### Complete System Modules & Definitions

#### 1. `clients` (Clients Management)

Controls access to client catalog, company records, contact numbers, and client tags.

- **`create`**: Add new client entries (`POST /clients`).
- **`read`**: View client directory and individual client profiles (`GET /clients`, `GET /clients/:id`).
- **`update`**: Modify existing client information or client status (`PUT /clients/:id`).
- **`delete`**: Remove or soft-archive client records (`DELETE /clients/:id`).
- **`can_work_with_all_clients`**: When enabled, the account can view, search, and manage all clients across the company; when disabled, visibility and access are strictly scoped to clients assigned to the linked employee profile.

#### 2. `employees` (Employee Management)

Controls access to staff member records, salaries, department assignments, and employee profiles.

- **`create`**: Register new employees and trigger auto-linking of user accounts (`POST /employees`).
- **`read`**: View employee lists, staff directory, and salary details (`GET /employees`, `GET /employees/:id`).
- **`update`**: Update staff details, salaries, or deactivate employees (`PUT /employees/:id`).
- **`delete`**: Remove employee records (`DELETE /employees/:id`).

#### 3. `departments` (Department Management)

Controls access to company department listings and structural organization.

- **`create`**: Create new operational departments (`POST /departments`).
- **`read`**: View department list (`GET /departments`).
- **`update`**: Edit department names or display labels (`PUT /departments/:id`).
- **`delete`**: Delete empty departments (`DELETE /departments/:id`).

#### 4. `cargo_kpi` (Cargo KPI & Shipment Operations)

Controls access to shipment tracking, cargo transactions, weight/volume metrics, and KPI targets.

- **`create`**: Log new cargo shipments or add KPI target entries (`POST /cargo-kpi`).
- **`read`**: View cargo transaction dashboards, analytics, and target progress (`GET /cargo-kpi`).
- **`update`**: Modify shipment parameters, weights, or KPI values (`PUT /cargo-kpi/:id`).
- **`delete`**: Delete cargo transaction entries (`DELETE /cargo-kpi/:id`).

#### 5. `finance` (Finance & Expenses)

Controls access to company financial ledgers, expense logs, and financial statistics.

- **`create`**: Log financial expenses or revenue entries (`POST /finance/expenses`).
- **`read`**: View financial reports, expense categories, and monthly summaries (`GET /finance`).
- **`update`**: Modify expense amounts or description details (`PUT /finance/expenses/:id`).
- **`delete`**: Void or delete expense entries (`DELETE /finance/expenses/:id`).

#### 6. `commercial_offers` (Commercial Offers & Quotes)

Controls access to client price quotes, commercial offer generators, and PDF document rendering.

- **`create`**: Draft and issue new commercial offers (`POST /commercial-offers`).
- **`read`**: Access commercial offer repository and download PDFs (`GET /commercial-offers`).
- **`update`**: Update offer details, terms, or pricing (`PUT /commercial-offers/:id`).
- **`delete`**: Cancel or remove commercial offers (`DELETE /commercial-offers/:id`).

#### 7. `tasks` (Kanban Tasks & Workflows)

Controls access to task management boards, Kanban columns, card assignments, and task comments.

- **`create`**: Create new tasks or task columns (`POST /tasks`).
- **`read`**: View Kanban board cards, task details, and activity logs (`GET /tasks`).
- **`update`**: Move task cards across columns, edit task fields, or post comments (`PUT /tasks/:id`).
- **`delete`**: Delete tasks or task columns (`DELETE /tasks/:id`).

#### 8. `currency` (Currency Rates & Settings)

Controls access to foreign currency exchange rates (USD, EUR, RUB to UZS) and Central Bank auto-sync integration.

- **`create`**: Add manual currency rate entries (`POST /currency`).
- **`read`**: View current exchange rates and rate conversion history (`GET /currency`).
- **`update`**: Update conversion rates or toggle auto-sync settings (`PUT /currency/:id`).
- **`delete`**: Delete historical rate entries (`DELETE /currency/:id`).

#### 9. `attachments` (Attachments & Documents)

Controls access to document uploads, MinIO presigned URL file streaming, and file management.

- **`create`**: Upload document files (passport, contracts, receipts) (`POST /attachments/upload`).
- **`read`**: Fetch temporary presigned view/download URLs for attachments (`GET /attachments/:id`).
- **`update`**: Update attachment metadata or re-upload files (`PUT /attachments/:id`).
- **`delete`**: Delete attachment files from MinIO storage and clear database references (`DELETE /attachments/:id`).

#### 10. `roles` (Role & Permissions Management)

Controls administrative access to defining custom roles and managing user permissions.

- **`create`**: Create new custom system roles with tailored permission matrices (`POST /roles`).
- **`read`**: View roles listing, single role details, and system module taxonomy (`GET /roles`, `GET /roles/modules`).
- **`update`**: Update custom or system role display names and permission matrices (`PUT /roles/:id`).
- **`delete`**: Delete custom roles that have no active users assigned (`DELETE /roles/:id`).

---

## 5. Profile Picture Management Endpoints

### Upload Profile Picture (`POST /employees/me/picture`)

Upload or update the authenticated user's profile picture avatar image.

- **Route:** `/employees/me/picture`
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`
- **Payload:** `file` (binary, max 5MB, JPEG/PNG/WEBP/GIF)
- **Success HTTP Status:** `201 Created`

### Delete Profile Picture (`DELETE /employees/me/picture`)

Remove the authenticated user's profile picture avatar from MinIO and clear DB reference.

- **Route:** `/employees/me/picture`
- **Method:** `DELETE`
- **Success HTTP Status:** `200 OK`

---

## 6. Error Responses & Security Exceptions

| Location Key               | HTTP Code          | Scenario                                                                     |
| :------------------------- | :----------------- | :--------------------------------------------------------------------------- |
| `auth_header_missing`      | `401 Unauthorized` | Authorization header is absent or is not formatted as `Bearer <token>`.      |
| `invalid_token`            | `401 Unauthorized` | Access token signature verification failed or token has expired.             |
| `employee_profile_missing` | `404 Not Found`    | No employee details or user record could be resolved for the active session. |

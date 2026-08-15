# Frontend Integration Guide: `can_work_with_all_clients` Role Permission

This document provides a comprehensive guide for frontend developers on how the new **`can_work_with_all_clients`** permission works, how it affects the user interface, API responses, and role management matrices.

---

## 1. Overview & Purpose

The **`can_work_with_all_clients`** permission controls whether an account can view and manage all clients across the company or only the clients assigned to their linked employee profile.

This permission is analogous to `register_for_everyone` in the `cargo_registrations` module.

### Core Behavior Summary

| State                                                   | Role / User Capability                              | Filter / Scoping Behavior                                                                                                                      |
| :------------------------------------------------------ | :-------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| **Enabled (`true`)**                                    | Full client visibility across the organization.     | Can view, search, and list **all clients** in the database, including unassigned clients and clients assigned to other employees.              |
| **Disabled (`false`)** (Default for standard employees) | Scoped strictly to the employee's assigned clients. | Can **only see and access clients assigned to their own linked employee account** (`clients.assigned_employee_id == currentUser.employee_id`). |

---

## 2. Permission Matrix & Default Values

In the backend role management system, the `clients` module permissions schema now includes:

```typescript
export interface ClientsModulePermissions {
  create: boolean; // Permission to create new clients
  read: boolean; // Permission to view clients
  update: boolean; // Permission to edit clients
  delete: boolean; // Permission to delete clients
  can_work_with_all_clients: boolean; // Global vs scoped visibility
}
```

### System Defaults

- **`CEO`**: `can_work_with_all_clients: true` (Hardcoded full access)
- **`ROP` (Head of Sales / Operations)**: `can_work_with_all_clients: true`
- **`EMPLOYEE` (Standard Employee)**: `can_work_with_all_clients: false` (Disabled by default)
- **Custom Roles**: Disabled (`false`) by default unless explicitly toggled in Role Management.

---

## 3. How It Affects API Endpoints

### 1. `GET /api/v1/clients` (List / Search Clients)

- **When `can_work_with_all_clients: true` (or CEO/ROP):**
  - Returns all clients matching optional query parameters (`search`, `color`, `assigned_employee_id`, `is_active`, `page`, `limit`).
  - Allows filtering by any `assigned_employee_id`.

- **When `can_work_with_all_clients: false`:**
  - The backend **automatically injects the filter** `WHERE clients.assigned_employee_id = <current_user_employee_id>`.
  - Clients assigned to other employees or unassigned clients (`assigned_employee_id = null`) are **never returned**.
  - If the user account is not linked to any employee (`employee_id == null`), the backend returns an empty list (`data: []`, `total: 0`).

---

### 2. `GET /api/v1/clients/:id` (Get Single Client Details)

- **When `can_work_with_all_clients: true`:**
  - Can fetch details of any client by ID.

- **When `can_work_with_all_clients: false`:**
  - Can only fetch details of clients assigned to the employee.
  - If the client is assigned to another employee (or is unassigned), the endpoint returns:
    ```json
    {
      "statusCode": 403,
      "message": "You do not have permission to view clients assigned to other employees",
      "location": "permission_denied_for_other_employees"
    }
    ```

---

### 3. `GET /api/v1/clients/stats/color-distribution` (Color & Employee Distribution)

- **When `can_work_with_all_clients: true`:**
  - Returns statistics across all clients in the entire system.

- **When `can_work_with_all_clients: false`:**
  - Returns color distribution and count statistics **calculated strictly from the employee's assigned clients**.

---

### 4. `POST /api/v1/clients` (Create Client)

- **When `can_work_with_all_clients: true`:**
  - Can assign the client to any valid employee (`assigned_employee_id`) or leave unassigned (`null`).

- **When `can_work_with_all_clients: false`:**
  - If `assigned_employee_id` is passed and differs from the current user's `employee_id`, returns:
    ```json
    {
      "statusCode": 403,
      "message": "You do not have permission to assign clients to other employees",
      "location": "permission_denied_for_other_employees"
    }
    ```
  - If `assigned_employee_id` is omitted, the backend automatically defaults the client assignment to the current user's `employee_id`.
  - If the account is not linked to an employee profile, returns `400 Bad Request` with `location: "user_not_linked_to_employee"`.

---

### 5. `PUT /api/v1/clients/:id` (Update Client)

- **When `can_work_with_all_clients: true`:**
  - Can update any client and reassign to any employee.

- **When `can_work_with_all_clients: false`:**
  - Attempting to update a client assigned to another employee returns `403 Forbidden` (`location: "permission_denied_for_other_employees"`).
  - Attempting to reassign (`assigned_employee_id`) to another employee returns `403 Forbidden` (`location: "reassignment_prohibited"`).

---

### 6. `DELETE /api/v1/clients/:id` (Delete Client)

- **When `can_work_with_all_clients: true`:**
  - Can delete any client record.

- **When `can_work_with_all_clients: false`:**
  - Attempting to delete a client assigned to another employee returns `403 Forbidden` (`location: "permission_denied_for_other_employees"`).

---

## 4. Frontend UI Implementation Guidelines

### 1. Checking Permissions in Frontend Application

When the user logs in or calls `GET /api/v1/auth/me`, inspect the permissions payload:

```typescript
const canWorkWithAllClients = Boolean(
  user?.permissions?.clients?.can_work_with_all_clients ||
  user?.role === 'CEO' ||
  user?.role === 'ROP',
);
```

### 2. Client Management Table & Filters

- **Responsible Employee Filter**:
  - If `canWorkWithAllClients === false`: Hide or disable the "Filter by Responsible Employee" dropdown, as the user only has access to their own clients.
  - If `canWorkWithAllClients === true`: Show the dropdown filter containing all employees and "Unassigned".

- **Stats & Dashboard Badges**:
  - For standard employees, display a helper label like `"My Assigned Clients"` instead of `"All Company Clients"`.

### 3. Client Create / Edit Modal

- **"Responsible Employee" Selector**:
  - If `canWorkWithAllClients === true`: Render the employee selector dropdown allowing selection of any staff member or unassigned.
  - If `canWorkWithAllClients === false`: Hide the selector or make it a read-only field displaying current user's name (locked).

### 4. Role & Permissions Matrix UI (`/roles`)

In the Role Creation and Editing modal (`POST /api/v1/roles`, `PUT /api/v1/roles/:id`):

- Under the **Clients Management** section, display an extra toggle switch/checkbox:
  - **Label**: `Can work with all clients` (`can_work_with_all_clients`)
  - **Description**: `Allows the user to view, search, and manage clients assigned to all employees across the organization. When disabled, the user only sees their own assigned clients.`
  - **Default**: `false` (unchecked).

---

## 5. Summary Table for Frontend Error Handling

| Error Code        | Location Identifier                     | Cause / Description                                                                               | Recommended UI Action                                                        |
| :---------------- | :-------------------------------------- | :------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------- |
| `403 Forbidden`   | `permission_denied_for_other_employees` | Tried to view, edit, delete, or create a client assigned to another staff member.                 | Show notification: _"You can only view and manage clients assigned to you."_ |
| `403 Forbidden`   | `reassignment_prohibited`               | Tried to reassign an assigned client to another employee.                                         | Show notification: _"You do not have permission to reassign clients."_       |
| `400 Bad Request` | `user_not_linked_to_employee`           | User has a role with restricted client access but their user account has no `employee_id` linked. | Prompt user to contact admin to link employee profile.                       |
| `404 Not Found`   | `client_not_found`                      | Client ID does not exist in the database.                                                         | Redirect to `/clients` list with not found toast.                            |

# Yaqeen Backend - Authentication API Documentation

This document provides detailed specifications of the authentication and account setup endpoints for the **Yaqeen Backend**. It is designed specifically for frontend developers to implement robust login, registration, password-reset, and token-refresh flows.

---

## 1. General System Rules & Request/Response Conventions

### Base URL

- **Local URL:** `http://localhost:3000/api/v1`
- **Global Path Prefix:** `/api/v1`
- **Content-Type:** `application/json` for all requests and responses.

### Request Body Validation

The backend enforces strict validation on incoming JSON payloads using NestJS `ValidationPipe` with the following configuration:

- **Whitelisting (`whitelist: true`):** Properties without validation decorators in the target DTO are automatically stripped.
- **Forbid Non-Whitelisted (`forbidNonWhitelisted: true`):** If the request body contains any properties not defined in the corresponding DTO class, **the entire request is rejected** with a `400 Bad Request` validation error.
- **Payload Normalization:** Phone numbers passed in `phone_number` fields are normalized by removing all non-digit characters (e.g., `+998 (90) 123-45-67` becomes `998901234567`).

> [!WARNING]
> Do not send extra fields (such as `id`, `created_at`, or dummy fields) in your request bodies. The request will fail with a `validation_failed` error.

---

## 2. Global Error Response Schema

All errors thrown by the backend (both custom business exceptions and system validation failures) are captured by the global `CustomExceptionFilter` and returned in a unified format:

```json
{
  "statusCode": 400,
  "message": "Error message description or detailed validation explanation.",
  "error": "BadRequestException",
  "timestamp": "2026-07-19T13:04:57.123Z",
  "location": "validation_failed",
  "path": "/api/v1/auth/register/send-otp"
}
```

### Error Response Fields

1.  `statusCode` (number): The HTTP status code (e.g., `400`, `401`, `403`, `404`, `500`).
2.  `message` (string): Human-readable error message. In the case of validation failures, multiple validation errors are joined with commas into a single string.
3.  `error` (string): The exception class name (e.g., `BadRequestException`, `UnauthorizedException`).
4.  `timestamp` (string): ISO 8601 UTC timestamp of the error occurrence.
5.  `location` (string): A machine-readable identifier pointing to the specific validation error or business rule that was violated. Use this field on the frontend to display localized errors.
6.  `path` (string): The relative API path that triggered the error.

### Error Locations List

Here is the complete registry of `location` keys returned by the authentication endpoints:

| Location Key              | HTTP Code | Occurs When                                                                                         |
| :------------------------ | :-------- | :-------------------------------------------------------------------------------------------------- |
| `validation_failed`       | 400       | A property fails class-validator rules (e.g., bad format) or contains extra properties.             |
| `telegram_not_registered` | 400       | The phone number has not been registered in the Telegram OTP Bot.                                   |
| `account_not_found`       | 400       | No employee matches the phone number (registration) or no user matches (password reset).            |
| `already_registered`      | 400       | The user is already registered (status `Open`) or set-password is sent for a non-`Pending` account. |
| `account_pending`         | 400 / 401 | User tries to reset password or login with an account that is still in `Pending` status.            |
| `account_banned`          | 400 / 401 | User tries to login, refresh tokens, or reset password on a banned account.                         |
| `account_deleted`         | 400 / 401 | User tries to login, refresh tokens, or reset password on a deleted account.                        |
| `invalid_otp`             | 400       | The OTP code entered is incorrect or has expired (exceeded 5 minutes TTL).                          |
| `passwords_do_not_match`  | 400       | `password` does not match `password_confirmation`.                                                  |
| `invalid_token`           | 400       | The temporary action token (from OTP verification) is invalid or expired (exceeded 10 minutes TTL). |
| `invalid_login`           | 401       | The phone number or password provided during login is incorrect.                                    |
| `invalid_refresh_token`   | 401       | The refresh token provided is incorrect or has expired in Redis.                                    |
| `user_not_found`          | 401       | The user matching the refresh token payload does not exist in the database anymore.                 |
| `unauthorized`            | 401       | Default unauthorized access (missing/expired JWT token).                                            |
| `forbidden`               | 403       | Missing permissions for the requested resource.                                                     |
| `not_found`               | 404       | Route not found.                                                                                    |
| `internal_error`          | 500       | An unhandled exception or database connection error occurred on the server.                         |

---

## 3. Account Lifecycle & User Status State Machine

Users on the platform transition through a series of status flags, checked dynamically on each authentication action:

```mermaid
state-diagram-v2
    [*] --> Pending : Employee exists, sends Register OTP
    Pending --> Open : OTP Verified & Password Set
    Open --> Banned : Admin action
    Open --> Deleted : Admin action
    Banned --> Open : Admin action (optional)
```

1.  **Pending:** The account is initialized because an employee with this phone number exists, but the user has not yet verified their OTP and chosen a password.
    - _Permitted Actions:_ OTP Verification, Set Password.
    - _Forbidden Actions:_ Login, JWT token refresh, Password Reset.
2.  **Open:** Active user.
    - _Permitted Actions:_ Login, Refresh, Password Reset.
3.  **Banned:** Suspended user.
    - _Forbidden Actions:_ Login, Refresh, Password Reset, Registration.
4.  **Deleted:** Soft-deleted user.
    - _Forbidden Actions:_ Login, Refresh, Password Reset, Registration.

---

## 4. Telegram OTP Integration Flow

The backend communicates with a **Telegram OTP Bot** to issue one-time passwords. Before triggering any OTP send requests, the user **MUST** map their phone number to their Telegram chat.

### The Bot Workflow:

1.  The user searches for the bot and sends `/start`.
2.  The bot displays a button: **"Register Phone Number 📱"** (`request_contact: true`).
3.  When clicked, the bot:
    - Captures the user's phone number, `chat_id`, first/last names, and Telegram username, and saves it in the database (`telegram_contacts` table).
    - **Pending User Auto-Creation:** Checks if a user record exists for this phone digits. If not, it automatically creates a user record in the `users` table with status `'Pending'`, role `'EMPLOYEE'`, `employee_id` set to `null`, and an empty password.
    - **No Employee Creation:** No employee record is created during this bot flow.
4.  Only after this step can the frontend successfully trigger `/auth/register/send-otp` or `/auth/password-reset/send-otp`. Since the user is pre-created in `'Pending'` status, they can immediately receive their OTP and complete registration by choosing a password. When an admin later creates the corresponding employee profile via the API, the user record is automatically linked and updated with the correct role.

---

## 5. Token Security & Refresh Rotation Model

### Access Token (JWT)

- Passed in the header: `Authorization: Bearer <accessToken>`
- **Signature Algorithm:** HMAC SHA256 (`HS256`)
- **Expiry Time:** Configured in `.env` as `JWT_EXPIRES_IN`. Currently set to **30 minutes** (`30m`).
- **JWT Payload Format:**
  ```json
  {
    "sub": "3a0c4f82-a7d1-4e89-a2cb-3b10ad6e45c7", // User Database ID (UUID)
    "phone_number": "998901234567",
    "role": "EMPLOYEE", // 'CEO' | 'ROP' | 'EMPLOYEE'
    "jti": "5a4d3f2c-e1b0-4a89-94b2-4d10af6e479a", // JWT Unique ID
    "iat": 1784534680,
    "exp": 1784536480
  }
  ```

### Refresh Token & Rotation

- An 80-character random hex string (generated from 40 secure random bytes).
- Stored in Redis under the key `auth:refresh_token:<token>`.
- **Expiry Time:** Configured in `.env` as `REFRESH_TOKEN_EXPIRES_IN`. Currently set to **30 days** (`30d`).
- **Refresh Token Rotation (RTR):** When `/auth/refresh` is requested with a valid refresh token:
  1.  The old refresh token is immediately deleted from Redis.
  2.  A new Access Token and a brand new Refresh Token are generated and returned.
  3.  **Frontend Action Required:** The frontend must discard the old refresh token, replace it with the new one, and use the new access token. If a token refresh fails, the frontend should purge all tokens and redirect to the login page.

---

## 6. Detailed Endpoint Reference

### 6.1. User Login

Authenticate a user with a phone number and password.

- **Route:** `/auth/login`
- **Method:** `POST`
- **Access:** `Public`
- **HTTP Success Status:** `200 OK`

#### Request Body Schema

| Field          | Type     | Required | Constraints | Description                                              |
| :------------- | :------- | :------- | :---------- | :------------------------------------------------------- |
| `phone_number` | `string` | Yes      | Non-empty   | The user's phone number. Will be stripped of non-digits. |
| `password`     | `string` | Yes      | Non-empty   | The user's plain-text password.                          |

_Example Payload:_

```json
{
  "phone_number": "+998 (90) 123-45-67",
  "password": "mySecurePassword123"
}
```

#### Success Response (200 OK)

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzYTBjNGY4Mi1hN2QxLTRlODktYTJjYi0zYjEwYWQ2ZTQ1YzciLCJwaG9uZV9udW1iZXIiOiI5OTg5MDEyMzQ1NjciLCJyb2xlIjoiRU1QTE9ZRUUiLCJqdGkiOiI1YTRkM2YyYy1lMWIwLTRhODktOTRiMi00ZDEwYWY2ZTQ3OWEiLCJpYXQiOjE3ODQ1MzQ2ODAsImV4cCI6MTc4NDUzNjQ4MH0.signature",
  "refreshToken": "7c88b9071c504da89a72df98c39e2467d023bf5b0de0ad9bc19cf200ea74c2e6aa0089e0ff9981db",
  "user": {
    "id": "3a0c4f82-a7d1-4e89-a2cb-3b10ad6e45c7",
    "phone_number": "998901234567",
    "role": "EMPLOYEE",
    "status": "Open"
  }
}
```

#### Error Responses

- **401 Unauthorized (`location: "invalid_login"`)**
  - _Cause:_ Phone number does not exist, password hashes don't match, or user table entry is missing `password_hash`.
  - _Response Body:_
    ```json
    {
      "statusCode": 401,
      "message": "Invalid credentials",
      "error": "UnauthorizedException",
      "timestamp": "2026-07-19T13:04:57.123Z",
      "location": "invalid_login",
      "path": "/api/v1/auth/login"
    }
    ```
- **401 Unauthorized (`location: "account_banned"`)**
  - _Cause:_ The account status is set to `Banned`.
- **401 Unauthorized (`location: "account_deleted"`)**
  - _Cause:_ The account status is set to `Deleted`.
- **401 Unauthorized (`location: "account_pending"`)**
  - _Cause:_ The user has not completed registration (status is `Pending`).

---

### 6.2. Admin Login

Authenticate an administrator or manager. Behaves identically to User Login but exposes a different routing path for analytics and firewall grouping.

- **Route:** `/auth/admin/login`
- **Method:** `POST`
- **Access:** `Public`
- **HTTP Success Status:** `200 OK`

#### Request Body Schema

Same payload schema as **User Login**.

#### Success Response (200 OK)

Same response schema as **User Login** (returns access and refresh tokens, plus the user metadata).

---

### 6.3. Token Refresh

Obtain a new Access Token (JWT) and rotate the Refresh Token.

- **Route:** `/auth/refresh`
- **Method:** `POST`
- **Access:** `Public`
- **HTTP Success Status:** `200 OK`

#### Request Body Schema

| Field          | Type     | Required | Constraints | Description                            |
| :------------- | :------- | :------- | :---------- | :------------------------------------- |
| `refreshToken` | `string` | Yes      | Non-empty   | The 80-character active refresh token. |

_Example Payload:_

```json
{
  "refreshToken": "7c88b9071c504da89a72df98c39e2467d023bf5b0de0ad9bc19cf200ea74c2e6aa0089e0ff9981db"
}
```

#### Success Response (200 OK)

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.newJWTTokenPayload.signature",
  "refreshToken": "aa99bb88cc77dd66ee55ff44ee33dd22cc11bb00aa99bb88cc77dd66ee55ff44ee33dd22cc11bb00"
}
```

#### Error Responses

- **401 Unauthorized (`location: "invalid_refresh_token"`)**
  - _Cause:_ The token is not found in Redis (either expired or already rotated/used).
- **401 Unauthorized (`location: "user_not_found"`)**
  - _Cause:_ The user ID encoded in the token is no longer in the DB.
- **401 Unauthorized (`location: "account_banned"`)**
  - _Cause:_ User status became `Banned` since token was issued.
- **401 Unauthorized (`location: "account_deleted"`)**
  - _Cause:_ User status became `Deleted` since token was issued.
- **401 Unauthorized (`location: "account_pending"`)**
  - _Cause:_ User status reverted to `Pending`.

---

### 6.4. User Logout

Invalidate a Refresh Token and log the user out from the application.

- **Route:** `/auth/logout`
- **Method:** `POST`
- **Access:** `Public`
- **HTTP Success Status:** `200 OK`

#### Request Body Schema

| Field          | Type     | Required | Constraints | Description                                 |
| :------------- | :------- | :------- | :---------- | :------------------------------------------ |
| `refreshToken` | `string` | Yes      | Non-empty   | The active refresh token to be invalidated. |

_Example Payload:_

```json
{
  "refreshToken": "7c88b9071c504da89a72df98c39e2467d023bf5b0de0ad9bc19cf200ea74c2e6aa0089e0ff9981db"
}
```

#### Success Response (200 OK)

```json
{
  "message": "Logged out successfully"
}
```

#### Error Responses

- **401 Unauthorized (`location: "invalid_refresh_token"`)**
  - _Cause:_ The token is not found in Redis (either expired or already deleted).

---

### 6.5. Register Step 1: Send OTP

Verify that a phone number belongs to an employee, that they have joined the Telegram bot, and transmit a 6-digit OTP code to their Telegram.

- **Route:** `/auth/register/send-otp`
- **Method:** `POST`
- **Access:** `Public`
- **HTTP Success Status:** `200 OK`

#### Request Body Schema

| Field          | Type     | Required | Constraints | Description                         |
| :------------- | :------- | :------- | :---------- | :---------------------------------- |
| `phone_number` | `string` | Yes      | Non-empty   | User's phone number to receive OTP. |

_Example Payload:_

```json
{
  "phone_number": "+998901234567"
}
```

#### Success Response (200 OK)

```json
{
  "message": "OTP message sent successfully."
}
```

#### Error Responses

- **400 Bad Request (`location: "telegram_not_registered"`)**
  - _Cause:_ No matching `phone_number` mapping exists in `telegram_contacts`.
  - _Response Payload:_ Includes direct deep link metadata for seamless web redirection:
    ```json
    {
      "statusCode": 400,
      "message": "Phone number is not registered in the Telegram bot.",
      "error": "BadRequestException",
      "location": "telegram_not_registered",
      "telegram_bot_username": "YaqeenOtpBot",
      "telegram_bot_url": "https://t.me/YaqeenOtpBot?start=reg_998901234567"
    }
    ```
- **400 Bad Request (`location: "account_not_found"`)**
  - _Cause:_ No user exists with this phone number, **and** no matching record exists in the `employees` table. (Only pre-registered employees can create accounts).
- **400 Bad Request (`location: "already_registered"`)**
  - _Cause:_ A user with this phone number already exists and has a status of `Open`.
- **400 Bad Request (`location: "account_banned"`)**
  - _Cause:_ A user with this phone number is `Banned`.
- **400 Bad Request (`location: "account_deleted"`)**
  - _Cause:_ A user with this phone number is `Deleted`.

---

### 6.5.1. Check Telegram Registration Status

Check if a phone number has been linked/registered in the Telegram OTP Bot, and retrieve direct deep link URLs for UI modals.

- **Route:** `/auth/check-telegram-status`
- **Method:** `GET`
- **Access:** `Public`
- **Query Parameters:**
  - `phone_number` (string, required): Phone number to check (e.g., `+998901234567` or `998901234567`).

#### Success Response (200 OK)

```json
{
  "registered": true,
  "phone_number": "998901234567",
  "telegram_bot_username": "YaqeenOtpBot",
  "telegram_bot_url": "https://t.me/YaqeenOtpBot?start=reg_998901234567"
}
```

> [!TIP]
> **Frontend Integration Pattern (Recommended Web UX Flow):**
>
> 1. When calling `POST /auth/register/send-otp` returns `400` with `location: "telegram_not_registered"`:
> 2. Open a modal displaying:
>    - A primary CTA button: **"Open Telegram Bot"** pointing to `response.telegram_bot_url`.
>    - A **QR Code** generated from `telegram_bot_url` for desktop users to scan with their phone.
> 3. Start auto-polling `GET /auth/check-telegram-status?phone_number=<phone>` every 2 seconds.
> 4. As soon as `registered` becomes `true`, close the modal and automatically re-trigger `POST /auth/register/send-otp`!

---

### 6.6. Register Step 2: Verify OTP

Verify the 6-digit code received on Telegram and retrieve a short-lived temporary registration token.

- **Route:** `/auth/register/verify-otp`
- **Method:** `POST`
- **Access:** `Public`
- **HTTP Success Status:** `200 OK`

#### Request Body Schema

| Field          | Type     | Required | Constraints     | Description                            |
| :------------- | :------- | :------- | :-------------- | :------------------------------------- |
| `phone_number` | `string` | Yes      | Non-empty       | Normalized user phone number.          |
| `otp`          | `string` | Yes      | Exactly 6 chars | The 6-digit OTP code sent to Telegram. |

_Example Payload:_

```json
{
  "phone_number": "998901234567",
  "otp": "583921"
}
```

#### Success Response (200 OK)

```json
{
  "token": "495d43ec-6945-422f-ad3d-7104b2a8d389"
}
```

#### Error Responses

- **400 Bad Request (`location: "invalid_otp"`)**
  - _Cause:_ The code entered does not match the key in Redis, or the 5-minute TTL has expired.

---

### 6.7. Register Step 3: Set Password

Provide the temporary verification token to complete registration, hash the password, and mark the account status as `Open`.

- **Route:** `/auth/register/set-password`
- **Method:** `POST`
- **Access:** `Public`
- **HTTP Success Status:** `200 OK`

#### Request Body Schema

| Field                   | Type     | Required | Constraints | Description                                   |
| :---------------------- | :------- | :------- | :---------- | :-------------------------------------------- |
| `token`                 | `string` | Yes      | Non-empty   | The temporary registration token from Step 2. |
| `password`              | `string` | Yes      | Min 6 chars | The user's new account password.              |
| `password_confirmation` | `string` | Yes      | Non-empty   | Must exactly match `password`.                |

_Example Payload:_

```json
{
  "token": "495d43ec-6945-422f-ad3d-7104b2a8d389",
  "password": "SuperSecretPassword123",
  "password_confirmation": "SuperSecretPassword123"
}
```

#### Success Response (200 OK)

```json
{
  "message": "Registration completed successfully. Your account is now active."
}
```

#### Error Responses

- **400 Bad Request (`location: "passwords_do_not_match"`)**
  - _Cause:_ `password` and `password_confirmation` do not match.
- **400 Bad Request (`location: "invalid_token"`)**
  - _Cause:_ The registration token was not found in Redis (expired after 10 minutes or already used).
- **400 Bad Request (`location: "account_not_found"`)**
  - _Cause:_ The phone number associated with the token does not match any user in the database.
- **400 Bad Request (`location: "already_registered"`)**
  - _Cause:_ The user matching the token does not have `Pending` status (already `Open`).

---

### 6.8. Password Reset Step 1: Send OTP

Initiate password reset. Verifies that the account is active (`Open`) and sends a 6-digit reset OTP code to Telegram.

- **Route:** `/auth/password-reset/send-otp`
- **Method:** `POST`
- **Access:** `Public`
- **HTTP Success Status:** `200 OK`

#### Request Body Schema

| Field          | Type     | Required | Constraints | Description                   |
| :------------- | :------- | :------- | :---------- | :---------------------------- |
| `phone_number` | `string` | Yes      | Non-empty   | Normalized user phone number. |

_Example Payload:_

```json
{
  "phone_number": "998901234567"
}
```

#### Success Response (200 OK)

```json
{
  "message": "OTP message sent successfully."
}
```

#### Error Responses

- **400 Bad Request (`location: "telegram_not_registered"`)**
  - _Cause:_ Phone number mapping is not in the `telegram_contacts` table.
- **400 Bad Request (`location: "account_not_found"`)**
  - _Cause:_ No user matches this phone number.
- **400 Bad Request (`location: "account_pending"`)**
  - _Cause:_ User status is `Pending` (they must complete initial registration first).
- **400 Bad Request (`location: "account_banned"`)**
  - _Cause:_ User status is `Banned`.
- **400 Bad Request (`location: "account_deleted"`)**
  - _Cause:_ User status is `Deleted`.

---

### 6.9. Password Reset Step 2: Verify OTP

Verify the password reset OTP code and retrieve a short-lived temporary password-reset token.

- **Route:** `/auth/password-reset/verify-otp`
- **Method:** `POST`
- **Access:** `Public`
- **HTTP Success Status:** `200 OK`

#### Request Body Schema

| Field          | Type     | Required | Constraints     | Description                            |
| :------------- | :------- | :------- | :-------------- | :------------------------------------- |
| `phone_number` | `string` | Yes      | Non-empty       | Normalized user phone number.          |
| `otp`          | `string` | Yes      | Exactly 6 chars | The 6-digit OTP code sent to Telegram. |

_Example Payload:_

```json
{
  "phone_number": "998901234567",
  "otp": "928301"
}
```

#### Success Response (200 OK)

```json
{
  "token": "be89cf20-e102-4b2a-bf39-47c0a1b2d3e4"
}
```

#### Error Responses

- **400 Bad Request (`location: "invalid_otp"`)**
  - _Cause:_ The code entered does not match the key in Redis, or the 5-minute TTL has expired.

---

### 6.10. Password Reset Step 3: Set Password

Provide the temporary reset token to set a new password for the account.

- **Route:** `/auth/password-reset/set-password`
- **Method:** `POST`
- **Access:** `Public`
- **HTTP Success Status:** `200 OK`

#### Request Body Schema

| Field                   | Type     | Required | Constraints | Description                                     |
| :---------------------- | :------- | :------- | :---------- | :---------------------------------------------- |
| `token`                 | `string` | Yes      | Non-empty   | The temporary password reset token from Step 2. |
| `password`              | `string` | Yes      | Min 6 chars | The new password.                               |
| `password_confirmation` | `string` | Yes      | Non-empty   | Must exactly match `password`.                  |

_Example Payload:_

```json
{
  "token": "be89cf20-e102-4b2a-bf39-47c0a1b2d3e4",
  "password": "BrandNewPassword123",
  "password_confirmation": "BrandNewPassword123"
}
```

#### Success Response (200 OK)

```json
{
  "message": "Password reset successfully. You can now login with your new password."
}
```

#### Error Responses

- **400 Bad Request (`location: "passwords_do_not_match"`)**
  - _Cause:_ `password` and `password_confirmation` do not match.
- **400 Bad Request (`location: "invalid_token"`)**
  - _Cause:_ The reset token was not found in Redis (expired after 10 minutes or already used).
- **400 Bad Request (`location: "account_not_found"`)**
  - _Cause:_ The phone number associated with the token does not match any user in the database.
- **400 Bad Request (`location: "account_banned"`)**
  - _Cause:_ The user status became `Banned` during reset.
- **400 Bad Request (`location: "account_deleted"`)**
  - _Cause:_ The user status became `Deleted` during reset.
- **400 Bad Request (`location: "account_pending"`)**
  - _Cause:_ The user status is `Pending`.

---

## 7. Utility Endpoints

### 7.1. Service Health Check

Check connectivity and health of the API database and Redis store.

- **Route:** `/health`
- **Method:** `GET`
- **Access:** `Public`
- **HTTP Success Status:** `200 OK`

#### Success Response (200 OK)

```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up"
    },
    "redis": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up"
    },
    "redis": {
      "status": "up"
    }
  }
}
```

#### Error Response (503 Service Unavailable)

If the database or Redis is down, the response status will be `503` with a summary of the failing components:

```json
{
  "status": "error",
  "info": {
    "database": {
      "status": "up"
    }
  },
  "error": {
    "redis": {
      "status": "down",
      "message": "Redis connection timed out"
    }
  },
  "details": {
    "database": {
      "status": "up"
    },
    "redis": {
      "status": "down",
      "message": "Redis connection timed out"
    }
  }
}
```

---

### 7.2. Base Route Hello

Basic sanity check to verify if the server is responsive.

- **Route:** `/` (maps to `/api/v1` due to global prefix)
- **Method:** `GET`
- **Access:** `Public`
- **HTTP Success Status:** `200 OK`
- **Response Body:**
  ```text
  Hello World!
  ```

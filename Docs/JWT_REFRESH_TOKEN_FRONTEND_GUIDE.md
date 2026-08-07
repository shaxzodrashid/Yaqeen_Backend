# JWT & Refresh Token Integration Guide for Frontend Developers

This guide provides a comprehensive walkthrough for frontend developers (React, Vue, Angular, React Native, etc.) on how to authenticate, store, and manage **JWT Access Tokens** and **Refresh Tokens** when communicating with the backend API.

---

## 1. Concepts & Token Lifecycle

| Token Type             | Purpose                                           | Expiration / Lifetime           | Where Sent                         |
| :--------------------- | :------------------------------------------------ | :------------------------------ | :--------------------------------- |
| **Access Token (JWT)** | Authenticates individual API requests             | Short/Medium (e.g., 1 day)      | Included in `Authorization` header |
| **Refresh Token**      | Obtains a fresh Access Token + Refresh Token pair | Configurable (e.g., 30 minutes) | Sent in body to `/auth/refresh`    |

### Token Rotation Strategy

When `/auth/refresh` is called, the backend uses **Refresh Token Rotation**:

1. The submitted `refreshToken` is checked and immediately **invalidated/deleted**.
2. A new `accessToken` AND a new `refreshToken` are generated and returned.
3. The frontend **must replace both tokens** with the new pair.

---

## 2. API Endpoints Overview

### 2.1 Login

- **Endpoint:** `POST /auth/login`
- **Request Body:**
  ```json
  {
    "phone_number": "+998901234567",
    "password": "YourPassword123!"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
    "refreshToken": "4a9d7f8c1b2e3f...",
    "user": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "phone_number": "998901234567",
      "role": "EMPLOYEE",
      "status": "Open"
    }
  }
  ```

---

### 2.2 Refresh Token

- **Endpoint:** `POST /auth/refresh`
- **Request Body:**
  ```json
  {
    "refreshToken": "4a9d7f8c1b2e3f..."
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
    "refreshToken": "9f8e7d6c5b4a3e..."
  }
  ```
- **Error Response (`401 Unauthorized`):**
  ```json
  {
    "statusCode": 401,
    "message": "Invalid or expired refresh token",
    "location": "invalid_refresh_token"
  }
  ```

---

### 2.3 Logout

- **Endpoint:** `POST /auth/logout`
- **Request Body:**
  ```json
  {
    "refreshToken": "9f8e7d6c5b4a3e..."
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "message": "Logged out successfully."
  }
  ```

---

## 3. Recommended Frontend Storage Strategy

1. **Access Token (`accessToken`):**
   - Keep in **in-memory state** (e.g., Zustand, Redux, React Context, or a module-level variable).
   - Fast access, naturally cleared on hard page reloads (can be restored via refresh token or initial auth check).

2. **Refresh Token (`refreshToken`):**
   - **Web Applications:** Store in `localStorage` or `sessionStorage` (or HTTP-Only secure cookies if handled transparently by cookie configuration).
   - **Mobile / React Native:** Store using secure storage like `Expo SecureStore` or `react-native-encrypted-storage`.

---

## 4. Complete Implementation Examples

### Option A: Axios Interceptor with Automatic Token Refresh (Recommended)

Below is a production-ready Axios instance configured with an HTTP `401` interceptor that queues requests while refreshing, avoiding duplicate `/auth/refresh` calls when multiple requests fail simultaneously.

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = 'https://api.yourdomain.com';

// 1. Create Axios Instance
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper functions for token storage
export const getAccessToken = (): string | null =>
  localStorage.getItem('accessToken');
export const getRefreshToken = (): string | null =>
  localStorage.getItem('refreshToken');

export const setTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
};

export const clearTokens = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};

// 2. Request Interceptor: Attach Access Token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// State to handle multiple concurrent 401 errors
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

// 3. Response Interceptor: Auto-Refresh on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Check if error is 401 and request was not already retried
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry
    ) {
      // Do not attempt refresh on auth endpoints themselves
      if (
        originalRequest.url?.includes('/auth/login') ||
        originalRequest.url?.includes('/auth/refresh')
      ) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // If refresh is already in progress, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        // Call refresh endpoint
        const response = await axios.post<{
          accessToken: string;
          refreshToken: string;
        }>(`${API_BASE_URL}/auth/refresh`, { refreshToken });

        const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
          response.data;

        // Update stored tokens
        setTokens(newAccessToken, newRefreshToken);

        // Update failed requests queue with new access token
        processQueue(null, newAccessToken);

        // Retry original request with new access token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearTokens();
        // Redirect to login page on session expiry
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
```

---

### Option B: Native Fetch API Wrapper Example

If you are using native `fetch` without Axios, wrap your fetch calls with automatic refresh logic:

```typescript
async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let accessToken = localStorage.getItem('accessToken');

  const headers = new Headers(options.headers || {});
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response = await fetch(url, { ...options, headers });

  // Handle 401 Unauthorized
  if (response.status === 401) {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      localStorage.clear();
      window.location.href = '/login';
      throw new Error('Session expired');
    }

    // Call /auth/refresh
    const refreshResponse = await fetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (refreshResponse.ok) {
      const data = await refreshResponse.json();
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);

      // Retry original request
      headers.set('Authorization', `Bearer ${data.accessToken}`);
      response = await fetch(url, { ...options, headers });
    } else {
      localStorage.clear();
      window.location.href = '/login';
      throw new Error('Refresh token invalid');
    }
  }

  return response;
}
```

---

## 5. Important Rules & Edge Cases

1. **Always Use `Bearer` Scheme:**
   Headers must strictly follow:

   ```http
   Authorization: Bearer <accessToken>
   ```

2. **Single-Use Refresh Tokens (Rotation):**
   - Do NOT re-use old refresh tokens. Once used in `/auth/refresh`, the backend deletes that key from Redis.
   - If an old refresh token is reused, the backend will return `401 Unauthorized` (`invalid_refresh_token`).

3. **User Status Handling:**
   If a user account becomes `Banned`, `Deleted`, or `Pending`, calls to `/auth/refresh` will fail with standard 401 error objects containing `location`:
   - `account_banned`
   - `account_deleted`
   - `account_pending`
     When received, clear tokens and present appropriate UI messages to the user.

4. **Logout Procedure:**
   Always call `POST /auth/logout` with `{ refreshToken }` to invalidate the refresh session on the backend before clearing local storage.

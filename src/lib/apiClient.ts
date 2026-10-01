import { useAuthStore } from '@/stores/authStore';
import { isDemoMode } from './demoMode';
import { reportAuthErrors } from '@/lib/api/GraphQLClient';
// import { logger } from './loggerInstance';

// Mock logger to replace removed logger calls
const logger = {
  debug: (..._args: unknown[]) => {},
  info: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
};

export interface ApiClientOptions {
  baseURL?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public statusText?: string,
    public response?: Response,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// (No longer in use — 401s never trigger logout. See the 401 handler
// in `makeRequest` for the reasoning.)

export class ApiClient {
  private baseURL: string;
  private timeout: number;
  private retryAttempts: number;
  private retryDelay: number;

  constructor(options: ApiClientOptions = {}) {
    this.baseURL =
      options.baseURL ||
      import.meta.env.VITE_API_ENDPOINT ||
      'http://localhost:4000';
    this.timeout = options.timeout || 30000; // 30 seconds
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000; // 1 second

    logger.debug('ApiClient initialized', {
      baseURL: this.baseURL,
      timeout: this.timeout,
      retryAttempts: this.retryAttempts,
      retryDelay: this.retryDelay,
    });
  }

  /**
   * Get current auth state from the store
   */
  private getAuthState() {
    return useAuthStore.getState();
  }

  /**
   * Ensure we have a valid token, refreshing if necessary
   */
  private async ensureValidToken(): Promise<string | null> {
    const authState = this.getAuthState();
    const { tokens, isTokenExpired, refreshToken } = authState;

    // No tokens available
    if (!tokens) {
      logger.debug('No tokens available');
      return null;
    }

    // Token is still valid
    if (!isTokenExpired()) {
      logger.debug('Token is still valid');
      return tokens.accessToken;
    }

    // Token is expired, try to refresh
    logger.debug('Token expired, attempting refresh');
    const refreshSuccess = await refreshToken();

    if (refreshSuccess) {
      const newTokens = this.getAuthState().tokens;
      logger.debug('Token refreshed successfully');
      return newTokens?.accessToken || null;
    }

    logger.warn('Token refresh failed');
    return null;
  }

  /**
   * Create request headers with authorization if available
   */
  private async createHeaders(
    customHeaders: Record<string, string> = {}
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    // Add X-Demo header if in demo mode
    if (isDemoMode()) {
      headers['X-Demo'] = 'true';
      logger.debug('Demo mode enabled, X-Demo header added');
    }

    const token = await this.ensureValidToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      logger.debug('Authorization header added');

      // Also extract and send user ID from auth store
      const authState = this.getAuthState();
      if (authState.user?.id) {
        headers['x-user-id'] = authState.user.id;
        logger.debug('User ID header added', { userId: authState.user.id });
      }
    } else {
      logger.debug('No valid token available, making unauthenticated request');
    }

    return headers;
  }

  /**
   * Create a timeout promise for request timeout handling
   */
  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new ApiError(`Request timeout after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Delay for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Core request method with retry logic and timeout
   */
  private async makeRequest<T>(
    url: string,
    options: RequestInit = {},
    attempt: number = 1
  ): Promise<ApiResponse<T>> {
    const fullUrl = url.startsWith('http')
      ? url
      : `${this.baseURL}${url.startsWith('/') ? url : `/${url}`}`;

    logger.debug('Making API request', {
      url: fullUrl,
      method: options.method || 'GET',
      attempt,
      maxAttempts: this.retryAttempts,
    });

    try {
      // Create the fetch request with timeout
      const requestHeaders = await this.createHeaders(
        options.headers as Record<string, string>
      );
      const fetchPromise = fetch(fullUrl, {
        ...options,
        headers: requestHeaders,
        credentials: 'include', // Include cookies for refresh token
      });

      const timeoutPromise = this.createTimeoutPromise(this.timeout);
      const response = await Promise.race([fetchPromise, timeoutPromise]); // Handle HTTP errors
      if (!response.ok) {
        let errorData: { message?: string } | null = null;
        try {
          errorData = await response.json();
        } catch {
          // Response might not be JSON
        }

        // DO NOT auto-logout on 401. A 401 from any endpoint (transient
        // network blip, CouchDB-specific permission, brief backend
        // hiccup) used to fire `logout()` which calls the `deleteToken`
        // mutation — and the Gainium backend tracks tokens server-side,
        // so once you call deleteToken the user's JWT is permanently
        // dead even if it was previously valid. That made auth brittle:
        // a single auxiliary-endpoint 401 logged the user out for real
        // and they had to re-mint a JWT from scratch. Just surface the
        // error to the caller and let real-validation paths
        // (`initializeAuth` → `validateToken`) decide whether the
        // session is truly dead.
        //
        // That is what the central session handling does: a 401 on a request
        // that carried the session token asks the auth store to re-validate
        // it, and only the backend's definitive rejection ends the session
        // (with a visible notice) — never a silent wipe, never a revoke.
        if (response.status === 401) {
          logger.warn(
            'Received 401, surfacing as ApiError (NOT calling logout)',
            { url: fullUrl }
          );
          const bearer = requestHeaders['Authorization'];
          if (bearer?.startsWith('Bearer ')) {
            reportAuthErrors(bearer.slice('Bearer '.length), [], 401);
          }
        }

        throw new ApiError(
          errorData?.message ||
            `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response.statusText,
          response,
          errorData
        );
      }

      // Parse response
      let data: T;
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = (await response.text()) as unknown as T;
      }

      logger.debug('API request successful', {
        url: fullUrl,
        status: response.status,
        attempt,
      });

      return {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      };
    } catch (error) {
      logger.error('API request failed', {
        url: fullUrl,
        attempt,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Retry logic for network errors (not HTTP errors)
      if (
        attempt < this.retryAttempts &&
        !(error instanceof ApiError && error.status)
      ) {
        logger.debug('Retrying request', {
          url: fullUrl,
          attempt: attempt + 1,
          delay: this.retryDelay,
        });

        await this.delay(this.retryDelay);
        return this.makeRequest<T>(url, options, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * GET request
   */
  async get<T = unknown>(
    url: string,
    options: Omit<RequestInit, 'method'> = {}
  ): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = unknown>(
    url: string,
    data?: unknown,
    options: Omit<RequestInit, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : null,
    });
  }

  /**
   * PUT request
   */
  async put<T = unknown>(
    url: string,
    data?: unknown,
    options: Omit<RequestInit, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : null,
    });
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(
    url: string,
    data?: unknown,
    options: Omit<RequestInit, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : null,
    });
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(
    url: string,
    options: Omit<RequestInit, 'method'> = {}
  ): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, { ...options, method: 'DELETE' });
  }

  /**
   * GraphQL request method
   * This allows gradual migration from the existing GraphQLClient
   */
  async graphql<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
    options: Omit<RequestInit, 'method' | 'body'> = {}
  ): Promise<T> {
    const graphqlUrl = `${this.baseURL}`;

    const response = await this.makeRequest<{
      data: T;
      errors?: Array<{ message: string }>;
    }>(graphqlUrl, {
      ...options,
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    });

    // Handle GraphQL errors
    if (response.data.errors && response.data.errors.length > 0) {
      const errorMessages = response.data.errors
        .map((e) => e.message)
        .join(', ');
      throw new ApiError(
        `GraphQL errors: ${errorMessages}`,
        response.status,
        response.statusText
      );
    }

    if (!response.data.data) {
      throw new ApiError(
        'GraphQL response missing data',
        response.status,
        response.statusText
      );
    }

    return response.data.data;
  }

  /**
   * Upload file with multipart/form-data
   */
  async upload<T = unknown>(
    url: string,
    file: File,
    field: string = 'file',
    additionalFields?: Record<string, string>,
    options: Omit<RequestInit, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append(field, file);

    if (additionalFields) {
      Object.entries(additionalFields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    // Remove Content-Type header for multipart/form-data
    const headers = { ...(options.headers as Record<string, string>) };
    delete headers['Content-Type'];

    return this.makeRequest<T>(url, {
      ...options,
      method: 'POST',
      body: formData,
      headers,
    });
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      const response = await this.get<{ status: string; timestamp: string }>(
        '/health'
      );
      return response.data;
    } catch (error) {
      logger.error('Health check failed', error);
      throw error;
    }
  }
}

// Default API client instance
export const apiClient = new ApiClient();

// Export convenience methods that can be used directly
export const api = {
  get: <T = unknown>(url: string, options?: Omit<RequestInit, 'method'>) =>
    apiClient.get<T>(url, options),

  post: <T = unknown>(
    url: string,
    data?: unknown,
    options?: Omit<RequestInit, 'method' | 'body'>
  ) => apiClient.post<T>(url, data, options),

  put: <T = unknown>(
    url: string,
    data?: unknown,
    options?: Omit<RequestInit, 'method' | 'body'>
  ) => apiClient.put<T>(url, data, options),

  patch: <T = unknown>(
    url: string,
    data?: unknown,
    options?: Omit<RequestInit, 'method' | 'body'>
  ) => apiClient.patch<T>(url, data, options),

  delete: <T = unknown>(url: string, options?: Omit<RequestInit, 'method'>) =>
    apiClient.delete<T>(url, options),

  graphql: <T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
    options?: Omit<RequestInit, 'method' | 'body'>
  ) => apiClient.graphql<T>(query, variables, options),

  upload: <T = unknown>(
    url: string,
    file: File,
    field?: string,
    additionalFields?: Record<string, string>,
    options?: Omit<RequestInit, 'method' | 'body'>
  ) => apiClient.upload<T>(url, file, field, additionalFields, options),

  healthCheck: () => apiClient.healthCheck(),
};

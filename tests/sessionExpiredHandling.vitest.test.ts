/**
 * Session-expiry handling: an auth failure on any request either ends the
 * session with a visible notice (backend rejected the token) or triggers a
 * re-validation (auth-shaped refusal) — and is never returned as empty data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastError = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const validateTokenDetailed = vi.fn();
vi.mock('@/lib/realAuthService', () => ({
  RealAuthService: {
    validateTokenDetailed: (...args: unknown[]) => validateTokenDetailed(...args),
    logout: vi.fn(),
  },
}));

import {
  GraphQLAuthError,
  GraphQLClient,
  classifyAuthErrors,
} from '@/lib/api/GraphQLClient';
import {
  SESSION_EXPIRED_MESSAGE,
  clearSessionExpired,
  isSessionExpiredPending,
  loginRedirectUrl,
} from '@/lib/sessionExpiredNotice';
import { useAuthStore } from '@/stores/authStore';

const ENDPOINT = 'https://api.example.test/graphql';
const TOKEN = 'header.payload.signature';

function respond(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function signIn() {
  useAuthStore.setState({
    user: { id: 'u1' } as never,
    tokens: { accessToken: TOKEN, expiresAt: Date.now() + 3_600_000 },
    isAuthenticated: true,
    isLoading: false,
  });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('classifyAuthErrors', () => {
  it('treats the backend token rejection as dead', () => {
    expect(
      classifyAuthErrors([{ message: 'Session is expired, please login again' }])
    ).toBe('dead');
  });
  it('treats auth-shaped refusals as suspect', () => {
    expect(
      classifyAuthErrors([
        { message: 'Access denied', extensions: { code: 'FORBIDDEN' } },
      ])
    ).toBe('suspect');
    expect(classifyAuthErrors([{ message: 'x', extensions: { code: 'UNAUTHENTICATED' } }])).toBe(
      'suspect'
    );
    expect(classifyAuthErrors([], 401)).toBe('suspect');
  });
  it('ignores ordinary errors', () => {
    expect(
      classifyAuthErrors([
        { message: 'botType: must be "dca"', extensions: { code: 'BAD_USER_INPUT' } },
      ])
    ).toBeNull();
    expect(classifyAuthErrors([], 500)).toBeNull();
  });
});

describe('loginRedirectUrl', () => {
  beforeEach(() => clearSessionExpired());
  it('keeps a same-origin return path', () => {
    expect(loginRedirectUrl('/bots/dca?id=1')).toBe(
      '/login?redirectTo=%2Fbots%2Fdca%3Fid%3D1'
    );
  });
  it('drops protocol-relative and root paths', () => {
    expect(loginRedirectUrl('//evil.example')).toBe('/login');
    expect(loginRedirectUrl('/')).toBe('/login');
  });
});

describe('session expiry on requests', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    validateTokenDetailed.mockReset();
    toastError.mockReset();
    clearSessionExpired();
    signIn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ends the session with a notice when the backend rejects the token', async () => {
    fetchMock.mockReturnValueOnce(
      respond({ errors: [{ message: 'Session is expired, please login again' }] })
    );
    const client = new GraphQLClient(ENDPOINT, TOKEN);
    await expect(client.request('query { maxModels { id } }')).rejects.toBeInstanceOf(
      GraphQLAuthError
    );
    await flush();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.tokens).toBeNull();
    expect(toastError).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE, expect.anything());
    expect(isSessionExpiredPending()).toBe(true);
    expect(loginRedirectUrl('/bots')).toBe('/login?redirectTo=%2Fbots&sessionExpired=1');
  });

  it('fails (not empty data) on a FORBIDDEN null field, then ends a session the backend rejects', async () => {
    fetchMock.mockReturnValueOnce(
      respond({
        data: { maxModels: null },
        errors: [{ message: 'Access denied', extensions: { code: 'FORBIDDEN' } }],
      })
    );
    validateTokenDetailed.mockResolvedValueOnce({
      ok: false,
      definitive: true,
      reason: 'User not found',
    });
    const client = new GraphQLClient(ENDPOINT, TOKEN);
    await expect(client.request('query { maxModels { id } }')).rejects.toBeInstanceOf(
      GraphQLAuthError
    );
    await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
    expect(validateTokenDetailed).toHaveBeenCalledWith(TOKEN, expect.anything());
    expect(toastError).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE, expect.anything());
  });

  it('keeps a valid session when the refusal was only a permission', async () => {
    fetchMock.mockReturnValueOnce(
      respond({
        data: { a: 1, maxModels: null },
        errors: [{ message: 'Access denied', extensions: { code: 'FORBIDDEN' } }],
      })
    );
    validateTokenDetailed.mockResolvedValueOnce({ ok: true, user: { id: 'u1' } });
    const client = new GraphQLClient(ENDPOINT, TOKEN);
    // Other fields are usable, so the partial result is returned.
    await expect(client.request('query { a maxModels { id } }')).resolves.toEqual({
      a: 1,
      maxModels: null,
    });
    await flush();
    await flush();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('ignores requests made without a session token', async () => {
    fetchMock.mockReturnValueOnce(
      respond({ errors: [{ message: 'Session is expired, please login again' }] })
    );
    const client = new GraphQLClient(ENDPOINT, 'demo');
    await expect(client.request('query { x }')).rejects.toBeInstanceOf(GraphQLAuthError);
    await flush();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });
});

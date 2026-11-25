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

// Some resolvers report a dead session inside `data` as an envelope
// (`{status:'NOTOK', reason:'User not found'}`, HTTP 200, no `errors`). The same
// text is also an ordinary refusal elsewhere, so it only triggers a re-check.
describe('session-dead reason inside a NOTOK payload', () => {
  const fetchMock = vi.fn();
  const editRefused = {
    changeDCADealSettings: { status: 'NOTOK', reason: 'User not found', data: null },
  };
  // The suspect handler throttles re-checks (one per 15 s); give each test its
  // own clock so they never throttle each other.
  let clock = Date.parse('2030-01-01T00:00:00Z');

  beforeEach(() => {
    clock += 60_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(clock);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    validateTokenDetailed.mockReset();
    toastError.mockReset();
    clearSessionExpired();
    signIn();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('re-checks the session when a resolver answers NOTOK with a session-dead reason (§2.1, §2.6)', async () => {
    fetchMock.mockReturnValueOnce(respond({ data: editRefused }));
    validateTokenDetailed.mockResolvedValueOnce({ ok: true, user: { id: 'u1' } });
    const client = new GraphQLClient(ENDPOINT, TOKEN);
    await expect(client.request('mutation { changeDCADealSettings { status } }')).resolves.toEqual(
      editRefused
    );
    await vi.waitFor(() =>
      expect(validateTokenDetailed).toHaveBeenCalledWith(TOKEN, expect.anything())
    );
  });

  it('ends the session when the re-check rejects the token (§2.2)', async () => {
    fetchMock.mockReturnValueOnce(respond({ data: editRefused }));
    validateTokenDetailed.mockResolvedValueOnce({
      ok: false,
      definitive: true,
      reason: 'User not found',
    });
    const client = new GraphQLClient(ENDPOINT, TOKEN);
    await client.request('mutation { changeDCADealSettings { status } }');
    await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
    expect(useAuthStore.getState().tokens).toBeNull();
    expect(toastError).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE, expect.anything());
  });

  it('keeps the session when the re-check accepts the token (§2.3)', async () => {
    const affiliate = { getAffiliate: { status: 'NOTOK', reason: 'User not found', data: null } };
    fetchMock.mockReturnValueOnce(respond({ data: affiliate }));
    validateTokenDetailed.mockResolvedValueOnce({ ok: true, user: { id: 'u1' } });
    const client = new GraphQLClient(ENDPOINT, TOKEN);
    await expect(client.request('query { getAffiliate { status } }')).resolves.toEqual(affiliate);
    await vi.waitFor(() => expect(validateTokenDetailed).toHaveBeenCalled());
    await flush();
    await flush();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().tokens?.accessToken).toBe(TOKEN);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('ignores a NOTOK reason that is not session-dead (§2.4)', async () => {
    fetchMock.mockReturnValueOnce(
      respond({ data: { changeDCADealSettings: { status: 'NOTOK', reason: 'Deal not found' } } })
    );
    const client = new GraphQLClient(ENDPOINT, TOKEN);
    await client.request('mutation { changeDCADealSettings { status } }');
    await flush();
    await flush();
    expect(validateTokenDetailed).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('ignores a session-dead NOTOK payload on a demo request (§2.5)', async () => {
    fetchMock.mockReturnValueOnce(respond({ data: editRefused }));
    const client = new GraphQLClient(ENDPOINT, 'demo');
    await client.request('mutation { changeDCADealSettings { status } }');
    await flush();
    await flush();
    expect(validateTokenDetailed).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

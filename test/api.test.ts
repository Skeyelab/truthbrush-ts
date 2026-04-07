/**
 * Unit tests for src/api.ts – all HTTP is mocked at the module level so no
 * real network connections are ever opened.
 */

// ---------------------------------------------------------------------------
// Module-level mock: must be hoisted BEFORE imports
// ---------------------------------------------------------------------------

jest.mock('wreq-js', () => ({
  __esModule: true,
  default: {},
  createSession: jest.fn(),
  fetch: jest.fn(),
}));

import { createSession, fetch as wreqFetch } from 'wreq-js';
import {
  Api,
  LoginErrorException,
  GeoblockException,
  CFBlockException,
  dateToBound,
} from '../src/api';

// ---------------------------------------------------------------------------
// Module-level session mock (shared object; reset in beforeEach)
// ---------------------------------------------------------------------------

const mockSessionFetch = jest.fn();
const mockSession = {
  fetch: mockSessionFetch,
  close: jest.fn(),
  getCookies: jest.fn().mockReturnValue({}),
  setCookie: jest.fn(),
  clearCookies: jest.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal wreq-js-compatible response. */
function mockResponse(data: unknown, headers: Record<string, string> = {}, status = 200) {
  const webHeaders = new Headers();
  for (const [k, v] of Object.entries(headers)) webHeaders.set(k, v);
  const textContent = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    status,
    headers: webHeaders,
    json: jest.fn().mockResolvedValue(data),
    text: jest.fn().mockResolvedValue(textContent),
  };
}

/** Return an API instance that is already "authenticated" (no real login needed). */
function authedApi(): Api {
  return new Api(undefined, undefined, 'test-token');
}

// ---------------------------------------------------------------------------
// Global setup: clear mock state before every test and install safe defaults
// ---------------------------------------------------------------------------

beforeEach(() => {
  // resetAllMocks clears both call history AND the implementation/return-value queue,
  // preventing unconsumed `mockResolvedValueOnce` values from leaking between tests.
  jest.resetAllMocks();
  // Re-wire the session mock after reset
  (createSession as jest.Mock).mockResolvedValue(mockSession);
  // Safe defaults – prevent any test that forgets its mock from hitting the network
  mockSessionFetch.mockResolvedValue(mockResponse(null));
  (wreqFetch as jest.Mock).mockResolvedValue(mockResponse({ access_token: 'default-token' }));
});

afterEach(() => {
  // Restore real timers if a test activated fake ones
  jest.useRealTimers();
});

// ===========================================================================
// dateToBound
// ===========================================================================

describe('dateToBound', () => {
  it('start bound: applies (ms << 16) | 0x0000 formula and returns a string', () => {
    const dt = new Date(Date.UTC(2025, 0, 1, 0, 0, 0, 0)); // 2025-01-01T00:00:00Z
    const ms = BigInt(dt.getTime());
    const expected = String((ms << 16n) | 0n);
    expect(dateToBound('2025-01-01', 'start')).toBe(expected);
  });

  it('end bound: applies (ms << 16) | 0xFFFF formula and returns a string', () => {
    const dt = new Date(Date.UTC(2025, 0, 1, 23, 59, 59, 999)); // 2025-01-01T23:59:59.999Z
    const ms = BigInt(dt.getTime());
    const expected = String((ms << 16n) | 0xFFFFn);
    expect(dateToBound('2025-01-01', 'end')).toBe(expected);
  });

  it('start bound is always less than end bound for the same date', () => {
    const start = BigInt(dateToBound('2025-06-15', 'start'));
    const end = BigInt(dateToBound('2025-06-15', 'end'));
    expect(start).toBeLessThan(end);
  });

  it('throws when date string includes a time component (hours)', () => {
    expect(() => dateToBound('2025-01-01T12:00:00', 'start')).toThrow();
  });

  it('throws when date string includes a time component (minutes)', () => {
    expect(() => dateToBound('2025-01-01T00:30:00', 'start')).toThrow();
  });

  it('accepts a Date object for start bound', () => {
    const dt = new Date(Date.UTC(2025, 0, 1)); // midnight UTC
    const expected = dateToBound('2025-01-01', 'start');
    expect(dateToBound(dt, 'start')).toBe(expected);
  });

  it('accepts a Date object for end bound', () => {
    const dt = new Date(Date.UTC(2025, 0, 1));
    const expected = dateToBound('2025-01-01', 'end');
    expect(dateToBound(dt, 'end')).toBe(expected);
  });

  it('start bound of an earlier date is less than start bound of a later date', () => {
    const earlier = BigInt(dateToBound('2025-01-01', 'start'));
    const later = BigInt(dateToBound('2025-06-01', 'start'));
    expect(earlier).toBeLessThan(later);
  });
});

// ===========================================================================
// Error classes
// ===========================================================================

describe('LoginErrorException', () => {
  it('is an instance of Error', () => {
    expect(new LoginErrorException('msg')).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    expect(new LoginErrorException('msg').name).toBe('LoginErrorException');
  });

  it('carries the message', () => {
    expect(new LoginErrorException('test message').message).toBe('test message');
  });
});

describe('GeoblockException', () => {
  it('extends LoginErrorException', () => {
    expect(new GeoblockException('msg')).toBeInstanceOf(LoginErrorException);
  });

  it('is also an instance of Error', () => {
    expect(new GeoblockException('msg')).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    expect(new GeoblockException('msg').name).toBe('GeoblockException');
  });
});

describe('CFBlockException', () => {
  it('extends LoginErrorException', () => {
    expect(new CFBlockException('msg')).toBeInstanceOf(LoginErrorException);
  });

  it('is also an instance of Error', () => {
    expect(new CFBlockException('msg')).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    expect(new CFBlockException('msg').name).toBe('CFBlockException');
  });
});

// ===========================================================================
// Api constructor
// ===========================================================================

describe('Api constructor', () => {
  const origUsername = process.env.TRUTHSOCIAL_USERNAME;
  const origPassword = process.env.TRUTHSOCIAL_PASSWORD;
  const origToken = process.env.TRUTHSOCIAL_TOKEN;

  afterEach(() => {
    origUsername === undefined ? delete process.env.TRUTHSOCIAL_USERNAME : (process.env.TRUTHSOCIAL_USERNAME = origUsername);
    origPassword === undefined ? delete process.env.TRUTHSOCIAL_PASSWORD : (process.env.TRUTHSOCIAL_PASSWORD = origPassword);
    origToken === undefined ? delete process.env.TRUTHSOCIAL_TOKEN : (process.env.TRUTHSOCIAL_TOKEN = origToken);
  });

  it('uses an explicitly provided token', () => {
    const api = new Api(undefined, undefined, 'explicit-token');
    expect(api.authId).toBe('explicit-token');
  });

  it('falls back to the TRUTHSOCIAL_TOKEN env var', () => {
    delete process.env.TRUTHSOCIAL_TOKEN;
    process.env.TRUTHSOCIAL_TOKEN = 'env-token';
    const api = new Api();
    expect(api.authId).toBe('env-token');
  });

  it('authId is undefined when no token is provided and the env var is absent', () => {
    delete process.env.TRUTHSOCIAL_TOKEN;
    const api = new Api('user', 'pass');
    expect(api.authId).toBeUndefined();
  });
});

// ===========================================================================
// Api.getAuthId
// ===========================================================================

describe('Api.getAuthId', () => {
  it('returns the access_token on successful login', async () => {
    (wreqFetch as jest.Mock).mockResolvedValueOnce(mockResponse({ access_token: 'new-token' }));
    const token = await new Api('user', 'pass').getAuthId('user', 'pass');
    expect(token).toBe('new-token');
  });

  it('throws LoginErrorException on a network error', async () => {
    (wreqFetch as jest.Mock).mockRejectedValueOnce(new Error('network error'));
    await expect(new Api('user', 'pass').getAuthId('user', 'pass'))
      .rejects.toThrow(LoginErrorException);
  });

  it('throws GeoblockException when response contains geoblock text', async () => {
    (wreqFetch as jest.Mock).mockResolvedValueOnce(mockResponse('unavailable in your area', {}, 403));
    await expect(new Api('user', 'pass').getAuthId('user', 'pass'))
      .rejects.toThrow(GeoblockException);
  });

  it('throws CFBlockException when response contains cloudflare block text', async () => {
    (wreqFetch as jest.Mock).mockResolvedValueOnce(mockResponse('you have been blocked', {}, 403));
    await expect(new Api('user', 'pass').getAuthId('user', 'pass'))
      .rejects.toThrow(CFBlockException);
  });

  it('throws LoginErrorException on a generic 403', async () => {
    (wreqFetch as jest.Mock).mockResolvedValueOnce(mockResponse('forbidden', {}, 403));
    await expect(new Api('user', 'pass').getAuthId('user', 'pass'))
      .rejects.toThrow(LoginErrorException);
  });

  it('throws when access_token is absent from the response', async () => {
    (wreqFetch as jest.Mock).mockResolvedValueOnce(mockResponse({ error: 'invalid_grant' }));
    await expect(new Api('user', 'pass').getAuthId('user', 'pass')).rejects.toThrow();
  });

  it('auto-authenticates through checkLogin when authId is not set', async () => {
    (wreqFetch as jest.Mock).mockResolvedValueOnce(mockResponse({ access_token: 'auto-token' }));
    mockSessionFetch.mockResolvedValueOnce(mockResponse({ id: 'u1', username: 'trump' }));
    const api = new Api('user', 'pass', undefined);
    const result = await api.lookup('trump');
    expect(result).toEqual({ id: 'u1', username: 'trump' });
    expect(api.authId).toBe('auto-token');
  });
});

// ===========================================================================
// Api.lookup
// ===========================================================================

describe('Api.lookup', () => {
  it('calls /v1/accounts/lookup with the acct param and returns the user', async () => {
    const user = { id: '12345', username: 'realDonaldTrump' };
    mockSessionFetch.mockResolvedValueOnce(mockResponse(user));
    const result = await authedApi().lookup('realDonaldTrump');
    expect(result).toEqual(user);
    const callUrl: string = mockSessionFetch.mock.calls[0][0];
    expect(callUrl).toContain('/v1/accounts/lookup');
    expect(new URL(callUrl).searchParams.get('acct')).toBe('realDonaldTrump');
  });

  it('throws LoginErrorException when no credentials are provided', async () => {
    const origToken = process.env.TRUTHSOCIAL_TOKEN;
    const origUser = process.env.TRUTHSOCIAL_USERNAME;
    const origPass = process.env.TRUTHSOCIAL_PASSWORD;
    delete process.env.TRUTHSOCIAL_TOKEN;
    delete process.env.TRUTHSOCIAL_USERNAME;
    delete process.env.TRUTHSOCIAL_PASSWORD;
    const api = new Api(); // no username, no password, no token
    try {
      await expect(api.lookup('user')).rejects.toThrow(LoginErrorException);
    } finally {
      origToken === undefined ? delete process.env.TRUTHSOCIAL_TOKEN : (process.env.TRUTHSOCIAL_TOKEN = origToken);
      origUser === undefined ? delete process.env.TRUTHSOCIAL_USERNAME : (process.env.TRUTHSOCIAL_USERNAME = origUser);
      origPass === undefined ? delete process.env.TRUTHSOCIAL_PASSWORD : (process.env.TRUTHSOCIAL_PASSWORD = origPass);
    }
  });
});

// ===========================================================================
// Api.search
// ===========================================================================

describe('Api.search', () => {
  it('yields one page of results then stops when the response is empty', async () => {
    mockSessionFetch
      .mockResolvedValueOnce(mockResponse({ accounts: [{ id: '1' }], statuses: [], hashtags: [] }))
      .mockResolvedValueOnce(mockResponse({ accounts: [], statuses: [], hashtags: [] }));

    const pages: unknown[] = [];
    for await (const page of authedApi().search('accounts', 'trump', 40)) {
      pages.push(page);
    }
    expect(pages).toHaveLength(1);
    expect((pages[0] as { accounts: unknown[] }).accounts).toHaveLength(1);
  });

  it('stops early when the total results satisfy the limit', async () => {
    const accounts = Array.from({ length: 40 }, (_, i) => ({ id: String(i) }));
    mockSessionFetch.mockResolvedValueOnce(mockResponse({ accounts, statuses: [], hashtags: [] }));

    const pages: unknown[] = [];
    for await (const page of authedApi().search('accounts', 'trump', 40)) {
      pages.push(page);
    }
    expect(pages).toHaveLength(1);
    expect(mockSessionFetch).toHaveBeenCalledTimes(1);
  });

  it('throws when both min_id and start_date are provided', async () => {
    const gen = authedApi().search('accounts', 'q', 40, 4, 0, '100', undefined, '2025-01-01');
    await expect(gen.next()).rejects.toThrow();
  });

  it('throws when both max_id and end_date are provided', async () => {
    const gen = authedApi().search('accounts', 'q', 40, 4, 0, '0', '999', undefined, '2025-01-01');
    await expect(gen.next()).rejects.toThrow();
  });

  it('converts start_date to min_id using dateToBound', async () => {
    mockSessionFetch.mockResolvedValueOnce(mockResponse({ accounts: [], statuses: [], hashtags: [] }));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of authedApi().search('accounts', 'q', 40, 4, 0, '0', undefined, '2025-01-01')) { /* drain */ }
    const callUrl = mockSessionFetch.mock.calls[0][0] as string;
    expect(new URL(callUrl).searchParams.get('min_id')).toBe(dateToBound('2025-01-01', 'start'));
  });

  it('converts end_date to max_id using dateToBound', async () => {
    mockSessionFetch.mockResolvedValueOnce(mockResponse({ accounts: [], statuses: [], hashtags: [] }));
    for await (const _ of authedApi().search('accounts', 'q', 40, 4, 0, '0', undefined, undefined, '2025-01-31')) { /* drain */ }
    const callUrl = mockSessionFetch.mock.calls[0][0] as string;
    expect(new URL(callUrl).searchParams.get('max_id')).toBe(dateToBound('2025-01-31', 'end'));
  });
});

// ===========================================================================
// Api.hashtag
// ===========================================================================

describe('Api.hashtag', () => {
  it('yields pages of posts for a hashtag', async () => {
    const page1 = [{ id: '10' }, { id: '9' }];
    mockSessionFetch
      .mockResolvedValueOnce(mockResponse(page1))
      .mockResolvedValueOnce(mockResponse([]));

    const pages: unknown[][] = [];
    for await (const page of authedApi().hashtag('maga', 100)) {
      pages.push(page as unknown[]);
    }
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual(page1);
  });

  it('strips a leading # from the tag name', async () => {
    mockSessionFetch.mockResolvedValueOnce(mockResponse([]));
    for await (const _ of authedApi().hashtag('#maga', 100)) { /* drain */ }
    const url: string = mockSessionFetch.mock.calls[0][0];
    expect(url).toContain('/timelines/tag/maga');
    expect(url).not.toContain('#');
  });

  it('stops immediately when the response is empty', async () => {
    mockSessionFetch.mockResolvedValueOnce(mockResponse([]));
    const pages: unknown[] = [];
    for await (const page of authedApi().hashtag('test', 100)) {
      pages.push(page);
    }
    expect(pages).toHaveLength(0);
  });
});

// ===========================================================================
// Api.trending
// ===========================================================================

describe('Api.trending', () => {
  it('calls /v1/truth/trending/truths with the limit and returns data', async () => {
    const truths = [{ id: '1' }, { id: '2' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(truths));
    const result = await authedApi().trending(10);
    expect(result).toEqual(truths);
    expect(mockSessionFetch.mock.calls[0][0]).toContain('/truth/trending/truths');
    expect(mockSessionFetch.mock.calls[0][0]).toContain('limit=10');
  });

  it('defaults the limit to 10', async () => {
    mockSessionFetch.mockResolvedValueOnce(mockResponse([]));
    await authedApi().trending();
    expect(mockSessionFetch.mock.calls[0][0]).toContain('limit=10');
  });
});

// ===========================================================================
// Api.groupPosts
// ===========================================================================

describe('Api.groupPosts', () => {
  it('returns posts for a group id', async () => {
    const posts = [{ id: '1' }, { id: '2' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(posts));
    const result = await authedApi().groupPosts('grp1', 20);
    expect(result).toEqual(posts);
  });

  it('paginates when more posts are needed', async () => {
    const page1 = [{ id: '10' }, { id: '9' }];
    const page2 = [{ id: '8' }];
    mockSessionFetch
      .mockResolvedValueOnce(mockResponse(page1))
      .mockResolvedValueOnce(mockResponse(page2))
      .mockResolvedValueOnce(mockResponse(null));
    const result = await authedApi().groupPosts('grp1', 3);
    expect(result).toHaveLength(3);
    expect((result as { id: string }[])[0].id).toBe('10');
    expect((result as { id: string }[])[2].id).toBe('8');
  });

  it('stops paginating when the limit is reached exactly', async () => {
    const page1 = [{ id: '1' }, { id: '2' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(page1));
    const result = await authedApi().groupPosts('grp1', 2);
    expect(result).toHaveLength(2);
    expect(mockSessionFetch).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Api.tags
// ===========================================================================

describe('Api.tags', () => {
  it('calls /v1/trends and returns tags', async () => {
    const tags = [{ name: 'MAGA' }, { name: 'Trump' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(tags));
    const result = await authedApi().tags();
    expect(result).toEqual(tags);
    expect(mockSessionFetch.mock.calls[0][0]).toContain('/v1/trends');
  });
});

// ===========================================================================
// Api.suggested
// ===========================================================================

describe('Api.suggested', () => {
  it('returns suggested users', async () => {
    const users = [{ id: '1', username: 'a' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(users));
    const result = await authedApi().suggested(50);
    expect(result).toEqual(users);
  });

  it('passes maximum as the limit query param', async () => {
    mockSessionFetch.mockResolvedValueOnce(mockResponse([]));
    await authedApi().suggested(25);
    expect(mockSessionFetch.mock.calls[0][0]).toContain('limit=25');
  });
});

// ===========================================================================
// Api.trendingGroups
// ===========================================================================

describe('Api.trendingGroups', () => {
  it('calls /v1/truth/trends/groups with the limit', async () => {
    const groups = [{ id: 'g1' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(groups));
    const result = await authedApi().trendingGroups(10);
    expect(result).toEqual(groups);
    const url: string = mockSessionFetch.mock.calls[0][0];
    expect(url).toContain('/truth/trends/groups');
    expect(url).toContain('limit=10');
  });
});

// ===========================================================================
// Api.groupTags
// ===========================================================================

describe('Api.groupTags', () => {
  it('calls /v1/groups/tags and returns data', async () => {
    const tags = [{ name: 'maga' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(tags));
    const result = await authedApi().groupTags();
    expect(result).toEqual(tags);
    expect(mockSessionFetch.mock.calls[0][0]).toContain('/v1/groups/tags');
  });
});

// ===========================================================================
// Api.suggestedGroups
// ===========================================================================

describe('Api.suggestedGroups', () => {
  it('returns suggested groups', async () => {
    const groups = [{ id: 'g1' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(groups));
    const result = await authedApi().suggestedGroups(50);
    expect(result).toEqual(groups);
  });

  it('passes maximum as the limit query param', async () => {
    mockSessionFetch.mockResolvedValueOnce(mockResponse([]));
    await authedApi().suggestedGroups(30);
    expect(mockSessionFetch.mock.calls[0][0]).toContain('limit=30');
  });
});

// ===========================================================================
// Api.ads
// ===========================================================================

describe('Api.ads', () => {
  it('returns ads', async () => {
    const ads = [{ id: 'ad1' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(ads));
    const result = await authedApi().ads();
    expect(result).toEqual(ads);
  });

  it('defaults device to "desktop"', async () => {
    mockSessionFetch.mockResolvedValueOnce(mockResponse([]));
    await authedApi().ads();
    expect(mockSessionFetch.mock.calls[0][0]).toContain('device=desktop');
  });

  it('passes a custom device parameter', async () => {
    mockSessionFetch.mockResolvedValueOnce(mockResponse([]));
    await authedApi().ads('mobile');
    expect(mockSessionFetch.mock.calls[0][0]).toContain('device=mobile');
  });
});

// ===========================================================================
// Api.userFollowers
// ===========================================================================

describe('Api.userFollowers', () => {
  it('yields followers for a given user_id', async () => {
    const followers = [{ id: 'f1' }, { id: 'f2' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(followers, {}));

    const result: unknown[] = [];
    for await (const f of authedApi().userFollowers(undefined, 'user123')) {
      result.push(f);
    }
    expect(result).toEqual(followers);
  });

  it('looks up user id from handle when user_id is not provided', async () => {
    mockSessionFetch
      .mockResolvedValueOnce(mockResponse({ id: 'resolved-id', username: 'testuser' })) // lookup
      .mockResolvedValueOnce(mockResponse([{ id: 'f1' }], {}));                         // followers page

    const result: unknown[] = [];
    for await (const f of authedApi().userFollowers('testuser')) {
      result.push(f);
    }
    expect(result).toHaveLength(1);
  });

  it('respects the maximum limit', async () => {
    const page1 = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const page2 = [{ id: '4' }];
    mockSessionFetch
      .mockResolvedValueOnce(mockResponse(page1, { link: '<https://truthsocial.com/api/v1/accounts/u1/followers?max_id=3>; rel="next"' }))
      .mockResolvedValueOnce(mockResponse(page2, {}));

    const result: unknown[] = [];
    for await (const f of authedApi().userFollowers(undefined, 'u1', 2)) {
      result.push(f);
    }
    expect(result).toHaveLength(2);
  });
});

// ===========================================================================
// Api.userFollowing
// ===========================================================================

describe('Api.userFollowing', () => {
  it('yields users that a user follows', async () => {
    const following = [{ id: 'f1' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(following, {}));

    const result: unknown[] = [];
    for await (const f of authedApi().userFollowing(undefined, 'user123')) {
      result.push(f);
    }
    expect(result).toEqual(following);
  });

  it('respects the maximum limit', async () => {
    const page = [{ id: '1' }, { id: '2' }, { id: '3' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(page, {}));

    const result: unknown[] = [];
    for await (const f of authedApi().userFollowing(undefined, 'u1', 2)) {
      result.push(f);
    }
    expect(result).toHaveLength(2);
  });
});

// ===========================================================================
// Api.pullStatuses
// ===========================================================================

describe('Api.pullStatuses', () => {
  function makeStatus(id: string, createdAt: string) {
    return { id, created_at: createdAt, in_reply_to_id: null };
  }

  it('yields statuses in reverse chronological order (newest first)', async () => {
    const statuses = [
      makeStatus('200', '2024-01-02T00:00:00Z'),
      makeStatus('100', '2024-01-01T00:00:00Z'),
    ];
    mockSessionFetch
      .mockResolvedValueOnce(mockResponse({ id: 'u1' }))    // lookup
      .mockResolvedValueOnce(mockResponse(statuses))         // page 1
      .mockResolvedValueOnce(mockResponse([]));             // page 2 – empty, stops loop

    const result: { id: string }[] = [];
    for await (const s of authedApi().pullStatuses('testuser')) {
      result.push(s as { id: string });
    }
    expect(result[0].id).toBe('200'); // most recent first
    expect(result[1].id).toBe('100');
  });

  it('adds a _pulled ISO timestamp to every status', async () => {
    const statuses = [makeStatus('1', '2024-01-01T00:00:00Z')];
    mockSessionFetch
      .mockResolvedValueOnce(mockResponse({ id: 'u1' }))
      .mockResolvedValueOnce(mockResponse(statuses))
      .mockResolvedValueOnce(mockResponse([]));

    for await (const s of authedApi().pullStatuses('user')) {
      expect((s as { _pulled: string })._pulled).toBeDefined();
      expect(typeof (s as { _pulled: string })._pulled).toBe('string');
    }
  });

  it('stops when the created_after threshold is reached', async () => {
    const statuses = [
      makeStatus('300', '2024-01-03T00:00:00Z'),
      makeStatus('200', '2024-01-02T00:00:00Z'),
      makeStatus('100', '2024-01-01T00:00:00Z'),
    ];
    mockSessionFetch
      .mockResolvedValueOnce(mockResponse({ id: 'u1' }))
      .mockResolvedValueOnce(mockResponse(statuses));

    const createdAfter = new Date('2024-01-01T12:00:00Z'); // only posts strictly after this
    const result: unknown[] = [];
    for await (const s of authedApi().pullStatuses('user', false, false, createdAfter)) {
      result.push(s);
    }
    // Post 300 (Jan 3) and 200 (Jan 2) are after the threshold; 100 (Jan 1) is not
    expect(result).toHaveLength(2);
  });

  it('stops when the since_id threshold is reached', async () => {
    const statuses = [
      makeStatus('300', '2024-01-03T00:00:00Z'),
      makeStatus('200', '2024-01-02T00:00:00Z'),
      makeStatus('100', '2024-01-01T00:00:00Z'),
    ];
    mockSessionFetch
      .mockResolvedValueOnce(mockResponse({ id: 'u1' }))
      .mockResolvedValueOnce(mockResponse(statuses));

    const result: unknown[] = [];
    // Only posts with id > 150: 300 and 200
    for await (const s of authedApi().pullStatuses('user', false, false, undefined, '150')) {
      result.push(s);
    }
    expect(result).toHaveLength(2);
  });

  it('handles an API error object gracefully by stopping iteration', async () => {
    mockSessionFetch
      .mockResolvedValueOnce(mockResponse({ id: 'u1' }))
      .mockResolvedValueOnce(mockResponse({ error: 'unauthorized' }));

    const result: unknown[] = [];
    for await (const s of authedApi().pullStatuses('user')) {
      result.push(s);
    }
    expect(result).toHaveLength(0);
  });

  it('builds the URL with exclude_replies=true when replies=false', async () => {
    mockSessionFetch
      .mockResolvedValueOnce(mockResponse({ id: 'u1' }))
      .mockResolvedValueOnce(mockResponse([]));

    for await (const _ of authedApi().pullStatuses('user', false)) { /* drain */ }
    const url: string = mockSessionFetch.mock.calls[1][0];
    expect(url).toContain('exclude_replies=true');
  });

  it('builds the URL with pinned=true when pinned=true', async () => {
    mockSessionFetch
      .mockResolvedValueOnce(mockResponse({ id: 'u1' }))
      .mockResolvedValueOnce(mockResponse([]));

    for await (const _ of authedApi().pullStatuses('user', false, false, undefined, undefined, true)) { /* drain */ }
    const url: string = mockSessionFetch.mock.calls[1][0];
    expect(url).toContain('pinned=true');
  });
});

// ===========================================================================
// Api.userLikes
// ===========================================================================

describe('Api.userLikes', () => {
  it('yields users who liked a post', async () => {
    const likers = [{ id: 'u1' }, { id: 'u2' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(likers, {}));

    const result: unknown[] = [];
    for await (const u of authedApi().userLikes('12345')) {
      result.push(u);
    }
    expect(result).toEqual(likers);
  });

  it('extracts the post id from a full Truth Social URL', async () => {
    mockSessionFetch.mockResolvedValueOnce(mockResponse([{ id: 'u1' }], {}));

    for await (const _ of authedApi().userLikes('https://truthsocial.com/post/99999')) { /* drain */ }
    const url: string = mockSessionFetch.mock.calls[0][0];
    expect(url).toContain('/statuses/99999/favourited_by');
  });

  it('respects the topNum limit', async () => {
    const likers = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(likers, {}));

    const result: unknown[] = [];
    for await (const u of authedApi().userLikes('12345', false, 3)) {
      result.push(u);
    }
    expect(result).toHaveLength(3);
  });

  it('yields all likers when includeAll=true, ignoring topNum', async () => {
    const likers = [{ id: '1' }, { id: '2' }, { id: '3' }];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(likers, {}));

    const result: unknown[] = [];
    for await (const u of authedApi().userLikes('12345', true, 1)) {
      result.push(u);
    }
    expect(result).toHaveLength(3);
  });

  it('returns nothing when topNum < 1', async () => {
    const result: unknown[] = [];
    for await (const u of authedApi().userLikes('12345', false, 0)) {
      result.push(u);
    }
    expect(result).toHaveLength(0);
    expect(mockSessionFetch).not.toHaveBeenCalled(); // no HTTP call should be made
  });
});

// ===========================================================================
// Api.pullComments
// ===========================================================================

describe('Api.pullComments', () => {
  function makeComment(id: string, inReplyToId: string) {
    return { id, in_reply_to_id: inReplyToId };
  }

  it('yields comments on a post', async () => {
    const comments = [makeComment('c1', 'post1'), makeComment('c2', 'c1')];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(comments, {}));

    const result: unknown[] = [];
    for await (const c of authedApi().pullComments('post1')) {
      result.push(c);
    }
    expect(result).toHaveLength(2);
  });

  it('respects the topNum limit', async () => {
    const comments = [makeComment('c1', 'post1'), makeComment('c2', 'post1'), makeComment('c3', 'post1')];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(comments, {}));

    const result: unknown[] = [];
    for await (const c of authedApi().pullComments('post1', false, false, 2)) {
      result.push(c);
    }
    expect(result).toHaveLength(2);
  });

  it('filters to only direct replies when onlyFirst=true', async () => {
    const comments = [
      makeComment('c1', 'post1'), // direct reply  ← should be included
      makeComment('c2', 'c1'),    // reply to reply ← should be excluded
      makeComment('c3', 'post1'), // direct reply  ← should be included
    ];
    mockSessionFetch.mockResolvedValueOnce(mockResponse(comments, {}));

    const result: unknown[] = [];
    for await (const c of authedApi().pullComments('post1', true, true, 40)) {
      result.push(c);
    }
    expect(result).toHaveLength(2);
    (result as { id: string }[]).forEach(c => expect(['c1', 'c3']).toContain(c.id));
  });

  it('yields all comments when includeAll=true (ignores topNum)', async () => {
    const comments = Array.from({ length: 10 }, (_, i) => makeComment(`c${i}`, 'post1'));
    mockSessionFetch.mockResolvedValueOnce(mockResponse(comments, {}));

    const result: unknown[] = [];
    for await (const c of authedApi().pullComments('post1', true, false, 3)) {
      result.push(c);
    }
    expect(result).toHaveLength(10);
  });

  it('returns nothing when topNum < 1', async () => {
    const result: unknown[] = [];
    for await (const c of authedApi().pullComments('post1', false, false, 0)) {
      result.push(c);
    }
    expect(result).toHaveLength(0);
    expect(mockSessionFetch).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Rate limiting
// ===========================================================================

describe('Rate limiting', () => {
  it('reads x-ratelimit headers from the response', async () => {
    const headers = {
      'x-ratelimit-limit': '300',
      'x-ratelimit-remaining': '200',
      'x-ratelimit-reset': new Date(Date.now() + 60_000).toISOString(),
    };
    mockSessionFetch.mockResolvedValueOnce(mockResponse({ id: 'u1' }, headers));

    const api = authedApi();
    await api.lookup('testuser');

    expect(api.rateLimitRemaining).toBe(200);
    expect(api.rateLimitMax).toBe(300);
  });

  it('sleeps when rateLimitRemaining drops to 50 or below', async () => {
    jest.useFakeTimers();
    const resetTime = new Date(Date.now() + 1_000).toISOString();
    const headers = {
      'x-ratelimit-limit': '300',
      'x-ratelimit-remaining': '50',
      'x-ratelimit-reset': resetTime,
    };
    mockSessionFetch.mockResolvedValueOnce(mockResponse({ id: 'u1' }, headers));

    const api = authedApi();
    const promise = api.lookup('testuser');

    // Advance fake timers to complete the sleep inside checkRateLimit
    await jest.runAllTimersAsync();
    await promise;
    // If we reach here without timeout the sleep was correctly awaited
    expect(api.rateLimitRemaining).toBe(50);
  });
});

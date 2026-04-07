import axios, { type AxiosProxyConfig } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BASE_URL = 'https://truthsocial.com';
export const API_BASE_URL = 'https://truthsocial.com/api';
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

// OAuth client credentials from the Truth Social web app bundle
const CLIENT_ID = '9X1Fdd-pxNsAgEDNi_SfhJWi8T-vLuV2WVzKIbkTCw4';
const CLIENT_SECRET = 'ozF8jzI4968oTKFkEnsBC-UbLPCdrSv0MkXGQu2o_-M';

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class LoginErrorException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginErrorException';
  }
}

/** Raised when Truth Social blocks access due to geographic restrictions. */
export class GeoblockException extends LoginErrorException {
  constructor(message: string) {
    super(message);
    this.name = 'GeoblockException';
  }
}

/** Raised when Cloudflare blocks the request. */
export class CFBlockException extends LoginErrorException {
  constructor(message: string) {
    super(message);
    this.name = 'CFBlockException';
  }
}

// ---------------------------------------------------------------------------
// Utility – date ↔ snowflake-style ID bounds
// ---------------------------------------------------------------------------

/**
 * Convert a date (or ISO date string) to a lower/upper snowflake-style ID
 * bound, matching the original Python implementation's `(ms << 16) | 0x0000`
 * / `(ms << 16) | 0xFFFF` formula.
 *
 * JavaScript's bitwise operators are 32-bit, so BigInt is used to preserve
 * the full magnitude of modern timestamps.
 *
 * @param dtInput - A `Date` object or an ISO date-only string (e.g. `"2025-01-01"`).
 *                  If a string is provided it must not contain a time component.
 * @param bound   - `"start"` for the beginning of the day, `"end"` for the end.
 * @returns       A decimal string representation of the computed ID bound.
 */
export function dateToBound(dtInput: string | Date, bound: 'start' | 'end'): string {
  let dt: Date;
  if (typeof dtInput === 'string') {
    dt = new Date(dtInput);
    if (
      dt.getUTCHours() !== 0 ||
      dt.getUTCMinutes() !== 0 ||
      dt.getUTCSeconds() !== 0 ||
      dt.getUTCMilliseconds() !== 0
    ) {
      throw new Error(
        'date string must not include a time component. Pass in a Date object for time-specific bounds.',
      );
    }
  } else {
    dt = dtInput;
  }

  if (bound === 'start') {
    const boundDt = new Date(
      Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0, 0, 0, 0),
    );
    const ms = BigInt(boundDt.getTime());
    return String((ms << 16n) | 0n);
  } else {
    const boundDt = new Date(
      Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 23, 59, 59, 999),
    );
    const ms = BigInt(boundDt.getTime());
    return String((ms << 16n) | 0xFFFFn);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildProxyConfig(): AxiosProxyConfig | undefined {
  const raw = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return { host: url.hostname, port: url.port ? parseInt(url.port, 10) : 80 };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Api class
// ---------------------------------------------------------------------------

export class Api {
  rateLimitMax: number = 300;
  rateLimitRemaining: number | null = null;
  rateLimitReset: Date | null = null;
  authId: string | undefined;

  private readonly username: string | undefined;
  private readonly password: string | undefined;

  constructor(username?: string, password?: string, token?: string) {
    this.username = username ?? process.env.TRUTHSOCIAL_USERNAME;
    this.password = password ?? process.env.TRUTHSOCIAL_PASSWORD;
    this.authId = token ?? process.env.TRUTHSOCIAL_TOKEN ?? undefined;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async checkLogin(): Promise<void> {
    if (!this.authId) {
      if (!this.username) throw new LoginErrorException('Username is missing.');
      if (!this.password) throw new LoginErrorException('Password is missing.');
      this.authId = await this.getAuthId(this.username, this.password);
    }
  }

  private async checkRateLimit(headers: Record<string, string>): Promise<void> {
    const limit = headers['x-ratelimit-limit'];
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];

    if (limit !== undefined) this.rateLimitMax = parseInt(limit, 10);
    if (remaining !== undefined) this.rateLimitRemaining = parseInt(remaining, 10);
    if (reset !== undefined) this.rateLimitReset = new Date(reset);

    if (this.rateLimitRemaining !== null && this.rateLimitRemaining <= 50) {
      const now = Date.now();
      const resetMs = this.rateLimitReset ? this.rateLimitReset.getTime() : now;
      const timeToSleep = resetMs - now;
      console.warn(
        `Approaching rate limit; sleeping for ${timeToSleep / 1000} seconds...`,
      );
      await sleep(timeToSleep > 0 ? timeToSleep : 10_000);
    }
  }

  private requestConfig(extraHeaders?: Record<string, string>) {
    return {
      headers: {
        Authorization: `Bearer ${this.authId}`,
        'User-Agent': USER_AGENT,
        ...extraHeaders,
      },
      proxy: buildProxyConfig(),
    };
  }

  private async get(url: string, params?: Record<string, unknown>): Promise<unknown> {
    const resp = await axios.get(API_BASE_URL + url, {
      params,
      ...this.requestConfig(),
    });
    await this.checkRateLimit(resp.headers as Record<string, string>);
    return resp.data as unknown;
  }

  private async *getPaginated(
    url: string,
    params?: Record<string, unknown>,
    resume?: string,
  ): AsyncGenerator<unknown[]> {
    let nextLink: string | null = API_BASE_URL + url;
    if (resume) nextLink += `?max_id=${resume}`;

    while (nextLink !== null) {
      const resp = await axios.get(nextLink, {
        params,
        ...this.requestConfig(),
      });

      // Parse RFC 5988 Link header to find the `rel="next"` URL
      const linkHeader: string = (resp.headers as Record<string, string>)['link'] ?? '';
      nextLink = null;
      for (const part of linkHeader.split(',')) {
        const [urlPart, relPart] = part.split(';');
        if (relPart?.trim() === 'rel="next"') {
          nextLink = urlPart.trim().replace(/^<|>$/g, '');
          break;
        }
      }

      yield resp.data as unknown[];
      await this.checkRateLimit(resp.headers as Record<string, string>);
    }
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  async getAuthId(username: string, password: string): Promise<string> {
    const url = `${BASE_URL}/oauth/v2/token`;
    const payload = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'password',
      username,
      password,
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
      scope: 'read',
    };

    let resp: { data: Record<string, unknown>; status: number };
    try {
      resp = await axios.post(url, payload, {
        proxy: buildProxyConfig(),
        headers: { 'User-Agent': USER_AGENT },
        // Do not throw on non-2xx so we can inspect status ourselves
        validateStatus: () => true,
      });
    } catch (err) {
      throw new LoginErrorException(`Cannot authenticate: ${(err as Error).message}`);
    }

    if (resp.status === 403) {
      const text = String(resp.data ?? '').toLowerCase();
      if (text.includes('unavailable in your area')) {
        throw new GeoblockException('Truth Social is unavailable in your area.');
      }
      if (text.includes('you have been blocked')) {
        throw new CFBlockException('Request blocked by Cloudflare.');
      }
      throw new LoginErrorException(
        `Authentication forbidden (403). Response: ${String(resp.data).slice(0, 200)}`,
      );
    }

    const data = resp.data as { access_token?: string };
    if (!data.access_token) {
      throw new Error('Invalid truthsocial.com credentials provided!');
    }

    return data.access_token;
  }

  // -------------------------------------------------------------------------
  // Public API methods
  // -------------------------------------------------------------------------

  /** Look up a user's account information by handle. */
  async lookup(userHandle: string): Promise<Record<string, unknown>> {
    await this.checkLogin();
    return this.get('/v1/accounts/lookup', { acct: userHandle }) as Promise<Record<string, unknown>>;
  }

  /**
   * Search for accounts, statuses, hashtags or groups.
   * Yields one page of results at a time.
   */
  async *search(
    searchtype: string,
    query: string,
    limit = 40,
    resolve: number | boolean = 4,
    offset = 0,
    minId = '0',
    maxId?: string,
    startDate?: string | Date,
    endDate?: string | Date,
  ): AsyncGenerator<Record<string, unknown[]>> {
    await this.checkLogin();

    if (minId !== '0' && startDate !== undefined) {
      throw new Error('Cannot specify both minId and startDate.');
    }
    if (maxId !== undefined && endDate !== undefined) {
      throw new Error('Cannot specify both maxId and endDate.');
    }

    if (startDate !== undefined) minId = dateToBound(startDate, 'start');
    if (endDate !== undefined) maxId = dateToBound(endDate, 'end');
    if (maxId !== undefined) {
      if (BigInt(minId) >= BigInt(maxId)) throw new Error('minId must be less than maxId.');
    }

    const PAGE_SIZE = 40;
    let totalYielded = 0;

    while (totalYielded < limit) {
      const fetchSize = Math.min(PAGE_SIZE, limit - totalYielded);
      const params: Record<string, unknown> = {
        q: query,
        resolve,
        limit: fetchSize,
        type: searchtype,
        offset,
        min_id: minId,
      };
      if (maxId !== undefined) params.max_id = maxId;

      const resp = await this.get('/v2/search', params) as Record<string, unknown[]> | null;

      if (!resp || Object.values(resp).every(v => Array.isArray(v) && v.length === 0)) break;

      yield resp;
      totalYielded += Object.values(resp).reduce(
        (sum, v) => sum + (Array.isArray(v) ? v.length : 0),
        0,
      );
      offset += PAGE_SIZE;
    }
  }

  /**
   * Collect posts with a specific hashtag.
   * Yields arrays of posts, one page at a time.
   */
  async *hashtag(tag: string, limit = 100): AsyncGenerator<unknown[]> {
    await this.checkLogin();
    if (tag.startsWith('#')) tag = tag.slice(1);

    let numResults = 0;
    const params: Record<string, unknown> = {};

    while (numResults < limit) {
      const resp = await this.get(`/v1/timelines/tag/${tag}`, params) as unknown[] | null;
      if (!resp) break;

      const results = (Array.isArray(resp) ? resp : []).filter(Boolean);
      if (results.length === 0) break;

      numResults += results.length;
      params.max_id = (results[results.length - 1] as { id: string }).id;

      yield results;
    }
  }

  /** Return trending Truths. */
  async trending(limit = 10): Promise<unknown> {
    await this.checkLogin();
    return this.get(`/v1/truth/trending/truths?limit=${limit}`);
  }

  /** Return posts from a group timeline. */
  async groupPosts(groupId: string, limit = 20): Promise<unknown[]> {
    await this.checkLogin();
    const timeline: unknown[] = [];
    let remaining = limit;
    let posts = await this.get(`/v1/timelines/group/${groupId}?limit=${remaining}`) as unknown[] | null;

    while (posts && posts.length > 0) {
      timeline.push(...posts);
      remaining -= posts.length;
      if (remaining <= 0) break;
      const lastId = (posts[posts.length - 1] as { id: string }).id;
      posts = await this.get(
        `/v1/timelines/group/${groupId}?max_id=${lastId}&limit=${remaining}`,
      ) as unknown[] | null;
    }
    return timeline;
  }

  /** Return trending hashtags. */
  async tags(): Promise<unknown> {
    await this.checkLogin();
    return this.get('/v1/trends');
  }

  /** Return a list of suggested users. */
  async suggested(maximum = 50): Promise<unknown> {
    await this.checkLogin();
    return this.get(`/v2/suggestions?limit=${maximum}`);
  }

  /** Return trending groups. */
  async trendingGroups(limit = 10): Promise<unknown> {
    await this.checkLogin();
    return this.get(`/v1/truth/trends/groups?limit=${limit}`);
  }

  /** Return trending group tags. */
  async groupTags(): Promise<unknown> {
    await this.checkLogin();
    return this.get('/v1/groups/tags');
  }

  /** Return a list of suggested groups. */
  async suggestedGroups(maximum = 50): Promise<unknown> {
    await this.checkLogin();
    return this.get(`/v1/truth/suggestions/groups?limit=${maximum}`);
  }

  /** Return ads from Rumble's Ad Platform. */
  async ads(device = 'desktop'): Promise<unknown> {
    await this.checkLogin();
    return this.get(`/v3/truth/ads?device=${device}`);
  }

  /** Yield a user's followers, one at a time. */
  async *userFollowers(
    userHandle?: string,
    userId?: string,
    maximum = 1000,
    resume?: string,
  ): AsyncGenerator<unknown> {
    await this.checkLogin();
    if (!userHandle && !userId) throw new Error('userHandle or userId must be provided.');
    const resolvedId = userId ?? (await this.lookup(userHandle!)).id as string;

    let nOutput = 0;
    for await (const batch of this.getPaginated(`/v1/accounts/${resolvedId}/followers`, undefined, resume)) {
      for (const f of batch) {
        yield f;
        nOutput += 1;
        if (maximum !== undefined && nOutput >= maximum) return;
      }
    }
  }

  /** Yield users that a given user follows, one at a time. */
  async *userFollowing(
    userHandle?: string,
    userId?: string,
    maximum = 1000,
    resume?: string,
  ): AsyncGenerator<unknown> {
    await this.checkLogin();
    if (!userHandle && !userId) throw new Error('userHandle or userId must be provided.');
    const resolvedId = userId ?? (await this.lookup(userHandle!)).id as string;

    let nOutput = 0;
    for await (const batch of this.getPaginated(`/v1/accounts/${resolvedId}/following`, undefined, resume)) {
      for (const f of batch) {
        yield f;
        nOutput += 1;
        if (maximum !== undefined && nOutput >= maximum) return;
      }
    }
  }

  /**
   * Yield a user's statuses in reverse chronological order (newest first).
   * Adds a `_pulled` ISO timestamp to each post.
   */
  async *pullStatuses(
    username: string,
    replies = false,
    verbose = false,
    createdAfter?: Date,
    sinceId?: string,
    pinned = false,
  ): AsyncGenerator<Record<string, unknown>> {
    await this.checkLogin();
    const user = await this.lookup(username);
    const userId = user.id as string;

    const params: Record<string, unknown> = {};
    let keepGoing = true;

    while (keepGoing) {
      let url = `/v1/accounts/${userId}/statuses`;
      if (pinned) {
        url += '?pinned=true&with_muted=true';
      } else if (!replies) {
        url += '?exclude_replies=true';
      }
      if (verbose) console.debug(`${url} ${JSON.stringify(params)}`);

      let result: unknown;
      try {
        result = await this.get(url, params);
      } catch (err) {
        console.error(`Error pulling statuses for ${userId}: ${(err as Error).message}`);
        break;
      }

      if (!result || typeof result !== 'object') break;

      if ('error' in (result as object)) {
        console.error(`API error for ${userId}: ${JSON.stringify(result)}`);
        break;
      }

      if (!Array.isArray(result) || result.length === 0) break;

      const posts = [...result].sort(
        (a: Record<string, unknown>, b: Record<string, unknown>) =>
          String(b.id).localeCompare(String(a.id)),
      ) as Record<string, unknown>[];

      params.max_id = posts[posts.length - 1].id;

      if (pinned) keepGoing = false; // assume single page for pinned

      for (const post of posts) {
        post._pulled = new Date().toISOString();

        const postAt = new Date(post.created_at as string);

        if (
          (createdAfter && postAt <= createdAfter) ||
          (sinceId && parseInt(post.id as string, 10) <= parseInt(sinceId, 10))
        ) {
          keepGoing = false;
          break;
        }

        if (verbose) console.debug(`${post.id} ${post.created_at}`);
        yield post;
      }
    }
  }

  /**
   * Yield users who liked a given post.
   * @param post     - Post ID or full Truth Social URL.
   * @param includeAll - If `true`, ignore `topNum` and return all likers.
   * @param topNum   - Maximum number of likers to return (default 40).
   */
  async *userLikes(
    post: string,
    includeAll = false,
    topNum = 40,
  ): AsyncGenerator<unknown> {
    await this.checkLogin();
    topNum = Math.floor(topNum);
    if (topNum < 1) return;

    const postId = post.split('/').pop()!;
    let nOutput = 0;

    for await (const batch of this.getPaginated(
      `/v1/statuses/${postId}/favourited_by`,
      { limit: 80 },
    )) {
      for (const u of batch) {
        yield u;
        nOutput += 1;
        if (!includeAll && nOutput >= topNum) return;
      }
    }
  }

  /**
   * Yield comments (replies) on a post, oldest first.
   * @param post       - Post ID or full Truth Social URL.
   * @param includeAll - If `true`, ignore `topNum`.
   * @param onlyFirst  - If `true`, only yield direct replies (not replies to replies).
   * @param topNum     - Maximum number of comments to return (default 40).
   */
  async *pullComments(
    post: string,
    includeAll = false,
    onlyFirst = false,
    topNum = 40,
  ): AsyncGenerator<unknown> {
    await this.checkLogin();
    topNum = Math.floor(topNum);
    if (topNum < 1) return;

    const postId = post.split('/').pop()!;
    let nOutput = 0;

    for await (const batch of this.getPaginated(
      `/v1/statuses/${postId}/context/descendants`,
      { sort: 'oldest' },
    )) {
      for (const comment of batch as Record<string, unknown>[]) {
        const isDirectReply = comment.in_reply_to_id === postId;
        if (!onlyFirst || isDirectReply) {
          yield comment;
          nOutput += 1;
          if (!includeAll && nOutput >= topNum) return;
        }
      }
    }
  }
}

# truthbrush-ts

A TypeScript port of [truthbrush](https://github.com/stanfordio/truthbrush) — an API client for [Truth Social](https://truthsocial.com/).

## Installation

```bash
npm install
npm run build
```

## CLI Usage

```bash
# Look up a user
npx ts-node src/cli.ts user realDonaldTrump

# Trending truths
npx ts-node src/cli.ts trends --limit 20

# Trending hashtags
npx ts-node src/cli.ts tags

# Search (accounts, statuses, hashtags, groups)
npx ts-node src/cli.ts search trump --searchtype accounts --limit 40

# Pull a user's statuses
npx ts-node src/cli.ts statuses realDonaldTrump

# Pull statuses created after a date
npx ts-node src/cli.ts statuses realDonaldTrump --created-after 2025-01-01T00:00:00Z

# Users who liked a post
npx ts-node src/cli.ts likes <post_id> 100

# Comments on a post
npx ts-node src/cli.ts comments <post_id> 50 --onlyfirst

# Group posts
npx ts-node src/cli.ts groupposts <group_id> --limit 20

# Suggested users
npx ts-node src/cli.ts suggestions --maximum 50

# Ads
npx ts-node src/cli.ts ads --device desktop
```

Each command prints one JSON object per line to stdout.

## Library Usage

```typescript
import { Api, dateToBound } from 'truthbrush';

const api = new Api(
  process.env.TRUTHSOCIAL_USERNAME,
  process.env.TRUTHSOCIAL_PASSWORD,
  // or pass a bearer token directly:
  process.env.TRUTHSOCIAL_TOKEN,
);

// Look up a user
const user = await api.lookup('realDonaldTrump');

// Pull statuses
for await (const post of api.pullStatuses('realDonaldTrump')) {
  console.log(JSON.stringify(post));
}

// Search with date bounds
for await (const page of api.search(
  'statuses',
  'election',
  100,
  4,
  0,
  '0',
  undefined,
  '2025-01-01', // start_date
  '2025-01-31', // end_date
)) {
  console.log(JSON.stringify(page.statuses));
}

// Users who liked a post
for await (const user of api.userLikes('<post_id>', false, 100)) {
  console.log(JSON.stringify(user));
}
```

## Environment Variables

| Variable               | Description                                          |
|------------------------|------------------------------------------------------|
| `TRUTHSOCIAL_USERNAME` | Truth Social username (used to obtain a token)       |
| `TRUTHSOCIAL_PASSWORD` | Truth Social password (used to obtain a token)       |
| `TRUTHSOCIAL_TOKEN`    | Bearer token (skips username/password auth if set)   |
| `https_proxy`          | Optional HTTPS proxy URL                             |

Copy `.env.example` to `.env` and fill in your credentials.

## Development

```bash
# Run tests (105 unit tests, all mocked – no real network calls)
npm test

# Build
npm run build

# Lint
npm run lint
```

## API

All methods that return paginated results are **async generators** that `yield` one item (or page) at a time.

| Method | Returns | Description |
|--------|---------|-------------|
| `lookup(handle)` | `Promise<object>` | Look up a user's profile |
| `search(type, query, ...)` | `AsyncGenerator<page>` | Search across Truth Social |
| `hashtag(tag, limit?)` | `AsyncGenerator<post[]>` | Posts for a hashtag |
| `trending(limit?)` | `Promise<object>` | Trending Truths |
| `groupPosts(groupId, limit?)` | `Promise<post[]>` | Posts in a group |
| `tags()` | `Promise<object>` | Trending hashtags |
| `suggested(max?)` | `Promise<object>` | Suggested users |
| `trendingGroups(limit?)` | `Promise<object>` | Trending groups |
| `groupTags()` | `Promise<object>` | Group tags |
| `suggestedGroups(max?)` | `Promise<object>` | Suggested groups |
| `ads(device?)` | `Promise<object>` | Ads |
| `userFollowers(handle?, id?, max?)` | `AsyncGenerator<user>` | User's followers |
| `userFollowing(handle?, id?, max?)` | `AsyncGenerator<user>` | Users followed |
| `pullStatuses(username, ...)` | `AsyncGenerator<post>` | User's statuses |
| `userLikes(post, ...)` | `AsyncGenerator<user>` | Users who liked a post |
| `pullComments(post, ...)` | `AsyncGenerator<comment>` | Comments on a post |

## Notes

- This library uses `axios` for HTTP. Unlike the Python version (which uses `curl_cffi` to emulate browser TLS fingerprints for Cloudflare bypass), this TypeScript port does not perform TLS fingerprint impersonation. Authentication and most API calls still work, but Cloudflare may block some requests in certain environments.
- Rate-limit headers (`x-ratelimit-*`) are read automatically; the client sleeps when the remaining quota drops to ≤ 50.

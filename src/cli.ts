#!/usr/bin/env node
/**
 * Truthbrush CLI – a TypeScript port of the original Python Click-based CLI.
 * Uses Commander.js.
 */

import { Command } from 'commander';
import { Api } from './api';

// ---------------------------------------------------------------------------
// Factory – exported so tests can inject a mock Api
// ---------------------------------------------------------------------------

export function makeProgram(api: Api): Command {
  const program = new Command();

  program
    .name('truthbrush')
    .description('API client for Truth Social');

  // -------------------------------------------------------------------------

  program
    .command('user <handle>')
    .description("Pull a user's metadata.")
    .action(async (handle: string) => {
      const user = await api.lookup(handle);
      process.stdout.write(JSON.stringify(user) + '\n');
    });

  // -------------------------------------------------------------------------

  program
    .command('trends')
    .description('Pull trendy Truths.')
    .option('--limit <number>', 'Number of trending truths to return', '10')
    .action(async (opts: { limit: string }) => {
      const data = await api.trending(parseInt(opts.limit, 10));
      process.stdout.write(JSON.stringify(data) + '\n');
    });

  // -------------------------------------------------------------------------

  program
    .command('tags')
    .description('Pull trendy tags.')
    .action(async () => {
      const data = await api.tags();
      process.stdout.write(JSON.stringify(data) + '\n');
    });

  // -------------------------------------------------------------------------

  program
    .command('grouptags')
    .description('Pull trending group tags.')
    .action(async () => {
      const data = await api.groupTags();
      process.stdout.write(JSON.stringify(data) + '\n');
    });

  // -------------------------------------------------------------------------

  program
    .command('grouptrends')
    .description('Pull trending groups.')
    .option('--limit <number>', 'Number of trending groups to return', '10')
    .action(async (opts: { limit: string }) => {
      const data = await api.trendingGroups(parseInt(opts.limit, 10));
      process.stdout.write(JSON.stringify(data) + '\n');
    });

  // -------------------------------------------------------------------------

  program
    .command('groupsuggestions')
    .description('Pull list of suggested groups.')
    .option('--maximum <number>', 'Maximum number of groups to return', '50')
    .action(async (opts: { maximum: string }) => {
      const data = await api.suggestedGroups(parseInt(opts.maximum, 10));
      process.stdout.write(JSON.stringify(data) + '\n');
    });

  // -------------------------------------------------------------------------

  program
    .command('suggestions')
    .description('Pull the list of suggested users.')
    .option('--maximum <number>', 'Maximum number of users to return', '50')
    .action(async (opts: { maximum: string }) => {
      const data = await api.suggested(parseInt(opts.maximum, 10));
      process.stdout.write(JSON.stringify(data) + '\n');
    });

  // -------------------------------------------------------------------------

  program
    .command('ads')
    .description("Pull ads from Rumble's Ad Platform via Truth Social.")
    .option('--device <device>', 'Device type (desktop or mobile)', 'desktop')
    .action(async (opts: { device: string }) => {
      const data = await api.ads(opts.device);
      process.stdout.write(JSON.stringify(data) + '\n');
    });

  // -------------------------------------------------------------------------

  program
    .command('search <query>')
    .description('Search for users, statuses, groups, or hashtags.')
    .option(
      '--searchtype <type>',
      'Type of search (accounts, statuses, hashtags, groups)',
      'accounts',
    )
    .option('--limit <number>', 'Maximum number of results', '40')
    .option('--resolve <number>', 'Resolve', '4')
    .option('--start-date <date>', 'Start date for search results (e.g. 2026-01-01)')
    .option('--end-date <date>', 'End date for search results (e.g. 2026-03-01)')
    .action(
      async (
        query: string,
        opts: {
          searchtype: string;
          limit: string;
          resolve: string;
          startDate?: string;
          endDate?: string;
        },
      ) => {
        for await (const page of api.search(
          opts.searchtype,
          query,
          parseInt(opts.limit, 10),
          parseInt(opts.resolve, 10),
          0,
          '0',
          undefined,
          opts.startDate,
          opts.endDate,
        )) {
          const results = page[opts.searchtype] ?? [];
          process.stdout.write(JSON.stringify(results) + '\n');
        }
      },
    );

  // -------------------------------------------------------------------------

  program
    .command('statuses <username>')
    .description("Pull a user's statuses.")
    .option('--replies', 'Include replies (default: false)', false)
    .option('--created-after <datetime>', 'Only pull posts created after this ISO datetime')
    .option('--pinned', 'Only pull pinned posts', false)
    .action(
      async (
        username: string,
        opts: { replies: boolean; createdAfter?: string; pinned: boolean },
      ) => {
        let createdAfter: Date | undefined;
        if (opts.createdAfter) {
          createdAfter = new Date(opts.createdAfter);
          // Assume UTC if no timezone offset is detectable
          if (isNaN(createdAfter.getTime())) {
            console.error(`Invalid date: ${opts.createdAfter}`);
            process.exit(1);
          }
        }
        for await (const post of api.pullStatuses(
          username,
          opts.replies,
          false,
          createdAfter,
          undefined,
          opts.pinned,
        )) {
          process.stdout.write(JSON.stringify(post) + '\n');
        }
      },
    );

  // -------------------------------------------------------------------------

  program
    .command('likes <post> <top_num>')
    .description('Pull the top N most recent users who liked the post.')
    .option('--includeall', 'Return all likers (ignores top_num)', false)
    .action(async (post: string, topNumStr: string, opts: { includeall: boolean }) => {
      const topNum = parseInt(topNumStr, 10);
      for await (const user of api.userLikes(post, opts.includeall, topNum)) {
        process.stdout.write(JSON.stringify(user) + '\n');
      }
    });

  // -------------------------------------------------------------------------

  program
    .command('comments <post> <top_num>')
    .description('Pull the top N oldest comments on a post.')
    .option('--includeall', 'Return all comments (ignores top_num)', false)
    .option('--onlyfirst', 'Return only direct replies to the post', false)
    .action(
      async (
        post: string,
        topNumStr: string,
        opts: { includeall: boolean; onlyfirst: boolean },
      ) => {
        const topNum = parseInt(topNumStr, 10);
        for await (const comment of api.pullComments(post, opts.includeall, opts.onlyfirst, topNum)) {
          process.stdout.write(JSON.stringify(comment) + '\n');
        }
      },
    );

  // -------------------------------------------------------------------------

  program
    .command('groupposts <group_id>')
    .description("Pull posts from a group's timeline.")
    .option('--limit <number>', 'Maximum number of posts to return', '20')
    .action(async (groupId: string, opts: { limit: string }) => {
      const data = await api.groupPosts(groupId, parseInt(opts.limit, 10));
      process.stdout.write(JSON.stringify(data) + '\n');
    });

  return program;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const api = new Api();
  makeProgram(api)
    .parseAsync(process.argv)
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}

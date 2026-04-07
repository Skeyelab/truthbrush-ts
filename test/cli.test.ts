import { makeProgram } from '../src/cli';
import { Api } from '../src/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal Jest-mock-compatible Api double. All methods return/yield nothing. */
function mockApi(): jest.Mocked<Api> {
  return {
    authId: 'test-token',
    rateLimitMax: 300,
    rateLimitRemaining: null,
    rateLimitReset: null,
    lookup: jest.fn().mockResolvedValue({ id: '1', username: 'user' }),
    trending: jest.fn().mockResolvedValue([]),
    tags: jest.fn().mockResolvedValue([]),
    groupTags: jest.fn().mockResolvedValue([]),
    trendingGroups: jest.fn().mockResolvedValue([]),
    suggestedGroups: jest.fn().mockResolvedValue([]),
    suggested: jest.fn().mockResolvedValue([]),
    ads: jest.fn().mockResolvedValue([]),
    groupPosts: jest.fn().mockResolvedValue([]),
    getAuthId: jest.fn().mockResolvedValue('token'),
    // Async generator stubs
    search: jest.fn().mockImplementation(async function* () { /* empty */ }),
    hashtag: jest.fn().mockImplementation(async function* () { /* empty */ }),
    userLikes: jest.fn().mockImplementation(async function* () { /* empty */ }),
    pullComments: jest.fn().mockImplementation(async function* () { /* empty */ }),
    pullStatuses: jest.fn().mockImplementation(async function* () { /* empty */ }),
    userFollowers: jest.fn().mockImplementation(async function* () { /* empty */ }),
    userFollowing: jest.fn().mockImplementation(async function* () { /* empty */ }),
  } as unknown as jest.Mocked<Api>;
}

/** Run a command and capture stdout. Returns written text. */
async function run(api: jest.Mocked<Api>, args: string[]): Promise<string> {
  const program = makeProgram(api as unknown as Api);
  program.exitOverride(); // prevent process.exit on --help / errors
  const writes: string[] = [];
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  });
  try {
    await program.parseAsync(['node', 'cli', ...args]);
  } finally {
    spy.mockRestore();
  }
  return writes.join('');
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

describe('CLI command registration', () => {
  it('registers the "user" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    const names = program.commands.map(c => c.name());
    expect(names).toContain('user');
  });

  it('registers the "trends" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    expect(program.commands.map(c => c.name())).toContain('trends');
  });

  it('registers the "tags" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    expect(program.commands.map(c => c.name())).toContain('tags');
  });

  it('registers the "grouptags" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    expect(program.commands.map(c => c.name())).toContain('grouptags');
  });

  it('registers the "grouptrends" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    expect(program.commands.map(c => c.name())).toContain('grouptrends');
  });

  it('registers the "groupsuggestions" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    expect(program.commands.map(c => c.name())).toContain('groupsuggestions');
  });

  it('registers the "suggestions" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    expect(program.commands.map(c => c.name())).toContain('suggestions');
  });

  it('registers the "ads" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    expect(program.commands.map(c => c.name())).toContain('ads');
  });

  it('registers the "search" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    expect(program.commands.map(c => c.name())).toContain('search');
  });

  it('registers the "statuses" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    expect(program.commands.map(c => c.name())).toContain('statuses');
  });

  it('registers the "likes" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    expect(program.commands.map(c => c.name())).toContain('likes');
  });

  it('registers the "comments" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    expect(program.commands.map(c => c.name())).toContain('comments');
  });

  it('registers the "groupposts" command', () => {
    const program = makeProgram(mockApi() as unknown as Api);
    expect(program.commands.map(c => c.name())).toContain('groupposts');
  });
});

// ---------------------------------------------------------------------------
// Command behaviour
// ---------------------------------------------------------------------------

describe('CLI "user" command', () => {
  it('calls api.lookup with the given handle', async () => {
    const api = mockApi();
    await run(api, ['user', 'realDonaldTrump']);
    expect(api.lookup).toHaveBeenCalledWith('realDonaldTrump');
  });

  it('prints JSON of the user to stdout', async () => {
    const api = mockApi();
    api.lookup.mockResolvedValueOnce({ id: '99', username: 'realDonaldTrump' });
    const output = await run(api, ['user', 'realDonaldTrump']);
    expect(JSON.parse(output)).toMatchObject({ id: '99', username: 'realDonaldTrump' });
  });
});

describe('CLI "trends" command', () => {
  it('calls api.trending and prints JSON', async () => {
    const api = mockApi();
    api.trending.mockResolvedValueOnce([{ id: 't1' }]);
    const output = await run(api, ['trends']);
    expect(api.trending).toHaveBeenCalled();
    expect(JSON.parse(output)).toEqual([{ id: 't1' }]);
  });
});

describe('CLI "tags" command', () => {
  it('calls api.tags and prints JSON', async () => {
    const api = mockApi();
    api.tags.mockResolvedValueOnce([{ name: 'MAGA' }]);
    const output = await run(api, ['tags']);
    expect(api.tags).toHaveBeenCalled();
    expect(JSON.parse(output)).toEqual([{ name: 'MAGA' }]);
  });
});

describe('CLI "grouptags" command', () => {
  it('calls api.groupTags and prints JSON', async () => {
    const api = mockApi();
    api.groupTags.mockResolvedValueOnce([{ name: 'gtag' }]);
    const output = await run(api, ['grouptags']);
    expect(api.groupTags).toHaveBeenCalled();
    expect(JSON.parse(output)).toEqual([{ name: 'gtag' }]);
  });
});

describe('CLI "grouptrends" command', () => {
  it('calls api.trendingGroups and prints JSON', async () => {
    const api = mockApi();
    api.trendingGroups.mockResolvedValueOnce([{ id: 'g1' }]);
    const output = await run(api, ['grouptrends']);
    expect(api.trendingGroups).toHaveBeenCalled();
    expect(JSON.parse(output)).toEqual([{ id: 'g1' }]);
  });
});

describe('CLI "groupsuggestions" command', () => {
  it('calls api.suggestedGroups and prints JSON', async () => {
    const api = mockApi();
    api.suggestedGroups.mockResolvedValueOnce([{ id: 'sg1' }]);
    const output = await run(api, ['groupsuggestions']);
    expect(api.suggestedGroups).toHaveBeenCalled();
    expect(JSON.parse(output)).toEqual([{ id: 'sg1' }]);
  });
});

describe('CLI "suggestions" command', () => {
  it('calls api.suggested and prints JSON', async () => {
    const api = mockApi();
    api.suggested.mockResolvedValueOnce([{ id: 'su1' }]);
    const output = await run(api, ['suggestions']);
    expect(api.suggested).toHaveBeenCalled();
    expect(JSON.parse(output)).toEqual([{ id: 'su1' }]);
  });
});

describe('CLI "ads" command', () => {
  it('calls api.ads and prints JSON', async () => {
    const api = mockApi();
    api.ads.mockResolvedValueOnce([{ id: 'ad1' }]);
    const output = await run(api, ['ads']);
    expect(api.ads).toHaveBeenCalled();
    expect(JSON.parse(output)).toEqual([{ id: 'ad1' }]);
  });
});

describe('CLI "groupposts" command', () => {
  it('calls api.groupPosts with group_id and default limit', async () => {
    const api = mockApi();
    api.groupPosts.mockResolvedValueOnce([{ id: 'p1' }]);
    const output = await run(api, ['groupposts', 'grp123']);
    expect(api.groupPosts).toHaveBeenCalledWith('grp123', 20);
    expect(JSON.parse(output)).toEqual([{ id: 'p1' }]);
  });

  it('respects --limit option', async () => {
    const api = mockApi();
    api.groupPosts.mockResolvedValueOnce([]);
    await run(api, ['groupposts', 'grp123', '--limit', '5']);
    expect(api.groupPosts).toHaveBeenCalledWith('grp123', 5);
  });
});

describe('CLI "search" command', () => {
  it('calls api.search and prints each page', async () => {
    const api = mockApi();
    api.search.mockImplementationOnce(async function* () {
      yield { accounts: [{ id: 'a1' }], statuses: [], hashtags: [] };
    });
    const output = await run(api, ['search', 'trump', '--searchtype', 'accounts']);
    expect(api.search).toHaveBeenCalled();
    const lines = output.trim().split('\n');
    expect(JSON.parse(lines[0])).toEqual([{ id: 'a1' }]);
  });
});

describe('CLI "statuses" command', () => {
  it('calls api.pullStatuses with username and prints each status', async () => {
    const api = mockApi();
    api.pullStatuses.mockImplementationOnce(async function* () {
      yield { id: 's1', created_at: '2024-01-01T00:00:00Z' };
    });
    const output = await run(api, ['statuses', 'trumphandle']);
    expect(api.pullStatuses).toHaveBeenCalled();
    const args = (api.pullStatuses as jest.Mock).mock.calls[0];
    expect(args[0]).toBe('trumphandle');
    expect(JSON.parse(output)).toMatchObject({ id: 's1' });
  });
});

describe('CLI "likes" command', () => {
  it('calls api.userLikes with post and prints each user', async () => {
    const api = mockApi();
    api.userLikes.mockImplementationOnce(async function* () {
      yield { id: 'u1' };
    });
    const output = await run(api, ['likes', 'post123', '10']);
    expect(api.userLikes).toHaveBeenCalled();
    expect(JSON.parse(output)).toMatchObject({ id: 'u1' });
  });
});

describe('CLI "comments" command', () => {
  it('calls api.pullComments with post and prints each comment', async () => {
    const api = mockApi();
    api.pullComments.mockImplementationOnce(async function* () {
      yield { id: 'c1' };
    });
    const output = await run(api, ['comments', 'post123', '10']);
    expect(api.pullComments).toHaveBeenCalled();
    expect(JSON.parse(output)).toMatchObject({ id: 'c1' });
  });
});

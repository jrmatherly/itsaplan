import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';
import { ResponseTooLargeError, UrlNotAllowedError } from '@repo/net';

type Init = {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  allowedHosts?: string;
  signal?: AbortSignal;
};

const pinnedFetch = mock(async (_url: string, _init?: Init) =>
  Response.json({ data: { web: [] } }),
);
mock.module('@repo/net', () => ({ pinnedFetch, ResponseTooLargeError, UrlNotAllowedError }));

const cloudFetch = mock(async (_url: string | URL | Request, _init?: Init) =>
  Response.json({ data: { web: [] } }),
);
const realFetch = globalThis.fetch;
globalThis.fetch = cloudFetch as unknown as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

const { firecrawlSearch } = await import('../search');
const { firecrawlCrawl } = await import('../crawl');
const { firecrawlExtract } = await import('../extract');
const { firecrawl } = await import('../index');
const { verifyFirecrawl } = await import('../verify');

const cloud = { apiKey: 'fc-1' };
const selfHosted = { apiKey: 'any', baseUrl: 'https://firecrawl.example.com' };
const noSignal = new AbortController().signal;
const html = (status: number) =>
  new Response('<html>', { status, headers: { 'content-type': 'text/html' } });

describe('firecrawl instance URL', () => {
  beforeEach(() => {
    pinnedFetch.mockClear();
    cloudFetch.mockClear();
  });

  it('calls the Firecrawl cloud when the credential has no instance URL', async () => {
    await firecrawlSearch.execute(cloud, { query: 'q' });
    await firecrawlSearch.execute({ apiKey: 'fc-1', baseUrl: '  ' }, { query: 'q' });
    for (const [url, init] of cloudFetch.mock.calls) {
      expect(url).toBe('https://api.firecrawl.dev/v2/search');
      expect(init!.method).toBe('POST');
      expect(init!.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer fc-1',
      });
    }
    expect(cloudFetch).toHaveBeenCalledTimes(2);
    expect(pinnedFetch).not.toHaveBeenCalled();
  });

  it('calls a self-hosted server through the SSRF guard, whatever form the address has', async () => {
    const forms = {
      ' https://firecrawl.example.com/ ': 'https://firecrawl.example.com/v2/search',
      'https://firecrawl.example.com/v2/': 'https://firecrawl.example.com/v2/search',
      'https://example.com/firecrawl': 'https://example.com/firecrawl/v2/search',
      'https://example.com/firecrawl/v2': 'https://example.com/firecrawl/v2/search',
    };
    for (const baseUrl of Object.keys(forms)) {
      await firecrawlSearch.execute({ apiKey: 'any', baseUrl }, { query: 'q' });
    }
    expect(pinnedFetch.mock.calls.map(([url]) => url)).toEqual(Object.values(forms));
    const init = pinnedFetch.mock.calls[0]![1]!;
    expect(init.headers!.Authorization).toBe('Bearer any');
    expect(init.timeoutMs).toBe(120_000);
    expect(init.maxBytes).toBe(20 * 1024 * 1024);
    expect(cloudFetch).not.toHaveBeenCalled();
  });

  it('refuses an instance URL with a query, a fragment, a user name or no scheme', async () => {
    const bad = [
      'https://firecrawl.example.com/admin?x=',
      'https://firecrawl.example.com/admin?',
      'https://firecrawl.example.com/admin#',
      'https://user:pw@firecrawl.example.com',
      'firecrawl.example.com',
      'firecrawl.example.com:3002',
      'ftp://firecrawl.example.com',
    ];
    for (const baseUrl of bad) {
      await expect(firecrawlSearch.execute({ baseUrl }, { query: 'q' })).rejects.toThrow(
        'Instance URL',
      );
      expect(await verifyFirecrawl({ baseUrl }, noSignal)).toBe('rejected');
    }
    expect(pinnedFetch).not.toHaveBeenCalled();
    expect(cloudFetch).not.toHaveBeenCalled();
  });

  it('polls a crawl job on the self-hosted server', async () => {
    pinnedFetch
      .mockImplementationOnce(async () => Response.json({ id: 'j1' }))
      .mockImplementationOnce(async () => Response.json({ status: 'completed', data: [] }));
    const result = (await firecrawlCrawl.execute(selfHosted, { url: 'https://a.example' })) as {
      status: string;
    };
    expect(result.status).toBe('completed');
    expect(pinnedFetch.mock.calls[1]![0]).toBe('https://firecrawl.example.com/v2/crawl/j1');
    expect(pinnedFetch.mock.calls[1]![1]!.headers!.Authorization).toBe('Bearer any');
    expect(cloudFetch).not.toHaveBeenCalled();
  });

  it('sends no key to a self-hosted server when the credential has none', async () => {
    expect(firecrawl.credentialSchema.find((f) => f.key === 'apiKey')!.required).toBe(false);
    await firecrawlSearch.execute({ baseUrl: selfHosted.baseUrl }, { query: 'q' });
    await firecrawlSearch.execute({ baseUrl: selfHosted.baseUrl, apiKey: '  ' }, { query: 'q' });
    expect(pinnedFetch).toHaveBeenCalledTimes(2);
    for (const [, init] of pinnedFetch.mock.calls) {
      expect(init!.headers).toEqual({ 'Content-Type': 'application/json' });
    }
  });

  it('extracts from each page with its own scrape, and keeps the pages that worked', async () => {
    pinnedFetch
      .mockImplementationOnce(async () => Response.json({ data: { json: { title: 'A' } } }))
      .mockImplementationOnce(async () => Response.json({ error: 'timed out' }, { status: 408 }))
      .mockImplementationOnce(async () =>
        Response.json({ data: { json: null, warning: 'no result' } }),
      );
    const urls = ['https://a.example', 'https://b.example', 'https://c.example'];
    const out = (await firecrawlExtract.execute(selfHosted, {
      urls,
      prompt: 'The title',
      schema: { type: 'object' },
    })) as { results: Array<Record<string, unknown>> };
    expect(out.results[0]).toEqual({ url: urls[0], data: { title: 'A' } });
    expect(out.results[1]!.url).toBe(urls[1]);
    expect(out.results[1]!.error).toContain('408');
    expect(out.results[1]!.error).not.toContain('model provider');
    expect(out.results[2]).toEqual({ url: urls[2], data: null, warning: 'no result' });
    for (const [url, init] of pinnedFetch.mock.calls) {
      expect(url).toBe('https://firecrawl.example.com/v2/scrape');
      expect(JSON.parse(init!.body!).formats).toEqual([
        { type: 'json', prompt: 'The title', schema: { type: 'object' } },
      ]);
    }
    expect(pinnedFetch.mock.calls.map(([, init]) => JSON.parse(init!.body!).url)).toEqual(urls);
    const body = JSON.parse(pinnedFetch.mock.calls[0]![1]!.body!);
    expect(body.onlyMainContent).toBe(false);
    expect(body.timeout).toBeLessThan(120_000);
  });

  it('fails the extract when no page worked, with each cause once', async () => {
    pinnedFetch
      .mockImplementationOnce(async () => Response.json({ error: 'no' }, { status: 401 }))
      .mockImplementationOnce(async () => Response.json({ error: 'no' }, { status: 401 }))
      .mockImplementationOnce(async () => Response.json({ success: false, error: 'dns' }));
    const urls = ['https://a.example', 'https://b.example', 'https://c.example'];
    const failure = firecrawlExtract.execute(selfHosted, { urls, prompt: 'p' });
    await expect(failure).rejects.toThrow(/^Firecrawl extract failed \(401\)[^;]*; dns$/);
  });

  it('names a missing model only for the 500 a self-hosted server gives without one', async () => {
    const run = (
      send: typeof pinnedFetch | typeof cloudFetch,
      credential: Record<string, string>,
      code: string,
    ) => {
      send.mockImplementationOnce(async () => Response.json({ code }, { status: 500 }));
      return firecrawlExtract.execute(credential, { urls: ['https://a.example'], prompt: 'p' });
    };
    await expect(run(pinnedFetch, selfHosted, 'UNKNOWN_ERROR')).rejects.toThrow('model provider');
    await expect(run(pinnedFetch, selfHosted, 'SCRAPE_ALL_ENGINES_FAILED')).rejects.not.toThrow(
      'model provider',
    );
    await expect(run(cloudFetch, cloud, 'UNKNOWN_ERROR')).rejects.not.toThrow('model provider');
    expect(cloudFetch.mock.calls[0]![0]).toBe('https://api.firecrawl.dev/v2/scrape');
  });

  it('takes at most ten page URLs and no wildcard', () => {
    const parse = (urls: string[]) =>
      firecrawlExtract.inputSchema.safeParse({ urls, prompt: 'p' }).success;
    const page = (n: number) => `https://a.example/${n}`;
    expect(parse(Array.from({ length: 10 }, (_, n) => page(n)))).toBe(true);
    expect(parse(Array.from({ length: 11 }, (_, n) => page(n)))).toBe(false);
    expect(parse(['https://a.example/*'])).toBe(false);
  });

  it('gives the guard reason and the remedy when the address is refused', async () => {
    pinnedFetch.mockImplementationOnce(async () => {
      throw new UrlNotAllowedError('url must use https');
    });
    await expect(firecrawlSearch.execute(selfHosted, { query: 'q' })).rejects.toThrow(
      /url must use https.*FIRECRAWL_ALLOWED_HOSTS.*http:\/\/hostname/,
    );
  });

  it('passes FIRECRAWL_ALLOWED_HOSTS to the SSRF guard, read per call', async () => {
    const saved = process.env.FIRECRAWL_ALLOWED_HOSTS;
    try {
      process.env.FIRECRAWL_ALLOWED_HOSTS = 'http://firecrawl.internal';
      await firecrawlSearch.execute(selfHosted, { query: 'q' });
      delete process.env.FIRECRAWL_ALLOWED_HOSTS;
      await firecrawlSearch.execute(selfHosted, { query: 'q' });
    } finally {
      if (saved === undefined) delete process.env.FIRECRAWL_ALLOWED_HOSTS;
      else process.env.FIRECRAWL_ALLOWED_HOSTS = saved;
    }
    expect(pinnedFetch.mock.calls.map(([, init]) => init!.allowedHosts)).toEqual([
      'http://firecrawl.internal',
      undefined,
    ]);
  });

  it('tells the agent when the answer is over the size limit', async () => {
    pinnedFetch.mockImplementationOnce(async () => {
      throw new ResponseTooLargeError('response exceeds the byte limit');
    });
    await expect(firecrawlSearch.execute(selfHosted, { query: 'q' })).rejects.toThrow('20 MB');
  });
});

describe('firecrawl credential check', () => {
  beforeEach(() => {
    pinnedFetch.mockClear();
    cloudFetch.mockClear();
  });

  const answers = (send: typeof pinnedFetch | typeof cloudFetch, credential: typeof cloud) =>
    Promise.all(
      [
        Response.json({ success: true }),
        Response.json({}, { status: 401 }),
        Response.json({ code: 'UNKNOWN_ERROR' }, { status: 500 }),
        Response.json({ message: 'no Route matched' }, { status: 404 }),
        html(200),
        html(404),
      ].map((response) => {
        send.mockImplementationOnce(async () => response);
        return verifyFirecrawl(credential, noSignal);
      }),
    );

  it('answers for the cloud', async () => {
    expect(await verifyFirecrawl({}, noSignal)).toBe('rejected');
    expect(await verifyFirecrawl({ apiKey: ' ' }, noSignal)).toBe('rejected');
    expect(cloudFetch).not.toHaveBeenCalled();
    await verifyFirecrawl(cloud, noSignal);
    expect(cloudFetch.mock.calls[0]![0]).toBe('https://api.firecrawl.dev/v2/team/credit-usage');
    cloudFetch.mockClear();
    expect(await answers(cloudFetch, cloud)).toEqual([
      'valid',
      'rejected',
      'unavailable',
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
  });

  it('answers for a self-hosted server from its queue status', async () => {
    expect(await verifyFirecrawl({ baseUrl: selfHosted.baseUrl }, noSignal)).toBe('valid');
    expect(pinnedFetch.mock.calls[0]![0]).toBe(
      'https://firecrawl.example.com/v2/team/queue-status',
    );
    expect(await answers(pinnedFetch, selfHosted)).toEqual([
      'valid',
      'rejected',
      'unknown',
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
  });

  it('checks an instance URL of spaces as the cloud', async () => {
    cloudFetch.mockImplementationOnce(async () => Response.json({}, { status: 500 }));
    expect(await verifyFirecrawl({ apiKey: 'fc-1', baseUrl: '  ' }, noSignal)).toBe('unavailable');
  });

  it('passes the check deadline on and keeps the guard error class', async () => {
    await verifyFirecrawl(selfHosted, noSignal);
    expect(pinnedFetch.mock.calls[0]![1]!.signal).toBe(noSignal);
    pinnedFetch.mockImplementationOnce(async () => {
      throw new UrlNotAllowedError('url must use https');
    });
    await expect(verifyFirecrawl(selfHosted, noSignal)).rejects.toBeInstanceOf(UrlNotAllowedError);
  });
});

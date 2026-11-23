import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';
import { ResponseTooLargeError, UrlNotAllowedError } from '@repo/net';

type Init = {
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
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

  it('gives the guard reason and the remedy when the address is refused', async () => {
    pinnedFetch.mockImplementationOnce(async () => {
      throw new UrlNotAllowedError('url must use https');
    });
    await expect(firecrawlSearch.execute(selfHosted, { query: 'q' })).rejects.toThrow(
      /url must use https.*SSRF_ALLOWED_HOSTS.*http:\/\/host/,
    );
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
    expect(await answers(cloudFetch, cloud)).toEqual([
      'valid',
      'rejected',
      'unavailable',
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
  });

  it('reports a self-hosted server without billing as not checkable', async () => {
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

import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';
import { ResponseTooLargeError, UrlNotAllowedError } from '@repo/net';

const pinnedFetch = mock(
  async (_url: string, _init?: { headers?: Record<string, string>; timeoutMs?: number }) =>
    Response.json({ data: { web: [] } }),
);
mock.module('@repo/net', () => ({ pinnedFetch, ResponseTooLargeError, UrlNotAllowedError }));

const cloudFetch = mock(async (_url: string | URL | Request) =>
  Response.json({ data: { web: [] } }),
);
const realFetch = globalThis.fetch;
globalThis.fetch = cloudFetch as unknown as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

const { firecrawlSearch } = await import('../search');
const { verifyFirecrawl } = await import('../verify');

const selfHosted = { apiKey: 'any', baseUrl: 'https://firecrawl.example.com/v2/' };
const noSignal = new AbortController().signal;

describe('firecrawl instance URL', () => {
  beforeEach(() => {
    pinnedFetch.mockClear();
    cloudFetch.mockClear();
  });

  it('calls the Firecrawl cloud when the credential has no instance URL', async () => {
    await firecrawlSearch.execute({ apiKey: 'fc-1' }, { query: 'q' });
    expect(cloudFetch.mock.calls[0]![0]).toBe('https://api.firecrawl.dev/v2/search');
    expect(pinnedFetch).not.toHaveBeenCalled();
  });

  it('calls a self-hosted server through the SSRF guard', async () => {
    await firecrawlSearch.execute(
      { apiKey: 'any', baseUrl: ' https://firecrawl.example.com/ ' },
      { query: 'q' },
    );
    await firecrawlSearch.execute(selfHosted, { query: 'q' });
    expect(pinnedFetch.mock.calls[1]![0]).toBe('https://firecrawl.example.com/v2/search');
    expect(pinnedFetch.mock.calls[0]![0]).toBe('https://firecrawl.example.com/v2/search');
    expect(pinnedFetch.mock.calls[0]![1]!.headers!.Authorization).toBe('Bearer any');
    expect(pinnedFetch.mock.calls[0]![1]!.timeoutMs).toBe(120_000);
    expect(cloudFetch).not.toHaveBeenCalled();
  });

  it('names SSRF_ALLOWED_HOSTS when the guard refuses the address', async () => {
    pinnedFetch.mockImplementationOnce(async () => {
      throw new UrlNotAllowedError('url must not point to a private or local address');
    });
    await expect(
      firecrawlSearch.execute({ apiKey: 'any', baseUrl: 'https://10.0.0.5' }, { query: 'q' }),
    ).rejects.toThrow('SSRF_ALLOWED_HOSTS');
  });

  it('reports a self-hosted server without billing as not checkable', async () => {
    pinnedFetch.mockImplementationOnce(async () =>
      Response.json({ success: false, code: 'UNKNOWN_ERROR' }, { status: 500 }),
    );
    expect(await verifyFirecrawl(selfHosted, noSignal)).toBe('unknown');
  });

  it('reports a wrong address as unavailable and a refused key as rejected', async () => {
    pinnedFetch.mockImplementationOnce(async () => new Response('<html>', { status: 404 }));
    expect(await verifyFirecrawl(selfHosted, noSignal)).toBe('unavailable');
    pinnedFetch.mockImplementationOnce(async () => Response.json({}, { status: 401 }));
    expect(await verifyFirecrawl(selfHosted, noSignal)).toBe('rejected');
  });

  it('keeps the guard error class, so the check reports a refused address as unknown', async () => {
    pinnedFetch.mockImplementationOnce(async () => {
      throw new UrlNotAllowedError('url must use https');
    });
    await expect(verifyFirecrawl(selfHosted, noSignal)).rejects.toBeInstanceOf(UrlNotAllowedError);
  });
});

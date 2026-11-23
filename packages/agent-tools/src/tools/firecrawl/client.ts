import { pinnedFetch, ResponseTooLargeError, UrlNotAllowedError } from '@repo/net';
import { jsonOrThrow } from '../../http';
import type { ToolConfig } from '../../types';
import { sleep } from '../time';

// Shared client for the Firecrawl API, the cloud service or a self-hosted server. Every
// tool authenticates with the credential's API key as a bearer token and posts a JSON
// body. The crawl and extract endpoints are asynchronous: the POST returns a job id,
// which is then polled with pollJob until the job reaches a terminal status.

export const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v2';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

// The api buffers a whole answer, and a scraped page decides its size.
const MAX_SELF_HOSTED_MB = 20;

// A self-hosted server's address is the credential's, so that call goes through the SSRF
// guard. The cloud address is fixed.
export async function firecrawlFetch(
  credential: ToolConfig,
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  } = {},
): Promise<Response> {
  const headers = { ...init.headers, Authorization: `Bearer ${String(credential.apiKey ?? '')}` };
  const base = String(credential.baseUrl ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v2$/, '');
  if (!base) return fetch(`${FIRECRAWL_BASE}/${path}`, { ...init, headers });
  try {
    // An idle limit, long enough for a scrape that renders a slow page.
    return await pinnedFetch(`${base}/v2/${path}`, {
      ...init,
      headers,
      timeoutMs: 120_000,
      maxBytes: MAX_SELF_HOSTED_MB * 1024 * 1024,
    });
  } catch (err) {
    // The same class, so the credential check still reports an address it cannot reach.
    if (err instanceof UrlNotAllowedError) {
      throw new UrlNotAllowedError(
        `The Firecrawl address is not allowed (${err.message}). A self-hosted server needs an https address, and one on a private network has to be named in SSRF_ALLOWED_HOSTS on the instance.`,
      );
    }
    if (err instanceof ResponseTooLargeError) {
      throw new Error(
        `The Firecrawl answer is larger than ${MAX_SELF_HOSTED_MB} MB. Ask for fewer pages or less content.`,
      );
    }
    throw err;
  }
}

// Posts to a Firecrawl endpoint and returns its parsed JSON body. `what` names the
// call in the error message a failure throws.
export async function firecrawlPost(
  credential: ToolConfig,
  path: string,
  body: Record<string, unknown>,
  what: string,
): Promise<unknown> {
  const res = await firecrawlFetch(credential, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res, what);
}

// A job status body. `status` moves from processing to a terminal value; the rest of
// the fields depend on the job type.
export type JobStatus = { status?: string } & Record<string, unknown>;

// Polls a job until it finishes or maxWaitMs elapses. Returns the last status body
// either way, so a caller can report a still-processing job (with its id) rather than
// block indefinitely.
export async function pollJob(
  jobPath: string,
  credential: ToolConfig,
  what: string,
  { intervalMs = 3000, maxWaitMs = 60000 }: { intervalMs?: number; maxWaitMs?: number } = {},
): Promise<JobStatus> {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const res = await firecrawlFetch(credential, jobPath);
    const data = (await jsonOrThrow(res, what)) as JobStatus;
    if (data.status && TERMINAL.has(data.status)) return data;
    if (Date.now() >= deadline) return data;
    await sleep(intervalMs);
  }
}

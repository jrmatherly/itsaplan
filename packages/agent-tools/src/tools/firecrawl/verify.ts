import type { CredentialCheck, ToolConfig } from '../../types';
import { firecrawlFetch, selfHostedBase } from './client';

// Asks for something that checks the key, if the server has one, and spends nothing.
// The cloud is asked for the team's remaining credits. A self-hosted server without
// billing answers that with an error, so it is asked for the team's queue.
export async function verifyFirecrawl(
  credential: ToolConfig,
  signal: AbortSignal,
): Promise<CredentialCheck> {
  let selfHosted: boolean;
  try {
    selfHosted = selfHostedBase(credential) !== '';
  } catch {
    // An Instance URL the client refuses: rejected, so the credential is not saved.
    return 'rejected';
  }
  // Without a key the cloud serves only scrape and search, on a free tier.
  if (!selfHosted && !String(credential.apiKey ?? '').trim()) return 'rejected';
  const res = await firecrawlFetch(
    credential,
    selfHosted ? 'team/queue-status' : 'team/credit-usage',
    { signal },
  );
  // An address that is not a Firecrawl API can answer any path with a page.
  if (!res.headers.get('content-type')?.includes('json')) return 'unavailable';
  if (res.ok) return 'valid';
  if (res.status === 401) return 'rejected';
  // A self-hosted version that fails this request can still serve the tools.
  return res.status === 500 && selfHosted ? 'unknown' : 'unavailable';
}

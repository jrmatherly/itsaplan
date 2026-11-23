import type { CredentialCheck, ToolConfig } from '../../types';
import { firecrawlFetch, selfHostedBase } from './client';

// Reading the team's remaining credits spends none of them. A self-hosted server that
// runs without billing answers the request with a JSON 500, so it cannot be checked.
export async function verifyFirecrawl(
  credential: ToolConfig,
  signal: AbortSignal,
): Promise<CredentialCheck> {
  const res = await firecrawlFetch(credential, 'team/credit-usage', { signal });
  // An address that is not a Firecrawl API can answer any path with a page.
  if (!res.headers.get('content-type')?.includes('json')) return 'unavailable';
  if (res.ok) return 'valid';
  if (res.status === 401) return 'rejected';
  return res.status === 500 && selfHostedBase(credential) ? 'unknown' : 'unavailable';
}

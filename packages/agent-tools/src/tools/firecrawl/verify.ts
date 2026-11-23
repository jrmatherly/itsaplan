import type { CredentialCheck, ToolConfig } from '../../types';
import { firecrawlFetch } from './client';

// Reading the team's remaining credits spends none of them. A self-hosted server that
// runs without billing answers the request with an error, so it cannot be checked.
export async function verifyFirecrawl(
  credential: ToolConfig,
  signal: AbortSignal,
): Promise<CredentialCheck> {
  const res = await firecrawlFetch(credential, 'team/credit-usage', { signal });
  if (res.ok) return 'valid';
  const fromApi = res.headers.get('content-type')?.includes('json');
  if (fromApi && res.status === 401) return 'rejected';
  return fromApi && credential.baseUrl ? 'unknown' : 'unavailable';
}

import { QueryCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/core/client';

// Fork-owned, so `providers.tsx` differs from upstream by one `QueryClient` option.

// First elements of the query keys a toast would repeat or interrupt: a reader shows
// the error, or the read is secondary to the page. A key shared with a page's main
// read that shows nothing stays out.
const QUIET_KEYS: readonly unknown[] = [
  // The API answers 400 to a link it will not resolve, and the read runs on hover.
  'link-preview',
  // A new key on every navigation; the page's own reads report an outage.
  'sync',
  'attachment-text',
  'issueAgentRuns',
  'externalRunTrace',
  'internalRunTrace',
  'receivedInvites',
  'agentSchedules',
  'planePreview',
  'linearPreview',
  'trelloPreview',
  'instanceEmailPreview',
  'apiSpec',
  // In the shell's banner, which leaves out a 403: the role does not grant the page.
  'boardIssues',
  'views',
];

// 401 signs the user out. 403 and 404 are left to the page: most show "no access" or
// "not found", and a toast for each would repeat them.
const HANDLED_STATUSES = [401, 403, 404];

export function failedReadCache(notify: (error: unknown) => void): QueryCache {
  return new QueryCache({
    onError: (error, query) => {
      if (query.meta?.suppressErrorToast) return;
      if (query.state.data !== undefined) return;
      // No component waits on it: the caller of `fetchQuery` gets the rejection.
      if (query.getObserversCount() === 0) return;
      if (QUIET_KEYS.includes(query.queryKey[0])) return;
      if (error instanceof ApiError && HANDLED_STATUSES.includes(error.status)) return;
      notify(error);
    },
  });
}

export function toastFailedRead(error: unknown, fallback: string) {
  // Any other error carries the browser's text ("Failed to fetch"), not one for the user.
  const message = error instanceof ApiError ? error.message : fallback;
  // One id, so several failed reads show one toast.
  toast.error(message, { id: 'failed-read' });
}

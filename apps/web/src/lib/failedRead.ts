import { QueryCache } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/core/client';

// Fork-owned, so `providers.tsx` differs from upstream by one option.

// First elements of the query keys whose every reader shows the error itself. A key
// shared with a reader that shows nothing stays out, so that reader's failure is toasted.
export const OWN_ERROR_UI: readonly unknown[] = [
  // The API answers 400 to a link it will not resolve, and the read runs on hover.
  'link-preview',
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
  // Shown in the shell's error banner.
  'boardIssues',
  'views',
];

// 401 signs the user out; a page renders its own state for 403 and 404.
const HANDLED_STATUSES = [401, 403, 404];

export function failedReadCache(notify: (error: unknown) => void): QueryCache {
  return new QueryCache({
    onError: (error, query) => {
      if (query.meta?.suppressErrorToast) return;
      if (query.state.data !== undefined) return;
      if (OWN_ERROR_UI.includes(query.queryKey[0])) return;
      if (error instanceof ApiError && HANDLED_STATUSES.includes(error.status)) return;
      notify(error);
    },
  });
}

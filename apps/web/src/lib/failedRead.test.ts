import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/core/client';
import { OWN_ERROR_UI, failedReadCache } from './failedRead';

function client() {
  const seen: unknown[] = [];
  const qc = new QueryClient({
    queryCache: failedReadCache((error) => seen.push(error)),
    defaultOptions: { queries: { retry: false } },
  });
  const fail = (queryKey: unknown[], error: unknown, meta?: Record<string, unknown>) =>
    qc.fetchQuery({ queryKey, meta, queryFn: () => Promise.reject(error) }).catch(() => {});
  return { qc, seen, fail };
}

describe('failedReadCache', () => {
  it('notifies once for a failed read that has nothing to show', async () => {
    const { seen, fail } = client();
    const down = new ApiError(500, 'down');
    await fail(['board'], down);
    assert.deepEqual(seen, [down]);
  });

  it('notifies for a network failure', async () => {
    const { seen, fail } = client();
    await fail(['board'], new TypeError('Failed to fetch'));
    assert.equal(seen.length, 1);
  });

  it('notifies once however many components read the query', async () => {
    const { qc, seen } = client();
    const options = {
      queryKey: ['board'],
      queryFn: () => Promise.reject(new ApiError(500, 'down')),
    };
    const stop = [new QueryObserver(qc, options), new QueryObserver(qc, options)].map((observer) =>
      observer.subscribe(() => {}),
    );
    await qc
      .getQueryCache()
      .find({ queryKey: ['board'] })!
      .promise?.catch(() => {});
    stop.forEach((unsubscribe) => unsubscribe());
    assert.equal(seen.length, 1);
  });

  it('keeps quiet when the page still shows earlier data', async () => {
    const { qc, seen, fail } = client();
    qc.setQueryData(['board'], []);
    await fail(['board'], new ApiError(500, 'down'));
    assert.deepEqual(seen, []);
  });

  for (const status of [401, 403, 404]) {
    it(`keeps quiet for a ${status}, which the page handles`, async () => {
      const { seen, fail } = client();
      await fail(['board'], new ApiError(status, 'no'));
      assert.deepEqual(seen, []);
    });
  }

  it('keeps quiet for a read that opted out', async () => {
    const { seen, fail } = client();
    await fail(['board'], new ApiError(500, 'down'), { suppressErrorToast: true });
    assert.deepEqual(seen, []);
  });

  it('keeps quiet for a read that shows its own error', async () => {
    const { seen, fail } = client();
    assert.ok(OWN_ERROR_UI.includes('link-preview'));
    await fail(
      ['link-preview', 'user', 'https://example.com'],
      new ApiError(400, 'The link could not be resolved'),
    );
    assert.deepEqual(seen, []);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/core/client';
import { failedReadCache, toastFailedRead } from './failedRead';

function client() {
  const seen: unknown[] = [];
  const qc = new QueryClient({
    queryCache: failedReadCache((error) => seen.push(error)),
    defaultOptions: { queries: { retry: false } },
  });
  const settled = (queryKey: unknown[]) =>
    qc
      .getQueryCache()
      .find({ queryKey })!
      .promise?.catch(() => {});
  // A read some component is waiting on.
  const fail = async (queryKey: unknown[], error: unknown, meta?: Record<string, unknown>) => {
    const options = { queryKey, meta, queryFn: () => Promise.reject(error) };
    const stop = new QueryObserver(qc, options).subscribe(() => {});
    await settled(queryKey);
    stop();
  };
  return { qc, seen, fail, settled };
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

  it('notifies for a 400 on an ordinary read', async () => {
    const { seen, fail } = client();
    await fail(['board'], new ApiError(400, 'bad'));
    assert.equal(seen.length, 1);
  });

  it('notifies once however many components read the query', async () => {
    const { qc, seen, settled } = client();
    const options = {
      queryKey: ['board'],
      queryFn: () => Promise.reject(new ApiError(500, 'down')),
    };
    const stop = [new QueryObserver(qc, options), new QueryObserver(qc, options)].map((observer) =>
      observer.subscribe(() => {}),
    );
    await settled(['board']);
    stop.forEach((unsubscribe) => unsubscribe());
    assert.equal(seen.length, 1);
  });

  it('keeps quiet when the page still shows earlier data', async () => {
    const { qc, seen, fail } = client();
    qc.setQueryData(['board'], null);
    await fail(['board'], new ApiError(500, 'down'));
    assert.deepEqual(seen, []);
  });

  it('keeps quiet for a read no component is waiting on', async () => {
    const { qc, seen } = client();
    await qc
      .fetchQuery({ queryKey: ['board'], queryFn: () => Promise.reject(new ApiError(500, 'down')) })
      .catch(() => {});
    assert.deepEqual(seen, []);
  });

  for (const status of [401, 403, 404]) {
    it(`keeps quiet for a ${status}, which is handled elsewhere`, async () => {
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

  it('keeps quiet for a quiet key, matched on its first element only', async () => {
    const { seen, fail } = client();
    await fail(
      ['link-preview', 'user', 'https://example.com'],
      new ApiError(400, 'The link could not be resolved'),
    );
    assert.deepEqual(seen, []);
    await fail(['board', 'link-preview'], new ApiError(500, 'down'));
    assert.equal(seen.length, 1);
  });
});

describe('toastFailedRead', () => {
  const shown = () =>
    toast
      .getToasts()
      .filter((item) => item.id === 'failed-read')
      .map((item) => 'title' in item && item.title);

  it('shows one toast for several failed reads', () => {
    toastFailedRead(new ApiError(500, 'Database is down'), 'Something went wrong');
    toastFailedRead(new ApiError(500, 'Search is down'), 'Something went wrong');
    assert.deepEqual(shown(), ['Search is down']);
  });

  it('shows the fallback for an error that is not from the API', () => {
    toastFailedRead(new TypeError('Failed to fetch'), 'Something went wrong');
    assert.deepEqual(shown(), ['Something went wrong']);
  });
});

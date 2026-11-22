import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

const tracked = Bun.spawnSync(['git', 'ls-files'], { cwd: ROOT }).stdout.toString().split('\n');
const members = tracked
  .filter((file) => /^(apps|packages)\/[^/]+\/package\.json$/.test(file))
  .map((file) => file.replace(/\/package\.json$/, ''));
const dockerfiles = tracked.filter((file) => /^apps\/[^/]+\/Dockerfile$/.test(file));

function copiedManifests(dockerfile: string): string[] {
  const text = readFileSync(join(ROOT, dockerfile), 'utf8');
  return [
    ...text.matchAll(
      /^COPY\s+(?:--\S+\s+)*(?:\.\/)?((?:apps|packages)\/[^/\s]+)\/package\.json\s/gm,
    ),
  ].map((match) => match[1]);
}

// Without its COPY line a member is missing from the install layer: the Docker build fails
// while local dev still works.
describe('Dockerfiles', () => {
  test('the workspace members and the Dockerfiles are found', () => {
    expect(members.length).toBeGreaterThan(0);
    expect(dockerfiles.length).toBeGreaterThan(0);
  });

  for (const dockerfile of dockerfiles) {
    test(`${dockerfile} copies every workspace package.json`, () => {
      const copied = copiedManifests(dockerfile);
      expect(members.filter((member) => !copied.includes(member))).toEqual([]);
    });
  }
});

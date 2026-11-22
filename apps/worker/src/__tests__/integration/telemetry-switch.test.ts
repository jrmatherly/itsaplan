import { afterEach, describe, expect, it } from 'bun:test';
import { appSetting, db, getSetting, setSetting } from '@repo/db';
import { eq } from 'drizzle-orm';
import { processTelemetry } from '../../telemetry';
import { utcDay } from '../../telemetry-schedule';

const INSTANCE_ID_KEY = 'telemetry.instance_id';
const LAST_SENT_KEY = 'telemetry.last_sent_day';

const saved = {
  TELEMETRY_DISABLED: process.env.TELEMETRY_DISABLED,
  DO_NOT_TRACK: process.env.DO_NOT_TRACK,
};

function setEnv(name: keyof typeof saved, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  setEnv('TELEMETRY_DISABLED', saved.TELEMETRY_DISABLED);
  setEnv('DO_NOT_TRACK', saved.DO_NOT_TRACK);
});

describe('processTelemetry', () => {
  // One test, in this order: the worker keeps its telemetry state in memory once it has
  // loaded it, so the off case has to run before the on case.
  it('creates no instance id while telemetry is off, and creates one once it is on', async () => {
    // Today counts as sent, so the on case stops before it builds or sends a snapshot.
    await setSetting(LAST_SENT_KEY, utcDay(new Date()));
    await db.delete(appSetting).where(eq(appSetting.key, INSTANCE_ID_KEY));

    setEnv('TELEMETRY_DISABLED', undefined);
    setEnv('DO_NOT_TRACK', undefined);
    await processTelemetry();
    expect(await getSetting(INSTANCE_ID_KEY)).toBeNull();

    setEnv('TELEMETRY_DISABLED', '0');
    await processTelemetry();
    expect(await getSetting<string>(INSTANCE_ID_KEY)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

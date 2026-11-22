import { describe, expect, it } from 'bun:test';
import {
  MINUTES_PER_DAY,
  minuteOfDay,
  randomSendMinute,
  shouldSend,
  telemetryEnabled,
  utcDay,
} from '../../telemetry-schedule';

describe('utcDay', () => {
  it('formats the UTC date', () => {
    expect(utcDay(new Date('2026-07-27T23:59:59Z'))).toBe('2026-07-27');
    expect(utcDay(new Date('2026-07-28T00:00:00Z'))).toBe('2026-07-28');
  });
});

describe('minuteOfDay', () => {
  it('counts minutes since midnight UTC', () => {
    expect(minuteOfDay(new Date('2026-07-27T00:00:00Z'))).toBe(0);
    expect(minuteOfDay(new Date('2026-07-27T13:37:00Z'))).toBe(817);
    expect(minuteOfDay(new Date('2026-07-27T23:59:59Z'))).toBe(MINUTES_PER_DAY - 1);
  });
});

describe('randomSendMinute', () => {
  it('stays inside the day', () => {
    for (let i = 0; i < 200; i++) {
      const minute = randomSendMinute();
      expect(minute).toBeGreaterThanOrEqual(0);
      expect(minute).toBeLessThan(MINUTES_PER_DAY);
      expect(Number.isInteger(minute)).toBe(true);
    }
  });
});

describe('shouldSend', () => {
  it('sends the very first pulse immediately, whatever the slot', () => {
    expect(
      shouldSend({ day: '2026-07-27', lastSentDay: null, minuteOfDay: 0, sendMinute: 1400 }),
    ).toBe(true);
  });

  it('does not send twice on the same day', () => {
    expect(
      shouldSend({
        day: '2026-07-27',
        lastSentDay: '2026-07-27',
        minuteOfDay: 1439,
        sendMinute: 10,
      }),
    ).toBe(false);
  });

  it('waits for the instance slot on later days', () => {
    const before = {
      day: '2026-07-28',
      lastSentDay: '2026-07-27',
      minuteOfDay: 599,
      sendMinute: 600,
    };
    expect(shouldSend(before)).toBe(false);
    expect(shouldSend({ ...before, minuteOfDay: 600 })).toBe(true);
    expect(shouldSend({ ...before, minuteOfDay: 1439 })).toBe(true);
  });

  it('still sends after a gap of several days once the slot passes', () => {
    expect(
      shouldSend({
        day: '2026-07-30',
        lastSentDay: '2026-07-20',
        minuteOfDay: 700,
        sendMinute: 600,
      }),
    ).toBe(true);
  });
});

describe('telemetryEnabled', () => {
  it('is off when nothing is set, and when both variables are empty', () => {
    expect(telemetryEnabled({})).toBe(false);
    expect(telemetryEnabled({ TELEMETRY_DISABLED: '', DO_NOT_TRACK: '' })).toBe(false);
  });

  it('is off for any value of TELEMETRY_DISABLED but 0', () => {
    expect(telemetryEnabled({ TELEMETRY_DISABLED: '1' })).toBe(false);
    expect(telemetryEnabled({ TELEMETRY_DISABLED: 'false' })).toBe(false);
    expect(telemetryEnabled({ TELEMETRY_DISABLED: ' 0' })).toBe(false);
    expect(telemetryEnabled({ TELEMETRY_DISABLED: '00' })).toBe(false);
  });

  it('is on only when TELEMETRY_DISABLED is 0', () => {
    expect(telemetryEnabled({ TELEMETRY_DISABLED: '0' })).toBe(true);
    expect(telemetryEnabled({ TELEMETRY_DISABLED: '0', DO_NOT_TRACK: '0' })).toBe(true);
    // The shape compose passes when an operator sets only TELEMETRY_DISABLED=0.
    expect(telemetryEnabled({ TELEMETRY_DISABLED: '0', DO_NOT_TRACK: '' })).toBe(true);
  });

  it('stays off when DO_NOT_TRACK is set, even with TELEMETRY_DISABLED=0', () => {
    expect(telemetryEnabled({ TELEMETRY_DISABLED: '0', DO_NOT_TRACK: '1' })).toBe(false);
    expect(telemetryEnabled({ TELEMETRY_DISABLED: '0', DO_NOT_TRACK: 'true' })).toBe(false);
    expect(telemetryEnabled({ TELEMETRY_DISABLED: '0', DO_NOT_TRACK: 'false' })).toBe(false);
  });
});

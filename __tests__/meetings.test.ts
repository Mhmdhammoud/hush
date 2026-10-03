jest.mock('react-native', () => ({ NativeModules: { HushCalendar: {} } }));

import { prepActions, PrepState } from '../src/useMeetingPrep';
import { Meeting } from '../src/calendar';

const T0 = Date.parse('2026-10-03T10:00:00Z');
const meeting = (p: Partial<Meeting> = {}): Meeting => ({
  id: 'e1',
  title: 'Standup',
  start: '2026-10-03T10:00:00Z',
  end: '2026-10-03T11:00:00Z',
  hasVideoLink: true,
  attendeeCount: 0,
  ...p,
});
const ok: PrepState = { connected: true, name: 'NC700', battery: 80, hoursRemaining: 10 };
const at = (min: number) => T0 + min * 60_000;

test('nothing outside the 5-minute lead window', () => {
  expect(prepActions(meeting(), at(-6), { ...ok, connected: false })).toEqual({ pull: false, warn: null });
  expect(prepActions(meeting(), at(60), { ...ok, connected: false })).toEqual({ pull: false, warn: null });
});

test('pulls the headset when it is elsewhere', () => {
  expect(prepActions(meeting(), at(-5), { ...ok, connected: false })).toEqual({ pull: true, warn: null });
  expect(prepActions(meeting(), at(-4), ok)).toEqual({ pull: false, warn: null });
});

test('ignores events that do not look like meetings', () => {
  expect(prepActions(meeting({ hasVideoLink: false }), at(-1), { ...ok, connected: false }).pull).toBe(false);
  expect(prepActions(meeting({ hasVideoLink: false, attendeeCount: 3 }), at(-1), { ...ok, connected: false }).pull).toBe(true);
});

test('warns when the estimate does not cover meeting + 15 min', () => {
  expect(prepActions(meeting(), at(-3), { ...ok, hoursRemaining: 1.2 }).warn).toBe(
    'NC700 has ~1.2h left, Standup runs 1h',
  );
  expect(prepActions(meeting(), at(-3), { ...ok, hoursRemaining: 1.25 }).warn).toBeNull();
});

test('falls back to <=20% when there is no estimate', () => {
  const s = { ...ok, hoursRemaining: null };
  expect(prepActions(meeting(), at(-3), { ...s, battery: 20 }).warn).toBe('NC700 has 20% left, Standup runs 1h');
  expect(prepActions(meeting(), at(-3), { ...s, battery: 21 }).warn).toBeNull();
  expect(prepActions(meeting(), at(-3), { ...s, battery: null }).warn).toBeNull();
});

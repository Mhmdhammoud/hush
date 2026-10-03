import { addSample, hoursLeft, formatHours, Sample } from '../src/battery';

const H = 3600_000;

test('estimates from the recent drain rate and resets on charge', () => {
  let s: Sample[] = [];
  s = addSample(s, { t: 0, pct: 80 });
  expect(hoursLeft(s)).toBeNull();
  s = addSample(s, { t: 1 * H, pct: 78 });
  expect(hoursLeft(s)).toBeNull(); // 2% drop is noise
  s = addSample(s, { t: 2 * H, pct: 76 }); // 4%/2h = 2%/h
  expect(hoursLeft(s)).toBeCloseTo(38);
  s = addSample(s, { t: 3 * H, pct: 95 }); // charged
  expect(s).toEqual([{ t: 3 * H, pct: 95 }]);
  expect(formatHours(6.33)).toBe('~6h 20m left');
  expect(formatHours(0.5)).toBe('~30m left');
});

import { addSample, hoursLeft, formatHours, Sample } from '../src/battery';

const H = 3600_000;

test('estimates from the recent drain rate and resets on charge', () => {
  let s: Sample[] = [];
  s = addSample(s, { t: 0, pct: 80 });
  expect(hoursLeft(s)).toBeNull();
  s = addSample(s, { t: 0.2 * H, pct: 70 });
  expect(hoursLeft(s)).toBeNull(); // one 10% step minutes apart: not a rate
  s = addSample(s, { t: 2 * H, pct: 60 }); // 20% over 2h = 10%/h
  expect(hoursLeft(s)).toBeCloseTo(6);
  s = addSample(s, { t: 3 * H, pct: 95 }); // charged
  expect(s).toEqual([{ t: 3 * H, pct: 95 }]);
  expect(formatHours(6.33)).toBe('~6h 20m left');
  expect(formatHours(0.5)).toBe('~30m left');
});

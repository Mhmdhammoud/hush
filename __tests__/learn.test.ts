import { predictDevice, suggestAppRule, AncEvent, SwitchEvent } from '../src/learn';

const ev = (app: string, level: number): AncEvent => ({ app, appName: app.split('.').pop()!, level, t: 0 });

test('suggests a rule once a habit is clear, and respects rules/dismissals', () => {
  const xcode = 'com.apple.dt.Xcode';
  expect(suggestAppRule([ev(xcode, 10), ev(xcode, 10)], {}, [])).toBeNull(); // too few
  const habit = [ev(xcode, 10), ev(xcode, 9), ev(xcode, 10), ev('com.spotify.client', 3)];
  expect(suggestAppRule(habit, {}, [])).toMatchObject({ app: xcode, anc: 10 });
  expect(suggestAppRule(habit, { [xcode]: { appName: 'Xcode', anc: 10 } }, [])).toBeNull();
  expect(suggestAppRule(habit, {}, [xcode])).toBeNull();
  // no clear habit: all over the place
  expect(suggestAppRule([ev(xcode, 0), ev(xcode, 5), ev(xcode, 10)], {}, [])).toBeNull();
});

test('predicts the usual device for this time of day', () => {
  const ipad = '665544332211';
  const iphone = 'a1b2c3d4e5f6';
  const at = (day: number, hour: number) => new Date(2026, 8, day, hour, 0).getTime(); // Sep 2026; 21,22,23 = Mon-Wed
  const log: SwitchEvent[] = [
    { mac: ipad, t: at(21, 21) },
    { mac: ipad, t: at(22, 20) },
    { mac: ipad, t: at(23, 21) },
    { mac: iphone, t: at(23, 9) },
  ];
  const tueEvening = new Date(2026, 8, 29, 21, 30);
  expect(predictDevice(log, tueEvening, [])).toBe(ipad);
  expect(predictDevice(log, tueEvening, [ipad])).toBeNull(); // already connected
  expect(predictDevice(log, new Date(2026, 8, 29, 9, 0), [])).toBeNull(); // only 1 morning switch
  expect(predictDevice(log, new Date(2026, 8, 27, 21, 0), [])).toBeNull(); // Sunday ≠ weekday habit
});

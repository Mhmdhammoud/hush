// Protocol checks against bytes captured from the real NC700 (fw 2.0.4).
declare const Buffer: { from(s: string, enc?: string): Uint8Array };
const sent: string[] = [];
let dataListener: (hex: string) => void = () => {};

jest.mock('react-native', () => ({
  NativeModules: { HushBluetooth: { send: (h: string) => sent.push(h), connect: jest.fn() } },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: (name: string, cb: (hex: string) => void) => {
      if (name === 'data') dataListener = cb;
      return { remove: () => {} };
    },
  })),
}));

import * as bmap from '../src/bmap';

test('reassembles frames split and batched across data events', () => {
  const frames: bmap.Frame[] = [];
  bmap.onFrame(f => frames.push(f));
  // battery reply split mid-frame, then batched with the ANC reply
  dataListener('020203');
  dataListener('0428ffff00' + '0105030' + '30b0a01');
  expect(frames).toEqual([
    { block: 2, fn: 2, op: 3, payload: [0x28, 0xff, 0xff, 0x00] },
    { block: 1, fn: 5, op: 3, payload: [0x0b, 0x0a, 0x01] },
  ]);
});

test('noise cancelling is inverted on the wire', () => {
  expect(bmap.parseAnc([0x0b, 0x0a, 0x01])).toEqual({ level: 0, enabled: true });
  sent.length = 0;
  bmap.setAnc(10);
  expect(sent).toEqual(['0105020200' + '01']);
});

test('EQ decodes signed values per band and encodes writes', () => {
  expect(bmap.parseEq([0xf6, 0x0a, 0x08, 0x00, 0xf6, 0x0a, 0xfd, 0x01, 0xf6, 0x0a, 0x00, 0x02])).toEqual({
    bass: 8,
    mid: -3,
    treble: 0,
  });
  sent.length = 0;
  bmap.setEq('mid', -3);
  expect(sent).toEqual(['01070202fd01']);
});

test('device info decodes status bits and UTF-8 names', () => {
  const mbp = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x00, 0x01, 0x03,
    ...Buffer.from('Alex’s MacBook Pro', 'utf8')];
  expect(bmap.parseDeviceInfo(mbp)).toEqual({ mac: '112233445566', name: 'Alex’s MacBook Pro', connected: false, isHost: false });
  const mini = [0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x03, 0x01, 0x01, ...Buffer.from('Mac mini')];
  expect(bmap.parseDeviceInfo(mini)).toMatchObject({ connected: true, isHost: true });
});

test('switching drops the other non-host connection first', () => {
  jest.useFakeTimers();
  sent.length = 0;
  bmap.switchTo('665544332211', [
    { mac: 'a1b2c3d4e5f6', name: 'iPhone', connected: true, isHost: false },
    { mac: '0a0b0c0d0e0f', name: 'Mac mini', connected: true, isHost: true },
  ]);
  expect(sent).toEqual(['04020506a1b2c3d4e5f6']);
  jest.runAllTimers();
  expect(sent[1]).toBe('040105070' + '0665544332211');
});

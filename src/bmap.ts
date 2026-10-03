import { NativeEventEmitter, NativeModules } from 'react-native';

// Bose BMAP frame: [block, fn, op, len, ...payload]. Protocol table: README.md.
export const Op = { GET: 1, SETGET: 2, STATUS: 3, ERROR: 4, START: 5, RESULT: 6, PROCESSING: 7 } as const;
export type Frame = { block: number; fn: number; op: number; payload: number[] };

const native = NativeModules.HushBluetooth;
const emitter = new NativeEventEmitter(native);

const hex = (bytes: number[]) => bytes.map(b => b.toString(16).padStart(2, '0')).join('');
const send = (block: number, fn: number, op: number, payload: number[] = []) =>
  native.send(hex([block, fn, op, payload.length, ...payload]));

export function connect(): Promise<{ name: string; address: string }> {
  return native.connect();
}

/** Subscribe to parsed frames. Data events can split or batch frames, so we buffer. */
export function onFrame(cb: (f: Frame) => void) {
  let buf: number[] = [];
  const sub = emitter.addListener('data', (h: string) => {
    for (let i = 0; i < h.length; i += 2) buf.push(parseInt(h.slice(i, i + 2), 16));
    while (buf.length >= 4 && buf.length >= 4 + buf[3]) {
      const [block, fn, op, len] = buf;
      cb({ block, fn, op: op & 0x0f, payload: buf.slice(4, 4 + len) });
      buf = buf.slice(4 + len);
    }
  });
  return () => sub.remove();
}

export function onClosed(cb: () => void) {
  const sub = emitter.addListener('closed', cb);
  return () => sub.remove();
}

// --- Product info: firmware 00 05 (ASCII).
export const getFirmware = () => send(0x00, 0x05, Op.GET);
export const parseText = (p: number[]) => String.fromCharCode(...p.filter(Boolean));

// --- Noise cancelling: block 01 fn 05, payload [steps, raw, enabled]. Raw is inverted: 0 = max.
export const ANC_STEPS = 11;
export const getAnc = () => send(0x01, 0x05, Op.GET);
export const setAnc = (level: number, enabled = true) =>
  send(0x01, 0x05, Op.SETGET, [ANC_STEPS - 1 - level, enabled ? 1 : 0]);
export const parseAnc = (p: number[]) => ({ level: p[0] - 1 - p[1], enabled: p[2] === 1 });

// --- Battery: block 02 fn 02, payload[0] = percent.
export const getBattery = () => send(0x02, 0x02, Op.GET);

// --- EQ: block 01 fn 07, groups of [min, max, current, band] (band 0 bass, 1 mid, 2 treble).
export const getEq = () => send(0x01, 0x07, Op.GET);
export const parseEq = (p: number[]) => {
  const s = (b: number) => (b > 127 ? b - 256 : b);
  const eq: Record<number, number> = {};
  for (let i = 0; i + 3 < p.length; i += 4) eq[p[i + 3]] = s(p[i + 2]);
  return { bass: eq[0] ?? 0, mid: eq[1] ?? 0, treble: eq[2] ?? 0 };
};

// --- Devices (block 04). 04 04 = paired list [?, mac*N]; 04 05 = info for one mac:
// [mac(6), status, ?, type, ...name]. status bit0 = connected, bit1 = this host (the Mac talking to it).
export type Device = { mac: string; name: string; connected: boolean; isHost: boolean };
const macBytes = (mac: string) => mac.match(/../g)!.map(b => parseInt(b, 16));
const macStr = (b: number[]) => hex(b);
const utf8 = (b: number[]) => decodeURIComponent(b.filter(Boolean).map(x => '%' + x.toString(16).padStart(2, '0')).join(''));

export const getPairedList = () => send(0x04, 0x04, Op.GET);
export const parsePairedList = (p: number[]) => {
  const macs: string[] = [];
  for (let i = 1; i + 6 <= p.length; i += 6) macs.push(macStr(p.slice(i, i + 6)));
  return macs;
};
export const getDeviceInfo = (mac: string) => send(0x04, 0x05, Op.GET, macBytes(mac));
export const parseDeviceInfo = (p: number[]): Device => ({
  mac: macStr(p.slice(0, 6)),
  connected: (p[6] & 1) === 1,
  isHost: (p[6] & 2) === 2,
  name: utf8(p.slice(9)) || 'Unknown device',
});
export const connectDevice = (mac: string) => send(0x04, 0x01, Op.START, [0x00, ...macBytes(mac)]);
export const disconnectDevice = (mac: string) => send(0x04, 0x02, Op.START, macBytes(mac));

/** NC700 holds 2 live connections. To bring `target` in, drop the other non-host device first. */
export function switchTo(target: string, devices: Device[]) {
  const live = devices.filter(d => d.connected);
  if (live.some(d => d.mac === target)) return;
  if (live.length >= 2) {
    const victim = live.find(d => !d.isHost) ?? live[0];
    disconnectDevice(victim.mac);
    setTimeout(() => connectDevice(target), 1500);
  } else {
    connectDevice(target);
  }
}

// --- EQ write: SETGET [value, band], value -10..+10 (two's complement). Band 0 bass, 1 mid, 2 treble.
export type EqBand = 'bass' | 'mid' | 'treble';
const BAND: Record<EqBand, number> = { bass: 0, mid: 1, treble: 2 };
export const setEq = (band: EqBand, value: number) => send(0x01, 0x07, Op.SETGET, [value & 0xff, BAND[band]]);

// --- Self voice (sidetone) block 01 fn 0b. GET -> [persist, mode, supportedMask]; SETGET [persist, mode].
// Wire modes: 0 off, 1 high, 2 medium, 3 low.
export type SelfVoice = 'off' | 'low' | 'medium' | 'high';
const SV_WIRE: Record<SelfVoice, number> = { off: 0, high: 1, medium: 2, low: 3 };
export const getSelfVoice = () => send(0x01, 0x0b, Op.GET);
export const setSelfVoice = (mode: SelfVoice) => send(0x01, 0x0b, Op.SETGET, [1, SV_WIRE[mode]]);
export const parseSelfVoice = (p: number[]): SelfVoice =>
  (Object.keys(SV_WIRE) as SelfVoice[]).find(k => SV_WIRE[k] === p[1]) ?? 'off';

/** Baseband-connect the headset to this Mac (when another device holds it). */
export const pullHeadset = (address: string): Promise<boolean> => native.pullHeadset(address);

// --- Settings verified on NC700 fw 2.0.4 (see SETTINGS notes). Some SETGETs never reply, so
// every write is followed by a GET read-back.
const setting = (fn: number, payload: number[]) => {
  send(0x01, fn, Op.SETGET, payload);
  setTimeout(() => send(0x01, fn, Op.GET), 400);
};
const get1 = (fn: number) => () => send(0x01, fn, Op.GET);

/** Auto-off minutes, 0 = never. */
export const getAutoOff = get1(0x04);
export const setAutoOff = (minutes: number) => setting(0x04, [minutes & 0xff]);

/** Voice prompts: byte0 = (on << 5) | language; we only toggle and keep the language. */
export const getVoicePrompts = get1(0x03);
export const parseVoicePrompts = (p: number[]) => ({ on: (p[0] & 0x20) !== 0, lang: p[0] & 0x1f });
export const setVoicePrompts = (on: boolean, lang: number) => setting(0x03, [(on ? 0x20 : 0) | (lang & 0x1f)]);

/** Multipoint: GET bit0 = enabled (bit1 = supported). */
export const getMultipoint = get1(0x0a);
export const setMultipoint = (on: boolean) => setting(0x0a, [on ? 1 : 0]);

/** Shortcut (action) button hold: 3 battery level, 16 Spotify Tap. */
export type ShortcutAction = 'battery' | 'spotify';
const SHORTCUT: Record<ShortcutAction, number> = { battery: 3, spotify: 16 };
export const getShortcut = get1(0x09);
export const parseShortcut = (p: number[]): ShortcutAction | null =>
  (Object.keys(SHORTCUT) as ShortcutAction[]).find(k => SHORTCUT[k] === p[2]) ?? null;
export const setShortcut = (a: ShortcutAction) => setting(0x09, [0x80, 0x05, SHORTCUT[a]]);

/** Name: GET payload has a leading 00 flag; SETGET takes raw UTF-8. */
export const getName = get1(0x02);
export const parseName = (p: number[]) => decodeURIComponent(p.slice(1).map(x => '%' + x.toString(16).padStart(2, '0')).join(''));
export const setName = (name: string) =>
  setting(0x02, Array.from(unescape(encodeURIComponent(name.slice(0, 30)))).map(c => c.charCodeAt(0)));

/** Conversation mode: on forces full transparency; off restores the previous ANC level. */
export const getConversation = get1(0x0d);
export const setConversation = (on: boolean) => {
  setting(0x0d, [on ? 1 : 0]);
  setTimeout(getAnc, 700);
};

/** ANC button presets: [index, raw0, raw1, raw2], raw inverted like 01 05. Writing applies preset[index] live. */
export const getAncPresets = get1(0x0f);
export const parseAncPresets = (p: number[]) => ({ index: p[0], levels: [p[1], p[2], p[3]].map(r => ANC_STEPS - 1 - r) });
export const setAncPresets = (index: number, levels: number[]) => {
  setting(0x0f, [index, ...levels.map(l => ANC_STEPS - 1 - l)]);
  setTimeout(getAnc, 700);
};

/** Pairing list management (block 04, START). */
export const forgetDevice = (mac: string) => send(0x04, 0x03, Op.START, macBytes(mac));
export const enterPairingMode = () => send(0x04, 0x08, Op.START, [0x01]);

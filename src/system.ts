import { NativeEventEmitter, NativeModules } from 'react-native';

const native = NativeModules.HushSystem;
const emitter = new NativeEventEmitter(native);

export const launchAtLogin = (): Promise<boolean> => native.launchAtLogin();
export const setLaunchAtLogin = (on: boolean): Promise<boolean> => native.setLaunchAtLogin(on);
export const notify = (title: string, body: string) => native.notify(title, body);
export const setMenuState = (s: `anc:${number}` | 'disconnected') => native.setMenuState(s);
export const quit = () => native.quit();
export const haptic = () => native.haptic();

export function onHotkey(cb: (action: string) => void) {
  const sub = emitter.addListener('hotkey', cb);
  return () => sub.remove();
}

/** True while any app is capturing from the default microphone (a call). */
export const micInUse = (): Promise<boolean> => native.micInUse();
export function onMic(cb: (inUse: boolean) => void) {
  const sub = emitter.addListener('mic', cb);
  return () => sub.remove();
}

/** Tiny persisted prefs (UserDefaults), JSON-encoded. */
export async function getPref<T>(key: string, fallback: T): Promise<T> {
  const raw: string | null = await native.getPref(key);
  return raw == null ? fallback : (JSON.parse(raw) as T);
}
export const setPref = (key: string, value: unknown) => native.setPref(key, JSON.stringify(value));

export type Wheel = { dy: number; precise: boolean };
export function onWheel(cb: (w: Wheel) => void) {
  const sub = emitter.addListener('wheel', cb);
  return () => sub.remove();
}

export function onCommand(cb: (url: string) => void) {
  const sub = emitter.addListener('command', cb);
  return () => sub.remove();
}
export const publishState = (state: unknown) => native.publishState(JSON.stringify(state));

export function onUnlock(cb: () => void) {
  const sub = emitter.addListener('unlock', cb);
  return () => sub.remove();
}

export type FrontApp = { bundleId: string; name: string };
export function onFrontApp(cb: (app: FrontApp) => void) {
  const sub = emitter.addListener('frontApp', cb);
  return () => sub.remove();
}

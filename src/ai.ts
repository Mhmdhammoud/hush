import { NativeModules } from 'react-native';

const native = NativeModules.HushAI;

/** Same allow-list as HushAI.swift. The native side already filters; this is the JS-side guard. */
const ALLOWED =
  /^(anc\/(10|[0-9]|up|down)|eq\/(bass|mid|treble)\/-?(10|[0-9])|eq\/flat|selfvoice\/(off|low|medium|high)|switch\/[^/%]{1,40}|callmode\/(on|off)|conversation\/(on|off))$/;

export const validCommands = (cmds: unknown): string[] =>
  Array.isArray(cmds) ? cmds.filter((c): c is string => typeof c === 'string').map(c => c.trim()).filter(c => ALLOWED.test(c)) : [];

/** hush:// URL for a command; segments are encoded because runCommand decodes them. */
export const toUrl = (cmd: string) => 'hush://' + cmd.split('/').map(encodeURIComponent).join('/');

/** Only what the model needs to resolve relative requests ("quieter", "more bass"). */
export function promptState(s: any): string {
  return JSON.stringify({
    anc: s?.anc?.level ?? null,
    eq: s?.eq ?? null,
    selfVoice: s?.selfVoice ?? null,
    conversation: s?.conversation ?? null,
    callMode: s?.callMode ?? null,
    devices: (s?.devices ?? []).map((d: { name: string; connected: boolean }) => ({ name: d.name, connected: d.connected })),
  });
}

export type Availability = { available: boolean; reason?: string };
export const available = (): Promise<Availability> =>
  native ? native.available() : Promise.resolve({ available: false, reason: 'no native module' });

export async function interpret(text: string, state: object): Promise<{ commands: string[]; summary: string }> {
  const r = await native.interpret(text, promptState(state));
  return { commands: validCommands(r?.commands), summary: String(r?.summary ?? '') };
}

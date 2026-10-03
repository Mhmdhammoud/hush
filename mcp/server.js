#!/usr/bin/env node
// Hush MCP server: exposes the Bose NC700 (via the Hush app's bin/hush CLI) to AI agents over stdio.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const run = promisify(execFile);
const CLI = process.env.HUSH_CLI || fileURLToPath(new URL('../bin/hush', import.meta.url));
// The app applies hush:// commands asynchronously; give it time before confirming.
const SETTLE_MS = Number(process.env.HUSH_SETTLE_MS ?? 1500);

const hush = async (...args) => (await run(CLI, args, { timeout: 20000 })).stdout;
const readStatus = async () => JSON.parse(await hush('status', '--json'));

function summary(s) {
  if (s.status !== 'connected') return `Headphones ${s.status}${s.error ? ` (${s.error})` : ''}`;
  const { anc = {}, eq = {} } = s;
  const devices = (s.devices || [])
    .map(d => `${d.name}${d.connected ? ' [connected]' : ''}${d.isHost ? ' (this Mac)' : ''}`)
    .join(', ');
  return [
    `${s.name}: battery ${s.battery}%${s.hoursRemaining != null ? ` (~${s.hoursRemaining}h left)` : ''}, firmware ${s.firmware}`,
    `Noise cancelling ${anc.level}/10, self voice ${s.selfVoice}, call mode ${s.callMode ? 'on' : 'off'}${s.inCall ? ' (in a call)' : ''}`,
    `EQ bass ${eq.bass}, mid ${eq.mid}, treble ${eq.treble}`,
    `Devices: ${devices || 'none'}`,
  ].join('\n');
}

const result = (text, s, isError = false) => ({
  content: [{ type: 'text', text }],
  structuredContent: s,
  ...(isError && { isError: true }),
});
const fail = text => ({ content: [{ type: 'text', text }], isError: true });

// Send a write command, wait, re-read, and report whether the change was confirmed.
async function write(args, confirmed, describe) {
  const before = await readStatus();
  if (before.status !== 'connected') return result(`Cannot change settings: ${summary(before)}`, before, true);
  await hush(...args);
  await new Promise(r => setTimeout(r, SETTLE_MS));
  const after = await readStatus();
  const ok = confirmed(after, before);
  const text = ok
    ? `Confirmed: ${describe(after)}.`
    : `Sent \`hush ${args.join(' ')}\` but the headphones did not report the change yet (now: ${describe(after)}). It may still be applying; check get_headphones_status.`;
  return result(`${text}\n\n${summary(after)}`, after, !ok);
}

const server = new McpServer({ name: 'hush', version: '0.1.0' });

server.registerTool(
  'get_headphones_status',
  {
    description:
      "Read the current state of the user's Bose NC700 headphones: connection, battery, noise cancelling level, EQ, self voice, call mode and paired devices. Use before changing anything or when asked about the headphones.",
    inputSchema: {},
  },
  async () => {
    const s = await readStatus();
    return result(summary(s), s);
  },
);

server.registerTool(
  'set_noise_cancelling',
  {
    description:
      'Set noise cancelling on the headphones. 10 = maximum (use for focus, deep work, flights, noisy places), 0 = off/most transparent (use to hear surroundings or talk to someone). "up"/"down" nudge it one step.',
    inputSchema: {
      level: z.union([z.number().int().min(0).max(10), z.enum(['up', 'down'])]).describe('0-10, or "up" / "down"'),
    },
  },
  ({ level }) =>
    write(
      ['anc', String(level)],
      (a, b) => (typeof level === 'number' ? a.anc?.level === level : a.anc?.level !== b.anc?.level),
      a => `noise cancelling ${a.anc?.level}/10`,
    ),
);

const band = z.number().int().min(-10).max(10);
server.registerTool(
  'set_eq',
  {
    description:
      'Adjust the headphone equalizer. Give any of bass/mid/treble (-10..10, 0 = neutral), or preset "flat" to reset all to 0. E.g. more bass for music, more treble/mid for podcasts and voice.',
    inputSchema: {
      bass: band.optional(),
      mid: band.optional(),
      treble: band.optional(),
      preset: z.literal('flat').optional().describe('"flat" resets bass, mid and treble to 0'),
    },
  },
  async ({ preset, ...bands }) => {
    const set = Object.entries(bands).filter(([, v]) => v !== undefined);
    if (preset && set.length) return fail('Give either preset or bass/mid/treble, not both.');
    if (!preset && !set.length) return fail('Give at least one of bass, mid, treble, or preset "flat".');
    const want = preset ? { bass: 0, mid: 0, treble: 0 } : Object.fromEntries(set);
    const describe = a => `EQ bass ${a.eq?.bass}, mid ${a.eq?.mid}, treble ${a.eq?.treble}`;
    const confirmed = a => Object.entries(want).every(([k, v]) => a.eq?.[k] === v);
    if (preset) return write(['eq', 'flat'], confirmed, describe);
    // One CLI call per band; confirm all at the end.
    for (const [k, v] of set.slice(0, -1)) await hush('eq', k, String(v));
    const [k, v] = set.at(-1);
    return write(['eq', k, String(v)], confirmed, describe);
  },
);

server.registerTool(
  'set_self_voice',
  {
    description:
      'Set self voice (how much of your own voice you hear during calls): off, low, medium or high. Raise it if the user says they sound muffled or are shouting on calls.',
    inputSchema: { mode: z.enum(['off', 'low', 'medium', 'high']) },
  },
  ({ mode }) => write(['selfvoice', mode], a => a.selfVoice === mode, a => `self voice ${a.selfVoice}`),
);

server.registerTool(
  'switch_headphones',
  {
    description:
      'Switch the headphones to another paired device (e.g. "iPhone", "iPad", "MacBook"). Matches device names case-insensitively, partial names allowed. Use when the user wants to listen on a different device.',
    inputSchema: { device: z.string().min(1).describe('Device name or part of it') },
  },
  async ({ device }) => {
    const s = await readStatus();
    const devices = s.devices || [];
    const q = device.toLowerCase();
    const match =
      devices.find(d => d.name.toLowerCase() === q) || devices.find(d => d.name.toLowerCase().includes(q));
    if (!match)
      return fail(`No paired device matches "${device}". Available: ${devices.map(d => d.name).join(', ') || 'none'}.`);
    return write(
      // bin/hush puts args into a hush:// URL unencoded and the app decodes them; encode so spaces survive.
      ['switch', encodeURIComponent(match.name)],
      a => a.devices?.some(d => d.mac === match.mac && d.connected),
      a => `${match.name} ${a.devices?.find(d => d.mac === match.mac)?.connected ? 'connected' : 'not connected'}`,
    );
  },
);

server.registerTool(
  'set_call_mode',
  {
    description:
      'Turn call mode on or off. Call mode tunes the headphones for calls (mic and self voice). Turn on before a meeting or call, off afterwards for music.',
    inputSchema: { on: z.boolean() },
  },
  ({ on }) =>
    write(['callmode', on ? 'on' : 'off'], a => !!a.callMode === on, a => `call mode ${a.callMode ? 'on' : 'off'}`),
);

await server.connect(new StdioServerTransport());

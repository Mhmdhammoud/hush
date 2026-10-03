// Smoke test: runs server.js against fake-hush.js over stdio and calls every tool through the SDK client.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [here('./server.js')],
  env: {
    ...process.env,
    HUSH_CLI: here('./fake-hush.js'),
    HUSH_FAKE_STATE: join(mkdtempSync(join(tmpdir(), 'hush-')), 'state.json'),
    HUSH_SETTLE_MS: '50',
  },
});
const client = new Client({ name: 'smoke', version: '0' });
await client.connect(transport);

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  console.log(`--- ${name} ${JSON.stringify(args)}${r.isError ? ' [error]' : ''}\n${r.content[0].text}\n`);
  return r;
};

const tools = (await client.listTools()).tools.map(t => t.name).sort();
assert.deepEqual(tools, ['get_headphones_status', 'set_call_mode', 'set_eq', 'set_noise_cancelling', 'set_self_voice', 'switch_headphones']);

let r = await call('get_headphones_status');
assert.equal(r.structuredContent.anc.level, 5);

r = await call('set_noise_cancelling', { level: 10 });
assert.ok(!r.isError && r.structuredContent.anc.level === 10 && r.content[0].text.startsWith('Confirmed'));
r = await call('set_noise_cancelling', { level: 'down' });
assert.equal(r.structuredContent.anc.level, 9);
r = await call('set_noise_cancelling', { level: 11 });
assert.ok(r.isError, 'out-of-range level rejected');

r = await call('set_eq', { bass: 4, treble: -2 });
assert.deepEqual(r.structuredContent.eq, { bass: 4, mid: 0, treble: -2 });
r = await call('set_eq', { preset: 'flat' });
assert.deepEqual(r.structuredContent.eq, { bass: 0, mid: 0, treble: 0 });
assert.ok((await call('set_eq', {})).isError);

r = await call('set_self_voice', { mode: 'high' });
assert.equal(r.structuredContent.selfVoice, 'high');

r = await call('switch_headphones', { device: 'iphone' });
assert.ok(!r.isError && r.structuredContent.devices.find(d => d.mac === 'bb').connected, 'name with space+apostrophe');
r = await call('switch_headphones', { device: 'ipad' });
assert.ok(!r.isError && r.structuredContent.devices.find(d => d.name === 'iPad').connected);
r = await call('switch_headphones', { device: 'pixel' });
assert.ok(r.isError && r.content[0].text.includes("Alex's iPhone"), 'lists available devices');
r = await call('switch_headphones', { device: 'broken' });
assert.ok(r.isError && r.content[0].text.includes('did not report the change'), 'reports unconfirmed write');

r = await call('set_call_mode', { on: true });
assert.equal(r.structuredContent.callMode, true);

await client.close();
console.log('smoke test passed');

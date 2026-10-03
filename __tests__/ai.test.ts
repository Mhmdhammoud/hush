const mockInterpret = jest.fn();
jest.mock('react-native', () => ({ NativeModules: { HushAI: { interpret: (...a: unknown[]) => mockInterpret(...a) } } }));

import * as ai from '../src/ai';

test('allow-list keeps valid commands and drops everything else', () => {
  const good = ['anc/0', 'anc/10', 'anc/up', 'eq/bass/-10', 'eq/treble/3', 'eq/flat', 'selfvoice/low',
    'switch/Mo\'s iPad', 'callmode/on', 'conversation/off'];
  const bad = ['anc/11', 'anc/-1', 'anc/cycle', 'eq/bass/11', 'eq/bass/+3', 'eq/volume/2', 'selfvoice/max',
    'switch/', 'switch/a/b', 'switch/%2e%2e', 'callmode/yes', 'order/pizza', 'anc/5; rm -rf', 'hush://anc/5', 42, null];
  expect(ai.validCommands([...good, ...bad])).toEqual(good);
  expect(ai.validCommands([' anc/7 '])).toEqual(['anc/7']);
  expect(ai.validCommands('anc/5')).toEqual([]);
});

test('switch names are URL-encoded so runCommand decodes them back', () => {
  expect(ai.toUrl("switch/Alex's iPad")).toBe("hush://switch/Alex's%20iPad");
  expect(decodeURIComponent(ai.toUrl("switch/Alex's iPad").split('/')[3])).toBe("Alex's iPad");
});

test('interpret sends a compact state and filters native output', async () => {
  mockInterpret.mockResolvedValue({ commands: ['anc/7', 'volume/11'], summary: 'Noise cancelling 7' });
  const r = await ai.interpret('quieter', {
    status: 'connected', anc: { level: 5, enabled: true }, eq: { bass: 0, mid: 0, treble: 0 }, selfVoice: 'off',
    devices: [{ mac: 'aa', name: 'iPad', connected: false, isHost: false }],
  });
  expect(r).toEqual({ commands: ['anc/7'], summary: 'Noise cancelling 7' });
  expect(JSON.parse(mockInterpret.mock.calls[0][1])).toEqual({
    anc: 5, eq: { bass: 0, mid: 0, treble: 0 }, selfVoice: 'off', conversation: null, callMode: null,
    devices: [{ name: 'iPad', connected: false }],
  });
});

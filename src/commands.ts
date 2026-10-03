import * as bmap from './bmap';
import type { Headset } from './useHeadset';

const ANC_CYCLE = [0, 5, 10];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * hush://anc/10 | anc/up | anc/down | anc/cycle
 * hush://eq/bass/-3 | eq/flat
 * hush://selfvoice/off|low|medium|high
 * hush://switch/<device name substring>
 * hush://callmode/on|off
 * hush://conversation/on|off
 * Returns an error string for bad input, null on success.
 */
export function runCommand(url: string, h: Headset, setCallMode: (on: boolean) => void): string | null {
  const [cmd, a, b] = url.replace(/^hush:\/\//, '').split('/').map(decodeURIComponent);
  const anc = h.anc?.level ?? 0;
  switch (cmd) {
    case 'anc': {
      const next =
        a === 'up' ? anc + 1 :
        a === 'down' ? anc - 1 :
        a === 'cycle' ? ANC_CYCLE.find(v => v > anc) ?? ANC_CYCLE[0] :
        Number(a);
      if (Number.isNaN(next)) return `bad anc value: ${a}`;
      bmap.setAnc(clamp(next, 0, bmap.ANC_STEPS - 1));
      return null;
    }
    case 'eq': {
      if (a === 'flat') {
        (['bass', 'mid', 'treble'] as bmap.EqBand[]).forEach(band => bmap.setEq(band, 0));
        return null;
      }
      if (!['bass', 'mid', 'treble'].includes(a) || Number.isNaN(Number(b))) return `bad eq: ${a}/${b}`;
      bmap.setEq(a as bmap.EqBand, clamp(Number(b), -10, 10));
      return null;
    }
    case 'selfvoice':
      if (!['off', 'low', 'medium', 'high'].includes(a)) return `bad selfvoice: ${a}`;
      bmap.setSelfVoice(a as bmap.SelfVoice);
      return null;
    case 'switch': {
      const d = h.devices.find(x => x.name.toLowerCase().includes((a ?? '').toLowerCase()));
      if (!d) return `no paired device matching "${a}"`;
      bmap.switchTo(d.mac, h.devices);
      return null;
    }
    case 'callmode':
      setCallMode(a === 'on');
      return null;
    case 'conversation':
      bmap.setConversation(a === 'on');
      return null;
    default:
      return `unknown command: ${cmd}`;
  }
}

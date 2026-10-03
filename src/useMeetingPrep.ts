import { useEffect, useRef } from 'react';
import { Meeting, upcomingMeetings } from './calendar';

const LEAD_MS = 5 * 60_000;
const MARGIN_H = 0.25; // battery must outlast the meeting by 15 min
const LOW_BATTERY = 20;
const POLL_MS = 60_000;

export type PrepState = {
  connected: boolean;
  name: string | null;
  battery: number | null;
  hoursRemaining: number | null;
};

const fmtH = (h: number) => (h >= 1 ? `${Math.round(h * 10) / 10}h` : `${Math.round(h * 60)}m`);

/** What to do for one meeting right now. Pure; the hook dedupes per event. */
export function prepActions(m: Meeting, now: number, s: PrepState): { pull: boolean; warn: string | null } {
  const start = Date.parse(m.start);
  const end = Date.parse(m.end);
  const due = now >= start - LEAD_MS && now < end;
  if (!due || (m.attendeeCount === 0 && !m.hasVideoLink)) return { pull: false, warn: null };

  const durH = (end - start) / 3600_000;
  let warn: string | null = null;
  if (s.connected) {
    const low = s.hoursRemaining != null ? s.hoursRemaining < durH + MARGIN_H : s.battery != null && s.battery <= LOW_BATTERY;
    if (low) {
      const left = s.hoursRemaining != null ? `~${fmtH(s.hoursRemaining)}` : `${s.battery}%`;
      warn = `${s.name ?? 'Your headphones'} has ${left} left, ${m.title} runs ${fmtH(durH)}`;
    }
  }
  return { pull: !s.connected, warn };
}

export function useMeetingPrep(opts: PrepState & {
  enabled: boolean;
  pull: () => void;
  notify: (title: string, body: string) => void;
}) {
  const live = useRef(opts);
  live.current = opts;
  const pulled = useRef(new Set<string>());
  const warned = useRef(new Set<string>());

  useEffect(() => {
    if (!opts.enabled) return;
    let alive = true;
    const tick = async () => {
      const meetings = await upcomingMeetings(10).catch(() => [] as Meeting[]);
      if (!alive) return;
      const o = live.current;
      for (const m of meetings) {
        const a = prepActions(m, Date.now(), o);
        if (a.pull && !pulled.current.has(m.id)) {
          pulled.current.add(m.id);
          o.pull();
        }
        if (a.warn && !warned.current.has(m.id)) {
          warned.current.add(m.id);
          o.notify('Charge your headphones', a.warn);
        }
      }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [opts.enabled]);
}

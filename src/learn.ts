// Local pattern learning: no network, no model. Two kinds of suggestions:
//  - per-app noise-cancelling rules ("you always pick 10 in Xcode")
//  - device prediction ("you usually switch to the iPad around this time")

export type AncEvent = { app: string; appName: string; level: number; t: number };
export type SwitchEvent = { mac: string; t: number };
export type AppRule = { appName: string; anc: number };
export type AppRules = Record<string, AppRule>;

const MAX_EVENTS = 300;
export const remember = <T>(log: T[], e: T): T[] => [...log, e].slice(-MAX_EVENTS);

/**
 * Suggest a rule for the app with the clearest habit: at least 3 manual changes there, 80% of them
 * landing within ±1 of the same level. Skips apps that already have a rule or were dismissed.
 */
export function suggestAppRule(
  events: AncEvent[],
  rules: AppRules,
  dismissed: string[],
): { app: string; appName: string; anc: number } | null {
  const byApp = new Map<string, AncEvent[]>();
  for (const e of events) {
    if (rules[e.app] || dismissed.includes(e.app)) continue;
    byApp.set(e.app, [...(byApp.get(e.app) ?? []), e]);
  }
  let best: { app: string; appName: string; anc: number; support: number } | null = null;
  for (const [app, es] of byApp) {
    if (es.length < 3) continue;
    const recent = es.slice(-10);
    for (const candidate of new Set(recent.map(e => e.level))) {
      const support = recent.filter(e => Math.abs(e.level - candidate) <= 1).length / recent.length;
      if (support >= 0.8 && (!best || support > best.support)) {
        best = { app, appName: recent[recent.length - 1].appName, anc: candidate, support };
      }
    }
  }
  return best && { app: best.app, appName: best.appName, anc: best.anc };
}

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

/**
 * Which device the user usually switches to at this time: same weekday/weekend kind, within ±1h
 * of now, at least 3 such switches and a 60% majority. Excludes devices already connected.
 */
export function predictDevice(log: SwitchEvent[], now: Date, connected: string[]): string | null {
  const hour = now.getHours();
  const near = log.filter(e => {
    const d = new Date(e.t);
    const dh = Math.abs(d.getHours() - hour);
    return isWeekend(d) === isWeekend(now) && Math.min(dh, 24 - dh) <= 1;
  });
  if (near.length < 3) return null;
  const counts = new Map<string, number>();
  near.forEach(e => counts.set(e.mac, (counts.get(e.mac) ?? 0) + 1));
  const [mac, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return n / near.length >= 0.6 && !connected.includes(mac) ? mac : null;
}

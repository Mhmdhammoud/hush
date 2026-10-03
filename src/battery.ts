export type Sample = { t: number; pct: number }; // t = epoch ms

const WINDOW_MS = 4 * 3600_000;
const MIN_DROP = 3; // % — below this the rate is noise

/** Append a reading; a jump up means it was charged, so start over. */
export function addSample(samples: Sample[], s: Sample): Sample[] {
  const last = samples[samples.length - 1];
  if (last && s.pct > last.pct + 1) return [s];
  if (last && s.pct === last.pct) return samples; // keep the first time we saw this level
  return [...samples, s].filter(x => s.t - x.t <= WINDOW_MS);
}

/** Hours left at the recent drain rate, or null until there's enough signal. */
export function hoursLeft(samples: Sample[]): number | null {
  if (samples.length < 2) return null;
  const a = samples[0];
  const b = samples[samples.length - 1];
  const drop = a.pct - b.pct;
  if (drop < MIN_DROP) return null;
  const perHour = drop / ((b.t - a.t) / 3600_000);
  return b.pct / perHour;
}

export const formatHours = (h: number) =>
  h >= 1 ? `~${Math.floor(h)}h ${Math.round((h % 1) * 60)}m left` : `~${Math.round(h * 60)}m left`;

// Opening-hours handling for OSM `opening_hours` values. The full OSM grammar
// is huge; this covers the common shapes ("24/7", "Mo-Su 07:00-22:00",
// "Mo-Fr 08:00-12:00,13:00-18:00; Sa 09:00-14:00; Su off", overnight
// "20:00-02:00") and is deliberately conservative: anything it doesn't fully
// understand yields no status, and the UI falls back to showing the raw text.

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']; // index = JS getDay()

interface Rule {
  days: Set<number>;
  off: boolean;
  ranges: Array<{ s: number; e: number }>; // minutes since midnight; e<=s wraps past midnight
}

function parseDays(part: string): Set<number> | null {
  const days = new Set<number>();
  for (const tok of part.split(',')) {
    const m = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(tok.trim());
    if (!m) return null;
    const a = DAYS.indexOf(m[1]);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    for (let d = a; ; d = (d + 1) % 7) {
      days.add(d);
      if (d === b) break;
    }
  }
  return days;
}

function parseRules(spec: string): Rule[] | null {
  const rules: Rule[] = [];
  for (const rawRule of spec.split(';')) {
    const rule = rawRule.trim();
    if (!rule) continue;
    // Holiday rules are noise for a road trip — ignore them rather than bail.
    if (/^(PH|SH)\b/.test(rule)) continue;
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/.exec(
      rule,
    );
    if (!m) return null;
    const days = m[1] ? parseDays(m[1]) : new Set([0, 1, 2, 3, 4, 5, 6]);
    if (!days) return null;
    const rest = (m[2] ?? '').trim();
    if (/^(off|closed)$/i.test(rest)) {
      rules.push({ days, off: true, ranges: [] });
      continue;
    }
    if (!/^\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:\s*,\s*\d{1,2}:\d{2}-\d{1,2}:\d{2})*$/.test(rest)) return null;
    const ranges = rest.split(',').map((r) => {
      const [a, b] = r.trim().split('-');
      const toMin = (t: string) => {
        const [h, mm] = t.split(':').map(Number);
        return h * 60 + mm;
      };
      return { s: toMin(a), e: toMin(b) };
    });
    rules.push({ days, off: false, ranges });
  }
  return rules.length ? rules : null;
}

const fmtMin = (min: number) => {
  const d = new Date();
  d.setHours(Math.floor((min % 1440) / 60), min % 60, 0, 0);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export interface HoursStatus {
  open: boolean;
  // When open: closing time; when closed: next opening ("09:00" or "Tue 09:00").
  until?: string;
  opensAt?: string;
}

export function hoursStatus(spec: string | undefined, now: Date = new Date()): HoursStatus | null {
  if (!spec) return null;
  if (spec.trim() === '24/7') return { open: true };
  const rules = parseRules(spec.trim());
  if (!rules) return null;
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const openOn = (d: number) => (rules.some((r) => r.days.has(d) && r.off) ? [] : rules.filter((r) => r.days.has(d) && !r.off).flatMap((r) => r.ranges));

  // Open right now? Today's ranges, plus yesterday's overnight tails.
  for (const { s, e } of openOn(day)) {
    if (e > s ? mins >= s && mins < e : mins >= s) return { open: true, until: fmtMin(e) };
  }
  for (const { s, e } of openOn((day + 6) % 7)) {
    if (e <= s && mins < e) return { open: true, until: fmtMin(e) };
  }
  // Closed — find the next opening within a week.
  const today = openOn(day)
    .filter(({ s }) => s > mins)
    .sort((a, b) => a.s - b.s)[0];
  if (today) return { open: false, opensAt: fmtMin(today.s) };
  for (let ahead = 1; ahead <= 7; ahead++) {
    const d = (day + ahead) % 7;
    const first = openOn(d).sort((a, b) => a.s - b.s)[0];
    if (first) {
      const label = new Date(now.getTime() + ahead * 86_400_000).toLocaleDateString([], { weekday: 'short' });
      return { open: false, opensAt: `${label} ${fmtMin(first.s)}` };
    }
  }
  return null;
}

// Friendlier raw display: expand the two-letter day codes.
const DAY_NAMES: Record<string, string> = { Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun' };
export function prettyHours(spec: string): string {
  return spec.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (d) => DAY_NAMES[d] ?? d).slice(0, 60);
}

// Fahrplan-Engine BürgerBus Wehr: ein Fahrzeug, je Betriebstag mehrere Runden (Linie 1 → 2 → 3 → 4 → ggf. 5).
// Quelle: data/network.json (aus tools/build.py, offizieller Fahrplan der Stadt Wehr). Zeiten in Ortszeit des Geräts.
import N from "@/data/network.json";

type Coord = [number, number];
interface RawStop { name: string; lon: number; lat: number; approx?: boolean }
interface RawLine { name: string; color: string; km: number; stops: { id: string; t: number }[]; legs: Coord[][] }
const NET = N as unknown as {
  source: string;
  stops: Record<string, RawStop>;
  lines: Record<string, RawLine>;
  rounds: Record<string, { start: string; l5: boolean }[]>;
  days: Record<string, number[]>;
};

export const SOURCE = NET.source;
export const MIN = 60_000;
const DAY = 86_400_000;

export interface Stop { id: string; name: string; lon: number; lat: number; approx: boolean }
export const STOPS: Record<string, Stop> = Object.fromEntries(
  Object.entries(NET.stops).map(([id, s]) => [id, { id, name: s.name, lon: s.lon, lat: s.lat, approx: !!s.approx }]),
);

export interface Line {
  linie: string;
  /** „Enkendorf/Hölzle“ */
  name: string;
  color: string;
  km: number;
  /** Halte in Fahrtreihenfolge, t = Minuten ab Rundenbeginn */
  stops: { id: string; t: number }[];
  legs: Coord[][];
  shape: Coord[];
  /** Fahrzeit der Linie in Minuten */
  dur: number;
}
export const LINES: Line[] = Object.entries(NET.lines)
  .sort(([a], [b]) => Number(a) - Number(b))
  .map(([linie, l]) => ({
    linie,
    name: l.name.replace(/^Linie \d+:\s*/, ""),
    color: l.color,
    km: l.km,
    stops: l.stops,
    legs: l.legs,
    shape: l.legs.flatMap((g, i) => (i ? g.slice(1) : g)),
    dur: l.stops[l.stops.length - 1].t - l.stops[0].t,
  }));
export const LINE: Record<string, Line> = Object.fromEntries(LINES.map((l) => [l.linie, l]));

/** Haltestellen, die im Fahrplan vorkommen, alphabetisch (Doppelungen innerhalb einer Linie zählen einmal) */
export const STOP_LIST: Stop[] = [...new Set(LINES.flatMap((l) => l.stops.map((s) => s.id)))]
  .map((id) => STOPS[id])
  .sort((a, b) => a.name.localeCompare(b.name, "de"));
export const linesAt = (stopId: string) => LINES.filter((l) => l.stops.some((s) => s.id === stopId)).map((l) => l.linie);

// ---------- Kalender ----------
export const midnight = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const addDays = (day: number, n: number) => {
  const d = new Date(day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
};
const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Ostersonntag (Gauß/Meeus) */
function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day).getTime();
}
const holidayCache = new Map<number, Set<string>>();
/** Gesetzliche Feiertage Baden-Württemberg */
function holidays(y: number) {
  let s = holidayCache.get(y);
  if (s) return s;
  const e = easter(y);
  s = new Set([
    `${y}-01-01`, `${y}-01-06`, `${y}-05-01`, `${y}-10-03`, `${y}-11-01`, `${y}-12-25`, `${y}-12-26`,
    ...[-2, 1, 39, 50, 60].map((n) => ymd(addDays(e, n))),
  ]);
  holidayCache.set(y, s);
  return s;
}
export const isHoliday = (day: number) => holidays(new Date(day).getFullYear()).has(ymd(day));

/** Tagestyp laut Fahrplan: „mwf“ (Mo/Mi/Fr) oder „tt“ (Di/Do); null = kein Betrieb (Wochenende, Feiertag) */
export function dayType(day: number): string | null {
  if (isHoliday(day)) return null;
  const wd = new Date(day).getDay();
  for (const [k, days] of Object.entries(NET.days)) if (days.includes(wd)) return k;
  return null;
}

// ---------- Fahrten ----------
export interface Trip {
  /** eindeutig, z. B. 2026-11-25-08:00-L1 */
  key: string;
  linie: string;
  day: number;
  round: number;
  /** Halte mit absoluter Zeit (ms) */
  st: { id: string; t: number }[];
  start: number;
  end: number;
}
export interface Round { start: number; end: number; trips: Trip[] }

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const roundCache = new Map<number, Round[]>();
export function roundsOf(day: number): Round[] {
  let r = roundCache.get(day);
  if (r) return r;
  const type = dayType(day);
  r = !type
    ? []
    : NET.rounds[type].map((rd, ri) => {
        const t0 = day + toMin(rd.start) * MIN;
        const trips = LINES.filter((l) => l.linie !== "5" || rd.l5).map((l) => {
          const st = l.stops.map((s) => ({ id: s.id, t: t0 + s.t * MIN }));
          return { key: `${ymd(day)}-${rd.start}-L${l.linie}`, linie: l.linie, day, round: ri, st, start: st[0].t, end: st[st.length - 1].t };
        });
        return { start: trips[0].start, end: trips[trips.length - 1].end, trips };
      });
  roundCache.set(day, r);
  return r;
}

/** Runde, in der der Bus zur Zeit t unterwegs ist (inkl. kurzer Wendezeit an der Hauptstraße) */
export function roundAt(t: number): Round | null {
  return roundsOf(midnight(t)).find((r) => t >= r.start && t <= r.end) ?? null;
}
/** Fahrt, die der Bus zur Zeit t fährt bzw. als nächste beginnt (innerhalb der Runde) */
export function tripAt(t: number): Trip | null {
  const r = roundAt(t);
  if (!r) return null;
  return r.trips.find((x) => t <= x.end) ?? null;
}
/** Beginn der nächsten Runde nach t (bis 14 Tage voraus) */
export function nextRoundStart(t: number): number | null {
  for (let i = 0; i < 14; i++) {
    const r = roundsOf(addDays(midnight(t), i)).find((x) => x.start > t);
    if (r) return r.start;
  }
  return null;
}

// ---------- Position ----------
const R = 6371000, RAD = Math.PI / 180;
const dist = (a: Coord, b: Coord) => Math.hypot((b[0] - a[0]) * RAD * Math.cos(((a[1] + b[1]) / 2) * RAD), (b[1] - a[1]) * RAD) * R;
const bearing = (a: Coord, b: Coord) => {
  const y = Math.sin((b[0] - a[0]) * RAD) * Math.cos(b[1] * RAD);
  const x = Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) - Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos((b[0] - a[0]) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
};
interface Prep { g: Coord[]; c: number[]; len: number }
const prepCache = new Map<Coord[], Prep>();
function prep(g: Coord[]): Prep {
  let p = prepCache.get(g);
  if (p) return p;
  const c = [0];
  for (let i = 1; i < g.length; i++) c.push(c[i - 1] + dist(g[i - 1], g[i]));
  p = { g, c, len: c[c.length - 1] };
  prepCache.set(g, p);
  return p;
}
function along(p: Prep, f: number) {
  const d = p.len * Math.min(1, Math.max(0, f));
  let i = 1;
  while (i < p.c.length - 1 && p.c[i] < d) i++;
  const a = p.g[i - 1] ?? p.g[0], b = p.g[i] ?? a;
  const s = p.c[i] - p.c[i - 1] || 1, k = (d - p.c[i - 1]) / s;
  return { lon: a[0] + (b[0] - a[0]) * k, lat: a[1] + (b[1] - a[1]) * k, course: a === b ? 0 : bearing(a, b) };
}

export interface BusPos {
  lon: number;
  lat: number;
  course: number;
  moving: boolean;
  trip: Trip;
  /** Index des zuletzt erreichten Halts in trip.st */
  idx: number;
}
const DWELL = 0.3 * MIN; // Haltezeit je Halt, danach Fahrt zum nächsten

/** Position des Busses nach Fahrplan; null außerhalb der Runden */
export function busAt(t: number): BusPos | null {
  const trip = tripAt(t);
  if (!trip) return null;
  const line = LINE[trip.linie];
  if (t < trip.start) {
    const s = STOPS[trip.st[0].id];
    return { lon: s.lon, lat: s.lat, course: lastCourse(trip, 0), moving: false, trip, idx: 0 };
  }
  for (let i = 0; i < trip.st.length - 1; i++) {
    const a = trip.st[i], b = trip.st[i + 1];
    if (t > b.t) continue;
    const dwell = Math.min(DWELL, (b.t - a.t) * 0.3);
    const p = prep(line.legs[i]);
    if (t < a.t + dwell || b.t <= a.t) {
      const s = STOPS[a.id];
      return { lon: s.lon, lat: s.lat, course: lastCourse(trip, i), moving: false, trip, idx: i };
    }
    return { ...along(p, (t - a.t - dwell) / (b.t - a.t - dwell)), moving: true, trip, idx: i };
  }
  const s = STOPS[trip.st[trip.st.length - 1].id];
  return { lon: s.lon, lat: s.lat, course: lastCourse(trip, trip.st.length - 2), moving: false, trip, idx: trip.st.length - 1 };
}
function lastCourse(trip: Trip, i: number) {
  const g = LINE[trip.linie].legs[Math.max(0, Math.min(i, LINE[trip.linie].legs.length - 1))];
  return g.length > 1 ? bearing(g[0], g[1]) : 0;
}

/** Fortschritt 0..1 entlang der Linienstrecke */
export function progressOn(trip: Trip, t: number): number {
  const line = LINE[trip.linie];
  const total = line.legs.reduce((s, g) => s + prep(g).len, 0) || 1;
  let done = 0;
  for (let i = 0; i < trip.st.length - 1; i++) {
    const a = trip.st[i], b = trip.st[i + 1], len = prep(line.legs[i]).len;
    if (t >= b.t) done += len;
    else {
      const dwell = Math.min(DWELL, (b.t - a.t) * 0.3);
      if (t > a.t + dwell && b.t > a.t) done += len * ((t - a.t - dwell) / (b.t - a.t - dwell));
      break;
    }
  }
  return Math.min(1, done / total);
}
/** Strecke an Anteil f teilen: [gefahren, Rest] */
export function splitShape(c: Coord[], f: number): [Coord[], Coord[]] {
  const p = prep(c);
  const d = p.len * f;
  let i = 1;
  while (i < c.length - 1 && p.c[i] < d) i++;
  const a = c[i - 1], b = c[i], s = p.c[i] - p.c[i - 1] || 1, k = Math.min(1, Math.max(0, (d - p.c[i - 1]) / s));
  const m: Coord = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  return [[...c.slice(0, i), m], [m, ...c.slice(i)]];
}

// ---------- Abfahrten ----------
export interface Departure {
  key: string;
  trip: Trip;
  linie: string;
  /** Position des Halts in trip.st */
  idx: number;
  dep: number;
  /** nächster Halt nach dieser Haltestelle */
  next: string;
}
/** Nächste Abfahrten an einer Haltestelle ab t (Ankunft am Linienende zählt nicht), bis 14 Tage voraus */
export function nextDepartures(stopId: string, t: number, n = 8): Departure[] {
  const out: Departure[] = [];
  for (let i = 0; i < 14 && out.length < n; i++)
    for (const r of roundsOf(addDays(midnight(t), i)))
      for (const trip of r.trips)
        trip.st.forEach((s, idx) => {
          if (s.id !== stopId || idx === trip.st.length - 1 || s.t < t - MIN) return;
          out.push({ key: `${trip.key}-${idx}`, trip, linie: trip.linie, idx, dep: s.t, next: trip.st[idx + 1].id });
        });
  return out.sort((a, b) => a.dep - b.dep).slice(0, n);
}

/** Erster Betriebstag ab heute: Zeitfenster aller Runden (für die Zeitraffer-Schleife) */
export function serviceWindow(now: number): { from: number; to: number } | null {
  for (let i = 0; i < 14; i++) {
    const rs = roundsOf(addDays(midnight(now), i));
    if (rs.length) return { from: rs[0].start - MIN, to: rs[rs.length - 1].end + 2 * MIN };
  }
  return null;
}

/** Alle Linienstrecken als Polylinien */
export const SHAPES = LINES.map((l) => ({ linie: l.linie, color: l.color, coords: l.shape }));
export const BOUNDS: [Coord, Coord] = (() => {
  const all = LINES.flatMap((l) => l.shape);
  const xs = all.map((c) => c[0]), ys = all.map((c) => c[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
})();
export { DAY };

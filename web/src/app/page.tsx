"use client";

// Fahrgast-Ansicht BürgerBus Wehr: Wo ist der Bus? Haltestelle wählen → nächste Abfahrten → Abfahrt antippen →
// Bus live verfolgen (Strecke von oben oder Mitfahren in 3D). Direktlink, z. B. QR-Code am Halt: /?halt=hauptstr
// Position nach Fahrplan berechnet, bis ein GPS-Tracker angebunden ist (Phase 2).
// Fährt der Bus gerade nicht, spielt die Seite den nächsten Betriebstag im Zeitraffer ab (Pausen übersprungen).
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import BusMap from "@/components/map/LazyBusMap";
import type { MapBus, MapLine, MapPoint } from "@/components/map/BusMap";
import { IBus, IClock, IPause, IPin, IPlay } from "@/components/Icons";
import {
  LINE,
  LINES,
  MIN,
  SHAPES,
  SOURCE,
  STOPS,
  STOP_LIST,
  busAt,
  linesAt,
  midnight,
  nextDepartures,
  nextRoundStart,
  progressOn,
  roundAt,
  serviceWindow,
  splitShape,
  type Departure,
} from "@/lib/fahrplan";
import Drawer from "./Drawer";
import s from "./page.module.css";

export default function Page() {
  return (
    <Suspense>
      <App />
    </Suspense>
  );
}

interface Sim {
  base: number;
  real: number;
  speed: number;
  prev?: number;
  loop?: { from: number; to: number };
}
const LOOP_SPEED = 60; // 1 Minute Fahrplan pro Sekunde
const TRIP_SPEED = 6;
const VORLAUF = 10 * MIN; // Live-Ortung ab 10 Min. vor der Abfahrt an Ihrer Haltestelle

const fmt = (t: number) => new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
function dayLabel(t: number, now: number) {
  const d = midnight(t), n = midnight(now);
  if (d === n) return "";
  if (d - n < 2 * 86_400_000 && d > n) return "morgen ";
  return new Date(t).toLocaleDateString("de-DE", { weekday: "short" }) + " ";
}
/** Google Maps läuft auch ohne WebGL (dann flache Karte); Testschalter für die Ansicht ohne Karte: ?ohnekarte */
function canMap() {
  try {
    return !new URLSearchParams(location.search).has("ohnekarte");
  } catch {
    return true;
  }
}

function App() {
  const q = useSearchParams();
  const [stopId, setStopId] = useState<string | null>(() => {
    const h = q.get("halt");
    return h && STOPS[h] ? h : null;
  });
  const [selKey, setSelKey] = useState<string | null>(null);
  const [sim, setSim] = useState<Sim | null>(null);
  const [, tick] = useState(0);
  const [env, setEnv] = useState<{ map: boolean; desktop: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [sizes, setSizes] = useState({ peek: 220, full: 520 });
  const [query, setQuery] = useState("");
  const [geo, setGeo] = useState<"idle" | "busy" | "fail">("idle");
  const [view, setView] = useState<"route" | "3d">(() => (q.get("ansicht") === "strecke" ? "route" : "3d"));
  const [lineSel, setLineSel] = useState<string | null>(() => (q.get("linie") && LINE[q.get("linie")!] ? q.get("linie") : null));
  const [busCard, setBusCard] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const read = () => setEnv({ map: canMap(), desktop: mq.matches });
    read();
    mq.addEventListener?.("change", read);
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => {
      clearInterval(id);
      mq.removeEventListener?.("change", read);
    };
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (stopId) p.set("halt", stopId);
    if (lineSel && !stopId) p.set("linie", lineSel);
    if (view === "route") p.set("ansicht", "strecke");
    const qs = p.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }, [stopId, lineSel, view]);

  const clock = useCallback(() => {
    if (!sim) return Date.now();
    const t = sim.base + (Date.now() - sim.real) * sim.speed;
    if (!sim.loop) return t;
    const span = sim.loop.to - sim.loop.from;
    return sim.loop.from + ((((t - sim.loop.from) % span) + span) % span);
  }, [sim]);
  const now = clock();

  const startLoop = useCallback(() => {
    const w = serviceWindow(Date.now());
    if (w) setSim({ base: w.from, real: Date.now(), speed: LOOP_SPEED, loop: w });
  }, []);
  // Autoplay, wenn der Bus gerade nicht fährt
  useEffect(() => {
    if (!roundAt(Date.now())) startLoop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // In der Schleife Pausen zwischen den Runden überspringen
  const secKey = Math.floor(now / 1000);
  const lastJump = useRef(0);
  useEffect(() => {
    if (!sim?.loop || !sim.speed || Date.now() - lastJump.current < 700) return;
    const t = clock();
    if (roundAt(t)) return;
    lastJump.current = Date.now();
    const n = nextRoundStart(t);
    setSim({ ...sim, base: n && n < sim.loop.to ? n - 20_000 : sim.loop.from, real: Date.now() });
  }, [secKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const togglePause = () => {
    if (!sim) return;
    const t = clock();
    setSim(sim.speed ? { ...sim, base: t, real: Date.now(), prev: sim.speed, speed: 0 } : { ...sim, base: t, real: Date.now(), speed: sim.prev ?? LOOP_SPEED });
  };

  const deps = useMemo(() => (stopId ? nextDepartures(stopId, now, 8) : []), [stopId, Math.floor(now / 15_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel: Departure | null = useMemo(() => deps.find((d) => d.key === selKey) ?? null, [deps, selKey]);
  // Live-Fenster der gewählten Abfahrt: ab 10 Min. vorher bis Ende der Linienfahrt
  const win = sel ? { from: Math.max(sel.trip.start - 2 * MIN, sel.dep - VORLAUF), until: sel.trip.end } : null;
  const inWindow = !!win && now >= win.from && now < win.until;

  const pickStop = (id: string) => {
    setStopId(id);
    setSelKey(null);
    if (!sim?.loop) setSim(null);
    setQuery("");
    setLineSel(null);
    setBusCard(false);
    setOpen(true);
  };
  const closeStop = () => {
    setStopId(null);
    setSelKey(null);
    setLineSel(null);
    setQuery("");
    if (sim && !sim.loop) startLoop();
    setOpen(false);
  };
  const pickDep = (d: Departure) => {
    setSelKey(d.key);
    if (sim?.loop) setSim({ base: Math.max(d.trip.start - 2 * MIN, d.dep - VORLAUF) - 10_000, real: Date.now(), speed: TRIP_SPEED });
    setOpen(false);
  };
  const followBus = () => {
    const b = busAt(clock());
    if (!b) return;
    const nx = b.trip.st[Math.min(b.idx + 1, b.trip.st.length - 1)];
    setStopId(nx.id);
    setLineSel(null);
    setBusCard(false);
    const d = nextDepartures(nx.id, clock(), 4).find((x) => x.trip.key === b.trip.key);
    setSelKey(d?.key ?? null);
    if (sim?.loop) setSim({ base: clock(), real: Date.now(), speed: TRIP_SPEED });
    setOpen(false);
  };

  const nearMe = () => {
    if (!navigator.geolocation) return setGeo("fail");
    setGeo("busy");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        let best = STOP_LIST[0], bd = Infinity;
        for (const x of STOP_LIST) {
          const d = (x.lat - p.coords.latitude) ** 2 + ((x.lon - p.coords.longitude) * Math.cos((x.lat * Math.PI) / 180)) ** 2;
          if (d < bd) {
            bd = d;
            best = x;
          }
        }
        setGeo("idle");
        pickStop(best.id);
      },
      () => setGeo("fail"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 },
    );
  };

  // Bus auf der Karte: in der Übersicht immer, bei gewählter Abfahrt nur im Live-Fenster
  const getBus = useCallback((): MapBus[] => {
    const t = clock();
    if (sel && win && (t < win.from || t >= win.until)) return [];
    const b = busAt(t);
    if (!b) return [];
    return [{ id: "bus", lon: b.lon, lat: b.lat, course: b.course, moving: b.moving, label: `Linie ${b.trip.linie}`, color: LINE[b.trip.linie].color }];
  }, [clock, sel, win?.from, win?.until]); // eslint-disable-line react-hooks/exhaustive-deps

  const bus = busAt(now);
  const follow3d = view === "3d" && !!sel && inWindow;
  const progKey = inWindow ? Math.floor(now / 2000) : 0;
  const lines = useMemo<MapLine[]>(() => {
    if (sel) {
      const c = LINE[sel.linie];
      if (inWindow) {
        const [done, todo] = splitShape(c.shape, progressOn(sel.trip, clock()));
        return [
          { id: "done", coords: done, color: "#ffffff", width: 3, opacity: 0.45 },
          { id: "todo", coords: todo, color: c.color, width: 5, opacity: 0.95 },
        ];
      }
      return [{ id: "todo", coords: c.shape, color: c.color, width: 5, opacity: 0.95 }];
    }
    const show = lineSel ? [lineSel] : stopId ? linesAt(stopId) : LINES.map((l) => l.linie);
    const active = bus?.trip.linie;
    return SHAPES.filter((x) => show.includes(x.linie)).map((x) => ({
      id: `l${x.linie}`,
      coords: x.coords,
      color: x.color,
      width: lineSel || x.linie === active ? 5 : 3.5,
      opacity: lineSel || !active || x.linie === active ? 0.95 : 0.55,
    }));
  }, [sel, stopId, progKey, lineSel, bus?.trip.linie]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextStopId = sel && inWindow ? (sel.trip.st.find((x) => x.t > now)?.id ?? null) : null;
  const stopMarks = useMemo(() => {
    // Übersicht: alle Halte antippbar; sonst die Halte der gewählten Linie bzw. Fahrt
    const ids = sel ? sel.trip.st.map((x) => x.id) : lineSel ? LINE[lineSel].stops.map((x) => x.id) : stopId ? linesAt(stopId).flatMap((l) => LINE[l].stops.map((x) => x.id)) : STOP_LIST.map((x) => x.id);
    return [...new Set(ids)].map((id) => ({ id, lon: STOPS[id].lon, lat: STOPS[id].lat, mine: id === stopId }));
  }, [sel, stopId, lineSel]);
  const points = useMemo<MapPoint[]>(() => {
    const out: MapPoint[] = [];
    if (stopId) out.push({ id: stopId, lon: STOPS[stopId].lon, lat: STOPS[stopId].lat, label: STOPS[stopId].name });
    if (nextStopId && nextStopId !== stopId) out.push({ id: `n-${nextStopId}`, lon: STOPS[nextStopId].lon, lat: STOPS[nextStopId].lat, label: `Nächster Halt: ${STOPS[nextStopId].name}` });
    return out;
  }, [stopId, nextStopId]);

  const results = useMemo(() => {
    const k = norm(query);
    if (!k) return [];
    const words = k.split(" ");
    return STOP_LIST.filter((x) => words.every((w) => norm(x.name).includes(w))).slice(0, 8);
  }, [query]);

  const minuteKey = Math.floor(now / 60_000);
  const lineInfo = useMemo(() => {
    const t0 = clock();
    return new Map(
      LINES.map((l) => {
        const d = nextDepartures(l.stops[0].id, t0, 12).find((x) => x.linie === l.linie && x.idx === 0);
        return [l.linie, { running: bus?.trip.linie === l.linie, next: d?.dep ?? null }] as const;
      }),
    );
  }, [minuteKey, bus?.trip.linie]); // eslint-disable-line react-hooks/exhaustive-deps
  const lineStops = useMemo(() => {
    if (!lineSel) return null;
    const l = LINE[lineSel];
    const t0 = clock();
    const seen = new Set<string>();
    return {
      l,
      rows: l.stops
        .filter((x, i) => i < l.stops.length - 1 && !seen.has(x.id) && seen.add(x.id))
        .map((x) => ({ id: x.id, next: nextDepartures(x.id, t0, 12).find((d) => d.linie === l.linie) ?? null })),
    };
  }, [lineSel, minuteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!env) return <main className={s.page} />;

  // ---------- Texte ----------
  let phase: "pick" | "stop" | "wait" | "approach" | "boarding" | "after" = "pick";
  if (sel && win) phase = now < win.from ? "wait" : now < sel.dep - 0.3 * MIN ? "approach" : now < sel.dep + 0.3 * MIN ? "boarding" : "after";
  else if (stopId) phase = "stop";
  const L = sel ? LINE[sel.linie] : null;

  let title: React.ReactNode;
  let sub: string;
  if (phase === "pick") {
    title = <>Wo ist der <em>Bürgerbus?</em></>;
    sub = bus ? `Der Bus fährt ${sim?.loop ? "laut Fahrplan" : "gerade"} Linie ${bus.trip.linie} (${LINE[bus.trip.linie].name}). Haltestelle wählen oder Bus antippen.` : "Haltestelle wählen, dann Ihre Abfahrt antippen.";
  } else if (phase === "stop") {
    const n = deps[0];
    title = <>{STOPS[stopId!].name}</>;
    sub = n ? `Nächste Abfahrt ${dayLabel(n.dep, now)}${fmt(n.dep)} Uhr · Linie ${n.linie} (${LINE[n.linie].name})` : "In den nächsten Tagen hält der Bürgerbus hier nicht.";
  } else {
    const d = sel!;
    if (phase === "wait") title = <>Abfahrt {dayLabel(d.dep, now)}{fmt(d.dep)} Uhr</>;
    else if (phase === "approach") {
      const m = Math.ceil((d.dep - now) / MIN);
      title = m <= 1 ? <>Der Bus ist <em>gleich da</em></> : <>Der Bus ist in <em>{m} Min.</em> da</>;
    } else if (phase === "boarding") title = <>Der Bus <em>ist da</em></>;
    else title = <>Gute Fahrt!</>;
    sub = phase === "wait" ? `Live-Ortung ab ${fmt(win!.from)} Uhr · Linie ${d.linie} (${L!.name})` : `Linie ${d.linie} (${L!.name}) · ab ${STOPS[stopId!].name} ${fmt(d.dep)} Uhr`;
  }

  const visible = env.desktop ? 0 : open ? sizes.full : sizes.peek;
  const fitPadding = env.desktop ? { top: 90, bottom: 60, left: 480, right: 80 } : { top: 80, bottom: visible + 24, left: 36, right: 36 };

  const search = (
    <div className={s.field}>
      <label htmlFor="suche">Haltestelle</label>
      <div className={s.searchRow}>
        <input id="suche" type="search" inputMode="search" autoComplete="off" placeholder={stopId ? STOPS[stopId].name : "z. B. Hauptstraße"} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="btn" onClick={nearMe} disabled={geo === "busy"} aria-label="Haltestelle in meiner Nähe">
          <IPin /> {geo === "busy" ? "…" : "Nähe"}
        </button>
      </div>
      {geo === "fail" && <small className={s.hint}>Standort nicht verfügbar. Bitte Haltestelle eintippen.</small>}
      {results.length > 0 && (
        <ul className={s.results} data-nodrag>
          {results.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => pickStop(x.id)}>
                {x.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query && results.length === 0 && <small className={s.hint}>Keine Haltestelle des Bürgerbusses gefunden.</small>}
    </div>
  );

  const linePicker = (
    <div className={s.field}>
      <span>Oder nach Linie</span>
      <div className={s.lineChips} data-nodrag role="group" aria-label="Linie wählen">
        {LINES.map((l) => {
          const info = lineInfo.get(l.linie);
          return (
            <button
              key={l.linie}
              type="button"
              className={lineSel === l.linie ? s.on : ""}
              aria-pressed={lineSel === l.linie}
              style={{ ["--lc" as string]: l.color }}
              onClick={() => {
                setLineSel(lineSel === l.linie ? null : l.linie);
                setStopId(null);
                setSelKey(null);
                setOpen(true);
              }}
            >
              <span className={s.lnNum}>{l.linie}</span>
              <span className={s.lnRoute}>{l.name}</span>
              <span className={s.lnMeta}>
                {info?.running ? (
                  <>
                    <i className={s.dot} /> Bus unterwegs
                  </>
                ) : info?.next ? (
                  `nächste ${dayLabel(info.next, now)}${fmt(info.next)}`
                ) : (
                  `${l.km} km`
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const lineList = lineStops && (
    <div className={s.field}>
      <span>
        Linie {lineStops.l.linie} · {lineStops.l.name} · ca. {lineStops.l.dur} Min.
      </span>
      <ol className={s.stopList} data-nodrag>
        {lineStops.rows.map(({ id, next }) => (
          <li key={id}>
            <button type="button" onClick={() => pickStop(id)}>
              <i aria-hidden="true" style={{ background: lineStops.l.color }} />
              <b>{STOPS[id].name}</b>
              <em>{next ? `${dayLabel(next.dep, now)}${fmt(next.dep)}` : "–"}</em>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );

  let hereIdx = -1;
  if (sel && inWindow) sel.trip.st.forEach((x, i) => (now >= x.t ? (hereIdx = i) : null));
  const tripList = sel && (
    <div className={s.field}>
      <span>Fahrtverlauf · Linie {sel.linie}</span>
      <ol className={`${s.stopList} ${s.trip}`} data-nodrag>
        {sel.trip.st.map((x, i) => (
          <li key={`${x.id}-${i}`} className={`${i < hereIdx ? s.past : ""} ${i === hereIdx ? s.here : ""} ${i === sel.idx ? s.me : ""}`}>
            <div>
              <i aria-hidden="true" />
              <b>{STOPS[x.id].name}</b>
              <em>{fmt(x.t)}</em>
            </div>
            {i === hereIdx && <small>{now < x.t + 0.3 * MIN ? "Bus hält hier" : "Bus unterwegs zum nächsten Halt"}</small>}
          </li>
        ))}
      </ol>
    </div>
  );

  const simTag = sim && <span className={s.simTag}>{sim.speed ? `Zeitraffer ${sim.speed}×` : "Pausiert"}</span>;
  const peek = (
    <>
      <div className={s.partner}>
        <span className={s.badge} aria-hidden="true">
          <IBus />
        </span>
        <span>
          <b>{sel ? `Linie ${sel.linie} · ${L!.name}` : "BürgerBus Wehr"}</b>
          Ehrenamtlich unterwegs in Wehr und Öflingen
        </span>
        {(stopId || lineSel) && (
          <button type="button" className={s.close} onClick={closeStop} aria-label="Zur Übersicht">
            <span aria-hidden="true">×</span> Übersicht
          </button>
        )}
      </div>
      <div className={s.status}>
        {sel && (
          <div className={s.live}>
            <span className={inWindow ? s.dot : s.off} />
            {inWindow ? "Live-Ortung aktiv" : "Live-Ortung startet automatisch"}
            {simTag}
          </div>
        )}
        {!sel && sim?.loop && (
          <div className={s.live}>
            <span className={sim.speed ? s.dot : s.off} />
            Fahrplan {new Date(now).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })} · {fmt(now)} Uhr
            {simTag}
          </div>
        )}
        {!sel && !sim && bus && (
          <div className={s.live}>
            <span className={s.dot} />
            Live: Bürgerbus auf Linie {bus.trip.linie}
          </div>
        )}
        <h1 key={`${stopId}-${sel?.key}-${phase}`} className={s.swap}>
          {title}
        </h1>
        <p className={s.sub}>{sub}</p>
        {nextStopId && (
          <p className={s.nextStop}>
            Nächster Halt: <b>{STOPS[nextStopId].name}</b>
          </p>
        )}
      </div>
      {!stopId && !lineSel && search}
      {!sel && sim && (
        <div className={s.playRow}>
          {sim.loop ? (
            <button type="button" className="btn" onClick={togglePause}>
              {sim.speed ? <IPause /> : <IPlay />} {sim.speed ? "Pause" : "Weiter"}
            </button>
          ) : (
            <button type="button" className="btn" onClick={startLoop}>
              <IPlay /> Betriebstag
            </button>
          )}
          <button type="button" className="btn" onClick={() => setSim(null)}>
            <IClock /> Echtzeit
          </button>
        </div>
      )}
      {!sim && !bus && !stopId && (
        <button type="button" className={`btn ${s.demoBtn}`} onClick={startLoop}>
          <IPlay /> Betriebstag abspielen
        </button>
      )}
    </>
  );

  const more = (
    <>
      {sel && win && (
        <div className={s.win} aria-hidden="true">
          <div className={s.bar}>
            <span style={{ width: `${Math.min(1, Math.max(0, (now - win.from) / (win.until - win.from))) * 100}%` }} />
          </div>
          <div className={s.ends}>
            <span>Start {fmt(sel.trip.start)}</span>
            <span>Ihr Halt {fmt(sel.dep)}</span>
            <span>Ende {fmt(sel.trip.end)}</span>
          </div>
        </div>
      )}
      {tripList}
      {!stopId && linePicker}
      {!stopId && lineList}
      {stopId && search}
      {stopId && !query && (
        <div className={s.field}>
          <span>Nächste Abfahrten · {STOPS[stopId].name}</span>
          {STOPS[stopId].approx && <small className={s.approx}>Genaue Lage dieser Haltestelle wird noch geprüft.</small>}
          {deps.length === 0 ? (
            <p className={s.sub}>In den nächsten Tagen hält der Bürgerbus hier nicht.</p>
          ) : (
            <ul className={s.deps} data-nodrag>
              {deps.map((d) => {
                const from = Math.max(d.trip.start - 2 * MIN, d.dep - VORLAUF);
                const live = now >= from && now < d.trip.end;
                const m = Math.round((d.dep - now) / MIN);
                return (
                  <li key={d.key}>
                    <button type="button" className={sel?.key === d.key ? s.on : ""} onClick={() => pickDep(d)} aria-pressed={sel?.key === d.key}>
                      <time>
                        {dayLabel(d.dep, now) && <small>{dayLabel(d.dep, now)}</small>}
                        {fmt(d.dep)}
                      </time>
                      <span className={s.lineTag} style={{ ["--lc" as string]: LINE[d.linie].color }}>
                        {d.linie}
                      </span>
                      <span className={s.dest}>→ {STOPS[d.next].name}</span>
                      <span className={live ? s.liveTag : s.inTag}>{live ? (now >= d.dep ? "unterwegs" : "live") : m > 0 && m < 60 ? `${m} Min.` : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {stopId && (
        <div className={s.actions}>
          {sim && !sim.loop && (
            <button type="button" className="btn" onClick={startLoop}>
              <IPlay /> Betriebstag
            </button>
          )}
          {sim && (
            <button type="button" className="btn" onClick={() => setSim(null)}>
              <IClock /> Echtzeit
            </button>
          )}
        </div>
      )}
      <details className={s.why}>
        <summary>So funktioniert die Live-Karte</summary>
        <div>
          <ul>
            <li>Haltestelle eintippen oder „Nähe“ drücken, dann die gewünschte Abfahrt antippen.</li>
            <li>Ab 10 Minuten vor der Abfahrt sehen Sie, wo der Bus gerade ist und wann er bei Ihnen ankommt.</li>
            <li>„Mitfahren 3D“ zeigt die Fahrt aus der Sicht hinter dem Bus, „Strecke“ die ganze Linie von oben.</li>
            <li>Ohne App und ohne Anmeldung, auf jedem Handy; per QR-Code an der Haltestelle.</li>
          </ul>
        </div>
      </details>
      <p className={s.legal}>
        {SOURCE}. Der Bürgerbus fährt nicht an Wochenenden und gesetzlichen Feiertagen. Die Position wird derzeit aus dem Fahrplan berechnet; Verspätungen sind noch nicht
        sichtbar. Datenschutz: Von Fahrgästen werden keine Daten erhoben, Ihr Standort („Nähe“) bleibt in Ihrem Browser. Karte: Google Maps (es gelten die Datenschutzhinweise von Google).
      </p>
    </>
  );

  return (
    <main className={`${s.page} ${env.desktop ? s.desk : ""}`}>
      {env.map ? (
        <BusMap
          getBus={getBus}
          onSelect={sel ? undefined : () => setBusCard(true)}
          lines={lines}
          points={points}
          stops={stopMarks}
          onStop={pickStop}
          fitKey={follow3d ? undefined : `${stopId}-${lineSel}-${sel?.key}-${env.desktop ? "d" : open ? "o" : "c"}-${sizes.peek}-${view}`}
          fitPadding={fitPadding}
          follow={follow3d ? { tilt: 60, zoom: 18 } : null}
          className={s.map}
        />
      ) : (
        <div className={s.band} style={{ paddingBottom: visible + 24 }}>
          <p className={s.bandNote}>Die Kartenansicht ist in diesem Browser nicht verfügbar. Abfahrten und Fahrtverlauf funktionieren trotzdem.</p>
        </div>
      )}

      <header className={s.top}>
        <div className={s.brand}>
          <span className={s.wordmark}>
            <IBus /> BürgerBus <small>Wehr</small>
          </span>
        </div>
        {sel && env.map && (
          <div className={s.viewSeg} role="group" aria-label="Ansicht Strecke oder Mitfahren">
            <button type="button" className={view === "route" ? s.on : ""} aria-pressed={view === "route"} onClick={() => setView("route")}>
              Strecke
            </button>
            <button type="button" className={view === "3d" ? s.on : ""} aria-pressed={view === "3d"} onClick={() => setView("3d")}>
              Mitfahren 3D
            </button>
          </div>
        )}
      </header>

      {busCard && !sel && bus && (
        <div className={s.vcard} role="dialog" aria-label={`Linie ${bus.trip.linie}`} style={env.desktop ? undefined : { top: "auto", bottom: visible + 12 }}>
          <div className={s.vhead}>
            <span className={s.lineTag} style={{ ["--lc" as string]: LINE[bus.trip.linie].color }}>
              {bus.trip.linie}
            </span>
            <b>{LINE[bus.trip.linie].name}</b>
            <button type="button" className={s.vx} onClick={() => setBusCard(false)} aria-label="Schließen">
              ×
            </button>
          </div>
          {(() => {
            const nx = bus.trip.st.find((x) => x.t > now);
            return nx ? (
              <p>
                Nächster Halt: <b>{STOPS[nx.id].name}</b> · {fmt(nx.t)} Uhr
              </p>
            ) : null;
          })()}
          <button type="button" className="btn btn-signal" onClick={followBus}>
            Fahrt verfolgen
          </button>
        </div>
      )}

      {env.desktop ? (
        <aside className={s.panel} aria-live="polite">
          {peek}
          {more}
        </aside>
      ) : (
        <Drawer open={open} setOpen={setOpen} onSizes={setSizes} peek={peek}>
          {more}
        </Drawer>
      )}
    </main>
  );
}

"use client";

// Druckvorlage: je Haltestelle ein Aushang (A6) mit QR-Code zur Live-Karte dieser Haltestelle.
// Filter per ?linie=3. Drucken über den Knopf oder Strg/Cmd+P.
// Ziel-Adresse: NEXT_PUBLIC_SITE_URL (z. B. https://buergerbus-wehr.de); ohne Angabe die aktuelle Adresse.
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { LINE, STOP_LIST, linesAt } from "@/lib/fahrplan";
import s from "./aushang.module.css";

export default function Page() {
  return (
    <Suspense>
      <Aushang />
    </Suspense>
  );
}

function Aushang() {
  const q = useSearchParams();
  const linie = q.get("linie");
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  const [base, setBase] = useState("");
  const stops = useMemo(() => (linie && LINE[linie] ? STOP_LIST.filter((x) => linesAt(x.id).includes(linie)) : STOP_LIST), [linie]);

  useEffect(() => {
    const b = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "") + "/?halt=";
    setBase(b);
    let alive = true;
    Promise.all(stops.map(async (x) => [x.id, await QRCode.toString(b + x.id, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0b0c0e", light: "#ffffff" } })] as const)).then(
      (r) => alive && setSvgs(Object.fromEntries(r)),
    );
    return () => {
      alive = false;
    };
  }, [stops]);

  return (
    <main className={s.page}>
      <header className={s.bar}>
        <b>Aushänge BürgerBus-Haltestellen</b>
        <span>
          {stops.length} Haltestellen{linie ? ` · Linie ${linie}` : ""} · je Seite ein A6-Aushang · Ziel {base || "…"}
        </span>
        <button type="button" onClick={() => window.print()}>
          Drucken
        </button>
      </header>
      <div className={s.grid}>
        {stops.map((x) => (
          <article key={x.id} className={s.card}>
            <h2>Wo ist der Bürgerbus?</h2>
            <p className={s.lead}>Code scannen und den Bus live verfolgen.</p>
            <div className={s.qr} dangerouslySetInnerHTML={{ __html: svgs[x.id] ?? "" }} />
            <p className={s.stop}>{x.name}</p>
            <p className={s.lines}>Linie {linesAt(x.id).join(" · ")}</p>
            <p className={s.foot}>Ohne App · BürgerBus Wehr</p>
          </article>
        ))}
      </div>
    </main>
  );
}

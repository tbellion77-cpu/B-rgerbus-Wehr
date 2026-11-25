"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import s from "./page.module.css";

/** Zweistufiges Info-Fenster fürs Handy: Antippen oder Wischen klappt auf und zu. */
export default function Drawer({
  open,
  setOpen,
  onSizes,
  peek,
  children,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onSizes: (v: { peek: number; full: number }) => void;
  peek: React.ReactNode;
  children: React.ReactNode;
}) {
  const sheet = useRef<HTMLElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const [h, setH] = useState({ peek: 220, full: 520 });
  const drag = useRef<{ y0: number; off0: number; t0: number; moved: boolean } | null>(null);
  const [dragOff, setDragOff] = useState<number | null>(null);
  const justDragged = useRef(false); // nach einem Zug kein zusätzlicher Klick-Umschalter

  useLayoutEffect(() => {
    const measure = () => {
      if (!sheet.current || !peekRef.current) return;
      const full = sheet.current.offsetHeight;
      const peekH = Math.min(full, peekRef.current.offsetTop + peekRef.current.offsetHeight + 12);
      setH((o) => (o.full === full && o.peek === peekH ? o : { peek: peekH, full }));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && sheet.current) ro.observe(sheet.current);
    if (ro && peekRef.current) ro.observe(peekRef.current);
    window.addEventListener("resize", measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => onSizes(h), [h, onSizes]);

  const closedOff = Math.max(0, h.full - h.peek);
  const baseOff = open ? 0 : closedOff;
  const off = dragOff ?? baseOff;

  // Gesten-Logik in Refs, damit die Touch-Listener nur einmal registriert werden
  const st = useRef({ open, closedOff, baseOff });
  st.current = { open, closedOff, baseOff };

  const down = (y: number, target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (el && el.closest && el.closest("a, select, input, label, [role=radio], [data-nodrag], .btn")) return false;
    drag.current = { y0: y, off0: st.current.baseOff, t0: Date.now(), moved: false };
    return true;
  };
  const moveTo = (y: number) => {
    const d = drag.current;
    if (!d) return;
    const dy = y - d.y0;
    if (Math.abs(dy) > 6) d.moved = true;
    if (!d.moved) return;
    const max = st.current.closedOff;
    let next = d.off0 + dy;
    if (next < 0) next = next * 0.3;
    if (next > max) next = max + (next - max) * 0.3;
    setDragOff(next);
  };
  const up = (y: number) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dy = y - d.y0;
    const v = dy / Math.max(1, Date.now() - d.t0); // px/ms
    setDragOff(null);
    if (!d.moved) return;
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 350);
    if (v < -0.35) setOpen(true);
    else if (v > 0.35) setOpen(false);
    else setOpen(d.off0 + dy < st.current.closedOff / 2);
  };

  // Touch: Wischen bewegt das Fenster; im offenen Zustand scrollt der Inhalt, solange er nicht oben steht.
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    let active = false;
    const ts = (e: TouchEvent) => {
      const more = el.querySelector("[data-more]") as HTMLElement | null;
      const inMore = !!more && more.contains(e.target as Node);
      active = !(inMore && st.current.open && more!.scrollTop > 0) && down(e.touches[0].clientY, e.target);
    };
    const tm = (e: TouchEvent) => {
      if (!active) return;
      const d = drag.current;
      const more = el.querySelector("[data-more]") as HTMLElement | null;
      const dy = d ? e.touches[0].clientY - d.y0 : 0;
      if (st.current.open && more && more.contains(e.target as Node) && dy < 0 && !(d && d.moved)) {
        active = false; // offen + im Inhalt nach oben wischen = scrollen
        drag.current = null;
        return;
      }
      if (e.cancelable) e.preventDefault();
      moveTo(e.touches[0].clientY);
    };
    const te = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      up(e.changedTouches[0].clientY);
    };
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te);
    el.addEventListener("touchcancel", te);
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te);
      el.removeEventListener("touchcancel", te);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !down(e.clientY, e.target)) return;
    const mm = (ev: MouseEvent) => moveTo(ev.clientY);
    const mu = (ev: MouseEvent) => {
      up(ev.clientY);
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
    };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  };

  const onPeekClick = (e: React.MouseEvent) => {
    if (justDragged.current) return;
    const el = e.target as HTMLElement;
    if (el.closest && el.closest("a, button, select, input, label")) return;
    setOpen(!open);
  };

  const t = `translate3d(0, ${Math.round(off)}px, 0)`;
  return (
    <section ref={sheet} className={`${s.sheet} ${dragOff != null ? s.dragging : ""}`} style={{ transform: t, WebkitTransform: t }} onMouseDown={onMouseDown} aria-live="polite">
      <button
        type="button"
        className={s.grip}
        onClick={() => !justDragged.current && setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Details einklappen, Karte zeigen" : "Haltestelle und Abfahrten zeigen"}
      >
        <span />
        <small>{open ? "Karte zeigen" : "Haltestelle & Abfahrten"}</small>
      </button>
      <div ref={peekRef} className={s.peek} onClick={onPeekClick}>
        {peek}
      </div>
      <div className={s.more} data-more aria-hidden={!open} {...(!open ? { inert: true } : {})}>
        {children}
      </div>
    </section>
  );
}

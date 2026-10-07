"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError, fmtTime, type FamilyState } from "@/lib/client";
import { hhmmToMinutes } from "@/lib/dates";
import { COLOURS, iconFor, isColourKey, TOKENS, isTokenKey, tokenLabel } from "@/lib/themes";

import { burstAt, setSoundPref, sounds, useConfettiCanvas, useSoundPref } from "./Fx";
import { PinPad } from "./PinPad";

type KidState = FamilyState["kids"][number];
const POLL_MS = 10_000;

export function Board({ initial }: { initial: FamilyState }) {
  const router = useRouter();
  const [state, setState] = useState<FamilyState>(initial);
  const sound = useSoundPref();
  const [popping, setPopping] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [toast, setToast] = useState("");
  // Clock: the server reports its local minutes at fetch time; the ring adds
  // the time elapsed since that fetch. Both stamps start at 0 (no drift until
  // the first tick), so the first paint matches the server exactly.
  const [now, setNow] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(0);
  const canvas = useConfettiCanvas();
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api<FamilyState>("/api/state");
      setState(next); setFetchedAt(Date.now()); setNow(Date.now());
    } catch (e) {
      // Expired session: back to sign-in rather than a silently stale board.
      if (e instanceof ApiError && e.status === 401) router.push("/login");
      /* otherwise keep the last good state */
    }
  }, [router]);

  useEffect(() => {
    // Initial fetch stamps fetchedAt so the ring keeps time even if later polls fail.
    const t0 = setTimeout(() => { void refresh(); }, 0);
    const t = setInterval(() => { setNow(Date.now()); void refresh(); }, POLL_MS);
    const vis = () => { if (document.visibilityState === "visible") { setNow(Date.now()); void refresh(); } };
    document.addEventListener("visibilitychange", vis);
    return () => { clearTimeout(t0); clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [refresh]);

  // Keep the tablet awake while the board is showing.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const wake = async () => { try { lock = lock ?? (await navigator.wakeLock?.request("screen")) ?? null; } catch { /* unsupported */ } };
    void wake();
    const onTouch = () => { void wake(); };
    document.addEventListener("click", onTouch);
    return () => { document.removeEventListener("click", onTouch); void lock?.release(); };
  }, []);

  function say(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2200); }
  const play = (fn: () => void) => { if (sound) fn(); };

  async function tap(kid: KidState, taskId: string, el: HTMLButtonElement) {
    if (busy.current) return;
    busy.current = true;
    const r = el.getBoundingClientRect();
    const colour = COLOURS[isColourKey(kid.colour) ? kid.colour : "marigold"];
    setPopping(taskId); play(sounds.ding);
    try {
      const result = await api<{ awarded: number; allDone: boolean; bonus: number; streakBonus: number }>("/api/complete", { json: { kidId: kid.id, taskId } });
      await refresh();
      if (result.allDone) {
        setTimeout(() => play(sounds.fanfare), 150);
        burstAt(canvas.current, r.left + r.width / 2, r.top, [colour.k, colour.deep, "#E5484D", "#5B8DEF", "#FFFFFF"]);
        if (result.bonus) say(`${kid.name}: all done! +${result.bonus} bonus`);
        if (result.streakBonus) { setTimeout(() => play(sounds.jackpot), 900); setTimeout(() => say(`${kid.name}: streak bonus +${result.streakBonus}!`), 2300); }
      }
    } catch {
      say("Could not save that, try again");
    } finally {
      setPopping(null); busy.current = false;
    }
  }
  async function untap(kid: KidState, taskId: string) {
    play(sounds.boop);
    try { await api("/api/uncomplete", { json: { kidId: kid.id, taskId } }); await refresh(); } catch { say("Could not undo"); }
  }
  async function undo(kid: KidState) {
    play(sounds.boop);
    try { await api("/api/undo", { json: { kidId: kid.id } }); await refresh(); } catch { say("Could not undo"); }
  }
  function toggleSound() {
    const next = !sound; setSoundPref(next);
    if (next) sounds.ding();
  }

  const elapsedMin = fetchedAt ? Math.max(0, now - fetchedAt) / 60000 : 0;
  const nowM = state.serverMinutes + elapsedMin;
  const s = hhmmToMinutes(state.family.startTime), l = hhmmToMinutes(state.family.leaveTime);
  const left = Math.ceil(l - nowM);
  let ringClass = "ring", big = "", small = "", p = 0;
  if (nowM < s) { big = fmtTime(Math.floor(nowM)); small = "good morning!"; }
  else if (left > 0) { p = Math.min(1, (nowM - s) / Math.max(1, l - s)); big = String(left); small = left === 1 ? "minute to go" : "minutes to go"; if (left <= 10) ringClass += " soon"; }
  else if (nowM < l + 90) { p = 1; ringClass += " go"; big = "GO!"; small = "time for school"; }
  else { big = fmtTime(Math.floor(nowM)); small = "see you tomorrow"; }
  const C = 2 * Math.PI * 52;
  const weekday = new Date(`${state.today}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long" });

  return (
    <div className="wrap board-page">
      <canvas ref={canvas} className="fx" aria-hidden="true" />
      <header className="top">
        <div className="brand">
          <h1>Up and<br />Out</h1>
          <p>{weekday} · {fmtTime(Math.floor(nowM))} · leave at {fmtTime(l)}</p>
        </div>
        <div className={ringClass} role="timer" aria-live="polite">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle className="trk" cx="60" cy="60" r="52" />
            <circle className="bar" cx="60" cy="60" r="52" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - p) }} />
          </svg>
          <div className="mid"><div className="big">{big}</div><div className="small">{small}</div></div>
        </div>
        <div className="tools">
          <button className="btn" type="button" aria-pressed={sound} onClick={toggleSound}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path style={{ opacity: sound ? 1 : 0 }} d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>
            <span>{sound ? "Sound on" : "Sound off"}</span>
          </button>
          <button className="btn" type="button" onClick={() => (state.family.hasPin ? setPinOpen(true) : router.push("/settings"))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>
            <span>Grown-ups</span>
          </button>
        </div>
      </header>

      <main className="board">
        {state.kids.map((kid) => {
          const n = kid.tasks.length;
          const todo = kid.tasks.filter((t) => !t.done);
          const done = kid.tasks.filter((t) => t.done);
          const tok = TOKENS[isTokenKey(kid.theme) ? kid.theme : "star"];
          return (
            <section key={kid.id} className="kid" data-colour={kid.colour} aria-label={`${kid.name}'s jobs`}>
              <div className="kid-head">
                <h2>{kid.name}</h2>
                <span className="count">{kid.doneCount} / {n}</span>
                <button className="btn small" type="button" disabled={kid.doneCount === 0} onClick={() => undo(kid)}>↶ Undo</button>
              </div>
              <div className="meter" aria-hidden="true"><i style={{ width: `${n ? (kid.doneCount / n) * 100 : 0}%` }} /></div>
              {kid.allDone ? (
                <div className="reward">
                  <small>All done{kid.earnedToday ? `, ${tokenLabel(kid.theme, kid.earnedToday)} earned` : ""}!</small>
                  <strong>{kid.goal.reached && kid.goalName ? `${kid.goalName} unlocked!` : "Brilliant!"}</strong>
                </div>
              ) : (
                <div className="tiles">
                  {todo.map((t) => (
                    <button key={t.id} type="button" className={`tile${popping === t.id ? " pop" : ""}`} onClick={(e) => tap(kid, t.id, e.currentTarget)}>
                      <span className="ico" aria-hidden="true">{iconFor(t.label)}</span><span>{t.label}</span>
                    </button>
                  ))}
                  {n === 0 && <p className="hint">No jobs yet. A grown-up can add some in Settings.</p>}
                </div>
              )}
              <div className="done-row">
                {done.map((t) => <button key={t.id} type="button" className="chip" aria-label={`Undo ${t.label}`} onClick={() => untap(kid, t.id)}>{t.label}</button>)}
              </div>
              <div className={`jar${kid.goal.reached ? " reached" : ""}`} aria-label={`${kid.name} has ${tokenLabel(kid.theme, kid.balance)}`}>
                <div className="jar-head">
                  <span>{kid.goalName ? `Saving for ${kid.goalName}` : "Treasure jar"}</span>
                  <strong>{tok.emoji} {kid.balance}{kid.goalCost > 0 ? ` / ${kid.goalCost}` : ""}</strong>
                </div>
                {kid.goalCost > 0 && <div className="jar-bar"><i style={{ width: `${kid.goal.fraction * 100}%` }} /></div>}
                <div className="jar-tokens" aria-hidden="true">{tok.emoji.repeat(Math.min(kid.balance, 40))}{kid.balance > 40 ? " …" : ""}</div>
                <div className="jar-foot">
                  <span>{kid.goal.reached ? "Goal reached! Ask a grown-up" : kid.goalCost > 0 ? `${kid.goal.remaining} more to go` : ""}</span>
                  <span className="streak">{kid.streak > 0 ? `🔥 ${kid.streak} day${kid.streak === 1 ? "" : "s"} in a row` : ""}</span>
                </div>
              </div>
            </section>
          );
        })}
      </main>

      {pinOpen && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setPinOpen(false); }}>
          <PinPad title="Grown-ups" onUnlocked={() => router.push("/settings")} onCancel={() => setPinOpen(false)} />
        </div>
      )}
      {toast && <div id="toast" role="status">{toast}</div>}
    </div>
  );
}

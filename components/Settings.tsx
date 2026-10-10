"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useState } from "react";

import { api, ApiError, fmtTime, type FamilyState } from "@/lib/client";
import { hhmmToMinutes } from "@/lib/dates";
import { DAY_NAMES, dateRange, formatDateSuffix, formatTaskLine, isTaskScheduled, parseTaskLine } from "@/lib/schedule";
import { COLOUR_KEYS, COLOURS, TOKEN_KEYS, TOKENS, tokenLabel } from "@/lib/themes";

import { PinPad } from "./PinPad";

type Tab = "kids" | "calendar" | "rewards" | "family";
type KidState = FamilyState["kids"][number];
type RoutineForm = { id?: string; name: string; startTime: string; endTime: string; days: number[]; bonus: number; streak: boolean; tasks: string };
type KidForm = { id?: string; name: string; colour: string; theme: string; goalName: string; goalCost: number; routines: RoutineForm[] };
type HistoryRow = { id: string; date: string; kind: string; amount: number; note: string; routine: string | null; createdAt: string };
type Run = (label: string, fn: () => Promise<void>) => Promise<boolean>;

const KIND_LABEL: Record<string, string> = { task: "Job", all_done: "On-time bonus", streak: "Streak bonus", claim: "Goal claimed", adjust: "Grown-up adjustment" };

function toForm(k: KidState, today: string): KidForm {
  return {
    id: k.id, name: k.name, colour: k.colour, theme: k.theme, goalName: k.goalName, goalCost: k.goalCost,
    routines: k.routines.map((r) => ({ id: r.id, name: r.name, startTime: r.startTime, endTime: r.endTime, days: r.days, bonus: r.bonus, streak: r.streak, tasks: r.allTasks.map((t) => formatTaskLine(t, today)).join("\n") })),
  };
}

const NEW_ROUTINE: RoutineForm = { name: "Evening", startTime: "17:00", endTime: "18:30", days: [1, 2, 3, 4, 5], bonus: 2, streak: false, tasks: "Homework\nRead a book" };

export function Settings({ initial, parentName, unlocked: initiallyUnlocked }: { initial: FamilyState; parentName: string; unlocked: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [unlocked, setUnlocked] = useState(initiallyUnlocked);
  const [tab, setTab] = useState<Tab>("kids");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => { setState(await api<FamilyState>("/api/state")); }, []);
  function say(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2000); }

  const run: Run = async (label, fn) => {
    setBusy(true); setError("");
    try { await fn(); await refresh(); say(label); return true; }
    catch (e) {
      if (e instanceof ApiError && e.code === "pin_required") { setUnlocked(false); return false; }
      setError(e instanceof ApiError ? e.message || "That did not work" : "That did not work");
      return false;
    } finally { setBusy(false); }
  };

  if (!unlocked) {
    return <div className="auth"><PinPad title="Grown-ups" onUnlocked={() => setUnlocked(true)} onCancel={() => router.push("/board")} /></div>;
  }

  const f = state.family;
  return (
    <div className="sheet">
      <div className="kid-head">
        <h1 style={{ flex: 1 }}>Grown-ups</h1>
        <Link className="btn" href="/board">← Board</Link>
      </div>
      <div className="tabs" role="tablist">
        {(["kids", "calendar", "rewards", "family"] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" className="btn small" aria-selected={tab === t} onClick={() => { setTab(t); setError(""); }}>
            {{ kids: "Kids and routines", calendar: "Calendar", rewards: "Rewards", family: "Family" }[t]}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      {tab === "kids" && <KidsTab key={state.kids.map((k) => k.id + k.routines.map((r) => r.id).join()).join(",")} state={state} busy={busy} run={run} />}
      {tab === "calendar" && <CalendarTab state={state} busy={busy} run={run} />}
      {tab === "rewards" && <RewardsTab state={state} busy={busy} run={run} />}
      {tab === "family" && <FamilyTab f={f} parentName={parentName} busy={busy} run={run} />}

      {toast && <div id="toast" role="status">{toast}</div>}
    </div>
  );
}

function DaysPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="days" role="group" aria-label="Days">
      {order.map((d) => (
        <label key={d}><input type="checkbox" checked={value.includes(d)} onChange={(e) => onChange(e.target.checked ? [...new Set([...value, d])].sort() : value.filter((x) => x !== d))} />{DAY_NAMES[d]}</label>
      ))}
    </div>
  );
}

function KidsTab({ state, busy, run }: { state: FamilyState; busy: boolean; run: Run }) {
  const [forms, setForms] = useState<KidForm[]>(() => state.kids.map((k) => toForm(k, state.today)));
  const update = (i: number, patch: Partial<KidForm>) => setForms((fs) => fs.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const updateR = (i: number, ri: number, patch: Partial<RoutineForm>) => setForms((fs) => fs.map((k, j) => (j !== i ? k : { ...k, routines: k.routines.map((r, n) => (n === ri ? { ...r, ...patch } : r)) })));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const kids = forms.map((k) => ({
      ...k,
      routines: k.routines.map((r) => ({ ...r, tasks: r.tasks.split("\n").map((line) => parseTaskLine(line, state.today)).filter(Boolean) })),
    }));
    void run("Saved", () => api("/api/kids", { method: "PUT", json: { kids } }).then(() => undefined));
  }

  return (
    <form onSubmit={submit}>
      <p className="hint">After a job, add <b>(Tue)</b> or <b>(Mon, Thu)</b> to limit it to those days (within the routine&apos;s days), or <b>(14 Oct)</b> for a one-off on that date. Up to 20 jobs per routine.</p>
      <div className="cols" style={{ marginTop: 10 }}>
        {forms.map((k, i) => (
          <div key={k.id ?? `new-${i}`} className="kidcard">
            <header>
              <h3>{k.name || "New kid"}</h3>
              <button type="button" className="btn small danger" disabled={forms.length <= 1} onClick={() => setForms((fs) => fs.filter((_, j) => j !== i))}>Remove</button>
            </header>
            <label>Name<input value={k.name} maxLength={20} required onChange={(e) => update(i, { name: e.target.value })} /></label>
            <div className="times">
              <label>Colour<select value={k.colour} onChange={(e) => update(i, { colour: e.target.value })}>{COLOUR_KEYS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
              <label>Tokens<select value={k.theme} onChange={(e) => update(i, { theme: e.target.value })}>{TOKEN_KEYS.map((t) => <option key={t} value={t}>{TOKENS[t].emoji} {TOKENS[t].many}</option>)}</select></label>
            </div>
            <div className="times">
              <label>Saving for<input value={k.goalName} maxLength={40} placeholder="Trip to the park" onChange={(e) => update(i, { goalName: e.target.value })} /></label>
              <label>Goal costs<input type="number" required min={0} max={1000} value={k.goalCost} onChange={(e) => update(i, { goalCost: Number(e.target.value) })} /></label>
            </div>
            <span style={{ display: "inline-block", width: 24, height: 24, borderRadius: 8, background: COLOURS[k.colour as keyof typeof COLOURS]?.k ?? "#ccc" }} aria-hidden="true" />

            {k.routines.map((r, ri) => (
              <div key={r.id ?? `new-${ri}`} className="kidcard" style={{ padding: 10 }}>
                <header>
                  <h3 style={{ fontSize: "1rem" }}>{r.name || "Routine"}</h3>
                  <label className="row" style={{ fontSize: ".75rem" }}><input type="radio" name={`streak-${i}`} checked={r.streak} onChange={() => setForms((fs) => fs.map((kk, j) => (j !== i ? kk : { ...kk, routines: kk.routines.map((rr, n) => ({ ...rr, streak: n === ri })) })))} />counts for streak</label>
                  <button type="button" className="btn small danger" disabled={k.routines.length <= 1} onClick={() => update(i, { routines: k.routines.filter((_, n) => n !== ri) })}>Remove</button>
                </header>
                <label>Routine name<input value={r.name} maxLength={30} required onChange={(e) => updateR(i, ri, { name: e.target.value })} /></label>
                <div className="times">
                  <label>Starts<input type="time" value={r.startTime} required onChange={(e) => updateR(i, ri, { startTime: e.target.value })} /></label>
                  <label>Finish by<input type="time" value={r.endTime} required onChange={(e) => updateR(i, ri, { endTime: e.target.value })} /></label>
                </div>
                <DaysPicker value={r.days} onChange={(days) => updateR(i, ri, { days })} />
                <label>Bonus for finishing on time<input type="number" required min={0} max={50} value={r.bonus} onChange={(e) => updateR(i, ri, { bonus: Number(e.target.value) })} style={{ width: 100 }} /></label>
                <label>Jobs, one per line<textarea value={r.tasks} style={{ minHeight: 120 }} onChange={(e) => updateR(i, ri, { tasks: e.target.value })} /></label>
              </div>
            ))}
            <div className="actions">
              <button type="button" className="btn small left" disabled={k.routines.length >= 6} onClick={() => update(i, { routines: [...k.routines, { ...NEW_ROUTINE }] })}>+ Add a routine</button>
              {state.kids.filter((o) => o.id !== k.id).map((o) => k.id && (
                <button key={o.id} type="button" className="btn small" disabled={busy} onClick={() => { if (confirm(`Replace ${o.name}'s routines with ${k.name}'s?`)) void run(`Copied to ${o.name}`, () => api(`/api/kids/${k.id}/copy-routines`, { json: { toKidId: o.id } }).then(() => undefined)); }}>Copy to {o.name}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn left" disabled={forms.length >= 6} onClick={() => setForms((fs) => [...fs, { name: "", colour: COLOUR_KEYS[fs.length % COLOUR_KEYS.length], theme: TOKEN_KEYS[fs.length % TOKEN_KEYS.length], goalName: "", goalCost: 20, routines: [{ name: "Morning", startTime: "07:00", endTime: "08:15", days: [1, 2, 3, 4, 5], bonus: 3, streak: true, tasks: "Get up\nBrush teeth" }] }])}>+ Add a kid</button>
        <button className="btn primary" type="submit" disabled={busy}>Save</button>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>Removing a kid hides them and keeps their history. Renaming a job resets today&apos;s tick for it.</p>
    </form>
  );
}

function CalendarTab({ state, busy, run }: { state: FamilyState; busy: boolean; run: Run }) {
  const days = dateRange(state.today, 7);
  const [kidId, setKidId] = useState(state.kids[0]?.id ?? "");
  const kid = state.kids.find((k) => k.id === kidId) ?? state.kids[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {state.kids.map((k) => (
        <div key={k.id}>
          <h3>{k.name}</h3>
          <div className="daygrid" style={{ marginTop: 8 }}>
            {days.map((d) => {
              const [, , dd] = d.split("-");
              const w = new Date(`${d}T12:00:00`).getDay();
              return (
                <div key={d} className={d === state.today ? "today" : ""}>
                  <b>{DAY_NAMES[w]} {Number(dd)}</b>
                  {k.routines.map((r) => {
                    const jobs = r.allTasks.filter((t) => isTaskScheduled({ days: t.days, date: t.date }, r, d));
                    if (!jobs.length) return null;
                    return (
                      <div key={r.id}>
                        <div className="r">{r.name} · {fmtTime(hhmmToMinutes(r.startTime))}</div>
                        {jobs.map((t) => <div key={t.id} className={t.date ? "one" : ""}>{t.date ? "📌 " : ""}{t.label}</div>)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form); void run("Added", () => api("/api/tasks", { json: { routineId: d.get("routineId"), label: d.get("label"), date: d.get("date") } }).then(() => { form.reset(); })); }}>
        <h3>Add a one-off job</h3>
        <div className="times" style={{ marginTop: 8 }}>
          <label>Kid<select value={kidId} onChange={(e) => setKidId(e.target.value)}>{state.kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
          <label>Routine<select name="routineId" required>{kid?.routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        </div>
        <div className="times" style={{ marginTop: 10 }}>
          <label>Job<input name="label" maxLength={40} required placeholder="Dentist form" /></label>
          <label>Date<input name="date" type="date" required min={state.today} /></label>
        </div>
        <div className="actions" style={{ marginTop: 10 }}><button className="btn primary" type="submit" disabled={busy}>Add</button></div>
        <p className="hint">One-offs also appear in the routine&apos;s job list as, for example, &quot;Dentist form ({formatDateSuffix(state.today)})&quot;, where you can remove them.</p>
      </form>
    </div>
  );
}

function RewardsTab({ state, busy, run }: { state: FamilyState; busy: boolean; run: Run }) {
  const f = state.family;
  const [histFor, setHistFor] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  async function showHistory(kidId: string) {
    setHistFor(kidId);
    try { setRows((await api<{ rows: HistoryRow[] }>(`/api/kids/${kidId}/history`)).rows); } catch { setRows([]); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); void run("Saved", () => api("/api/family", { method: "PUT", json: {
        tokenPerTask: Number(d.get("tokenPerTask")), streakLength: Number(d.get("streakLength")), streakBonus: Number(d.get("streakBonus")), schoolDaysOnly: d.get("schoolDaysOnly") === "on",
      } }).then(() => undefined)); }}>
        <h3>Rules</h3>
        <p className="hint">The bonus for finishing a routine on time is set per routine under Kids and routines.</p>
        <div className="cols" style={{ marginTop: 8 }}>
          <div>
            <label>Tokens per job<input name="tokenPerTask" type="number" required min={0} max={10} defaultValue={f.tokenPerTask} /></label>
            <label className="row"><input name="schoolDaysOnly" type="checkbox" defaultChecked={f.schoolDaysOnly} />Streaks count school days only</label>
          </div>
          <div>
            <label>Streak length (days in a row)<input name="streakLength" type="number" required min={0} max={30} defaultValue={f.streakLength} /></label>
            <label>Streak bonus<input name="streakBonus" type="number" required min={0} max={50} defaultValue={f.streakBonus} /></label>
          </div>
        </div>
        <div className="actions" style={{ marginTop: 12 }}><button className="btn primary" type="submit" disabled={busy}>Save rules</button></div>
      </form>

      <h3>Jars</h3>
      {state.kids.map((k) => (
        <div key={k.id} className="kidcard">
          <header>
            <h3>{k.name}: {TOKENS[k.theme as keyof typeof TOKENS]?.emoji} {tokenLabel(k.theme, k.balance)}</h3>
            {k.streak > 0 && <span className="streak">🔥 {k.streak}</span>}
          </header>
          <p className="hint">{k.goalName ? `Saving for ${k.goalName} (${k.goalCost})` : "No goal set"}{k.goal.reached ? " · goal reached" : k.goalCost > 0 ? ` · ${k.goal.remaining} to go` : ""}</p>
          <div className="actions">
            <button type="button" className="btn left" onClick={() => void showHistory(k.id)}>History</button>
            <form style={{ display: "flex", gap: 6, alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form); void run("Adjusted", () => api(`/api/kids/${k.id}/adjust`, { json: { amount: Number(d.get("amount")), note: String(d.get("note")) } }).then(() => { form.reset(); })); }}>
              <label>± tokens<input name="amount" type="number" min={-500} max={500} required style={{ width: 90 }} /></label>
              <label>Why<input name="note" maxLength={80} placeholder="Tidied bedroom" style={{ width: 160 }} /></label>
              <button className="btn" type="submit" disabled={busy}>Adjust</button>
            </form>
            <button type="button" className="btn primary" disabled={busy || !k.goal.reached} onClick={() => void run(`${k.name} claimed ${k.goalName || "the goal"}!`, () => api(`/api/kids/${k.id}/claim`, { json: {} }).then(() => undefined))}>Claim goal</button>
          </div>
          {histFor === k.id && (
            <table className="ledger">
              <tbody>
                {rows.length === 0 && <tr><td colSpan={3} className="hint">Nothing yet</td></tr>}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{KIND_LABEL[r.kind] ?? r.kind}{r.routine ? ` · ${r.routine}` : ""}{r.note ? ` · ${r.note}` : ""}</td>
                    <td className={`amt${r.amount < 0 ? " neg" : ""}`}>{r.amount > 0 ? `+${r.amount}` : r.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

function FamilyTab({ f, parentName, busy, run }: { f: FamilyState["family"]; parentName: string; busy: boolean; run: Run }) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); void run("Saved", () => api("/api/family", { method: "PUT", json: { name: d.get("name"), timezone: d.get("timezone") } }).then(() => undefined)); }}>
        <div className="times">
          <label>Family name<input name="name" defaultValue={f.name} maxLength={40} /></label>
          <label>Timezone<input name="timezone" defaultValue={f.timezone} required /></label>
        </div>
        <div className="actions" style={{ marginTop: 8 }}><button className="btn primary" type="submit" disabled={busy}>Save</button></div>
      </form>
      <div>
        <h3>Another grown-up?</h3>
        <p className="hint">They sign up with this family code and see the same board.</p>
        <span className="code">{f.inviteCode}</span>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form); void run(f.hasPin ? "PIN changed" : "PIN set", () => api("/api/pin", { method: "PUT", json: { pin: d.get("pin") } }).then(() => { form.reset(); })); }}>
        <h3>{f.hasPin ? "Change the grown-up PIN" : "Set a grown-up PIN"}</h3>
        <p className="hint">{f.hasPin ? "Four digits. Needed to open these screens from the board." : "Until a PIN is set, anyone on the board can open these screens."}</p>
        <label>New PIN<input name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} required placeholder="1234" style={{ width: 120 }} /></label>
        <div className="actions" style={{ marginTop: 8 }}><button className="btn primary" type="submit" disabled={busy}>{f.hasPin ? "Change PIN" : "Set PIN"}</button></div>
      </form>
      <div className="actions">
        <span className="hint left">Signed in as {parentName}</span>
        <button type="button" className="btn" onClick={() => void api("/api/pin", { method: "DELETE" }).then(() => router.push("/board"))}>Lock and go to board</button>
        <button type="button" className="btn danger" onClick={() => void signOut({ callbackUrl: "/login" })}>Sign out</button>
      </div>
    </div>
  );
}

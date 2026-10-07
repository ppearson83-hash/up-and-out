"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useState } from "react";

import { api, ApiError, type FamilyState } from "@/lib/client";
import { COLOUR_KEYS, COLOURS, TOKEN_KEYS, TOKENS, tokenLabel } from "@/lib/themes";

import { PinPad } from "./PinPad";

type Tab = "times" | "kids" | "rewards" | "family";
type KidForm = { id?: string; name: string; colour: string; theme: string; goalName: string; goalCost: number; tasks: string };
type HistoryRow = { id: string; date: string; kind: string; amount: number; note: string; createdAt: string };

const KIND_LABEL: Record<string, string> = { task: "Job", all_done: "All done bonus", streak: "Streak bonus", claim: "Goal claimed", adjust: "Grown-up adjustment" };

export function Settings({ initial, parentName, unlocked: initiallyUnlocked }: { initial: FamilyState; parentName: string; unlocked: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [unlocked, setUnlocked] = useState(initiallyUnlocked);
  const [tab, setTab] = useState<Tab>("times");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => { setState(await api<FamilyState>("/api/state")); }, []);
  function say(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2000); }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); await refresh(); say(label); return true; }
    catch (e) {
      if (e instanceof ApiError && e.code === "pin_required") { setUnlocked(false); return false; }
      setError(e instanceof ApiError ? e.message || "That did not work" : "That did not work");
      return false;
    } finally { setBusy(false); }
  }

  if (!unlocked) {
    return (
      <div className="auth">
        <PinPad title="Grown-ups" onUnlocked={() => setUnlocked(true)} onCancel={() => router.push("/board")} />
      </div>
    );
  }

  const f = state.family;
  return (
    <div className="sheet">
      <div className="kid-head">
        <h1 style={{ flex: 1 }}>Grown-ups</h1>
        <Link className="btn" href="/board">← Board</Link>
      </div>
      <div className="tabs" role="tablist">
        {(["times", "kids", "rewards", "family"] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" className="btn small" aria-selected={tab === t} onClick={() => { setTab(t); setError(""); }}>
            {{ times: "Times", kids: "Kids and jobs", rewards: "Rewards", family: "Family" }[t]}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      {tab === "times" && <TimesTab f={f} busy={busy} onSave={(patch) => run("Saved", () => api("/api/family", { method: "PUT", json: patch }).then(() => undefined))} />}
      {tab === "kids" && <KidsTab key={state.kids.map((k) => k.id).join(",")} kids={state.kids} busy={busy} onSave={(kids) => run("Saved", () => api("/api/kids", { method: "PUT", json: { kids } }).then(() => undefined))} />}
      {tab === "rewards" && <RewardsTab state={state} busy={busy} run={run} />}
      {tab === "family" && <FamilyTab f={f} parentName={parentName} busy={busy} run={run} />}

      {toast && <div id="toast" role="status">{toast}</div>}
    </div>
  );
}

function TimesTab({ f, busy, onSave }: { f: FamilyState["family"]; busy: boolean; onSave: (patch: Record<string, unknown>) => Promise<boolean> }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); void onSave({
      startTime: d.get("startTime"), leaveTime: d.get("leaveTime"), timezone: d.get("timezone"), schoolDaysOnly: d.get("schoolDaysOnly") === "on",
    }); }}>
      <div className="times">
        <label>Morning starts<input name="startTime" type="time" defaultValue={f.startTime} required /></label>
        <label>Leave for school<input name="leaveTime" type="time" defaultValue={f.leaveTime} required /></label>
      </div>
      <label style={{ marginTop: 12 }}>Timezone<input name="timezone" defaultValue={f.timezone} required /></label>
      <label className="row" style={{ marginTop: 12 }}><input name="schoolDaysOnly" type="checkbox" defaultChecked={f.schoolDaysOnly} />Streaks count school days only (weekends do not break a streak)</label>
      <div className="actions" style={{ marginTop: 16 }}><button className="btn primary" type="submit" disabled={busy}>Save</button></div>
    </form>
  );
}

function KidsTab({ kids, busy, onSave }: { kids: FamilyState["kids"]; busy: boolean; onSave: (kids: Omit<KidForm, "tasks">[] & { tasks: string[] }[]) => Promise<boolean> }) {
  const [forms, setForms] = useState<KidForm[]>(() => kids.map((k) => ({ id: k.id, name: k.name, colour: k.colour, theme: k.theme, goalName: k.goalName, goalCost: k.goalCost, tasks: k.tasks.map((t) => t.label).join("\n") })));
  const update = (i: number, patch: Partial<KidForm>) => setForms((fs) => fs.map((k, j) => (j === i ? { ...k, ...patch } : k)));

  return (
    <form onSubmit={(e) => { e.preventDefault(); void onSave(forms.map((k) => ({ ...k, tasks: k.tasks.split("\n").map((s) => s.trim()).filter(Boolean) }))); }}>
      <div className="cols">
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
              <label>Goal costs<input type="number" min={0} max={1000} value={k.goalCost} onChange={(e) => update(i, { goalCost: Number(e.target.value) })} /></label>
            </div>
            <label>Jobs, one per line<textarea value={k.tasks} onChange={(e) => update(i, { tasks: e.target.value })} /></label>
            <span style={{ display: "inline-block", width: 24, height: 24, borderRadius: 8, background: COLOURS[k.colour as keyof typeof COLOURS]?.k ?? "#ccc" }} aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn left" disabled={forms.length >= 6} onClick={() => setForms((fs) => [...fs, { name: "", colour: COLOUR_KEYS[fs.length % COLOUR_KEYS.length], theme: TOKEN_KEYS[fs.length % TOKEN_KEYS.length], goalName: "", goalCost: 20, tasks: "Get up\nBrush teeth" }])}>+ Add a kid</button>
        <button className="btn primary" type="submit" disabled={busy}>Save</button>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>Removing a kid hides them and keeps their history. Renaming a job resets today&apos;s tick for it.</p>
    </form>
  );
}

function RewardsTab({ state, busy, run }: { state: FamilyState; busy: boolean; run: (label: string, fn: () => Promise<void>) => Promise<boolean> }) {
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
        tokenPerTask: Number(d.get("tokenPerTask")), allDoneBonus: Number(d.get("allDoneBonus")), streakLength: Number(d.get("streakLength")), streakBonus: Number(d.get("streakBonus")),
      } }).then(() => undefined)); }}>
        <h3>Rules</h3>
        <div className="cols" style={{ marginTop: 8 }}>
          <div>
            <label>Tokens per job<input name="tokenPerTask" type="number" required min={0} max={10} defaultValue={f.tokenPerTask} /></label>
            <label>Bonus for everything done before leaving time<input name="allDoneBonus" type="number" required min={0} max={50} defaultValue={f.allDoneBonus} /></label>
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
                    <td>{KIND_LABEL[r.kind] ?? r.kind}{r.note ? ` · ${r.note}` : ""}</td>
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

function FamilyTab({ f, parentName, busy, run }: { f: FamilyState["family"]; parentName: string; busy: boolean; run: (label: string, fn: () => Promise<void>) => Promise<boolean> }) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); void run("Saved", () => api("/api/family", { method: "PUT", json: { name: d.get("name") } }).then(() => undefined)); }}>
        <label>Family name<input name="name" defaultValue={f.name} maxLength={40} /></label>
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

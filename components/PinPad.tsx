"use client";
import { useState } from "react";

import { api, ApiError } from "@/lib/client";

/**
 * Four-digit PIN entry. On success the server has set the unlock cookie and
 * onUnlocked fires. If the family has no PIN yet the server unlocks at once.
 */
export function PinPad({ title, onUnlocked, onCancel }: { title: string; onUnlocked: () => void; onCancel?: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    setBusy(true); setError("");
    try {
      await api("/api/pin", { json: { pin: value } });
      onUnlocked();
    } catch (e) {
      setError(e instanceof ApiError && e.code === "wrong_pin" ? "Wrong PIN, try again" : "Something went wrong");
      setPin("");
    } finally {
      setBusy(false);
    }
  }
  function press(d: string) {
    if (busy) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) void submit(next);
  }

  return (
    <div className="sheet" role="dialog" aria-label={title}>
      <h2>{title}</h2>
      <p className="hint">Grown-ups only. Enter the family PIN.</p>
      <div className="pin-dots" aria-live="polite">{[0, 1, 2, 3].map((i) => <span key={i}>{i < pin.length ? "●" : "○"}</span>)}</div>
      <div className="pinpad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="btn" onClick={() => press(d)} disabled={busy}>{d}</button>
        ))}
        <button type="button" className="btn" onClick={() => setPin("")} disabled={busy}>Clear</button>
        <button type="button" className="btn" onClick={() => press("0")} disabled={busy}>0</button>
        <button type="button" className="btn" onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy}>⌫</button>
      </div>
      {error && <p className="error">{error}</p>}
      {onCancel && <div className="actions"><button type="button" className="btn" onClick={onCancel}>Cancel</button></div>}
    </div>
  );
}

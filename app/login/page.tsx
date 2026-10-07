"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const f = new FormData(e.currentTarget);
    const res = await signIn("credentials", { email: String(f.get("email")), password: String(f.get("password")), redirect: false });
    setBusy(false);
    if (res?.error) { setError("Email or password not recognised"); return; }
    router.push("/board"); router.refresh();
  }

  return (
    <div className="auth">
      <form className="sheet" onSubmit={submit}>
        <h1>Up and Out</h1>
        <p className="hint">Grown-up sign in. Kids use the board once you are signed in on this device.</p>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <Link className="btn left" href="/signup">New family</Link>
          <button className="btn primary" type="submit" disabled={busy}>Sign in</button>
        </div>
      </form>
    </div>
  );
}

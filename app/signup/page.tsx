"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { api, ApiError } from "@/lib/client";

const MESSAGES: Record<string, string> = {
  email_taken: "There is already an account with that email",
  invalid_email: "That email does not look right",
  invalid_name: "Please enter your name",
  weak_password: "Password needs at least 8 characters",
  bad_invite: "That family code was not found",
};

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")), password = String(f.get("password"));
    try {
      await api("/api/signup", { json: {
        email, password, name: String(f.get("name")),
        familyName: joining ? undefined : String(f.get("familyName") ?? ""),
        invite: joining ? String(f.get("invite") ?? "") : undefined,
      } });
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) throw new Error("sign in failed");
      router.push(joining ? "/board" : "/settings"); router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? MESSAGES[err.code] ?? "Could not create the account" : "Could not create the account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="sheet" onSubmit={submit}>
        <h1>{joining ? "Join your family" : "New family"}</h1>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" className="btn small" aria-selected={!joining} onClick={() => setJoining(false)}>Start a family</button>
          <button type="button" role="tab" className="btn small" aria-selected={joining} onClick={() => setJoining(true)}>I have a family code</button>
        </div>
        <label>Your name<input name="name" autoComplete="given-name" required maxLength={40} /></label>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
        {joining
          ? <label>Family code<input name="invite" autoComplete="off" required maxLength={8} style={{ textTransform: "uppercase" }} /></label>
          : <label>Family name (optional)<input name="familyName" maxLength={40} placeholder="The Pearsons" /></label>}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <Link className="btn left" href="/login">Sign in instead</Link>
          <button className="btn primary" type="submit" disabled={busy}>{joining ? "Join" : "Create family"}</button>
        </div>
      </form>
    </div>
  );
}

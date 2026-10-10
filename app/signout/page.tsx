"use client";
import { signOut } from "next-auth/react";
import { useEffect } from "react";

/** Clears a session whose family no longer exists, then returns to sign-in. */
export default function SignoutPage() {
  useEffect(() => { void signOut({ callbackUrl: "/login" }); }, []);
  return <div className="auth"><p className="hint">Signing out…</p></div>;
}

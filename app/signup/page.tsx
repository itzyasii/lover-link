"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/Brand";
import { useAuthStore } from "@/stores/auth";

export default function SignupPage() {
  const router = useRouter();
  const signup = useAuthStore((s) => s.signup);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <Brand />
      <div className="glass mt-8 rounded-3xl p-7">
        <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[color:var(--wine-900)]">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-black/60">
          Start a private 1:1 space for calls and chat.
        </p>

        <form
          className="mt-6 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setBusy(true);
            try {
              await signup(email, username, password);
              router.push("/app");
            } catch {
              setError("Could not create account (try a different email/username).");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="grid gap-1 text-sm font-medium text-black/70">
            Email
            <input
              className="focus-ring rounded-2xl border border-black/10 bg-white/70 px-4 py-3"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-black/70">
            Username
            <input
              className="focus-ring rounded-2xl border border-black/10 bg-white/70 px-4 py-3"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="roseheart"
              autoComplete="username"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-black/70">
            Password
            <input
              className="focus-ring rounded-2xl border border-black/10 bg-white/70 px-4 py-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              type="password"
              autoComplete="new-password"
            />
          </label>

          {error ? (
            <div className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            className="focus-ring mt-2 rounded-2xl bg-[color:var(--rose-600)] px-4 py-3 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)] disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Creating…" : "Sign up"}
          </button>
        </form>

        <p className="mt-4 text-sm text-black/60">
          Already have an account?{" "}
          <Link className="font-semibold text-[color:var(--rose-700)]" href="/login">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}


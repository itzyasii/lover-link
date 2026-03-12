"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/Brand";
import { useAuthStore } from "@/stores/auth";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <Brand />
      <div className="glass mt-8 rounded-3xl p-7">
        <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[color:var(--wine-900)]">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-black/60">
          Log in to continue your conversations.
        </p>

        <form
          className="mt-6 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setBusy(true);
            try {
              await login(emailOrUsername, password);
              router.push("/app");
            } catch {
              setError("Invalid credentials.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="grid gap-1 text-sm font-medium text-black/70">
            Email or username
            <input
              className="focus-ring rounded-2xl border border-black/10 bg-white/70 px-4 py-3"
              value={emailOrUsername}
              onChange={(e) => setEmailOrUsername(e.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-black/70">
            Password
            <input
              className="focus-ring rounded-2xl border border-black/10 bg-white/70 px-4 py-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              autoComplete="current-password"
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
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-4 text-sm text-black/60">
          New here?{" "}
          <Link className="font-semibold text-[color:var(--rose-700)]" href="/signup">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}


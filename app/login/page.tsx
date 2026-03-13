"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart, LockKeyhole, MessageCircle, MoonStar } from "lucide-react";
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
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Brand />

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="glass rounded-3xl p-7">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-[color:var(--rose-700)]">
            <Heart className="h-4 w-4" />
            Welcome back
          </div>
          <h1 className="mt-4 font-[family-name:var(--font-serif)] text-3xl leading-tight text-[color:var(--wine-900)]">
            Return to the conversation that still feels like home.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-black/65">
            Log in and pick up where you left off: the note from earlier, the
            photo you wanted to send, or the call waiting to happen tonight.
          </p>

          <div className="mt-6 grid gap-3">
            <div className="rounded-3xl bg-white/55 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--wine-900)]">
                <MessageCircle className="h-4 w-4 text-[color:var(--rose-700)]" />
                Quiet, personal conversations
              </div>
              <p className="mt-2 text-sm text-black/65">
                No crowd, no pressure, just your own shared space.
              </p>
            </div>
            <div className="rounded-3xl bg-white/55 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--wine-900)]">
                <MoonStar className="h-4 w-4 text-[color:var(--rose-700)]" />
                Built for the ordinary hours
              </div>
              <p className="mt-2 text-sm text-black/65">
                Morning check-ins, midday thoughts, and late-night calls.
              </p>
            </div>
          </div>
        </section>

        <section className="glass rounded-3xl p-7">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-[color:var(--rose-700)]">
            <LockKeyhole className="h-4 w-4" />
            Log in
          </div>
          <h2 className="mt-4 font-[family-name:var(--font-serif)] text-2xl text-[color:var(--wine-900)]">
            Your space is waiting
          </h2>
          <p className="mt-1 text-sm text-black/60">
            Use your email or username to come back in.
          </p>

          <form
            className="mt-6 grid gap-4"
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
            <label className="grid gap-1.5 text-sm font-medium text-black/70">
              Email or username
              <input
                className="focus-ring rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-[color:var(--wine-900)] placeholder:text-black/35"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-black/70">
              Password
              <input
                className="focus-ring rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-[color:var(--wine-900)] placeholder:text-black/35"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
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
              className="focus-ring mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--rose-600)] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(198,43,105,0.28)] transition hover:bg-[color:var(--rose-700)] disabled:opacity-60"
              disabled={busy}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/18">
                <Heart className="h-4 w-4" />
              </span>
              {busy ? "Logging in..." : "Log in"}
            </button>
          </form>

          <p className="mt-4 text-sm text-black/60">
            New here?{" "}
            <Link
              className="font-semibold text-[color:var(--rose-700)]"
              href="/signup"
            >
              Create an account
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

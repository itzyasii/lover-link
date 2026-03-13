"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HeartHandshake, LockKeyhole, Sparkles, Users } from "lucide-react";
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
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Brand />

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="glass rounded-3xl p-7">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-[color:var(--rose-700)]">
            <Sparkles className="h-4 w-4" />
            Start softly
          </div>
          <h1 className="mt-4 font-[family-name:var(--font-serif)] text-3xl leading-tight text-[color:var(--wine-900)]">
            Make a warm little space for the two of you.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-black/65">
            Set up your account and start the kind of conversation that feels
            private, easy to return to, and close in all the right ways.
          </p>

          <div className="mt-6 grid gap-3">
            <div className="rounded-3xl bg-white/55 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--wine-900)]">
                <HeartHandshake className="h-4 w-4 text-[color:var(--rose-700)]" />
                Built for two
              </div>
              <p className="mt-2 text-sm text-black/65">
                One calm space for shared moments, sweet notes, and long calls.
              </p>
            </div>
            <div className="rounded-3xl bg-white/55 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--wine-900)]">
                <Users className="h-4 w-4 text-[color:var(--rose-700)]" />
                Easy to make yours
              </div>
              <p className="mt-2 text-sm text-black/65">
                Pick your name, settle in, and let the conversation grow from
                there.
              </p>
            </div>
          </div>
        </section>

        <section className="glass rounded-3xl p-7">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-[color:var(--rose-700)]">
            <LockKeyhole className="h-4 w-4" />
            Sign up
          </div>
          <h2 className="mt-4 font-[family-name:var(--font-serif)] text-2xl text-[color:var(--wine-900)]">
            Create your account
          </h2>
          <p className="mt-1 text-sm text-black/60">
            Just a few details, then your space is ready.
          </p>

          <form
            className="mt-6 grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setBusy(true);
              try {
                await signup(email, username, password);
                router.push("/app");
              } catch {
                setError(
                  "Could not create account. Try a different email or username.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="grid gap-1.5 text-sm font-medium text-black/70">
              Email
              <input
                className="focus-ring rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-[color:var(--wine-900)] placeholder:text-black/35"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-black/70">
              Username
              <input
                className="focus-ring rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-[color:var(--wine-900)] placeholder:text-black/35"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="roseheart"
                autoComplete="username"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-black/70">
              Password
              <input
                className="focus-ring rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-[color:var(--wine-900)] placeholder:text-black/35"
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
              className="focus-ring mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--rose-600)] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(198,43,105,0.28)] transition hover:bg-[color:var(--rose-700)] disabled:opacity-60"
              disabled={busy}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/18">
                <HeartHandshake className="h-4 w-4" />
              </span>
              {busy ? "Creating..." : "Sign up"}
            </button>
          </form>

          <p className="mt-4 text-sm text-black/60">
            Already have an account?{" "}
            <Link
              className="font-semibold text-[color:var(--rose-700)]"
              href="/login"
            >
              Log in
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

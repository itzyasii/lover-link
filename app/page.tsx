  "use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  Coffee,
  Heart,
  HeartCrack,
  HeartHandshake,
  LockKeyhole,
  MessageCircle,
  MoonStar,
  Phone,
  Sparkles,
  Users,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { useAuthStore } from "@/stores/auth";

export default function Home() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);

  const loggedIn = Boolean(accessToken);
  const name = me?.username || me?.email || "love";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-3">
          {loggedIn ? (
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-[color:var(--card-border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[color:var(--wine-900)] shadow-[0_10px_30px_rgba(59,10,34,0.08)] transition hover:-translate-y-0.5 hover:bg-white/85"
              onClick={() => void logout().then(() => router.refresh())}
              type="button"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,215,231,0.92))] text-[color:var(--rose-700)] shadow-sm">
                <HeartCrack className="h-4 w-4" />
              </span>
              <span className="leading-none">Log out</span>
            </button>
          ) : (
            <>
              <Link
                className="focus-ring inline-flex items-center gap-2 rounded-full border border-[color:var(--card-border)] bg-white/72 px-4 py-2 text-sm font-semibold text-[color:var(--wine-900)] shadow-[0_10px_24px_rgba(59,10,34,0.08)] transition hover:-translate-y-0.5 hover:bg-white/88"
                href="/login"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,236,242,0.94))] text-[color:var(--rose-700)] shadow-sm">
                  <Heart className="h-4 w-4" />
                </span>
                <span className="leading-none">Log in</span>
              </Link>
              <Link
                className="focus-ring inline-flex items-center gap-2 rounded-full bg-[color:var(--rose-600)] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(198,43,105,0.28)] transition hover:-translate-y-0.5 hover:bg-[color:var(--rose-700)]"
                href="/signup"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 shadow-sm">
                  <HeartHandshake className="h-4 w-4" />
                </span>
                <span className="leading-none">Sign up</span>
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="mt-14 grid gap-10 lg:grid-cols-2 lg:items-center">
        <section className="glass rounded-3xl p-8">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-[color:var(--rose-700)]">
            <Sparkles className="h-4 w-4" /> Soft. Romantic. Present.
          </p>

          <h1 className="mt-4 font-[family-name:var(--font-serif)] text-4xl leading-tight text-[color:var(--wine-900)] md:text-5xl">
            {loggedIn
              ? `Welcome back, ${name}.`
              : "LoverLink - a quiet place to stay close."}
          </h1>

          {loggedIn ? (
            <p className="mt-4 text-base text-black/70">
              Pick up where you left off, send something gentle, or turn a
              quiet moment into a call.
            </p>
          ) : (
            <p className="mt-4 max-w-xl text-base text-black/70">
              Messages, shared moments, and warm calls in one private space for
              two.
            </p>
          )}

          <div className="mt-5 rounded-3xl bg-white/55 p-5 text-sm text-black/70">
            <div className="flex items-center gap-2 font-semibold text-[color:var(--wine-900)]">
              <Heart className="h-4 w-4 text-[color:var(--rose-700)]" />
              Today&apos;s little prompt
            </div>
            <div className="mt-2 leading-relaxed">
              Tell them one small thing you noticed recently, and why it made
              you love them a little more.
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {loggedIn ? (
              <>
                <Link
                  className="focus-ring inline-flex items-center gap-2 rounded-full bg-[color:var(--rose-600)] px-5 py-3 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)]"
                  href="/app"
                >
                  <MessageCircle className="h-4 w-4" /> Open chats
                </Link>
                <Link
                  className="focus-ring inline-flex items-center gap-2 rounded-full bg-black/5 px-5 py-3 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
                  href="/app/friends"
                >
                  <Users className="h-4 w-4" /> See your people
                </Link>
                <Link
                  className="focus-ring inline-flex items-center gap-2 rounded-full bg-black/5 px-5 py-3 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
                  href="/app/calls"
                >
                  <Phone className="h-4 w-4" /> Start a call
                </Link>
              </>
            ) : (
              <>
                <Link
                  className="focus-ring inline-flex items-center gap-2 rounded-full bg-[color:var(--rose-600)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(198,43,105,0.28)] transition hover:-translate-y-0.5 hover:bg-[color:var(--rose-700)]"
                  href="/signup"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white/18">
                    <HeartHandshake className="h-4 w-4" />
                  </span>
                  Create your account
                </Link>
                <Link
                  className="focus-ring inline-flex items-center gap-2 rounded-full border border-[color:var(--card-border)] bg-white/72 px-5 py-3 text-sm font-semibold text-[color:var(--wine-900)] shadow-[0_10px_24px_rgba(59,10,34,0.08)] transition hover:-translate-y-0.5 hover:bg-white/88"
                  href="/login"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,236,242,0.94))] text-[color:var(--rose-700)] shadow-sm">
                    <MessageCircle className="h-4 w-4" />
                  </span>
                  Open conversation
                </Link>
              </>
            )}
          </div>

          {loggedIn ? (
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <div className="rounded-3xl bg-white/50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--wine-900)]">
                  <Coffee className="h-4 w-4 text-[color:var(--rose-700)]" />
                  Morning check-ins
                </div>
                <p className="mt-2 text-sm leading-relaxed text-black/65">
                  For the first thought of the day and the little note that
                  follows it.
                </p>
              </div>
              <div className="rounded-3xl bg-white/50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--wine-900)]">
                  <Camera className="h-4 w-4 text-[color:var(--rose-700)]" />
                  Tiny moments
                </div>
                <p className="mt-2 text-sm leading-relaxed text-black/65">
                  A photo, a laugh, a voice note, a soft &quot;this made me
                  think of you.&quot;
                </p>
              </div>
              <div className="rounded-3xl bg-white/50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--wine-900)]">
                  <MoonStar className="h-4 w-4 text-[color:var(--rose-700)]" />
                  Nightly closeness
                </div>
                <p className="mt-2 text-sm leading-relaxed text-black/65">
                  When texting turns into calling and nobody wants to hang up
                  first.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-white/50 p-4 text-sm text-black/65">
                Private by default
              </div>
              <div className="rounded-3xl bg-white/50 p-4 text-sm text-black/65">
                Built for two people
              </div>
              <div className="rounded-3xl bg-white/50 p-4 text-sm text-black/65">
                Easy to return to
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-4">
          {loggedIn ? (
            <>
              <div className="glass rounded-3xl p-6">
                <h2 className="font-[family-name:var(--font-serif)] text-xl text-[color:var(--wine-900)]">
                  A space that feels personal
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-black/70">
                  Not a crowded feed. Not a place to perform. Just one warm
                  space where your everyday affection has room to stay.
                </p>
              </div>

              <div className="glass rounded-3xl p-6">
                <h2 className="font-[family-name:var(--font-serif)] text-xl text-[color:var(--wine-900)]">
                  Private by default
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-black/70">
                  Your conversations stay between the two of you, without the
                  pressure, noise, or audience that usually comes with being
                  online.
                </p>
              </div>

              <div className="glass overflow-hidden rounded-3xl p-0">
                <div className="border-b border-white/60 bg-white/55 px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[color:var(--wine-900)]">
                        A little glimpse
                      </div>
                      <div className="mt-1 text-xs text-black/55">
                        The kind of conversation you come back to all day.
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-[color:var(--wine-900)]">
                      <LockKeyhole className="h-3.5 w-3.5 text-[color:var(--rose-700)]" />
                      Just for two
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,240,246,0.78))] p-5 text-sm text-[color:var(--wine-900)]">
                  <div className="max-w-[82%] rounded-3xl rounded-bl-xl bg-white/85 px-4 py-3 shadow-sm">
                    Reached home. I still keep smiling about your message from
                    earlier.
                  </div>
                  <div className="ml-auto max-w-[82%] rounded-3xl rounded-br-xl bg-[color:var(--peach-200)] px-4 py-3 shadow-sm">
                    Then keep this one too: I miss you already.
                  </div>
                  <div className="max-w-[82%] rounded-3xl rounded-bl-xl bg-white/85 px-4 py-3 shadow-sm">
                    Call me when you can? I want to hear your voice before
                    sleep.
                  </div>
                  <div className="flex items-center justify-between rounded-3xl bg-white/70 px-4 py-3 text-xs font-semibold text-black/60">
                    <span>Tonight feels like a long call kind of night.</span>
                    <span className="rounded-full bg-[color:var(--rose-600)] px-3 py-1 text-white">
                      Call
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="glass rounded-3xl p-6">
                <h2 className="font-[family-name:var(--font-serif)] text-xl text-[color:var(--wine-900)]">
                  Less noise. More us.
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-black/70">
                  A simpler place to talk, share, and stay near without the
                  usual clutter.
                </p>
              </div>
              <div className="glass rounded-3xl p-6">
                <h2 className="font-[family-name:var(--font-serif)] text-xl text-[color:var(--wine-900)]">
                  Start softly
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-black/70">
                  Create your space in a moment, then let the rest happen
                  naturally.
                </p>
              </div>
            </>
          )}
        </section>
      </main>

      {loggedIn ? (
        <section className="mt-10 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="glass rounded-3xl p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--rose-700)]">
              Small Moments Count
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-serif)] text-3xl leading-tight text-[color:var(--wine-900)]">
              The best relationships are built in ordinary hours.
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl bg-white/55 p-5">
                <div className="text-sm font-semibold text-[color:var(--wine-900)]">
                  Before work
                </div>
                <p className="mt-2 text-sm leading-relaxed text-black/65">
                  A simple &quot;have a good day&quot; that lands exactly where
                  it should.
                </p>
              </div>
              <div className="rounded-3xl bg-white/55 p-5">
                <div className="text-sm font-semibold text-[color:var(--wine-900)]">
                  In the middle of everything
                </div>
                <p className="mt-2 text-sm leading-relaxed text-black/65">
                  A photo from lunch, a quick thought, a small pause that feels
                  like closeness.
                </p>
              </div>
              <div className="rounded-3xl bg-white/55 p-5">
                <div className="text-sm font-semibold text-[color:var(--wine-900)]">
                  At the end of the day
                </div>
                <p className="mt-2 text-sm leading-relaxed text-black/65">
                  The kind of conversation that slows everything down and makes
                  the day feel shared.
                </p>
              </div>
            </div>
          </div>

          <div className="glass rounded-3xl p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--rose-700)]">
              A Softer Promise
            </p>
            <div className="mt-4 font-[family-name:var(--font-serif)] text-2xl leading-relaxed text-[color:var(--wine-900)]">
              &quot;No noise, no crowd, no need to perform. Just us, whenever
              we want to feel near.&quot;
            </div>
            <p className="mt-5 text-sm leading-relaxed text-black/65">
              LoverLink feels best when it becomes part of your rhythm: a place
              for your first thought, your last goodnight, and everything
              gentle in between.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

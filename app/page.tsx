"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, HeartHandshake, MessageCircle, Phone, Sparkles, Users } from "lucide-react";
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
              className="focus-ring rounded-full px-4 py-2 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/5"
              onClick={() => void logout().then(() => router.refresh())}
              type="button"
            >
              Log out
            </button>
          ) : (
            <>
              <Link
                className="focus-ring rounded-full px-4 py-2 text-sm font-medium text-[color:var(--wine-900)] hover:bg-black/5"
                href="/login"
              >
                Log in
              </Link>
              <Link
                className="focus-ring rounded-full bg-[color:var(--rose-600)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)]"
                href="/signup"
              >
                Sign up
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
            {loggedIn ? `Welcome back, ${name}.` : "LoverLink - where conversations feel close."}
          </h1>

          {loggedIn ? (
            <p className="mt-4 text-base text-black/70">
              Continue your love story. Pick up where you left off, send something sweet, or start a call in a single tap.
            </p>
          ) : (
            <p className="mt-4 text-base text-black/70">
              A private space for two hearts: messages that feel warm, moments that feel instant, and a design that feels like a hug.
            </p>
          )}

          <div className="mt-5 rounded-3xl bg-white/55 p-5 text-sm text-black/70">
            <div className="flex items-center gap-2 font-semibold text-[color:var(--wine-900)]">
              <Heart className="h-4 w-4 text-[color:var(--rose-700)]" />
              Today&apos;s little prompt
            </div>
            <div className="mt-2 leading-relaxed">
              Tell them one small thing you noticed recently - and why you loved it.
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
                  <Users className="h-4 w-4" /> Friends
                </Link>
                <Link
                  className="focus-ring inline-flex items-center gap-2 rounded-full bg-black/5 px-5 py-3 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
                  href="/app/calls"
                >
                  <Phone className="h-4 w-4" /> Calls
                </Link>
              </>
            ) : (
              <>
                <Link
                  className="focus-ring inline-flex items-center gap-2 rounded-full bg-[color:var(--rose-600)] px-5 py-3 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)]"
                  href="/signup"
                >
                  <HeartHandshake className="h-4 w-4" /> Create your account
                </Link>
                <Link
                  className="focus-ring rounded-full px-5 py-3 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/5"
                  href="/login"
                >
                  Open your messages
                </Link>
              </>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <div className="glass rounded-3xl p-6">
            <h2 className="font-[family-name:var(--font-serif)] text-xl text-[color:var(--wine-900)]">Made for two</h2>
            <ul className="mt-3 grid gap-2 text-sm text-black/70">
              <li>• Sweet, private 1:1 chats</li>
              <li>• Typing + online presence</li>
              <li>• Delivered &amp; read receipts</li>
              <li>• Share photos, videos, and little keepsakes</li>
              <li>• Crystal-clear voice &amp; video calls</li>
            </ul>
          </div>
          <div className="glass rounded-3xl p-6">
            <h2 className="font-[family-name:var(--font-serif)] text-xl text-[color:var(--wine-900)]">Design</h2>
            <p className="mt-2 text-sm text-black/70">
              Soft gradients, glass cards, rose accents, and a signature script logo.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}


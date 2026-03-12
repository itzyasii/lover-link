import Link from "next/link";
import { HeartHandshake, Sparkles } from "lucide-react";
import { Brand } from "@/components/Brand";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-3">
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
        </div>
      </header>

      <main className="mt-14 grid gap-10 lg:grid-cols-2 lg:items-center">
        <section className="glass rounded-3xl p-8">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-[color:var(--rose-700)]">
            <Sparkles className="h-4 w-4" /> Minimal. Romantic. Real-time.
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-serif)] text-4xl leading-tight text-[color:var(--wine-900)] md:text-5xl">
            LoverLink — where conversations feel close.
          </h1>
          <p className="mt-4 text-base text-black/70">
            1:1 chat, file sharing, and WebRTC voice/video calls with a soft
            love-themed interface, presence, typing, and read receipts.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-[color:var(--rose-600)] px-5 py-3 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)]"
              href="/signup"
            >
              <HeartHandshake className="h-4 w-4" /> Create your account
            </Link>
            <Link
              className="focus-ring rounded-full px-5 py-3 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/5"
              href="/app"
            >
              Open app
            </Link>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="glass rounded-3xl p-6">
            <h2 className="font-[family-name:var(--font-serif)] text-xl text-[color:var(--wine-900)]">
              Features
            </h2>
            <ul className="mt-3 grid gap-2 text-sm text-black/70">
              <li>• Presence + “last seen”</li>
              <li>• Typing indicators</li>
              <li>• Delivered/read receipts</li>
              <li>• Upload + share files, images, videos</li>
              <li>• WebRTC calling via Socket.IO signaling</li>
            </ul>
          </div>
          <div className="glass rounded-3xl p-6">
            <h2 className="font-[family-name:var(--font-serif)] text-xl text-[color:var(--wine-900)]">
              Design
            </h2>
            <p className="mt-2 text-sm text-black/70">
              Soft gradients, glass cards, rose accents, and a signature script
              logo.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}


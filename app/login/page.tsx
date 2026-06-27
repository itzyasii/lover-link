"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Heart, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { Brand } from "@/components/Brand";
import { useFcm } from "@/hooks/useFcm";
import { useAuthStore } from "@/stores/auth";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const refresh = useAuthStore((s) => s.refresh);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const { requestNotificationPermission } = useFcm();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });

  // Redirect if already authenticated
  useEffect(() => {
    if (isHydrated && accessToken) {
      router.push("/app");
    }
  }, [isHydrated, accessToken, router]);

  const validateForm = () => {
    if (!emailOrUsername.trim()) {
      setError("Please enter your email or username");
      return false;
    }
    if (!password.trim()) {
      setError("Please enter your password");
      return false;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setBusy(true);
    try {
      // Try to refresh token first if needed (simplified token handling)
      await refresh();
      const fcmToken = await requestNotificationPermission();
      await login(emailOrUsername, password, fcmToken);
      router.push("/app");
    } catch {
      setError("Invalid email/username or password. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white">
      {/* Header with Brand */}
      <header className="px-4 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Brand />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-12">
        {/* Welcome Card */}
        <div className="mt-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-100 mb-4">
            <Heart className="h-8 w-8 text-rose-600" fill="currentColor" />
          </div>
          <h1 className="font-[family-name:var(--font-serif)] text-3xl leading-tight text-gray-900">
            Welcome back
          </h1>
          <p className="mt-2 text-base text-gray-600">
            Log in to continue your conversation
          </p>
        </div>

        {/* Login Form - Native feeling card */}
        <div className="mt-8 bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-6 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email/Username Field */}
            <div className="space-y-2">
              <label
                htmlFor="emailOrUsername"
                className="block text-sm font-semibold text-gray-800"
              >
                Email or Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="emailOrUsername"
                  className={`w-full rounded-2xl border pl-12 pr-4 py-4 text-gray-900 placeholder:text-gray-400 focus:ring-4 focus:ring-rose-100 focus:border-rose-500 outline-none transition-all ${touched.email && !emailOrUsername.trim() ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  onBlur={() =>
                    setTouched((prev) => ({ ...prev, email: true }))
                  }
                  placeholder="you@example.com"
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-gray-800"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  className={`w-full rounded-2xl border pl-12 pr-14 py-4 text-gray-900 placeholder:text-gray-400 focus:ring-4 focus:ring-rose-100 focus:border-rose-500 outline-none transition-all ${touched.password && !password.trim() ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() =>
                    setTouched((prev) => ({ ...prev, password: true }))
                  }
                  placeholder="Enter your password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error ? (
              <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                {error}
              </div>
            ) : null}

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-6 py-4 text-base font-semibold text-white shadow-[0_8px_20px_rgba(244,63,94,0.35)] transition-all hover:bg-rose-700 hover:shadow-[0_12px_28px_rgba(244,63,94,0.4)] active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
              disabled={busy}
            >
              {busy ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Logging you in...
                </>
              ) : (
                <>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20">
                    <Heart className="h-4 w-4" />
                  </span>
                  Log in
                </>
              )}
            </button>
          </form>
        </div>

        {/* Sign Up Link - Native style bottom sheet like */}
        <div className="mt-6 bg-white rounded-3xl shadow-lg shadow-gray-200/30 p-5 border border-gray-100 text-center">
          <p className="text-gray-600">
            New to LoverLink?{" "}
            <Link
              className="font-bold text-rose-600 hover:text-rose-700 transition-colors"
              href="/signup"
            >
              Create an account
            </Link>
          </p>
        </div>

        {/* Features - Simplified */}
        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center mb-3">
              <Lock className="h-5 w-5 text-rose-600" />
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">
              Secure & Private
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Your conversations are protected
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center mb-3">
              <Mail className="h-5 w-5 text-rose-600" />
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">
              Always in Sync
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Messages sync across devices
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

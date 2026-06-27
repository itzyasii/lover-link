"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Heart, Eye, EyeOff, Lock, Mail, User, Sparkles } from "lucide-react";
import { Brand } from "@/components/Brand";
import { useFcm } from "@/hooks/useFcm";
import { useAuthStore } from "@/stores/auth";

export default function SignupPage() {
  const router = useRouter();
  const signup = useAuthStore((s) => s.signup);
  const refresh = useAuthStore((s) => s.refresh);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { requestNotificationPermission } = useFcm();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({
    email: false,
    username: false,
    password: false,
  });
  const [passwordStrength, setPasswordStrength] = useState(0);

  // Redirect if already authenticated
  useEffect(() => {
    if (isHydrated && accessToken) {
      router.push("/app");
    }
  }, [isHydrated, accessToken, router]);

  // Calculate password strength
  useEffect(() => {
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password)) strength += 25;
    if (/[^A-Za-z0-9]/.test(password)) strength += 25;
    setPasswordStrength(strength);
  }, [password]);

  const getStrengthColor = () => {
    if (passwordStrength <= 25) return "bg-red-500";
    if (passwordStrength <= 50) return "bg-orange-500";
    if (passwordStrength <= 75) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getStrengthText = () => {
    if (passwordStrength <= 25) return "Weak";
    if (passwordStrength <= 50) return "Fair";
    if (passwordStrength <= 75) return "Good";
    return "Strong";
  };

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateForm = () => {
    if (!email.trim()) {
      setError("Please enter your email address");
      return false;
    }
    if (!validateEmail(email)) {
      setError("Please enter a valid email address");
      return false;
    }
    if (!username.trim()) {
      setError("Please choose a username");
      return false;
    }
    if (username.length < 3) {
      setError("Username must be at least 3 characters long");
      return false;
    }
    if (!password.trim()) {
      setError("Please create a password");
      return false;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
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
      // Simplified token handling - refresh before signup if needed
      await refresh();
      const fcmToken = await requestNotificationPermission();
      await signup(email, username, password, fcmToken);
      router.push("/app");
    } catch {
      setError("Could not create account. Try a different email or username.");
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
            <Sparkles className="h-8 w-8 text-rose-600" />
          </div>
          <h1 className="font-[family-name:var(--font-serif)] text-3xl leading-tight text-gray-900">
            Create your account
          </h1>
          <p className="mt-2 text-base text-gray-600">
            Start your journey together in just a few steps
          </p>
        </div>

        {/* Signup Form - Native feeling card */}
        <div className="mt-8 bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-6 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-gray-800"
              >
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  className={`w-full rounded-2xl border pl-12 pr-4 py-4 text-gray-900 placeholder:text-gray-400 focus:ring-4 focus:ring-rose-100 focus:border-rose-500 outline-none transition-all ${touched.email && (!email.trim() || !validateEmail(email)) ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() =>
                    setTouched((prev) => ({ ...prev, email: true }))
                  }
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Username Field */}
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="block text-sm font-semibold text-gray-800"
              >
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="username"
                  className={`w-full rounded-2xl border pl-12 pr-4 py-4 text-gray-900 placeholder:text-gray-400 focus:ring-4 focus:ring-rose-100 focus:border-rose-500 outline-none transition-all ${touched.username && (!username.trim() || username.length < 3) ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() =>
                    setTouched((prev) => ({ ...prev, username: true }))
                  }
                  placeholder="roseheart"
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
                  className={`w-full rounded-2xl border pl-12 pr-14 py-4 text-gray-900 placeholder:text-gray-400 focus:ring-4 focus:ring-rose-100 focus:border-rose-500 outline-none transition-all ${touched.password && (!password.trim() || password.length < 8) ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() =>
                    setTouched((prev) => ({ ...prev, password: true }))
                  }
                  placeholder="Create a strong password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
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

              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      Password strength
                    </span>
                    <span
                      className={`text-xs font-medium ${passwordStrength > 50 ? "text-green-600" : "text-orange-600"}`}
                    >
                      {getStrengthText()}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getStrengthColor()} transition-all duration-300 ease-out`}
                      style={{ width: `${passwordStrength}%` }}
                    ></div>
                  </div>
                  <ul className="grid grid-cols-2 gap-1 mt-2">
                    <li
                      className={`text-xs flex items-center gap-1 ${password.length >= 8 ? "text-green-600" : "text-gray-400"}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${password.length >= 8 ? "bg-green-500" : "bg-gray-300"}`}
                      ></span>
                      8+ characters
                    </li>
                    <li
                      className={`text-xs flex items-center gap-1 ${/[A-Z]/.test(password) ? "text-green-600" : "text-gray-400"}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${/[A-Z]/.test(password) ? "bg-green-500" : "bg-gray-300"}`}
                      ></span>
                      Uppercase letter
                    </li>
                    <li
                      className={`text-xs flex items-center gap-1 ${/[0-9]/.test(password) ? "text-green-600" : "text-gray-400"}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(password) ? "bg-green-500" : "bg-gray-300"}`}
                      ></span>
                      Number
                    </li>
                    <li
                      className={`text-xs flex items-center gap-1 ${/[^A-Za-z0-9]/.test(password) ? "text-green-600" : "text-gray-400"}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${/[^A-Za-z0-9]/.test(password) ? "bg-green-500" : "bg-gray-300"}`}
                      ></span>
                      Special character
                    </li>
                  </ul>
                </div>
              )}
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
                  Creating your account...
                </>
              ) : (
                <>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20">
                    <Heart className="h-4 w-4" fill="currentColor" />
                  </span>
                  Create account
                </>
              )}
            </button>
          </form>
        </div>

        {/* Login Link - Native style bottom sheet like */}
        <div className="mt-6 bg-white rounded-3xl shadow-lg shadow-gray-200/30 p-5 border border-gray-100 text-center">
          <p className="text-gray-600">
            Already have an account?{" "}
            <Link
              className="font-bold text-rose-600 hover:text-rose-700 transition-colors"
              href="/login"
            >
              Log in
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
              Built for Two
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Your private space together
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center mb-3">
              <Sparkles className="h-5 w-5 text-rose-600" />
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Easy Setup</h3>
            <p className="text-xs text-gray-500 mt-1">Get started in minutes</p>
          </div>
        </div>
      </main>
    </div>
  );
}

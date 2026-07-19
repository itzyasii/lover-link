"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Heart, User } from "lucide-react";
import { motion } from "framer-motion";
import { Brand } from "@/components/Brand";
import { HeartbeatLoading } from "@/components/HeartbeatLoading";
import { useAuthStore } from "@/stores/auth";
import { useToastStore } from "@/stores/toast";
import { apiFetch } from "@/lib/api";
import { useFcm } from "@/hooks/useFcm";
import { cn } from "@/lib/utils";

const LoginSchema = z.object({
  emailOrUsername: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof LoginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const { addToast } = useToastStore();
  const { fcmToken } = useFcm();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      // Send emailOrUsername to match backend schema
      const requestBody = {
        emailOrUsername: data.emailOrUsername,
        password: data.password,
        fcmToken: fcmToken,
      };

      const response = await apiFetch<{
        ok: boolean;
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; username: string };
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        login(response.accessToken, response.refreshToken, response.user);
        addToast("Welcome back to LoverLink! ❤️", "success");
        router.push("/app");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Login failed";
      addToast(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    window.location.href = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/auth/oauth/google/url`;
  };

  // Show heartbeat loading when processing login
  if (isLoading) {
    return <HeartbeatLoading fullScreen message="Signing you in..." />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Brand size="lg" />
        </div>

        <div className="glass rounded-3xl p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-(--text) mb-2">
                Email or Username
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-(--muted)" />
                <input
                  {...register("emailOrUsername")}
                  type="text"
                  className={cn(
                    "w-full pl-12 pr-4 py-3 rounded-xl border-2 bg-white/50 focus:bg-white transition-all outline-none focus-ring",
                    errors.emailOrUsername
                      ? "border-red-300 focus:border-red-500"
                      : "border-(--card-border) focus:border-[#c62b69]",
                  )}
                  placeholder="your@email.com or username"
                />
              </div>
              {errors.emailOrUsername && (
                <p className="mt-1 text-sm text-red-500">
                  {errors.emailOrUsername.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-(--text) mb-2">
                Password
              </label>
              <div className="relative">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-(--muted)"
                >
                  <path
                    fillRule="evenodd"
                    d="M8 7a2 2 0 1 1 4 0v1H8V7Zm6 1.5V7A4 4 0 0 0 6 7v1.5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1Z"
                    clipRule="evenodd"
                  />
                </svg>
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  className={cn(
                    "w-full pl-12 pr-12 py-3 rounded-xl border-2 bg-white/50 focus:bg-white transition-all outline-none focus-ring",
                    errors.password
                      ? "border-red-300 focus:border-red-500"
                      : "border-(--card-border) focus:border-[#c62b69]",
                  )}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-(--muted) hover:text-(--text) transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-500">
                  {errors.password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-linear-to-r from-[#c62b69] to-rose-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-rose-200"
            >
              {isLoading ? (
                "Signing in..."
              ) : (
                <>
                  Sign In <Heart className="w-4 h-4 fill-white" />
                </>
              )}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white/70 text-(--muted)">
                or continue with
              </span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full py-3 border-2 border-(--card-border) rounded-xl font-medium text-(--text) hover:bg-white/50 transition-colors flex items-center justify-center gap-2 focus-ring"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.78 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google
          </button>

          <p className="mt-6 text-center text-sm text-(--muted)">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-[#c62b69] hover:text-[#a81f56] transition-colors"
            >
              Sign up
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

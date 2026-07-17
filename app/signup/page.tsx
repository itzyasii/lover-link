"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Heart, Mail, User as UserIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Brand } from "@/components/Brand";
import { useAuthStore } from "@/stores/auth";
import { useToastStore } from "@/stores/toast";
import { apiFetch } from "@/lib/api";
import { useFcm } from "@/hooks/useFcm";
import { cn } from "@/lib/utils";

const SignupSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(32, "Username too long"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(200, "Password too long"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type SignupFormData = z.infer<typeof SignupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuthStore();
  const { addToast } = useToastStore();
  const { fcmToken } = useFcm();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(SignupSchema),
  });

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    try {
      const response = await apiFetch<{
        ok: boolean;
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; username: string };
      }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: data.email,
          username: data.username,
          password: data.password,
          fcmToken: fcmToken,
        }),
      });

      if (response.ok) {
        signup(response.accessToken, response.refreshToken, response.user);
        addToast("Welcome to LoverLink! Your journey begins ❤️", "success");
        router.push("/app");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Signup failed";
      addToast(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-rose-50 via-pink-50 to-red-50 flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Brand size="lg" />
          <p className="mt-2 text-gray-500">Start your love story today</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-rose-100/50 p-8 border border-rose-100">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  {...register("email")}
                  type="email"
                  className={cn(
                    "w-full pl-12 pr-4 py-3 rounded-xl border-2 bg-gray-50 focus:bg-white transition-all outline-none",
                    errors.email
                      ? "border-red-300 focus:border-red-500"
                      : "border-gray-100 focus:border-rose-400",
                  )}
                  placeholder="your@email.com"
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-sm text-red-500">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  {...register("username")}
                  type="text"
                  className={cn(
                    "w-full pl-12 pr-4 py-3 rounded-xl border-2 bg-gray-50 focus:bg-white transition-all outline-none",
                    errors.username
                      ? "border-red-300 focus:border-red-500"
                      : "border-gray-100 focus:border-rose-400",
                  )}
                  placeholder="romanticpartner"
                />
              </div>
              {errors.username && (
                <p className="mt-1 text-sm text-red-500">
                  {errors.username.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  className={cn(
                    "w-full pl-4 pr-12 py-3 rounded-xl border-2 bg-gray-50 focus:bg-white transition-all outline-none",
                    errors.password
                      ? "border-red-300 focus:border-red-500"
                      : "border-gray-100 focus:border-rose-400",
                  )}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  {...register("confirmPassword")}
                  type={showConfirmPassword ? "text" : "password"}
                  className={cn(
                    "w-full pl-4 pr-12 py-3 rounded-xl border-2 bg-gray-50 focus:bg-white transition-all outline-none",
                    errors.confirmPassword
                      ? "border-red-300 focus:border-red-500"
                      : "border-gray-100 focus:border-rose-400",
                  )}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-500">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 mt-2 bg-linear-to-br from-rose-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-rose-200"
            >
              {isLoading ? (
                "Creating account..."
              ) : (
                <>
                  Create Account <Heart className="w-4 h-4 fill-white" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-rose-500 hover:text-rose-600"
            >
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

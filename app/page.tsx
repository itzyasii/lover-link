"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Heart, MessageCircle, Video, Bell, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/stores/auth";
import { Brand } from "@/components/Brand";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  // Redirect authenticated users to the app
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/app");
    }
  }, [isAuthenticated, isLoading, router]);

  // If still loading or already authenticated, don't show landing page
  if (isLoading || isAuthenticated) {
    return null;
  }

  const features = [
    {
      icon: MessageCircle,
      title: "Real-time Messaging",
      description: "Send and receive messages instantly with your loved one",
    },
    {
      icon: Video,
      title: "Video & Voice Calls",
      description: "Stay connected face-to-face with crystal clear calls",
    },
    {
      icon: Bell,
      title: "Smart Notifications",
      description: "Never miss a message with push notifications",
    },
    {
      icon: Shield,
      title: "Private & Secure",
      description: "Your conversations are protected and private",
    },
  ];

  return (
    <div className="min-h-screen bg-linear-to-br from-rose-50 via-pink-50 to-red-50">
      {/* Hero Section */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <Brand size="lg" />
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-rose-500 font-medium hover:bg-rose-50 rounded-xl transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 bg-linear-to-r from-rose-500 to-pink-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-rose-200"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4">
        <section className="flex flex-col items-center text-center py-16 md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              Connect with your
              <span className="block text-transparent bg-clip-text bg-linear-to-r from-rose-500 to-pink-500">
                special someone
              </span>
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
              LoverLink brings you closer to the person you love. Share moments,
              memories, and build a stronger relationship, no matter the
              distance.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="w-full sm:w-auto px-8 py-4 bg-linear-to-r from-rose-500 to-pink-500 text-white font-semibold text-lg rounded-2xl hover:opacity-90 transition-opacity shadow-xl shadow-rose-300 flex items-center justify-center gap-2"
              >
                Start Your Journey <Heart className="w-5 h-5 fill-white" />
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Features Section */}
        <section className="py-16 md:py-24">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
            Everything you need to stay connected
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="bg-white/70 backdrop-blur-sm rounded-3xl p-6 border border-rose-100 shadow-sm hover:shadow-lg transition-shadow"
                >
                  <div className="w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center mb-4">
                    <Icon className="w-7 h-7 text-rose-500" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600">{feature.description}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-24">
          <div className="bg-linear-to-r from-rose-500 to-pink-500 rounded-3xl p-8 md:p-12 text-center text-white">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to start your love story?
            </h2>
            <p className="text-lg text-rose-100 max-w-2xl mx-auto mb-8">
              Join thousands of couples who are already using LoverLink to stay
              connected, share moments, and build stronger relationships.
            </p>
            <Link
              href="/signup"
              className="inline-block px-8 py-4 bg-white text-rose-500 font-semibold text-lg rounded-2xl hover:bg-rose-50 transition-colors shadow-xl"
            >
              Create Free Account
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-rose-100 bg-white/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Brand size="sm" />
            <p className="text-gray-500 text-sm">
              © 2026 LoverLink. Made with 💕 for lovers everywhere.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

"use client";

import { Bell, X } from "lucide-react";
import { useFcm } from "@/hooks/useFcm";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function NotificationPermission() {
  const { isInitialized, permissionGranted, registerFcmToken } = useFcm();

  if (!isInitialized || permissionGranted) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white rounded-2xl shadow-xl border border-rose-100 p-4 z-40"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-rose-500" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900">
            Never miss a message 💌
          </h4>
          <p className="text-sm text-gray-500 mt-1">
            Enable notifications to get real-time messages from your loved one.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={registerFcmToken}
              className="px-3 py-1.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              Enable
            </button>
            <button className="px-3 py-1.5 text-gray-500 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors">
              Not now
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

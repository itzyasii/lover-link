"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useToastStore } from "@/stores/toast";

export function Toasts() {
  const items = useToastStore((s) => s.items);
  const remove = useToastStore((s) => s.remove);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] w-[340px] max-w-[calc(100vw-2rem)] space-y-2">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto glass rounded-3xl p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--wine-900)]">
                  {t.title}
                </div>
                {t.message ? (
                  <div className="mt-1 text-xs text-black/60">{t.message}</div>
                ) : null}
              </div>
              <button
                className="focus-ring grid h-8 w-8 place-items-center rounded-2xl bg-black/5 hover:bg-black/10"
                onClick={() => remove(t.id)}
                aria-label="Close"
              >
                <X className="h-4 w-4 text-black/60" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}


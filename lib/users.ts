"use client";

import { apiFetch } from "@/lib/api";

type BasicUser = { id: string; username: string; email: string; lastSeenAt: string | null };

const cache = new Map<string, BasicUser>();

export function getCachedUserLabel(id: string) {
  const u = cache.get(id);
  return u?.username ?? null;
}

export async function resolveUserLabels(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const missing = unique.filter((id) => !cache.has(id));
  if (missing.length === 0) return;

  const res = await apiFetch<{ ok: true; users: BasicUser[] }>(
    `/api/users/by-ids?ids=${encodeURIComponent(missing.join(","))}`,
  );
  for (const u of res.users) cache.set(u.id, u);
}

export async function resolveUserLabel(id: string) {
  await resolveUserLabels([id]);
  return getCachedUserLabel(id);
}


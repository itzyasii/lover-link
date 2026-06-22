export function formatLastSeen(lastSeenAtIso: string, now = new Date()) {
  const last = new Date(lastSeenAtIso);
  if (Number.isNaN(last.getTime())) return "Last seen";

  const diffMs = now.getTime() - last.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  const min = Math.floor(diffSec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (diffSec < 60) return "Last online just now";
  if (min < 60) return `Last online ${min} minute${min === 1 ? "" : "s"} ago`;
  if (hr < 24) return `Last online ${hr} hour${hr === 1 ? "" : "s"} ago`;
  if (day >= 1 && day < 365) return `Last online ${day} day${day === 1 ? "" : "s"} ago`;

  return `Last seen ${last.toLocaleString()}`;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${minutes}:${ss}`;
}

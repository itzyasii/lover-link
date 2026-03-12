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
  if (day < 7) return `Last online ${day} day${day === 1 ? "" : "s"} ago`;

  return `Last seen ${last.toLocaleString()}`;
}


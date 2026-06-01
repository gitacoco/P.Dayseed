import type { ActiveTimer } from "@/types/dayseed";

export function remainingSeconds(timer?: ActiveTimer, nowMs = Date.now()) {
  if (!timer) {
    return 0;
  }

  if (timer.status === "paused") {
    return Math.max(0, timer.remainingAtPauseSec ?? 0);
  }

  return Math.max(
    0,
    Math.ceil((new Date(timer.expectedEndAt).getTime() - nowMs) / 1000),
  );
}

export function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${rest}`;
}

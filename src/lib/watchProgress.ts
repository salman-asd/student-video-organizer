export interface ProgressSnapshot {
  currentSeconds: number;
  durationSeconds: number;
  percent: number;
  completed: boolean;
}

export interface ShouldPersistOptions {
  currentSeconds: number;
  durationSeconds: number;
  lastSavedAt: number;
  now: number;
  previousSeconds: number;
}

export function calculateProgress(currentSeconds: number, durationSeconds: number): ProgressSnapshot {
  const safeCurrent = Number.isFinite(currentSeconds) ? Math.max(0, currentSeconds) : 0;
  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;

  const percent = safeDuration > 0 ? Math.min(100, (safeCurrent / safeDuration) * 100) : 0;
  const completed = safeDuration > 0 ? percent >= 95 : safeCurrent > 0 && safeDuration === 0;

  return {
    currentSeconds: safeCurrent,
    durationSeconds: safeDuration,
    percent: Math.round(percent),
    completed,
  };
}

export function isVideoComplete(currentSeconds: number, durationSeconds: number): boolean {
  return calculateProgress(currentSeconds, durationSeconds).completed;
}

export function isResumeEligible(state?: Partial<{ status: string; watchedPercentage: number; currentPositionSeconds: number }>): boolean {
  if (!state) return false;
  const status = state.status ?? "not_started";
  const percentage = typeof state.watchedPercentage === "number" ? state.watchedPercentage : 0;
  const seconds = typeof state.currentPositionSeconds === "number" ? state.currentPositionSeconds : 0;

  if (status === "completed") return false;
  if (status === "in_progress" && percentage > 0 && seconds > 0) return true;
  if (status === "not_started" && seconds > 0) return true;
  return percentage > 0 && seconds > 0 && !isVideoComplete(seconds, Math.max(seconds, 1));
}

export function shouldPersistProgress({
  currentSeconds,
  durationSeconds,
  lastSavedAt,
  now,
  previousSeconds,
}: ShouldPersistOptions): boolean {
  const next = calculateProgress(currentSeconds, durationSeconds);
  const elapsedSinceSave = now - lastSavedAt;
  const positionDelta = Math.abs(currentSeconds - previousSeconds);
  const enoughProgress = next.percent >= 5;

  if (!Number.isFinite(currentSeconds) || !Number.isFinite(durationSeconds)) return false;
  if (elapsedSinceSave >= 15000 && positionDelta >= 5) return true;
  if (elapsedSinceSave >= 30000) return true;
  if (currentSeconds <= 1 && previousSeconds <= 1) return false;
  if (positionDelta >= 10 && enoughProgress) return true;
  if (positionDelta >= 25) return true;
  return false;
}

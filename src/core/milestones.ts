import { duration, plural } from "./format";

export interface Milestone {
  id: string;
  label: string;
  /** What has been achieved so far, in the track's own unit. */
  value: number;
  /** The next threshold, or undefined once every threshold is passed. */
  next?: number;
  /** The threshold most recently passed. */
  reached?: number;
  /** 0 to 1 towards `next`, measured from `reached`. */
  progress: number;
  describe(value: number): string;
}

const HOUR_THRESHOLDS = [1, 10, 50, 100, 250, 500, 1000, 2500, 5000];
const STREAK_THRESHOLDS = [3, 7, 14, 30, 60, 100, 200, 365, 500, 1000];
const DAY_THRESHOLDS = [1, 10, 50, 100, 250, 500, 1000];

function track(
  id: string,
  label: string,
  value: number,
  thresholds: number[],
  describe: (value: number) => string
): Milestone {
  const reached = [...thresholds].reverse().find((threshold) => value >= threshold);
  const next = thresholds.find((threshold) => value < threshold);
  const floor = reached ?? 0;
  const progress = next === undefined ? 1 : clamp((value - floor) / (next - floor));
  return { id, label, value, next, reached, progress, describe };
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

export interface MilestoneInput {
  totalSeconds: number;
  longestStreak: number;
  activeDays: number;
}

export function milestones(input: MilestoneInput): Milestone[] {
  return [
    track(
      "hours",
      "Hours tracked",
      Math.floor(input.totalSeconds / 3600),
      HOUR_THRESHOLDS,
      (value) => duration(value * 3600)
    ),
    track("streak", "Longest streak", input.longestStreak, STREAK_THRESHOLDS, (value) =>
      plural(value, "day")
    ),
    track("days", "Days active", input.activeDays, DAY_THRESHOLDS, (value) =>
      plural(value, "day")
    ),
  ];
}

// ABOUTME: Milestones derived from the summary — reached ones, and the next one in each track.
// ABOUTME: A quiet list on the dashboard; nothing here ever interrupts you with a popup.

import { duration, languageName, plural } from "./format";
import type { Summary } from "./aggregate";

export interface Milestone {
  id: string;
  label: string;
  /** What it took, once reached. Empty while it's still ahead. */
  detail: string;
  reached: boolean;
  /** 0–1 towards the target, for the progress bar on unreached ones. */
  progress: number;
}

const STREAK_STEPS = [3, 7, 14, 30, 100, 365];
const HOUR_STEPS = [1, 10, 50, 100, 500, 1000];
const LANGUAGE_HOUR_STEPS = [10, 50, 100, 500];
const DAY_STEPS = [10, 50, 100, 365];

function track(
  prefix: string,
  steps: number[],
  value: number,
  label: (step: number) => string,
  detail: (step: number) => string
): Milestone[] {
  const out: Milestone[] = [];
  for (const step of steps) {
    const reached = value >= step;
    out.push({
      id: `${prefix}-${step}`,
      label: label(step),
      detail: reached ? detail(step) : "",
      reached,
      progress: Math.min(value / step, 1),
    });
    // Show what's reached plus the next one, not the whole ladder.
    if (!reached) {
      break;
    }
  }
  return out;
}

export function milestonesFor(summary: Summary): Milestone[] {
  const hours = summary.total / 3600;
  const top = summary.languages[0];

  const milestones: Milestone[] = [
    ...track(
      "streak",
      STREAK_STEPS,
      summary.streak.longest,
      (step) => `${step}-day streak`,
      (step) => `Longest run: ${plural(summary.streak.longest, "day")} (target ${step})`
    ),
    ...track(
      "hours",
      HOUR_STEPS,
      hours,
      (step) => `${step} ${step === 1 ? "hour" : "hours"} tracked`,
      () => duration(summary.total)
    ),
    ...track(
      "days",
      DAY_STEPS,
      summary.daysQualifying,
      (step) => `${step} days of work`,
      () => plural(summary.daysQualifying, "day")
    ),
  ];

  if (top) {
    milestones.push(
      ...track(
        `lang-${top.id}`,
        LANGUAGE_HOUR_STEPS,
        top.seconds / 3600,
        (step) => `${step} hours in ${languageName(top.id)}`,
        () => duration(top.seconds)
      )
    );
  }

  // Reached first, then the one you're closest to finishing.
  return milestones.sort((a, b) => {
    if (a.reached !== b.reached) {
      return a.reached ? -1 : 1;
    }
    return b.progress - a.progress;
  });
}

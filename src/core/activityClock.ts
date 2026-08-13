// ABOUTME: Decides whether a moment counts as active — focused, plus input inside the idle window.
// ABOUTME: Pure and clock-injected, so the rule that defines every number is directly testable.

/**
 * How long a moment of input keeps the clock open. Five minutes is the tail we
 * are willing to credit after the last human signal: long enough to survive
 * reading a paragraph or watching a build, short enough that walking away from
 * a focused window costs minutes rather than hours.
 */
export const DEFAULT_IDLE_MINUTES = 5;
export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 30;
export const DEFAULT_IDLE_MS = DEFAULT_IDLE_MINUTES * 60 * 1000;
export const TICK_MS = 15 * 1000;

/** Clamps a configured idle window to something that can still be called honest. */
export function idleWindowMs(minutes: number | undefined): number {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
    return DEFAULT_IDLE_MS;
  }
  return Math.min(Math.max(minutes, MIN_IDLE_MINUTES), MAX_IDLE_MINUTES) * 60 * 1000;
}

/**
 * A viewport move this soon after a content change is the edit's own reflow.
 * Generous on purpose: the cost of ignoring a real scroll is nothing (you just
 * typed, so the clock is already open), while the cost of counting a machine's
 * reflow is time you never worked.
 */
export const EDIT_SCROLL_MS = 1000;

/**
 * Whether a viewport move should count as a human reading. The top line has to
 * have actually moved — resizing a pane or opening the panel changes the
 * visible range without anyone scrolling.
 */
export function isHumanScroll(now: number, lastEdit: number, topLineMoved: boolean): boolean {
  return topLineMoved && now - lastEdit >= EDIT_SCROLL_MS;
}

export interface ClockState {
  focused: boolean;
  /** Epoch ms of the last human signal — keystroke, cursor move, scroll, save, command. */
  lastInput: number;
}

/**
 * The window having focus is not enough: a focused window you walked away from
 * would log hours you never worked. Input inside the idle window is what makes
 * the difference between "open" and "being used".
 */
export function isActive(state: ClockState, now: number, idleMs: number = DEFAULT_IDLE_MS): boolean {
  return state.focused && withinIdle(now, state.lastInput, idleMs);
}

/**
 * Whether something that happened at `last` is still recent enough to matter.
 * Also the gate on signals a machine can produce — a terminal command, a debug
 * step: they may hold open a clock a keyboard already opened, never start one,
 * so nothing automated can claim more than one idle window past your last real
 * keypress.
 */
export function withinIdle(now: number, last: number, idleMs: number): boolean {
  return now - last < idleMs;
}

/**
 * Seconds to credit for a tick ending at `now`. Capped at the tick length so a
 * suspended laptop or a debugger pause can't credit hours in one go.
 */
export function creditFor(
  state: ClockState,
  now: number,
  lastTick: number,
  idleMs: number = DEFAULT_IDLE_MS
): number {
  if (!isActive(state, now, idleMs)) {
    return 0;
  }
  const elapsed = Math.min(now - lastTick, TICK_MS);
  return elapsed > 0 ? Math.round(elapsed / 1000) : 0;
}

/** A new session starts on the transition back into activity, not on every tick. */
export function startsSession(previousActive: boolean, nowActive: boolean): boolean {
  return !previousActive && nowActive;
}

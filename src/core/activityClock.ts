// ABOUTME: Decides whether a moment counts as active — focused, plus input inside the idle window.
// ABOUTME: Pure and clock-injected, so the rule that defines every number is directly testable.

export const IDLE_MS = 2 * 60 * 1000;
export const TICK_MS = 15 * 1000;

export interface ClockState {
  focused: boolean;
  /** Epoch ms of the last keystroke, cursor move or save. */
  lastInput: number;
}

/**
 * The window having focus is not enough: a focused window you walked away from
 * would log hours you never worked. Input inside the idle window is what makes
 * the difference between "open" and "being used".
 */
export function isActive(state: ClockState, now: number): boolean {
  return state.focused && now - state.lastInput < IDLE_MS;
}

/**
 * Seconds to credit for a tick ending at `now`. Capped at the tick length so a
 * suspended laptop or a debugger pause can't credit hours in one go.
 */
export function creditFor(state: ClockState, now: number, lastTick: number): number {
  if (!isActive(state, now)) {
    return 0;
  }
  const elapsed = Math.min(now - lastTick, TICK_MS);
  return elapsed > 0 ? Math.round(elapsed / 1000) : 0;
}

/**
 * A new session starts when the window comes back into use after being idle or
 * unfocused for at least the idle window.
 */
export function startsSession(previousActive: boolean, nowActive: boolean): boolean {
  return !previousActive && nowActive;
}

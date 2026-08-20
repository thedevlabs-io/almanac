/**
 * How long the clock keeps running after the last sign of activity.
 *
 * Fifteen minutes, not five. The clock is held open by anything observable in
 * the window, and the gaps this has to survive are real ones: reading a long
 * file, thinking about a design, watching a test suite, waiting on an agent.
 * Focus is what bounds the generosity. Switch to another app and the clock
 * stops at once, whatever this is set to.
 */
export const DEFAULT_IDLE_MINUTES = 15;
export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 60;
export const DEFAULT_IDLE_MS = DEFAULT_IDLE_MINUTES * 60 * 1000;

/** How often the clock wakes up to credit what just passed. */
export const TICK_MS = 15 * 1000;

/**
 * A gap longer than this between ticks means the host stopped running: the lid
 * closed, the machine slept, the extension host was throttled. None of that is
 * work, and the interval is credited as nothing rather than capped, because a
 * cap would still hand out fifteen seconds for every suspend.
 */
export const SUSPEND_MS = 4 * TICK_MS;

/**
 * How far past your last human signal a machine can carry the clock.
 *
 * Output arriving from a running command is real evidence that work is
 * happening and you are watching it, which is why a twenty minute test run
 * counts. It is not evidence that you are still in the chair, which is why it
 * cannot run forever: a focused window with `tail -f` in it would otherwise
 * bank a lunch break.
 *
 * Two idle windows, so it scales with the tolerance you chose rather than
 * overriding it. At the default that is 30 minutes of machine-carried time
 * past the last thing you actually did.
 */
export const MACHINE_GRACE_WINDOWS = 2;

/**
 * A viewport move this soon after a content change is the edit's own reflow,
 * not a person scrolling. Generous on purpose: ignoring a real scroll costs
 * nothing, because you just typed and the clock is already open, while counting
 * a machine's reflow credits time nobody worked.
 */
export const EDIT_SCROLL_MS = 1000;

/**
 * Whether a viewport move was a person reading. The top line has to have
 * actually moved, since resizing a pane or opening the panel changes the
 * visible range without anyone scrolling.
 */
export function isHumanScroll(now: number, lastEdit: number, topLineMoved: boolean): boolean {
  return topLineMoved && now - lastEdit >= EDIT_SCROLL_MS;
}

/** Clamps a configured idle window to a range that can still be called honest. */
export function idleWindowMs(minutes: number | undefined): number {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
    return DEFAULT_IDLE_MS;
  }
  return Math.min(Math.max(minutes, MIN_IDLE_MINUTES), MAX_IDLE_MINUTES) * 60 * 1000;
}

/**
 * Which surface a signal came from. Used for the "where did my day go"
 * breakdown and for the idle explanation, never by the rule that credits time.
 */
export type SignalKind =
  | "editor"
  | "terminal"
  | "debug"
  | "task"
  | "notebook"
  | "tabs"
  | "window";

/**
 * Whether a signal proves a *person* did something, or only that a machine did.
 *
 * This is not the tier system this rewrite removed. The old design ranked
 * signals by how much they resembled a keystroke in a text editor, which meant
 * terminal work could never open the clock at all. The human tier here is
 * `window.state.active`, VS Code's own recent-interaction flag, which sees the
 * terminal, the Simple Browser, webviews and the settings editor alike. What
 * `machine` covers is the genuinely ambiguous evidence: output from a command,
 * a task restarting, an agent editing the file you have open, a debugger
 * landing on a frame. Those extend a clock a person opened, within
 * `MACHINE_GRACE_WINDOWS`, and never open one themselves.
 */
export type SignalSource = "human" | "machine";

export interface PresenceState {
  /** Whether the VS Code window has OS focus. */
  focused: boolean;
  /** Epoch ms of the last observed sign of activity, of either source. Zero means none. */
  lastSignal: number;
  /** Epoch ms of the last signal a person demonstrably produced. Zero means none. */
  lastHuman: number;
  lastKind?: SignalKind;
}

export function initialState(focused: boolean): PresenceState {
  // Zero, not now. Opening a window is not working in it, so a window restored
  // at login and left alone credits nothing until something happens in it.
  return { focused, lastSignal: 0, lastHuman: 0 };
}

export function withinIdle(now: number, last: number, idleMs: number): boolean {
  return last > 0 && now - last < idleMs;
}

/**
 * Focused, and either a person did something inside the idle window, or a
 * machine did while still inside the grace period past the last thing a person
 * did. Focus alone is never enough: a focused window on a second monitor would
 * otherwise bank a whole meeting.
 *
 * Machine evidence cannot open a clock in a window where a person has done
 * nothing at all, which is what stops a session restored at login with a dev
 * server running from recording anything.
 */
export function isActive(state: PresenceState, now: number, idleMs = DEFAULT_IDLE_MS): boolean {
  if (!state.focused) {
    return false;
  }
  if (withinIdle(now, state.lastHuman, idleMs)) {
    return true;
  }
  return (
    withinIdle(now, state.lastSignal, idleMs) &&
    withinIdle(now, state.lastHuman, idleMs * MACHINE_GRACE_WINDOWS)
  );
}

/**
 * Seconds to credit for the interval ending at `now`. Capped at one tick so a
 * slow event loop cannot inflate an interval, and dropped entirely when the gap
 * says the host was suspended rather than merely busy.
 */
export function creditFor(
  state: PresenceState,
  now: number,
  lastTick: number,
  idleMs = DEFAULT_IDLE_MS
): number {
  if (!isActive(state, now, idleMs)) {
    return 0;
  }
  const gap = now - lastTick;
  if (gap <= 0 || gap > SUSPEND_MS) {
    return 0;
  }
  return Math.round(Math.min(gap, TICK_MS) / 1000);
}

/** A session begins on the transition into activity, not on every tick inside one. */
export function startsSession(wasActive: boolean, nowActive: boolean): boolean {
  return !wasActive && nowActive;
}

export interface Explanation {
  active: boolean;
  reason: string;
}

/**
 * Why the clock is or is not running, in the words the status bar and the
 * `Why am I idle right now?` command use. Behaviour a user cannot inspect is
 * behaviour they end up mistrusting, and this extension asks for a lot of trust.
 */
export function explain(
  state: PresenceState,
  now: number,
  idleMs = DEFAULT_IDLE_MS,
  enabled = true
): Explanation {
  if (!enabled) {
    return { active: false, reason: "Tracking is paused." };
  }
  if (!state.focused) {
    return { active: false, reason: "The VS Code window is not focused." };
  }
  if (state.lastHuman === 0) {
    return { active: false, reason: "Nothing has happened in this window yet." };
  }

  const limit = Math.round(idleMs / 60000);
  const humanSilence = Math.floor((now - state.lastHuman) / 60000);

  if (withinIdle(now, state.lastHuman, idleMs)) {
    return { active: true, reason: `Counting. Last activity: ${describeKind(state.lastKind)}.` };
  }
  if (!withinIdle(now, state.lastSignal, idleMs)) {
    return {
      active: false,
      reason: `No activity for ${humanSilence} minutes, past the ${limit} minute idle window.`,
    };
  }
  if (withinIdle(now, state.lastHuman, idleMs * MACHINE_GRACE_WINDOWS)) {
    return {
      active: true,
      reason: `Counting on ${describeKind(state.lastKind)}, but you have not touched anything for ${humanSilence} minutes. This stops at ${limit * MACHINE_GRACE_WINDOWS} minutes.`,
    };
  }
  return {
    active: false,
    reason: `Only ${describeKind(state.lastKind)} has been active, and that stops counting ${limit * MACHINE_GRACE_WINDOWS} minutes after you last did something. It has been ${humanSilence}.`,
  };
}

function describeKind(kind: SignalKind | undefined): string {
  switch (kind) {
    case "editor":
      return "editing or reading a file";
    case "terminal":
      return "the terminal";
    case "debug":
      return "a debug session";
    case "task":
      return "a running task";
    case "notebook":
      return "a notebook";
    case "tabs":
      return "switching tabs";
    case "window":
      return "activity in the window";
    default:
      return "activity in the window";
  }
}

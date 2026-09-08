import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  creditFor,
  explain,
  idleWindowMs,
  isActive,
  isEngaged,
  MACHINE_GRACE_WINDOWS,
  projectCreditFor,
  SESSION_GAP_MS,
  startsSession,
  SUSPEND_MS,
  TICK_MS,
  type PresenceState,
  type SignalKind,
  withFocus,
} from "../src/core/presence";

const IDLE = 15 * 60 * 1000;
const GRACE = IDLE * MACHINE_GRACE_WINDOWS;
const T = 1_000_000;

function state(overrides: Partial<PresenceState> = {}): PresenceState {
  return { focused: true, lastSignal: T, lastHuman: T, unfocusedAt: 0, ...overrides };
}

test("focus without any signal never counts", () => {
  assert.equal(isActive({ focused: true, lastSignal: 0, lastHuman: 0, unfocusedAt: 0 }, T, IDLE), false);
});

test("a signal without focus never counts", () => {
  assert.equal(isActive(state({ focused: false }), T + 100, IDLE), false);
});

test("focus plus a recent human signal counts", () => {
  assert.equal(isActive(state(), T + 100, IDLE), true);
});

test("the clock closes once the idle window passes", () => {
  assert.equal(isActive(state(), T + IDLE - 1, IDLE), true);
  assert.equal(isActive(state(), T + IDLE, IDLE), false);
});

// The bug this rewrite exists to fix. Every surface has to be able to open the
// clock on its own, with no editor keystroke preceding it.
const KINDS: SignalKind[] = ["editor", "terminal", "debug", "task", "notebook", "tabs", "window"];

for (const kind of KINDS) {
  test(`a human signal from ${kind} alone opens the clock`, () => {
    const fresh: PresenceState = { focused: true, lastSignal: T, lastHuman: T, unfocusedAt: 0, lastKind: kind };
    assert.equal(isActive(fresh, T + 1000, IDLE), true);
    assert.equal(creditFor(fresh, T + 1000, T + 1000 - TICK_MS, IDLE), 15);
  });
}

test("a terminal-only day accumulates a full day of time", () => {
  // Eight hours of terminal presence with no editor event at all. The previous
  // design credited nothing after the first five minutes of this.
  let seconds = 0;
  let now = 0;
  let lastTick = 0;
  let lastHuman = 0;
  const EIGHT_HOURS = 8 * 60 * 60 * 1000;

  while (now < EIGHT_HOURS) {
    now += TICK_MS;
    // A signal every 30 seconds, the first landing on the first tick.
    if (now % 30000 === TICK_MS) {
      lastHuman = now;
    }
    seconds += creditFor(
      { focused: true, lastSignal: lastHuman, lastHuman, unfocusedAt: 0, lastKind: "terminal" },
      now,
      lastTick,
      IDLE
    );
    lastTick = now;
  }

  assert.equal(seconds, EIGHT_HOURS / 1000);
});

test("machine output carries the clock past the idle window, but only to the grace limit", () => {
  // The lunch break case: a focused window with `tail -f` running in it.
  const machine = (elapsed: number): PresenceState => ({
    focused: true,
    lastHuman: T,
    lastSignal: T + elapsed,
    unfocusedAt: 0,
    lastKind: "terminal",
  });

  assert.equal(isActive(machine(IDLE + 1), T + IDLE + 1, IDLE), true, "a long test run still counts");
  assert.equal(isActive(machine(GRACE - 1), T + GRACE - 1, IDLE), true);
  assert.equal(isActive(machine(GRACE), T + GRACE, IDLE), false, "output cannot count forever");
  assert.equal(isActive(machine(GRACE + 60_000), T + GRACE + 60_000, IDLE), false);
});

test("machine output cannot open a clock no person ever opened", () => {
  // A window restored at login with a dev server already printing to a terminal.
  const noHuman: PresenceState = { focused: true, lastSignal: T, lastHuman: 0, unfocusedAt: 0, lastKind: "terminal" };
  assert.equal(isActive(noHuman, T + 100, IDLE), false);
});

test("credit is capped at one tick however long the interval was", () => {
  assert.equal(creditFor(state(), T + 100, T + 100 - TICK_MS, IDLE), 15);
  assert.equal(
    creditFor(state(), T + 100, T + 100 - TICK_MS * 2, IDLE),
    15,
    "a late timer credits one tick, not the time it was late by"
  );
});

test("a suspended host credits nothing rather than a capped tick", () => {
  assert.equal(creditFor(state(), T + 100, T + 100 - SUSPEND_MS - 1, IDLE), 0);
});

test("a backwards clock credits nothing", () => {
  assert.equal(creditFor(state(), T + 100, T + 200, IDLE), 0);
});

test("a session starts after the clock has been closed for a while, not on every reopening", () => {
  const now = 1_000_000_000;
  assert.equal(startsSession(0, now), true, "the first credited tick opens a session");
  assert.equal(startsSession(now - TICK_MS, now), false, "the next tick is the same session");
  assert.equal(startsSession(now - SESSION_GAP_MS + 1, now), false, "a short closure is the same sitting");
  assert.equal(startsSession(now - SESSION_GAP_MS - 1, now), true, "a longer one is a new session");
});

test("the idle window is clamped to an honest range", () => {
  assert.equal(idleWindowMs(undefined), 15 * 60 * 1000);
  assert.equal(idleWindowMs(Number.NaN), 15 * 60 * 1000);
  assert.equal(idleWindowMs(0), 60 * 1000);
  assert.equal(idleWindowMs(9999), 60 * 60 * 1000);
  assert.equal(idleWindowMs(20), 20 * 60 * 1000);
});

test("the explanation names the actual reason", () => {
  assert.match(explain(state(), T + 100, IDLE, false).reason, /paused/);
  assert.match(explain(state({ focused: false }), T + 100, IDLE).reason, /not focused/);
  assert.match(
    explain(state({ lastSignal: 0, lastHuman: 0 }), T + 100, IDLE).reason,
    /Nothing has happened/
  );
  assert.match(explain(state(), T + IDLE + 1, IDLE).reason, /idle window/);

  const counting = explain(state({ lastKind: "terminal" }), T + 100, IDLE);
  assert.equal(counting.active, true);
  assert.match(counting.reason, /terminal/);
});

test("the explanation says when only a machine is keeping the clock open", () => {
  const carried = explain(
    { focused: true, lastHuman: T, lastSignal: T + IDLE + 1, unfocusedAt: 0, lastKind: "terminal" },
    T + IDLE + 1,
    IDLE
  );
  assert.equal(carried.active, true);
  assert.match(carried.reason, /have not touched anything/);

  const expired = explain(
    { focused: true, lastHuman: T, lastSignal: T + GRACE + 1, unfocusedAt: 0, lastKind: "terminal" },
    T + GRACE + 1,
    IDLE
  );
  assert.equal(expired.active, false);
  assert.match(expired.reason, /stops counting/);
});

// almanac.concurrentProjects. A window you switched away from keeps its
// repository's clock running on the same rule as the day's clock, focus aside.
test("an unfocused window is engaged on a recent human signal, and never on nothing", () => {
  assert.equal(isEngaged(state({ focused: false }), T + 100, IDLE), true);
  assert.equal(isEngaged(state({ focused: false }), T + IDLE, IDLE), false);
  assert.equal(isEngaged({ focused: false, lastSignal: 0, lastHuman: 0, unfocusedAt: 0 }, T, IDLE), false);
});

test("machine evidence carries an unfocused repository clock only within the grace window", () => {
  const carried = state({ focused: false, lastHuman: T, lastSignal: T + GRACE - 1000 });
  assert.equal(isEngaged(carried, T + GRACE - 1, IDLE), true);
  assert.equal(isEngaged(carried, T + GRACE, IDLE), false);
  const neverHuman = { focused: false, lastSignal: T, lastHuman: 0, unfocusedAt: 0 };
  assert.equal(isEngaged(neverHuman, T + 100, IDLE), false);
});

test("project credit ignores focus, day credit does not, and both drop a suspend", () => {
  const away = state({ focused: false });
  assert.equal(creditFor(away, T + 1000, T + 1000 - TICK_MS, IDLE), 0);
  assert.equal(projectCreditFor(away, T + 1000, T + 1000 - TICK_MS, IDLE), 15);
  assert.equal(projectCreditFor(away, T + 1000, T + 1000 - SUSPEND_MS - 1, IDLE), 0);
  assert.equal(projectCreditFor(state(), T + 1000, T + 1000 - TICK_MS, IDLE), creditFor(state(), T + 1000, T + 1000 - TICK_MS, IDLE));
});

test("the explanation says an unfocused window still counts for its repository only when the setting is on", () => {
  const away = state({ focused: false });
  assert.equal(explain(away, T + 100, IDLE).reason, "The VS Code window is not focused.");
  const explained = explain(away, T + 100, IDLE, true, true);
  assert.equal(explained.active, false);
  assert.match(explained.reason, /repository open here still counts/);
  assert.equal(explain(away, T + IDLE * 3, IDLE, true, true).reason, "The VS Code window is not focused.");
});

// The trap: the last keystroke before you switch away must not carry the
// repository through a whole idle window of nothing, on every alt-tab.
test("an unfocused window needs a signal from after focus left", () => {
  const left = withFocus(state(), false, T + 1000);
  assert.equal(left.unfocusedAt, T + 1000);
  assert.equal(isEngaged(left, T + 2000, IDLE), false);
  assert.equal(projectCreditFor(left, T + 2000, T + 2000 - TICK_MS, IDLE), 0);
  const output = { ...left, lastSignal: T + 5000 };
  assert.equal(isEngaged(output, T + 6000, IDLE), true);
  assert.equal(isEngaged(output, T + GRACE, IDLE), false);
  assert.equal(explain(left, T + 2000, IDLE, true, true).reason, "The VS Code window is not focused.");
  assert.match(explain(output, T + 6000, IDLE, true, true).reason, /repository open here still counts/);
});

test("regaining focus keeps the moment it last left, and staying put changes nothing", () => {
  const same = state();
  assert.equal(withFocus(same, true, T + 1), same);
  const back = withFocus(withFocus(same, false, T + 1000), true, T + 2000);
  assert.equal(back.focused, true);
  assert.equal(back.unfocusedAt, T + 1000);
});

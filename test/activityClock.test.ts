// ABOUTME: Tests for the rule that decides whether a moment counts as work.
// ABOUTME: If this is wrong, every other number is wrong. Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  creditFor,
  DEFAULT_IDLE_MS,
  EDIT_SCROLL_MS,
  idleWindowMs,
  isActive,
  isHumanScroll,
  MAX_IDLE_MINUTES,
  MIN_IDLE_MINUTES,
  startsSession,
  TICK_MS,
  withinIdle,
} from "../src/core/activityClock";

const NOW = 1_800_000_000_000;

test("typing in a focused window is active", () => {
  assert.equal(isActive({ focused: true, lastInput: NOW - 1000 }, NOW), true);
});

test("an unfocused window is never active, however recent the input", () => {
  assert.equal(isActive({ focused: false, lastInput: NOW }, NOW), false);
});

test("a focused window you walked away from stops counting", () => {
  assert.equal(isActive({ focused: true, lastInput: NOW - DEFAULT_IDLE_MS - 1 }, NOW), false);
});

test("input just inside the idle window still counts", () => {
  assert.equal(isActive({ focused: true, lastInput: NOW - DEFAULT_IDLE_MS + 1000 }, NOW), true);
});

test("a shorter configured window ends the credit sooner", () => {
  const state = { focused: true, lastInput: NOW - 3 * 60 * 1000 };
  assert.equal(isActive(state, NOW), true);
  assert.equal(isActive(state, NOW, idleWindowMs(2)), false);
});

test("the idle window is clamped to a defensible range", () => {
  assert.equal(idleWindowMs(0), MIN_IDLE_MINUTES * 60 * 1000);
  assert.equal(idleWindowMs(-5), MIN_IDLE_MINUTES * 60 * 1000);
  assert.equal(idleWindowMs(600), MAX_IDLE_MINUTES * 60 * 1000);
  assert.equal(idleWindowMs(undefined), DEFAULT_IDLE_MS);
  assert.equal(idleWindowMs(Number.NaN), DEFAULT_IDLE_MS);
  assert.equal(idleWindowMs(10), 10 * 60 * 1000);
});

test("an inactive tick credits nothing", () => {
  assert.equal(creditFor({ focused: false, lastInput: NOW }, NOW, NOW - TICK_MS), 0);
});

test("a normal tick credits its own length", () => {
  const seconds = creditFor({ focused: true, lastInput: NOW }, NOW, NOW - TICK_MS);
  assert.equal(seconds, TICK_MS / 1000);
});

test("a long gap credits one tick, not the gap", () => {
  // A suspended laptop must not be able to bank hours in a single tick.
  const seconds = creditFor({ focused: true, lastInput: NOW }, NOW, NOW - 6 * 60 * 60 * 1000);
  assert.equal(seconds, TICK_MS / 1000);
});

test("credit stops at the configured window, not the default one", () => {
  const state = { focused: true, lastInput: NOW - 4 * 60 * 1000 };
  assert.equal(creditFor(state, NOW, NOW - TICK_MS), TICK_MS / 1000);
  assert.equal(creditFor(state, NOW, NOW - TICK_MS, idleWindowMs(2)), 0);
});

test("a scroll an edit caused is not a human reading", () => {
  // An agent writing to the file you left open scrolls it. If that counted, the
  // machine could hold the clock open all day with nobody at the keyboard.
  assert.equal(isHumanScroll(NOW, NOW - 1, true), false);
  assert.equal(isHumanScroll(NOW, NOW - EDIT_SCROLL_MS + 1, true), false);
});

test("a scroll well clear of any edit is a human reading", () => {
  assert.equal(isHumanScroll(NOW, NOW - EDIT_SCROLL_MS, true), true);
  assert.equal(isHumanScroll(NOW, 0, true), true);
});

test("a visible range that changed without moving is a resize, not a scroll", () => {
  assert.equal(isHumanScroll(NOW, 0, false), false);
});

test("a machine signal may hold a clock open, but only inside the idle window", () => {
  // A terminal command or a debug step can be an agent's doing, so it may only
  // extend a clock a keyboard opened — never start one from cold.
  const idleMs = idleWindowMs(5);
  assert.equal(withinIdle(NOW, NOW - 60_000, idleMs), true);
  assert.equal(withinIdle(NOW, NOW - idleMs, idleMs), false);
  assert.equal(withinIdle(NOW, NOW - 60 * 60_000, idleMs), false);
});

test("a session starts on the transition into activity, not on every tick", () => {
  assert.equal(startsSession(false, true), true);
  assert.equal(startsSession(true, true), false);
  assert.equal(startsSession(true, false), false);
});

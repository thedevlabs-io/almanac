// ABOUTME: Tests for the rule that decides whether a moment counts as work.
// ABOUTME: If this is wrong, every other number is wrong. Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { creditFor, IDLE_MS, isActive, startsSession, TICK_MS } from "../src/core/activityClock";

const NOW = 1_800_000_000_000;

test("typing in a focused window is active", () => {
  assert.equal(isActive({ focused: true, lastInput: NOW - 1000 }, NOW), true);
});

test("an unfocused window is never active, however recent the input", () => {
  assert.equal(isActive({ focused: false, lastInput: NOW }, NOW), false);
});

test("a focused window you walked away from stops counting", () => {
  assert.equal(isActive({ focused: true, lastInput: NOW - IDLE_MS - 1 }, NOW), false);
});

test("input just inside the idle window still counts", () => {
  assert.equal(isActive({ focused: true, lastInput: NOW - IDLE_MS + 1000 }, NOW), true);
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

test("a session starts on the transition into activity, not on every tick", () => {
  assert.equal(startsSession(false, true), true);
  assert.equal(startsSession(true, true), false);
  assert.equal(startsSession(true, false), false);
});

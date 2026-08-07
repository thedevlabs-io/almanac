// ABOUTME: Local calendar-day arithmetic — the key format, and walking days backwards.
// ABOUTME: Everything is local time on purpose: a streak should break at your midnight, not UTC's.

import type { DayKey } from "./types";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function keyOf(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseKey(key: DayKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DayKey, delta: number): DayKey {
  const date = parseKey(key);
  date.setDate(date.getDate() + delta);
  return keyOf(date);
}

/** Whole days between two keys — negative when `to` is earlier than `from`. */
export function daysBetween(from: DayKey, to: DayKey): number {
  const ms = parseKey(to).getTime() - parseKey(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Every day from `from` to `to` inclusive, oldest first. */
export function range(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let key = from; daysBetween(key, to) >= 0; key = addDays(key, 1)) {
    out.push(key);
  }
  return out;
}

/** 0 = Sunday, matching the heatmap's rows. */
export function weekday(key: DayKey): number {
  return parseKey(key).getDay();
}

export function isWeekend(key: DayKey): boolean {
  const day = weekday(key);
  return day === 0 || day === 6;
}

export function monthName(key: DayKey): string {
  return parseKey(key).toLocaleDateString(undefined, { month: "short" });
}

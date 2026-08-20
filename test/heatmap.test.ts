import { strict as assert } from "node:assert";
import { test } from "node:test";
import { shift } from "../src/core/day";
import { buildDashboard } from "../src/core/dashboardModel";
import { applyTick } from "../src/core/record";
import { emptyDay, type DayRecord } from "../src/core/types";
import { dashboardHtml } from "../src/ui/dashboardHtml";
import type { BrandFonts } from "../src/ui/style";

const TODAY = "2026-08-20";
const FONTS: BrandFonts = { display: "f/d.woff2", mono400: "f/m4.woff2", mono600: "f/m6.woff2" };

/** A year of work, so the grid has enough columns to expose label collisions. */
function year(): Record<string, DayRecord> {
  const days: Record<string, DayRecord> = {};
  for (let i = 0; i < 365; i += 3) {
    const date = shift(TODAY, -i);
    days[date] = applyTick(emptyDay(date), { seconds: 600 + i * 20, hour: 10 });
  }
  return days;
}

function week(): Record<string, DayRecord> {
  const days: Record<string, DayRecord> = {};
  for (const [offset, seconds, hour] of [[0, 7200, 9], [2, 3600, 14], [5, 1800, 22]] as const) {
    const date = shift(TODAY, -offset);
    days[date] = applyTick(emptyDay(date), { seconds, hour });
  }
  return days;
}

// The screenshot bug: `Jul` and `Aug` printed on top of each other and read as
// `JulAug`, because every week got a fixed 12px span and a month name is wider.
test("month labels never overlap", () => {
  const labels = buildDashboard(year(), { today: TODAY }).monthLabels;

  for (let i = 1; i < labels.length; i += 1) {
    const previous = labels[i - 1];
    const current = labels[i];
    assert.ok(previous && current);
    assert.ok(
      current.column >= previous.column + previous.span,
      `${previous.label} at column ${previous.column} spanning ${previous.span} runs into ${current.label} at ${current.column}`
    );
  }
});

test("a month too narrow to print is dropped rather than squeezed", () => {
  // The grid is aligned to a Monday, so the leading month is usually partial
  // and must not be labelled in one or two columns.
  const model = buildDashboard(year(), { today: TODAY });
  assert.ok(model.monthLabels.every((label) => label.span >= 3));
});

// The screenshot bug: --heat-0 was var(--vscode-editorWidget-background), the
// exact colour of the card behind it, so every day with no work was invisible.
test("a day with no activity is still a visible square", () => {
  const html = dashboardHtml(buildDashboard(year(), { today: TODAY }), "csp", FONTS, "dark");
  const heat0 = html.match(/--heat-0:\s*([^;]+);/)?.[1]?.trim();

  assert.ok(heat0, "no --heat-0 defined");
  assert.notEqual(
    heat0,
    "var(--vscode-editorWidget-background)",
    "empty cells are painted the same colour as the card behind them"
  );
  assert.equal(heat0, "color-mix(in srgb, var(--vscode-foreground) 11%, transparent)");
});

test("every column is seven rows tall, so the weekday gutter lines up", () => {
  const model = buildDashboard(year(), { today: TODAY });
  for (const heatWeek of model.weeks) {
    assert.equal(heatWeek.cells.length, 7);
  }
  // Only the trailing column may be padded, and padding never carries time.
  const filler = model.weeks.flatMap((w) => w.cells).filter((cell) => cell.filler);
  assert.ok(filler.every((cell) => cell.seconds === 0 && cell.level === 0));
});

test("weekday names label the rows they actually correspond to", () => {
  const model = buildDashboard(year(), { today: TODAY });
  assert.equal(model.weekdayLabels.length, 7);
  assert.equal(model.weekdayLabels[0], "Mon");
  assert.equal(model.weekdayLabels[2], "Wed");
  assert.equal(model.weekdayLabels[4], "Fri");

  // Every cell sits in the row its weekday says it does.
  for (const heatWeek of model.weeks) {
    heatWeek.cells.forEach((cell, row) => {
      assert.equal(cell.weekday, row, `${cell.date} is in row ${row} but is weekday ${cell.weekday}`);
    });
  }
});

test("the legend names real durations instead of Less to More", () => {
  const model = buildDashboard(year(), { today: TODAY });
  assert.equal(model.legend.length, 5);
  assert.equal(model.legend[0]?.text, "None");
  for (const stop of model.legend.slice(1)) {
    assert.match(stop.text, /^to \d+(h|m|s)/, `"${stop.text}" does not name a duration`);
  }

  const html = dashboardHtml(model, "csp", FONTS, "dark");
  assert.equal(html.includes("Less "), false, "the old wordless legend is still there");
});

test("an empty window says so rather than showing a broken scale", () => {
  const model = buildDashboard({}, { today: TODAY });
  assert.deepEqual(model.legend, [{ level: 0, text: "No activity yet" }]);
});

/**
 * The window tabs are gone. They were four ways to ask a question the page
 * answers twice over, and "average day" silently meant something different in
 * each one.
 */
test("the dashboard covers one rolling year, with no control to change it", () => {
  const model = buildDashboard(year(), { today: TODAY });
  assert.equal(model.from, shift(TODAY, -364));
  assert.equal(model.to, TODAY);
  assert.equal(model.rangeLabel, "last 365 days");

  const html = dashboardHtml(model, "csp", FONTS, "dark");
  assert.equal(html.includes("data-window"), false, "the window tabs are still being rendered");
});

test("the last seven days are always listed, whatever the graph shows", () => {
  const model = buildDashboard(week(), { today: TODAY });
  assert.equal(model.recentDays.length, 7, "every day appears, including the empty ones");
  assert.ok(model.weeks.length > 3, "the year grid is still drawn");

  const rows = model.recentDays;
  assert.match(rows[0]?.dayLabel ?? "", /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ \w+$/);
  assert.equal(rows[rows.length - 1]?.isToday, true);

  const worked = rows.find((row) => row.seconds === 7200);
  assert.equal(worked?.time, "2h");
  assert.equal(worked?.busiestHours, "09:00 to 10:00", "the stretch of the day is named");

  const idle = rows.find((row) => row.seconds === 0);
  assert.equal(idle?.time, "0m");
  assert.equal(idle?.busiestHours, "", "a day with nothing tracked claims no hours");
});

test("a late night day reports the hours it actually spanned", () => {
  const days = { [TODAY]: applyTick(applyTick(emptyDay(TODAY), { seconds: 60, hour: 22 }), { seconds: 60, hour: 23 }) };
  const model = buildDashboard(days, { today: TODAY });
  assert.equal(model.recentDays.find((row) => row.isToday)?.busiestHours, "22:00 to 00:00");
});

/* --- clicking a day ------------------------------------------------------ */

test("a square carries what it is worth, so hovering does not need a click", () => {
  const days = {
    [TODAY]: applyTick(emptyDay(TODAY), {
      seconds: 3600,
      hour: 10,
      language: "typescript",
      project: { repo: "almanac", folder: "src" },
    }),
  };
  const html = dashboardHtml(buildDashboard(days, { today: TODAY }), "csp", FONTS, "dark");
  const title = html.match(new RegExp(`data-day="${TODAY}"[^>]*title="([^"]*)"`))?.[1] ?? "";
  assert.match(title, /1h on Thu 20 Aug 2026 \(today\)/);
  assert.match(title, /mostly in almanac/);
  assert.match(title, /TypeScript/);
});

test("an empty square says nothing was tracked rather than 0m", () => {
  const model = buildDashboard(year(), { today: TODAY });
  const empty = model.weeks.flatMap((w) => w.cells).find((cell) => !cell.filler && cell.seconds === 0);
  assert.match(empty?.label ?? "", /^Nothing tracked on/);
});

test("clicking a day opens that day, built from the same aggregates as the year", () => {
  const date = shift(TODAY, -3);
  const days = {
    [date]: [
      { seconds: 3600, hour: 9, language: "typescript", kind: "editor" as const, project: { repo: "almanac", folder: "src/core" } },
      { seconds: 1800, hour: 14, language: "markdown", kind: "terminal" as const, project: { repo: "almanac", folder: "." } },
    ].reduce((record, tick) => applyTick(record, tick), emptyDay(date)),
  };
  const model = buildDashboard(days, { today: TODAY, selected: date });

  const day = model.selected;
  assert.ok(day, "no day detail was built");
  assert.equal(day.date, date);
  assert.equal(day.time, "1h 30m");
  assert.equal(day.relative, "3 days ago");
  assert.equal(day.empty, false);
  assert.equal(day.hoursText, "09:00 to 15:00");
  assert.equal(day.languages[0]?.label, "TypeScript");
  assert.equal(day.signals.map((signal) => signal.label).includes("Terminal"), true);
  assert.equal(day.repositories[0]?.repo, "almanac");
  assert.equal(day.hourBars.length, 24);

  const html = dashboardHtml(model, "csp", FONTS, "dark");
  assert.ok(html.includes('class="day-detail"'));
  assert.ok(html.includes("Thu 17 Aug 2026") || html.includes("17 Aug 2026"));
  assert.ok(html.includes('id="clear-day"'), "there is no way to close the day again");
  assert.ok(
    new RegExp(`heat-cell picked" data-level="\\d" data-day="${date}"`).test(html),
    "the open day's square is not marked"
  );
});

test("clicking a day with nothing on it says so rather than rendering blank", () => {
  const date = shift(TODAY, -10);
  const model = buildDashboard(year(), { today: TODAY, selected: date });
  assert.equal(model.selected?.empty, true);
  const html = dashboardHtml(model, "csp", FONTS, "dark");
  assert.ok(html.includes("Nothing tracked on this day"));
});

test("no day is open until one is clicked", () => {
  const model = buildDashboard(year(), { today: TODAY });
  assert.equal(model.selected, undefined);
  assert.equal(dashboardHtml(model, "csp", FONTS, "dark").includes('class="day-detail"'), false);
});

/* --- two sets of squares, two scales, two legends ------------------------ */

/**
 * The bug this pins: the matrix is shaded against the busiest single hour and
 * the day grid against the busiest whole day. One legend served both, so the
 * durations printed under the matrix were several times too large.
 */
test("the weekday grid's legend names hours, not days", () => {
  const date = shift(TODAY, -2);
  const days = {
    [date]: [
      { seconds: 3600, hour: 9 },
      { seconds: 1800, hour: 10 },
      { seconds: 900, hour: 11 },
    ].reduce((record, tick) => applyTick(record, tick), emptyDay(date)),
  };
  const model = buildDashboard(days, { today: TODAY });

  // The day holds 1h 45m; its busiest single hour holds 1h.
  assert.equal(model.legend[4]?.text, "to 1h 45m");
  assert.equal(model.weekHoursLegend[4]?.text, "to 1h");
  assert.notDeepEqual(
    model.weekHoursLegend,
    model.legend,
    "the matrix must not borrow the day grid's scale"
  );

  const html = dashboardHtml(model, "csp", FONTS, "dark");
  assert.equal(
    html.includes("shaded against the busiest hour, not the busiest day"),
    false,
    "the note that promised the right scale while showing the wrong one is still there"
  );
});

test("recent days are shaded on the same scale as the grid beside them", () => {
  // A busy day a month back, a quiet one yesterday. On the year's scale
  // yesterday is cool; on the last-seven-days scale it would be the hottest
  // square on screen, in the same colours, right next to the grid.
  const busy = shift(TODAY, -30);
  const quiet = shift(TODAY, -1);
  const days = {
    [busy]: applyTick(emptyDay(busy), { seconds: 8 * 3600, hour: 10 }),
    [quiet]: applyTick(emptyDay(quiet), { seconds: 900, hour: 10 }),
  };
  const model = buildDashboard(days, { today: TODAY });

  const row = model.recentDays.find((entry) => entry.date === quiet);
  assert.equal(row?.level, 1, "a 15 minute day is not the hottest shade of the year");
  const cell = model.weeks.flatMap((week) => week.cells).find((entry) => entry.date === quiet);
  assert.equal(row?.level, cell?.level, "the same day has two different shades on one screen");
});

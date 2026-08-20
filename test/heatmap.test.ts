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
test("month labels never overlap, whatever the window", () => {
  for (const window of ["month", "quarter", "year"] as const) {
    const model = buildDashboard(year(), { today: TODAY, window });
    const labels = model.monthLabels;

    for (let i = 1; i < labels.length; i += 1) {
      const previous = labels[i - 1];
      const current = labels[i];
      assert.ok(previous && current);
      assert.ok(
        current.column >= previous.column + previous.span,
        `${window}: ${previous.label} at column ${previous.column} spanning ${previous.span} runs into ${current.label} at ${current.column}`
      );
    }
    for (const label of labels) {
      assert.ok(label.span >= 3, `${window}: ${label.label} has only ${label.span} columns to print in`);
    }
  }
});

test("a month too narrow to print is dropped rather than squeezed", () => {
  // A 30 day window starts mid-month, so the leading partial month has one or
  // two columns and must not be labelled.
  const model = buildDashboard(year(), { today: TODAY, window: "month" });
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

// Seven squares stacked in one column is a heatmap of nothing.
test("the week window shows named days with hours, not a single column", () => {
  const model = buildDashboard(week(), { today: TODAY, window: "week" });

  assert.equal(model.showsDayRows, true);
  assert.deepEqual(model.weeks, [], "the grid is not drawn at this range");
  assert.equal(model.dayRows.length, 7, "every day appears, including the empty ones");

  const rows = model.dayRows;
  assert.match(rows[0]?.dayLabel ?? "", /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ \w+$/);
  assert.equal(rows[rows.length - 1]?.isToday, true);

  const worked = rows.find((row) => row.seconds === 7200);
  assert.equal(worked?.time, "2h");
  assert.equal(worked?.busiestHours, "09:00 to 10:00", "the stretch of the day is named");
  assert.equal(worked?.share, 1, "the busiest day of the week fills the bar");

  const idle = rows.find((row) => row.seconds === 0);
  assert.equal(idle?.time, "0m");
  assert.equal(idle?.busiestHours, "", "a day with nothing tracked claims no hours");
});

test("a late night day reports the hours it actually spanned", () => {
  const days = { [TODAY]: applyTick(applyTick(emptyDay(TODAY), { seconds: 60, hour: 22 }), { seconds: 60, hour: 23 }) };
  const model = buildDashboard(days, { today: TODAY, window: "week" });
  assert.equal(model.dayRows.find((row) => row.isToday)?.busiestHours, "22:00 to 00:00");
});

test("longer windows keep the grid and drop the day rows", () => {
  for (const window of ["month", "quarter", "year"] as const) {
    const model = buildDashboard(year(), { today: TODAY, window });
    assert.equal(model.showsDayRows, false);
    assert.deepEqual(model.dayRows, []);
    assert.ok(model.weeks.length > 3, `${window} should have a grid`);
  }
});

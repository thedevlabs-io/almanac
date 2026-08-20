import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildReport,
  clientOf,
  filterOptions,
  matches,
  parseSelection,
  reportToCsv,
  roundSeconds,
  selectionKey,
} from "../src/core/report";
import { applyTick } from "../src/core/record";
import { emptyDay, type DayRecord } from "../src/core/types";

function day(date: string, entries: [string, number][]): DayRecord {
  return entries.reduce(
    (record, [repo, seconds]) =>
      applyTick(record, { seconds, hour: 10, project: { repo, folder: "." } }),
    emptyDay(date)
  );
}

test("rounding always rounds up, because rounding down bills less than was worked", () => {
  assert.equal(roundSeconds(0, "15m"), 0);
  assert.equal(roundSeconds(1, "15m"), 900);
  assert.equal(roundSeconds(900, "15m"), 900);
  assert.equal(roundSeconds(901, "15m"), 1800);
  assert.equal(roundSeconds(3601, "1h"), 7200);
  assert.equal(roundSeconds(1234, "none"), 1234);
});

test("an unmapped repository reports under its own name rather than vanishing", () => {
  assert.equal(clientOf("acme-api", { "acme-api": "acme" }), "acme");
  assert.equal(clientOf("side-project", { "acme-api": "acme" }), "side-project");
  assert.equal(clientOf("acme-api", { "acme-api": "   " }), "acme-api");
});

test("repositories sharing a client are billed as one line per day", () => {
  const days = {
    "2026-08-01": day("2026-08-01", [["acme-api", 3600], ["acme-web", 1800], ["personal", 600]]),
  };
  const report = buildReport(days, {
    from: "2026-08-01",
    to: "2026-08-01",
    clients: { "acme-api": "Acme", "acme-web": "Acme" },
  });

  assert.equal(report.rows.length, 2);
  const acme = report.rows.find((row) => row.client === "Acme");
  assert.equal(acme?.seconds, 5400);
  assert.deepEqual(acme?.repos, ["acme-api", "acme-web"], "busiest repository first");
  assert.equal(report.rows.find((row) => row.client === "personal")?.seconds, 600);
});

test("rounding is applied per client per day, not once at the end", () => {
  const days = {
    "2026-08-01": day("2026-08-01", [["acme", 60]]),
    "2026-08-02": day("2026-08-02", [["acme", 60]]),
  };
  const report = buildReport(days, { from: "2026-08-01", to: "2026-08-02", rounding: "1h" });

  assert.equal(report.seconds, 120, "raw time is unchanged");
  assert.equal(report.billableSeconds, 7200, "two days each round up to an hour");
  assert.equal(report.clients[0]?.days, 2);
});

test("days with no repository time produce no rows", () => {
  const report = buildReport({ "2026-08-01": emptyDay("2026-08-01") }, {
    from: "2026-08-01",
    to: "2026-08-01",
  });
  assert.deepEqual(report.rows, []);
  assert.equal(report.billableSeconds, 0);
});

test("the CSV quotes fields that would otherwise break it", () => {
  const days = { "2026-08-01": day("2026-08-01", [["repo", 3600]]) };
  const csv = reportToCsv(
    buildReport(days, { from: "2026-08-01", to: "2026-08-01", clients: { repo: 'Ac"me, Ltd' } })
  );

  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "date,client,repositories,tracked_hours,billable_hours");
  assert.equal(lines[1], '2026-08-01,"Ac""me, Ltd",repo,1.00,1.00');
});

/* --- filtering by repository and folder ---------------------------------- */

function mixedDay(date: string): DayRecord {
  return [
    { seconds: 3600, hour: 9, project: { repo: "almanac", folder: "src/core" } },
    { seconds: 1800, hour: 10, project: { repo: "almanac", folder: "src/ui" } },
    { seconds: 900, hour: 11, project: { repo: "almanac", folder: "." } },
    { seconds: 2700, hour: 14, project: { repo: "devlabs-web", folder: "app" } },
  ].reduce((record, tick) => applyTick(record, tick), emptyDay(date));
}

test("a folder selection includes everything beneath it", () => {
  assert.equal(matches("almanac", "src/core", ["almanac/src"]), true);
  assert.equal(matches("almanac", "src", ["almanac/src"]), true);
  assert.equal(matches("almanac", "srcery", ["almanac/src"]), false, "a name prefix is not a path prefix");
  assert.equal(matches("almanac", ".", ["almanac/src"]), false);
  assert.equal(matches("devlabs-web", "app", ["almanac/src"]), false);
});

test("selecting a repository takes all of it, and no selection takes everything", () => {
  assert.equal(matches("almanac", "src/ui", ["almanac"]), true);
  assert.equal(matches("almanac", ".", ["almanac"]), true);
  assert.equal(matches("devlabs-web", "app", ["almanac"]), false);
  assert.equal(matches("devlabs-web", "app", []), true);
});

test("a key round trips through its string form", () => {
  for (const selection of [
    { repo: "almanac" },
    { repo: "almanac", folder: "." },
    { repo: "almanac", folder: "src/core" },
  ]) {
    assert.deepEqual(parseSelection(selectionKey(selection)), selection);
  }
});

test("filtering to one folder reports only that folder's time", () => {
  const days = { "2026-08-20": mixedDay("2026-08-20") };
  const all = buildReport(days, { from: "2026-08-20", to: "2026-08-20" });
  assert.equal(all.seconds, 9000);

  const core = buildReport(days, {
    from: "2026-08-20",
    to: "2026-08-20",
    include: ["almanac/src/core"],
  });
  assert.equal(core.seconds, 3600);
  assert.deepEqual(core.clients.map((client) => client.client), ["almanac"]);

  const src = buildReport(days, { from: "2026-08-20", to: "2026-08-20", include: ["almanac/src"] });
  assert.equal(src.seconds, 5400, "src should carry both folders under it, and not the root");
});

test("several selections add up rather than fighting", () => {
  const days = { "2026-08-20": mixedDay("2026-08-20") };
  const both = buildReport(days, {
    from: "2026-08-20",
    to: "2026-08-20",
    include: ["almanac/src/ui", "devlabs-web"],
  });
  assert.equal(both.seconds, 1800 + 2700);
  assert.deepEqual(both.clients.map((client) => client.client).sort(), ["almanac", "devlabs-web"]);
});

test("a filter is recorded on the report, so an export can be named as narrowed", () => {
  const days = { "2026-08-20": mixedDay("2026-08-20") };
  assert.deepEqual(buildReport(days, { from: "2026-08-20", to: "2026-08-20" }).include, []);
  assert.deepEqual(
    buildReport(days, { from: "2026-08-20", to: "2026-08-20", include: ["almanac"] }).include,
    ["almanac"]
  );
});

test("the filter's options are every repository and folder in range, busiest first", () => {
  const days = { "2026-08-20": mixedDay("2026-08-20") };
  const options = filterOptions(days, "2026-08-20", "2026-08-20");

  // `src` is offered even though nobody opened it directly: it is where
  // src/core and src/ui live, and "the source" is a real thing to filter by.
  assert.deepEqual(
    options.map((option) => option.key),
    [
      "almanac",
      "almanac/src",
      "almanac/src/core",
      "almanac/src/ui",
      "almanac/.",
      "devlabs-web",
      "devlabs-web/app",
    ]
  );
  assert.equal(options[0]?.seconds, 6300, "the repository row carries its whole total");
  assert.equal(options[1]?.seconds, 5400, "an intermediate folder carries everything beneath it");
  assert.equal(options[4]?.label, "repository root");
  assert.equal(options[2]?.depth, 2, "src/core indents one further than src");
});

test("filtering never invents or loses time: the parts sum to the whole", () => {
  const days = { "2026-08-20": mixedDay("2026-08-20") };
  const whole = buildReport(days, { from: "2026-08-20", to: "2026-08-20" }).seconds;
  const parts = ["almanac/src/core", "almanac/src/ui", "almanac/.", "devlabs-web"]
    .map((key) => buildReport(days, { from: "2026-08-20", to: "2026-08-20", include: [key] }).seconds)
    .reduce((sum, seconds) => sum + seconds, 0);
  assert.equal(parts, whole);
});

test("a CSV export of a filtered report contains only the filtered rows", () => {
  const days = { "2026-08-20": mixedDay("2026-08-20") };
  const csv = reportToCsv(
    buildReport(days, { from: "2026-08-20", to: "2026-08-20", include: ["devlabs-web"] })
  );
  assert.equal(csv.includes("devlabs-web"), true);
  assert.equal(csv.includes("almanac"), false, "a filtered export leaked an unselected repository");
});

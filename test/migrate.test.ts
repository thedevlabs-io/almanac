import { strict as assert } from "node:assert";
import { test } from "node:test";
import { migrate, UnreadableDatabase } from "../src/core/migrate";
import { SCHEMA_VERSION } from "../src/core/types";

test("a missing or dayless file starts empty", () => {
  for (const value of [null, undefined, {}, { version: 2 }]) {
    const database = migrate(value);
    assert.equal(database.version, SCHEMA_VERSION);
    assert.deepEqual(database.days, {});
  }
});

test("a file that is not a usable shape is refused, not silently emptied", () => {
  // Starting empty here would be worse than failing: the empty database is
  // written back over the original within seconds, destroying real history.
  for (const value of [42, "nope", [], { days: 7 }, { days: [] }, { days: "x" }]) {
    assert.throws(() => migrate(value), UnreadableDatabase, `should refuse ${JSON.stringify(value)}`);
  }
});

test("a file from a newer schema is refused rather than downgraded", () => {
  // Global storage can be synced, so an older install must not read a v3 file,
  // drop every field it does not recognise, and write the loss back.
  assert.throws(() => migrate({ version: SCHEMA_VERSION + 1, days: {} }), UnreadableDatabase);
  assert.doesNotThrow(() => migrate({ version: SCHEMA_VERSION, days: {} }));
  assert.doesNotThrow(() => migrate({ version: 1, days: {} }));
});

test("a version 1 flat project map becomes one repository per old folder name", () => {
  const database = migrate({
    version: 1,
    days: {
      "2026-08-01": {
        date: "2026-08-01",
        activeSeconds: 3600,
        languages: { typescript: 3600 },
        projects: { almanac: 2400, notes: 1200 },
        hours: new Array(24).fill(0),
        edits: 10,
        saves: 2,
        files: 3,
        sessions: 1,
        composition: { typedChars: 100, blockChars: 50, blockCount: 2 },
      },
    },
  });

  const day = database.days["2026-08-01"];
  assert.equal(day?.activeSeconds, 3600);
  assert.deepEqual(day?.projects, {
    almanac: { seconds: 2400, folders: { ".": 2400 } },
    notes: { seconds: 1200, folders: { ".": 1200 } },
  });
  assert.deepEqual(day?.composition, { typedChars: 100, blockChars: 50, blockCount: 2 });
  assert.deepEqual(day?.signals, {}, "version 1 recorded no signal split");
});

test("a version 2 project record survives a round trip", () => {
  const database = migrate({
    version: 2,
    days: {
      "2026-08-02": {
        projects: { acme: { seconds: 999, folders: { ".": 100, "apps/web": 200 } } },
        signals: { terminal: 300, editor: 100 },
      },
    },
  });

  assert.deepEqual(database.days["2026-08-02"]?.projects, {
    acme: { seconds: 300, folders: { ".": 100, "apps/web": 200 } },
  });
  assert.deepEqual(database.days["2026-08-02"]?.signals, { terminal: 300, editor: 100 });
});

test("a day key that is not a date is dropped", () => {
  const database = migrate({ days: { "not-a-date": {}, "2026-08-03": {} } });
  assert.deepEqual(Object.keys(database.days), ["2026-08-03"]);
});

test("negative and non-numeric values are floored to zero, never carried", () => {
  const day = migrate({
    days: { "2026-08-04": { activeSeconds: -5, edits: "many", hours: ["x", 10] } },
  }).days["2026-08-04"];

  assert.equal(day?.activeSeconds, 0);
  assert.equal(day?.edits, 0);
  assert.equal(day?.hours[0], 0);
  assert.equal(day?.hours[1], 10);
  assert.equal(day?.hours.length, 24);
});

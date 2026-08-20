import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { keyOf, shift } from "../src/core/day";
import { Store } from "../src/storage/store";

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "almanac-store-"));
}

async function read(directory: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(path.join(directory, "activity.json"), "utf8"));
}

test("a missing file is the ordinary first run", async () => {
  const directory = await tempDir();
  const store = new Store(directory, () => 730);
  await store.load();
  assert.deepEqual(store.days, {});
  const entries = await fs.readdir(directory);
  assert.deepEqual(entries, [], "nothing is written just for looking");
});

test("a tick is persisted, and the file is valid JSON", async () => {
  const directory = await tempDir();
  const store = new Store(directory, () => 730);
  await store.load();
  store.addTick("2026-08-20", { seconds: 60, hour: 9, kind: "terminal", project: { repo: "acme", folder: "apps/web" } });
  await store.flush();

  const database = (await read(directory)) as { version: number; days: Record<string, { activeSeconds: number; projects: Record<string, unknown> }> };
  assert.equal(database.version, 2);
  assert.equal(database.days["2026-08-20"]?.activeSeconds, 60);
  assert.deepEqual(database.days["2026-08-20"]?.projects, {
    acme: { seconds: 60, folders: { "apps/web": 60 } },
  });
});

test("an unparseable file is kept aside rather than overwritten", async () => {
  const directory = await tempDir();
  await fs.writeFile(path.join(directory, "activity.json"), "{ this is not json", "utf8");

  const store = new Store(directory, () => 730);
  await store.load();
  assert.deepEqual(store.days, {}, "starts empty");

  const kept = (await fs.readdir(directory)).filter((name) => name.endsWith(".corrupt"));
  assert.equal(kept.length, 1, "the original is preserved");
  assert.equal(await fs.readFile(path.join(directory, kept[0] as string), "utf8"), "{ this is not json");
});

test("a structurally wrong file is quarantined, not silently emptied", async () => {
  // The dangerous case: parseable JSON that migrate cannot use. Starting empty
  // would write the empty database back over two years of history.
  const directory = await tempDir();
  await fs.writeFile(path.join(directory, "activity.json"), JSON.stringify({ days: "gone" }), "utf8");

  const store = new Store(directory, () => 730);
  await store.load();

  const kept = (await fs.readdir(directory)).filter((name) => name.endsWith(".corrupt"));
  assert.equal(kept.length, 1);
});

test("a second casualty does not discard the first", async () => {
  const directory = await tempDir();
  for (let i = 0; i < 2; i += 1) {
    await fs.writeFile(path.join(directory, "activity.json"), `broken ${i}`, "utf8");
    await new Store(directory, () => 730).load();
    // The quarantine name is stamped to the second, so give the clock a tick.
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  const kept = (await fs.readdir(directory)).filter((name) => name.endsWith(".corrupt"));
  assert.equal(kept.length, 2, "both casualties survive");
});

test("retention prunes old days and keeps the window", async () => {
  const directory = await tempDir();
  const today = keyOf(new Date());
  await fs.writeFile(
    path.join(directory, "activity.json"),
    JSON.stringify({
      version: 2,
      days: {
        [shift(today, -400)]: { activeSeconds: 100 },
        [shift(today, -5)]: { activeSeconds: 200 },
      },
    }),
    "utf8"
  );

  const store = new Store(directory, () => 30);
  await store.load();
  assert.deepEqual(Object.keys(store.days), [shift(today, -5)]);
});

test("a nonsense retention value falls back instead of deleting everything", async () => {
  // VS Code does not coerce a settings value that violates the contributed
  // schema, so this arrives verbatim from settings.json.
  const directory = await tempDir();
  const today = keyOf(new Date());
  await fs.writeFile(
    path.join(directory, "activity.json"),
    JSON.stringify({ version: 2, days: { [shift(today, -5)]: { activeSeconds: 200 } } }),
    "utf8"
  );

  const store = new Store(directory, () => Number.NaN);
  await store.load();
  assert.deepEqual(Object.keys(store.days), [shift(today, -5)], "history survives a bad setting");
});

test("a failed write leaves the state dirty so it can be retried", async () => {
  const directory = await tempDir();
  const store = new Store(directory, () => 730);
  await store.load();
  store.addTick("2026-08-20", { seconds: 60, hour: 9 });

  // A directory where the file should go makes the rename fail.
  await fs.mkdir(path.join(directory, "activity.json"), { recursive: true });
  await store.flush();

  // Remove the obstruction; the retry must still carry the tick.
  await fs.rmdir(path.join(directory, "activity.json"));
  store.addTick("2026-08-20", { seconds: 60, hour: 9 });
  await store.flush();

  const database = (await read(directory)) as { days: Record<string, { activeSeconds: number }> };
  assert.equal(database.days["2026-08-20"]?.activeSeconds, 120, "the first tick was not lost");
});

test("clearing writes an empty database rather than leaving the old file", async () => {
  const directory = await tempDir();
  const store = new Store(directory, () => 730);
  await store.load();
  store.addTick("2026-08-20", { seconds: 60, hour: 9 });
  await store.flush();
  await store.clear();

  const database = (await read(directory)) as { days: Record<string, unknown> };
  assert.deepEqual(database.days, {});
});

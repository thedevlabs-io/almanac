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

/**
 * Two VS Code windows are two extension hosts with one file between them.
 * The first version of the store loaded once and wrote its whole memory back,
 * so whichever window wrote last erased the other's day.
 */
test("two windows writing the same file keep each other's minutes", async () => {
  const directory = await tempDir();
  const a = new Store(directory, () => 730);
  const b = new Store(directory, () => 730);
  await a.load();
  await b.load();

  a.addTick("2026-08-20", { seconds: 60, hour: 9, language: "typescript", kind: "editor" });
  a.count("2026-08-20", "sessions");
  await a.flush();
  b.addTick("2026-08-20", { seconds: 30, hour: 9, language: "go", kind: "terminal" });
  b.addTick("2026-08-21", { seconds: 15, hour: 10 });
  await b.flush();
  a.addTick("2026-08-20", { seconds: 15, hour: 10 });
  await a.flush();

  const database = (await read(directory)) as { days: Record<string, { activeSeconds: number; languages: Record<string, number>; sessions: number; hours: number[] }> };
  const day = database.days["2026-08-20"];
  assert.equal(day?.activeSeconds, 105, "every window's seconds survive");
  assert.deepEqual(day?.languages, { typescript: 60, go: 30 });
  assert.equal(day?.sessions, 1);
  assert.equal(day?.hours[9], 90);
  assert.equal(day?.hours[10], 15);
  assert.equal(database.days["2026-08-21"]?.activeSeconds, 15);

  // Each window sees the merged picture after its own write, not just its own.
  assert.equal(a.day("2026-08-20").activeSeconds, 105);
  assert.equal(b.day("2026-08-20").activeSeconds, 90, "b has not synced since a's last write");
  await b.sync();
  assert.equal(b.day("2026-08-20").activeSeconds, 105);
});

test("a window that only reads is told when another wrote", async () => {
  const directory = await tempDir();
  const writer = new Store(directory, () => 730);
  const reader = new Store(directory, () => 730);
  await writer.load();
  await reader.load();
  let changes = 0;
  reader.onDidChange(() => (changes += 1));

  await reader.sync();
  assert.equal(changes, 0, "nothing on disk moved");
  writer.addTick("2026-08-20", { seconds: 60, hour: 9 });
  await writer.flush();
  await reader.sync();
  assert.equal(changes, 1);
  assert.equal(reader.day("2026-08-20").activeSeconds, 60);
});

test("commits are read whole by each window, so the larger reading wins", async () => {
  const directory = await tempDir();
  const a = new Store(directory, () => 730);
  const b = new Store(directory, () => 730);
  await a.load();
  await b.load();
  a.setCommits("2026-08-20", 3);
  await a.flush();
  b.setCommits("2026-08-20", 5);
  await b.flush();
  a.setCommits("2026-08-20", 2);
  await a.flush();
  const database = (await read(directory)) as { days: Record<string, { commits: number }> };
  assert.equal(database.days["2026-08-20"]?.commits, 5);
});

test("a lock left by a dead window is cleared rather than blocking forever", async () => {
  const directory = await tempDir();
  const lock = path.join(directory, "activity.json.lock");
  await fs.writeFile(lock, "", "utf8");
  const old = new Date(Date.now() - 60 * 1000);
  await fs.utimes(lock, old, old);

  const store = new Store(directory, () => 730);
  await store.load();
  store.addTick("2026-08-20", { seconds: 60, hour: 9 });
  await store.flush();
  const database = (await read(directory)) as { days: Record<string, { activeSeconds: number }> };
  assert.equal(database.days["2026-08-20"]?.activeSeconds, 60);
  await assert.rejects(fs.stat(lock), "the lock is released afterwards");
});

test("a lock another window holds defers the write without losing it", async () => {
  const directory = await tempDir();
  const lock = path.join(directory, "activity.json.lock");
  const store = new Store(directory, () => 730);
  await store.load();
  await fs.writeFile(lock, "", "utf8");

  store.addTick("2026-08-20", { seconds: 60, hour: 9 });
  await store.flush();
  await assert.rejects(fs.stat(path.join(directory, "activity.json")), "nothing was written past the lock");
  assert.equal(store.day("2026-08-20").activeSeconds, 60, "the delta is still shown");

  await fs.rm(lock);
  store.addTick("2026-08-20", { seconds: 15, hour: 9 });
  await store.flush();
  const database = (await read(directory)) as { days: Record<string, { activeSeconds: number }> };
  assert.equal(database.days["2026-08-20"]?.activeSeconds, 75);
});

test("a listener reading the store mid-write sees each second once", async () => {
  const directory = await tempDir();
  const store = new Store(directory, () => 730);
  await store.load();
  const seen: number[] = [];
  store.onDidChange(() => seen.push(store.day("2026-08-20").activeSeconds));
  store.addTick("2026-08-20", { seconds: 60, hour: 9 });
  await store.flush();
  assert.deepEqual(seen, [60], "the delta was counted in both base and in flight");
});

test("a commit reading no larger than what is shown is not written again", async () => {
  // Merging by max means a lower reading changes nothing, and writing it
  // every poll would keep the file churning after a rebase.
  const directory = await tempDir();
  const store = new Store(directory, () => 730);
  await store.load();
  store.setCommits("2026-08-20", 5);
  await store.flush();
  const first = await fs.stat(path.join(directory, "activity.json"));
  store.setCommits("2026-08-20", 3);
  await store.flush();
  const second = await fs.stat(path.join(directory, "activity.json"));
  assert.equal(second.mtimeMs, first.mtimeMs, "the file was rewritten for a no-op");
  assert.equal(store.day("2026-08-20").commits, 5);
});

test("clearing while another window holds the lock fails loudly", async () => {
  const directory = await tempDir();
  const store = new Store(directory, () => 730);
  await store.load();
  store.addTick("2026-08-20", { seconds: 60, hour: 9 });
  await store.flush();
  await fs.writeFile(path.join(directory, "activity.json.lock"), "", "utf8");
  await assert.rejects(store.clear(), /another window/);
  const database = (await read(directory)) as { days: Record<string, unknown> };
  assert.equal(Object.keys(database.days).length, 1, "the data is still there, and the user was told");
});

// The window-mode prompt keys off this, so it must fire for a second window's
// write and never for a window's own.
test("a store notices when another window moved the file, and not its own writes", async () => {
  const directory = await tempDir();
  const first = new Store(directory, () => 730);
  await first.load();
  first.addTick("2026-08-20", { seconds: 60, hour: 9 });
  await first.flush();
  first.addTick("2026-08-20", { seconds: 60, hour: 10 });
  await first.flush();
  await first.sync();
  assert.equal(first.otherWindowSeen, false);

  const second = new Store(directory, () => 730);
  await second.load();
  assert.equal(second.otherWindowSeen, false, "the first read is not another window");
  second.addTick("2026-08-20", { seconds: 30, hour: 11 });
  await second.flush();
  assert.equal(second.otherWindowSeen, false, "a window's own write does not count");

  await first.sync();
  assert.equal(first.otherWindowSeen, true);
  assert.equal(first.day("2026-08-20").activeSeconds, 150);

  first.addTick("2026-08-20", { seconds: 15, hour: 12 });
  await first.flush();
  await second.sync();
  assert.equal(second.otherWindowSeen, true, "the other direction is seen too");

  const alone = new Store(await tempDir(), () => 730);
  await alone.load();
  alone.addTick("2026-08-20", { seconds: 60, hour: 9 });
  await alone.flush();
  await alone.clear();
  await alone.sync();
  assert.equal(alone.otherWindowSeen, false, "clearing is this window's own write");
  first.dispose();
  second.dispose();
  alone.dispose();
});

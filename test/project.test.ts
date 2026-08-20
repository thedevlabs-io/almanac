import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  addProjectTime,
  ancestors,
  basename,
  projectFrom,
  relativeTo,
  treeFor,
  treesFor,
  type ProjectRecord,
} from "../src/core/project";

test("a folder opened at the repository root reports the root", () => {
  const ref = projectFrom("/Users/me/code/acme", "/Users/me/code/acme");
  assert.deepEqual(ref, { repo: "acme", folder: ".", isRepo: true });
});

test("a monorepo subfolder rolls up to the repository", () => {
  const ref = projectFrom("/Users/me/code/acme/apps/web", "/Users/me/code/acme");
  assert.deepEqual(ref, { repo: "acme", folder: "apps/web", isRepo: true });
});

test("a folder outside any repository stands alone", () => {
  const ref = projectFrom("/Users/me/scratch/notes", undefined);
  assert.deepEqual(ref, { repo: "notes", folder: ".", isRepo: false });
});

test("a probe returning something the folder is not inside is not trusted", () => {
  const ref = projectFrom("/Users/me/code/acme", "/somewhere/else");
  assert.deepEqual(ref, { repo: "acme", folder: ".", isRepo: false });
});

test("windows paths resolve the same way", () => {
  const ref = projectFrom("C:\\code\\acme\\apps\\web", "C:\\code\\acme");
  assert.deepEqual(ref, { repo: "acme", folder: "apps/web", isRepo: true });
});

test("ancestors walk up to the root, nearest first", () => {
  assert.deepEqual(ancestors("/a/b/c"), ["/a/b/c", "/a/b", "/a"]);
});

test("basename and relativeTo handle the awkward cases", () => {
  assert.equal(basename("/a/b/"), "b");
  assert.equal(relativeTo("/a", "/a"), ".");
  assert.equal(relativeTo("/a", "/a/b/c"), "b/c");
  assert.equal(relativeTo("/a", "/ab"), undefined, "a prefix is not a parent");
});

test("time accumulates per repository and per folder", () => {
  let projects: Record<string, ProjectRecord> = {};
  projects = addProjectTime(projects, { repo: "acme", folder: "apps/web" }, 100);
  projects = addProjectTime(projects, { repo: "acme", folder: "apps/web" }, 50);
  projects = addProjectTime(projects, { repo: "acme", folder: "." }, 25);

  assert.equal(projects.acme?.seconds, 175);
  assert.deepEqual(projects.acme?.folders, { "apps/web": 150, ".": 25 });
});

test("the tree creates intermediate folders that were never opened", () => {
  const tree = treeFor("acme", {
    seconds: 300,
    folders: { "apps/web": 200, "services/billing": 100 },
  });

  assert.equal(tree.total, 300);
  assert.equal(tree.rootSeconds, 0);
  assert.deepEqual(
    tree.children.map((node) => [node.name, node.seconds, node.total]),
    [
      ["apps", 0, 200],
      ["services", 0, 100],
    ],
    "apps and services carry no time of their own, only their children's"
  );

  const apps = tree.children[0];
  assert.equal(apps?.children[0]?.name, "web");
  assert.equal(apps?.children[0]?.seconds, 200);
  assert.equal(apps?.children[0]?.path, "apps/web");
});

test("root time is kept apart from subfolder time", () => {
  const tree = treeFor("acme", { seconds: 150, folders: { ".": 50, frontend: 100 } });
  assert.equal(tree.rootSeconds, 50);
  assert.equal(tree.total, 150);
  assert.equal(tree.children[0]?.name, "frontend");
});

test("repositories and folders both sort busiest first", () => {
  const trees = treesFor({
    small: { seconds: 10, folders: { ".": 10 } },
    big: { seconds: 100, folders: { b: 40, a: 60 } },
  });
  assert.deepEqual(trees.map((tree) => tree.repo), ["big", "small"]);
  assert.deepEqual(trees[0]?.children.map((node) => node.name), ["a", "b"]);
});

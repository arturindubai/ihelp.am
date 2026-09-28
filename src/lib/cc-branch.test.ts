import { describe, it, expect } from "vitest";
import { findWorktreeByBranch } from "./cc-branch";

const makeList = (...branches: string[]) =>
  branches
    .map((b, i) => `worktree /path/${i}\nHEAD abc${i}\nbranch refs/heads/${b}`)
    .join("\n\n");

describe("findWorktreeByBranch — точное сравнение имени ветки", () => {
  it("task/DEV-2 не находит worktree с веткой task/DEV-25", () => {
    expect(findWorktreeByBranch(makeList("task/DEV-25"), "task/DEV-2")).toBeUndefined();
  });

  it("task/DEV-25 находит верный worktree", () => {
    expect(findWorktreeByBranch(makeList("task/DEV-25"), "task/DEV-25")).toContain("task/DEV-25");
  });

  it("task/AUTH-1 не находит worktree с веткой task/AUTH-10", () => {
    expect(findWorktreeByBranch(makeList("task/AUTH-10"), "task/AUTH-1")).toBeUndefined();
  });

  it("task/AUTH-10 находит верный worktree", () => {
    expect(findWorktreeByBranch(makeList("task/AUTH-10"), "task/AUTH-10")).toContain("task/AUTH-10");
  });

  it("task/DEV-6 не находит worktree с веткой task/DEV-60", () => {
    expect(findWorktreeByBranch(makeList("task/DEV-60"), "task/DEV-6")).toBeUndefined();
  });

  it("task/BUG-1 не находит worktree с веткой task/BUG-10", () => {
    expect(findWorktreeByBranch(makeList("task/BUG-10"), "task/BUG-1")).toBeUndefined();
  });

  it("при нескольких worktree находит нужный и не путает соседние", () => {
    const list = makeList("main", "task/DEV-25", "task/DEV-2");
    expect(findWorktreeByBranch(list, "task/DEV-2")).toContain("task/DEV-2");
    expect(findWorktreeByBranch(list, "task/DEV-25")).toContain("task/DEV-25");
  });

  it("возвращает undefined для несуществующей ветки", () => {
    expect(findWorktreeByBranch(makeList("task/DEV-25"), "task/DEV-99")).toBeUndefined();
  });
});

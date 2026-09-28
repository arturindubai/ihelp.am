/**
 * Поиск блока worktree по точному имени ветки в выводе `git worktree list --porcelain`.
 *
 * Проблема: `b.includes("task/DEV-2")` находил бы блок task/DEV-25 как подстроку.
 * Решение: проверяем, что точная строка `branch refs/heads/<branch>` является отдельной
 * строкой в блоке (Array.includes — точное совпадение элемента, а не подстроки).
 */
export function findWorktreeByBranch(
  porcelainList: string,
  branch: string,
): string | undefined {
  return porcelainList
    .split("\n\n")
    .find((block) => block.split("\n").includes(`branch refs/heads/${branch}`));
}

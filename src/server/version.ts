import "server-only";
import fs from "node:fs";
import path from "node:path";

/** Версия сборки (BUILD_ID) — по ней открытая вкладка узнаёт о выкладке (VersionWatch, /api/version) */
export function buildId(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return process.env.GIT_SHA?.slice(0, 12) || "dev";
  }
}

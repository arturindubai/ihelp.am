/** Типы для role-commands.mjs (сам модуль — чистый JavaScript: его запускает Node на сервере без сборки) */

export type WorkerRole = "dev" | "tester" | "triage" | "nocode" | "product" | "designer" | "deployer";
export type RoleRules = { allow: string[]; deny: string[] };
export type CheckResult = { ok: boolean; reason?: string; part?: string };
export type DocCommand = { line: number; command: string; inline: boolean };
export type DocReport = { total: number; bad: { line: number; command: string; reason: string; part: string }[] };

export const ROLE_DOCS: Record<WorkerRole, string>;
export const ROOT_DIR: string;
export function workDirFor(role: string): string;
export function parseWorkerRules(text: string): Record<string, RoleRules>;
export function parseRule(rule: string): { tool: string; pattern: string | null };
export function bashPatternToRegExp(pattern: string): RegExp;
export function pathPatternToRegExp(pattern: string): RegExp;
export function splitCommand(command: string): string[];
export function fillPlaceholders(command: string): string;
export function checkCommand(command: string, rules: RoleRules, role: string): CheckResult;
export function checkTool(tool: string, filePath: string, rules: RoleRules): CheckResult;
export function extractCommands(markdown: string): DocCommand[];
export function checkDoc(markdown: string, rules: RoleRules, role: string): DocReport;

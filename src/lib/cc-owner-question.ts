import { roleOf } from "./cc-flow";

/** true — автор является агентом или системным компонентом, а не человеком-владельцем */
export function isAgentAuthor(author: string): boolean {
  return roleOf(author) !== "owner";
}

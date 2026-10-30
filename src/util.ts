// Shared small utilities.
//
// Ported from wmy2981/editor-siyuan (src/util.ts): escapeHtml/baseName are
// verbatim; config() returns undefined instead of asserting because this
// plugin also loads on mobile/browser/publish frontends.
import type {ISiyuan} from "siyuan";

export const config = (): ISiyuan["config"] | undefined => window.siyuan?.config;

const ESCAPE_MAP: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
}

export function baseName(path: string): string {
    const index = path.lastIndexOf("/");
    return index < 0 ? path : path.slice(index + 1);
}

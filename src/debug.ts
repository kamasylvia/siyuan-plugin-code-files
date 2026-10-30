// Debug logging, gated behind the settings toggle.
//
// Ported from wmy2981/editor-siyuan (src/debug.ts).
const PREFIX = "[code-files]";

let enabled = false;

export function setDebug(value: boolean): void {
    enabled = value;
}

export function debug(...args: unknown[]): void {
    if (enabled) {
        console.log(PREFIX, ...args);
    }
}

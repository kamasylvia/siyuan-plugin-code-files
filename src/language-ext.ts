// Extension extraction for language guessing.
//
// Split out of wmy2981/editor-siyuan config.ts (extensionOf); the rest of
// that config module does not apply here.
import {stripQuery} from "./shared";
import {baseName} from "./util";

export function extensionOf(path: string): string {
    const name = baseName(stripQuery(path));
    const dot = name.lastIndexOf(".");
    return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

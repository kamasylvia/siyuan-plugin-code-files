// Frontend environment detection.
//
// Ported from wmy2981/editor-siyuan (src/frontend.ts): ask the host via
// getFrontend(), never sniff UA or window width.
import {getFrontend} from "siyuan";

export type TFrontend = ReturnType<typeof getFrontend>;

export const frontend = (): TFrontend => getFrontend();

export const isBrowserFrontend = (): boolean => frontend().startsWith("browser");

export const isMobileFrontend = (): boolean => frontend().endsWith("mobile");

export const isSeparateWindow = (): boolean => frontend() === "desktop-window";

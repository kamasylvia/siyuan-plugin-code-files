// Keep code colors following the user's SiYuan appearance.
//
// Ported from wmy2981/editor-siyuan (src/theme.ts) with the link id renamed:
// mount the same hljs theme stylesheet SiYuan code blocks use, positioned so
// SiYuan's own copy always wins once it loads.
import type {Plugin} from "siyuan";
import {debug} from "./debug";
import {config} from "./util";

const HLJS_CDN = "/stage/protyle/js/highlight.js";
const HLJS_VERSION = "11.12.0";
const LINK_ID = "code-files-hljsStyle";
const SIYUAN_LINK_ID = "protyleHljsStyle";
const PLUGINS_STYLE_ID = "pluginsStyle";

const FALLBACK_LIGHT = "default";
const FALLBACK_DARK = "github-dark";

interface ICodeThemeSource {
    mode?: number;
    codeBlockThemeLight?: string;
    codeBlockThemeDark?: string;
}

function insertLink(link: HTMLLinkElement): void {
    const anchor = document.getElementById(SIYUAN_LINK_ID) ?? document.getElementById(PLUGINS_STYLE_ID);
    if (anchor) {
        anchor.before(link);
    } else {
        document.head.append(link);
    }
}

function applyTheme(name: string, fallback: string): void {
    const href = `${HLJS_CDN}/styles/${name}.min.css?v=${HLJS_VERSION}`;
    let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
    if (!link) {
        link = document.createElement("link");
        link.id = LINK_ID;
        link.rel = "stylesheet";
        insertLink(link);
    }
    if (link.href.includes(href)) {
        return;
    }
    link.onerror = () => {
        link!.onerror = null;
        if (name !== fallback) {
            applyTheme(fallback, fallback);
        }
    };
    link.href = href;
}

function applyAppearance(source: ICodeThemeSource): void {
    if (source.mode === 0) {
        debug("code theme", {mode: "light", name: source.codeBlockThemeLight});
        applyTheme(source.codeBlockThemeLight || FALLBACK_LIGHT, FALLBACK_LIGHT);
    } else {
        debug("code theme", {mode: "dark", name: source.codeBlockThemeDark});
        applyTheme(source.codeBlockThemeDark || FALLBACK_DARK, FALLBACK_DARK);
    }
}

export function syncCodeTheme(): void {
    const appearance = config()?.appearance;
    if (appearance) {
        applyAppearance(appearance);
    }
}

export function watchCodeTheme(plugin: Plugin): void {
    syncCodeTheme();
    plugin.eventBus.on("ws-main", (event: CustomEvent<{cmd?: string; data?: ICodeThemeSource;}>) => {
        const detail = event.detail;
        if (detail?.cmd === "setAppearance" && typeof detail.data?.mode === "number") {
            applyAppearance(detail.data);
        }
    });
}

// highlight.js engine loading.
//
// Ported from wmy2981/editor-siyuan (src/hljs.ts): reuse SiYuan's bundled
// copy so token classification matches SiYuan code blocks exactly.
import {debug} from "./debug";

const HLJS_CDN = "/stage/protyle/js/highlight.js";
const HLJS_VERSION = "11.12.0";
const HLJS_THIRD_VERSION = "2.0.1";
const HLJS_SCRIPT_ID = "code-files-hljsScript";
const HLJS_THIRD_SCRIPT_ID = "code-files-hljsThirdScript";

let pending: Promise<boolean> | undefined;

function injectScript(src: string, id: string): Promise<boolean> {
    return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.addEventListener("load", () => {
            script.id = id;
            resolve(true);
        });
        script.addEventListener("error", () => {
            script.remove();
            resolve(false);
        });
        document.head.append(script);
    });
}

export function loadHljs(): Promise<boolean> {
    if ((window as unknown as {hljs?: unknown;}).hljs) {
        return Promise.resolve(true);
    }
    if (!pending) {
        pending = injectScript(`${HLJS_CDN}/highlight.min.js?v=${HLJS_VERSION}`, HLJS_SCRIPT_ID)
            .then((ok) =>
                ok && injectScript(`${HLJS_CDN}/third-languages.js?v=${HLJS_THIRD_VERSION}`, HLJS_THIRD_SCRIPT_ID)
            )
            .then((ok) => {
                if (!ok || !(window as unknown as {hljs?: unknown;}).hljs) {
                    pending = undefined;
                    debug("hljs load failed");
                    return false;
                }
                return true;
            });
    }
    return pending;
}

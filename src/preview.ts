import {
    openTab,
    showMessage,
} from "siyuan";
import {
    languageOf,
    postJSON,
} from "./shared";
import type {AssetOpenAction} from "./shared";

export const PREVIEW_TAB_TYPE = "script_preview";

const MAX_PREVIEW_BYTES = 1024 * 1024;

async function readScript(link: string): Promise<{text: string; truncated: boolean;}> {
    const stat = await postJSON<{size?: number;}>("/api/asset/statAsset", {path: link});
    if (stat.code !== 0) {
        throw new Error(stat.msg || "statAsset failed");
    }
    const apiPath = `/data/${link}`;
    const response = await fetch("/api/file/getFile", {
        body: JSON.stringify({path: apiPath}),
        method: "POST",
    });
    if (!response.ok) {
        throw new Error(`getFile HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const truncated = bytes.length > MAX_PREVIEW_BYTES;
    const slice = truncated ? bytes.slice(0, MAX_PREVIEW_BYTES) : bytes;
    return {text: new TextDecoder("utf-8", {fatal: false}).decode(slice), truncated};
}

const downloadScript = async (link: string, fileName: string, failed: string) => {
    try {
        const response = await fetch(`/${link}`, {method: "GET"});
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
        console.error(error);
        showMessage(failed);
    }
};

export const renderPreview = async (
    host: HTMLElement,
    link: string,
    i18n: Record<string, string>,
): Promise<void> => {
    const fileName = link.slice("assets/".length);
    host.innerHTML = `<div class="code-files-preview">
<div class="block__icons">
<span class="block__icon--show fn__flex-1">${fileName}</span>
<button data-action="download" class="b3-button b3-button--text">${i18n.download}</button>
</div>
<div class="code-files-preview__body"><div class="code-files-preview__gutter" aria-hidden="true"></div><pre class="code-files-preview__code"><code>${i18n.loading}</code></pre></div>
</div>`;
    host.querySelector('[data-action="download"]').addEventListener("click", () => {
        void downloadScript(link, fileName, i18n.downloadFailed);
    });
    const code = host.querySelector("code") as HTMLElement;
    const gutter = host.querySelector(".code-files-preview__gutter") as HTMLElement;
    try {
        const {text, truncated} = await readScript(link);
        const lineCount = text.split("\n").length;
        let numbers = "";
        for (let i = 1; i <= lineCount; i++) {
            numbers += `${i}\n`;
        }
        gutter.textContent = numbers;
        code.textContent = "";
        const language = languageOf(fileName);
        // Reuse SiYuan's bundled highlight.js when the editor has loaded it.
        const hljs = (window as unknown as {
            hljs?: {
                highlight: (code: string, options: {language: string;}) => {value: string;};
                getLanguage: (name: string) => unknown;
            };
        }).hljs;
        if (hljs && language !== "plaintext" && hljs.getLanguage(language)) {
            code.innerHTML = hljs.highlight(text, {language}).value;
            code.className = `hljs language-${language}`;
        } else {
            code.textContent = text;
        }
        if (truncated) {
            const note = document.createElement("div");
            note.className = "b3-card__info";
            note.textContent = i18n.truncated;
            host.querySelector(".code-files-preview").appendChild(note);
        }
    } catch (error) {
        console.error(error);
        code.textContent = i18n.loadFailed;
    }
};
export const openPreview = (
    pluginName: string,
    app: unknown,
    link: string,
    action: AssetOpenAction | undefined,
    getOpenedTab: () => Record<
        string,
        Array<
            {
                data?: {link?: string;};
                tab?: {parent?: {switchTab: (head: unknown, focus: boolean) => void;}; headElement?: unknown;};
            }
        >
    >,
): void => {
    for (const models of Object.values(getOpenedTab())) {
        for (const model of models) {
            if (model.data?.link === link) {
                model.tab?.parent?.switchTab(model.tab.headElement, true);
                return;
            }
        }
    }
    // Mirror openAssetByAction: follow-tab resolves to right unless the user
    // disabled split screen, in which case it falls back to current.
    const noSplitScreen = (window.siyuan?.config?.fileTree as {noSplitScreenWhenOpenTab?: boolean;} | undefined)
        ?.noSplitScreenWhenOpenTab === true;
    const placement = action ?? "follow-tab";
    const position = placement === "right" || (placement === "follow-tab" && !noSplitScreen) ?
        "right" :
        placement === "bottom" ?
        "bottom" :
        undefined;
    void openTab({
        app: app as never,
        custom: {
            data: {link},
            icon: "iconCode",
            id: pluginName + PREVIEW_TAB_TYPE,
            title: link.slice("assets/".length),
        },
        keepCursor: placement === "background" ? true : undefined,
        position,
    });
};

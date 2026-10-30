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
<button data-action="mode" class="b3-button b3-button--text">${i18n.edit}</button>
<button data-action="save" class="b3-button b3-button--text fn__none">${i18n.save}</button>
<button data-action="download" class="b3-button b3-button--text">${i18n.download}</button>
</div>
<div class="code-files-preview__body"><div class="code-files-preview__gutter" aria-hidden="true"></div><pre class="code-files-preview__code"><code>${i18n.loading}</code></pre></div>
</div>`;
    const modeButton = host.querySelector('[data-action="mode"]') as HTMLButtonElement;
    const saveButton = host.querySelector('[data-action="save"]') as HTMLButtonElement;
    host.querySelector('[data-action="download"]').addEventListener("click", () => {
        void downloadScript(link, fileName, i18n.downloadFailed);
    });
    const code = host.querySelector("code") as HTMLElement;
    const pre = host.querySelector("pre") as HTMLElement;
    const gutter = host.querySelector(".code-files-preview__gutter") as HTMLElement;
    let editing = false;
    let savedText = "";
    let editor: HTMLTextAreaElement | undefined;
    const paintGutter = (text: string) => {
        const lineCount = text.split("\n").length;
        let numbers = "";
        for (let i = 1; i <= lineCount; i++) {
            numbers += `${i}\n`;
        }
        gutter.textContent = numbers;
    };
    const paintCode = (text: string) => {
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
    };
    const setEditing = (next: boolean) => {
        if (next === editing) {
            return;
        }
        if (editing && editor && editor.value !== savedText) {
            if (!window.confirm(i18n.discardChanges)) {
                return;
            }
        }
        editing = next;
        modeButton.textContent = editing ? i18n.readonly : i18n.edit;
        saveButton.classList.toggle("fn__none", !editing);
        if (editing) {
            editor = document.createElement("textarea");
            editor.className = "code-files-preview__editor";
            editor.value = savedText;
            editor.spellcheck = false;
            editor.wrap = "off";
            const repaint = () => {
                paintCode(editor.value);
                paintGutter(editor.value);
                editor.style.height = "auto";
                editor.style.height = `${editor.scrollHeight}px`;
            };
            editor.addEventListener("input", repaint);
            editor.addEventListener("keydown", (event) => {
                // Keep Tab as indentation instead of moving focus.
                if (event.key === "Tab") {
                    event.preventDefault();
                    const start = editor.selectionStart ?? 0;
                    const end = editor.selectionEnd ?? 0;
                    editor.value = `${editor.value.slice(0, start)}    ${editor.value.slice(end)}`;
                    editor.selectionStart = editor.selectionEnd = start + 4;
                    repaint();
                }
            });
            pre.classList.add("code-files-preview__code--backdrop");
            pre.appendChild(editor);
            editor.style.height = "auto";
            editor.style.height = `${editor.scrollHeight}px`;
            editor.focus();
        } else if (editor) {
            paintCode(savedText);
            paintGutter(savedText);
            editor.remove();
            editor = undefined;
            pre.classList.remove("code-files-preview__code--backdrop");
            pre.scrollTop = 0;
            pre.scrollLeft = 0;
        }
    };
    modeButton.addEventListener("click", () => setEditing(!editing));
    saveButton.addEventListener("click", () => {
        if (!editor) {
            return;
        }
        void (async () => {
            try {
                const form = new FormData();
                form.append("path", `data/${link}`);
                form.append("file", new File([editor.value], fileName, {type: "text/plain"}));
                const response = await fetch("/api/file/putFile", {body: form, method: "POST"});
                const result = await response.json() as {code: number; msg: string;};
                if (!response.ok || result.code !== 0) {
                    throw new Error(result.msg || `putFile HTTP ${response.status}`);
                }
                savedText = editor.value;
                showMessage(i18n.saved);
                setEditing(false);
            } catch (error) {
                console.error(error);
                showMessage(i18n.saveFailed);
            }
        })();
    });
    try {
        const {text, truncated} = await readScript(link);
        savedText = text;
        paintGutter(text);
        paintCode(text);
        if (truncated) {
            const note = document.createElement("div");
            note.className = "b3-card__info";
            note.textContent = i18n.truncated;
            host.querySelector(".code-files-preview").appendChild(note);
            // Editing a truncated preview would silently drop the tail on save.
            modeButton.classList.add("fn__none");
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

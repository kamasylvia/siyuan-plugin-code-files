import type {EditorView} from "@codemirror/view";
import {
    openTab,
    showMessage,
} from "siyuan";
import {
    readAssetText,
    resolveAsset,
    writeAssetText,
    type AssetRef,
    type AssetText,
} from "./asset";
import {
    createCodeEditor,
    setCodeEditorReadOnly,
} from "./editor";
import {
    copyText,
    languageOf,
} from "./shared";
import type {AssetOpenAction} from "./shared";

export const PREVIEW_TAB_TYPE = "script_preview";

const MAX_PREVIEW_BYTES = 1024 * 1024;

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

// SiYuan injects highlight.js only after rendering a code block; load its
// bundled copy explicitly so decorations compute on first open.
let hljsPending: Promise<boolean> | undefined;
const ensureHljs = (): Promise<boolean> => {
    if ((window as unknown as {hljs?: unknown;}).hljs) {
        return Promise.resolve(true);
    }
    if (!hljsPending) {
        const inject = (src: string): Promise<boolean> =>
            new Promise((resolve) => {
                const script = document.createElement("script");
                script.src = src;
                script.async = true;
                script.addEventListener("load", () => resolve(true));
                script.addEventListener("error", () => {
                    script.remove();
                    resolve(false);
                });
                document.head.append(script);
            });
        hljsPending = inject("/stage/protyle/js/highlight.js/highlight.min.js?v=11.12.0")
            .then((ok) => ok && inject("/stage/protyle/js/highlight.js/third-languages.js?v=2.0.1"))
            .then((ok) => {
                if (!ok || !(window as unknown as {hljs?: unknown;}).hljs) {
                    hljsPending = undefined;
                    return false;
                }
                return true;
            });
    }
    return hljsPending;
};

export interface PreviewController {
    isDirty: () => boolean;
    save: () => Promise<boolean>;
}

export const renderPreview = async (
    host: HTMLElement,
    link: string,
    i18n: Record<string, string>,
    initialEditing: boolean,
): Promise<PreviewController> => {
    const fileName = link.slice("assets/".length);
    host.innerHTML = `<div class="code-files-preview">
<div class="block__icons">
<span class="block__icon--show fn__flex-1">${fileName}</span>
<button data-action="copy" class="b3-button b3-button--text">${i18n.copy}</button>
<button data-action="mode" class="b3-button b3-button--text">${i18n.edit}</button>
<button data-action="save" class="b3-button b3-button--text fn__none">${i18n.save}</button>
<button data-action="download" class="b3-button b3-button--text">${i18n.download}</button>
</div>
<div class="code-files-preview__body"><div class="code-files-preview__loading">${i18n.loading}</div></div>
</div>`;
    const modeButton = host.querySelector('[data-action="mode"]') as HTMLButtonElement;
    const saveButton = host.querySelector('[data-action="save"]') as HTMLButtonElement;
    const copyButton = host.querySelector('[data-action="copy"]') as HTMLButtonElement;
    const downloadButton = host.querySelector('[data-action="download"]') as HTMLButtonElement;
    const body = host.querySelector(".code-files-preview__body") as HTMLElement;
    downloadButton.addEventListener("click", () => {
        void downloadScript(link, fileName, i18n.downloadFailed);
    });
    let editing = false;
    let savedText = "";
    let view: EditorView | undefined;
    let ref: AssetRef | undefined;
    let loaded: AssetText | undefined;
    const currentText = (): string => view?.state.doc.toString() ?? savedText;
    const isDirty = (): boolean => editing && !!view && currentText() !== savedText;
    const setEditing = (next: boolean) => {
        if (next === editing || !view) {
            return;
        }
        if (editing && isDirty()) {
            if (!window.confirm(i18n.discardChanges)) {
                return;
            }
            view.dispatch({
                changes: {from: 0, to: view.state.doc.length, insert: savedText},
            });
        }
        editing = next;
        setCodeEditorReadOnly(view, !editing);
        modeButton.textContent = editing ? i18n.readonly : i18n.edit;
        saveButton.classList.toggle("fn__none", !editing);
        copyButton.classList.toggle("fn__none", editing);
        // Read-only: copy, edit, download. Editing: save, read-only, download.
        modeButton.before(saveButton);
        if (editing) {
            view.focus();
        }
    };
    modeButton.addEventListener("click", () => setEditing(!editing));
    copyButton.addEventListener("click", () => {
        void (async () => {
            try {
                await copyText(currentText());
                showMessage(i18n.copied);
            } catch (error) {
                console.error(error);
                showMessage(i18n.copyFailed);
            }
        })();
    });
    const saveNow = async (): Promise<boolean> => {
        if (!view || !ref || !loaded) {
            return true;
        }
        const failure = await writeAssetText(ref, {...loaded, text: currentText()});
        if (failure) {
            console.error(failure);
            showMessage(i18n.saveFailed);
            return false;
        }
        savedText = currentText();
        showMessage(i18n.saved);
        setEditing(false);
        return true;
    };
    saveButton.addEventListener("click", () => {
        void saveNow();
    });
    try {
        const resolved = await resolveAsset(link);
        if (resolved.kind !== "ok") {
            throw new Error(resolved.message);
        }
        ref = resolved.ref;
        if (ref.size > MAX_PREVIEW_BYTES) {
            throw new Error(i18n.tooLarge);
        }
        loaded = await readAssetText(ref);
        savedText = loaded.text;
        body.innerHTML = "";
        // Ensure SiYuan's bundled hljs is present before the editor computes decorations.
        await ensureHljs();
        view = createCodeEditor(body, {
            doc: loaded.text,
            language: languageOf(fileName),
            onChange: () => undefined,
            readOnly: !initialEditing,
        });
        if (initialEditing) {
            setEditing(true);
        }
    } catch (error) {
        console.error(error);
        body.innerHTML = `<div class="b3-list--empty">${i18n.loadFailed}</div>`;
    }
    return {isDirty, save: saveNow};
};
export const openPreview = (
    pluginName: string,
    app: unknown,
    link: string,
    action: AssetOpenAction | undefined,
    options: {forceTab?: boolean; startEditing?: boolean;} | undefined,
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
    const position = options?.forceTab ?
        undefined :
        placement === "right" || (placement === "follow-tab" && !noSplitScreen) ?
        "right" :
        placement === "bottom" ?
        "bottom" :
        undefined;
    void openTab({
        app: app as never,
        custom: {
            data: {link, startEditing: options?.startEditing === true},
            icon: "iconCode",
            id: pluginName + PREVIEW_TAB_TYPE,
            title: link.slice("assets/".length),
        },
        keepCursor: placement === "background" ? true : undefined,
        position,
    });
};

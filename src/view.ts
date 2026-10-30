// Editor tab view: action bar + CodeMirror mount.
//
// Ported from wmy2981/code-files-view (src/view.ts) and adapted: desktop tabs
// only (no mobile/popup/sy branches, no stash/cursor/language memory), plus
// our download button. Our shell (preview.ts) keeps open position, initial
// mode, dirty guard, and MCP capability.
import type {EditorView} from "@codemirror/view";
import {showMessage} from "siyuan";
import {
    readAssetText,
    resolveAsset,
    writeAssetText,
    type AssetRef,
    type AssetText,
} from "./asset";
import {openEditorMenu} from "./context-menu";
import {debug} from "./debug";
import {
    applyCodeRedo,
    applyCodeUndo,
    canCodeRedo,
    canCodeUndo,
    createCodeEditor,
    setCodeEditorLanguage,
    setCodeEditorLineWrap,
    setCodeEditorReadOnly,
} from "./editor";
import {loadHljs} from "./hljs";
import type {T} from "./i18n";
import {
    ICON_SAVE,
    ICON_WRAP,
} from "./icons";
import {
    guessLanguage,
    PLAIN_TEXT,
} from "./language";
import {openLanguageMenu} from "./language-menu";
import {
    closeSearch,
    toggleSearchPanel,
} from "./search";
import {
    baseNameWithoutID,
    copyText,
} from "./shared";
import {
    config,
    escapeHtml,
} from "./util";

export interface IEditorTab {
    readonly link: string;
    readonly element: HTMLElement;
    isDirty(): boolean;
    save(): Promise<boolean>;
    discard(): void;
    dispose(): void;
    focus(): void;
}

const registry = new Set<IEditorTab>();
let focused: IEditorTab | undefined;

export const allTabs = (): IEditorTab[] => Array.from(registry);
export const tabFor = (link: string): IEditorTab | undefined => Array.from(registry).find((item) => item.link === link);
export const focusedTab = (): IEditorTab | undefined => {
    if (focused && registry.has(focused)) {
        return focused;
    }
    const tabs = allTabs();
    return tabs[tabs.length - 1];
};

const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export interface IViewHost {
    element: Element;
    data?: Record<string, unknown>;
    headElement?: HTMLElement;
}

export interface IViewOptions {
    maxSizeMB: number;
    initialEditing: boolean;
    onDownload: (ref: AssetRef, fileName: string) => void;
}

export function createView(host: IViewHost, t: T, options: IViewOptions): IEditorTab {
    const link = String(host.data?.link ?? "");

    const root = document.createElement("div");
    root.className = "code-files-view";
    root.innerHTML = `<div class="code-files-view__action">
<span class="code-files-view__language" data-menu="true"></span>
<span class="code-files-view__icon" data-type="undo"><svg><use xlink:href="#iconUndo"></use></svg></span>
<span class="code-files-view__icon" data-type="redo"><svg><use xlink:href="#iconRedo"></use></svg></span>
<span class="code-files-view__icon" data-type="wrap"><svg><use xlink:href="#${ICON_WRAP}"></use></svg></span>
<span class="fn__flex-1"></span>
<span class="code-files-view__icon" data-type="search"><svg><use xlink:href="#iconSearch"></use></svg></span>
<span class="code-files-view__icon" data-type="copy"><svg><use xlink:href="#iconCopy"></use></svg></span>
<span class="code-files-view__icon" data-type="readonly"><svg><use xlink:href="#iconEye"></use></svg></span>
<span class="code-files-view__icon" data-type="save"><svg><use xlink:href="#${ICON_SAVE}"></use></svg></span>
<span class="code-files-view__icon" data-type="download"><svg><use xlink:href="#iconDownload"></use></svg></span>
</div>
<div class="code-files-view__body">
<div class="code-files-view__mount"></div>
</div>`;

    const mount = root.querySelector<HTMLElement>(".code-files-view__mount")!;
    const languageLabel = root.querySelector<HTMLElement>(".code-files-view__language")!;
    const undoIcon = root.querySelector<HTMLElement>('[data-type="undo"]')!;
    const redoIcon = root.querySelector<HTMLElement>('[data-type="redo"]')!;
    const wrapIcon = root.querySelector<HTMLElement>('[data-type="wrap"]')!;
    const searchIcon = root.querySelector<HTMLElement>('[data-type="search"]')!;
    const copyIcon = root.querySelector<HTMLElement>('[data-type="copy"]')!;
    const downloadIcon = root.querySelector<HTMLElement>('[data-type="download"]')!;
    const saveIcon = root.querySelector<HTMLElement>('[data-type="save"]')!;
    const readonlyIcon = root.querySelector<HTMLElement>('[data-type="readonly"]')!;

    let ref: AssetRef | undefined;
    let fileName = link.split("/").pop() ?? link;
    let editor: EditorView | undefined;
    let dirty = false;
    let readOnly = !options.initialEditing;
    let wrapOverride: boolean | undefined;
    let language = PLAIN_TEXT;
    let eol: "\n" | "\r\n" = "\n";
    let bom = false;
    let disposed = false;

    const placeholder = (text: string, isError = false): void => {
        mount.innerHTML = `<div class="code-files-view__placeholder${
            isError ? " code-files-view__placeholder--error" : ""
        }">${escapeHtml(text)}</div>`;
    };

    const editorConf = () => config()?.editor;
    const lineNumbersWanted = (): boolean => editorConf()?.codeSyntaxHighlightLineNum !== false;
    const lineWrapWanted = (): boolean => editorConf()?.codeLineWrap === true;
    const ligaturesWanted = (): boolean => editorConf()?.codeLigatures !== false;
    const wrapOn = (): boolean => wrapOverride ?? lineWrapWanted();

    const syncHistory = (): void => {
        const buttons: Array<[HTMLElement, boolean]> = [
            [undoIcon, editor !== undefined && canCodeUndo(editor)],
            [redoIcon, editor !== undefined && canCodeRedo(editor)],
        ];
        for (const [icon, available] of buttons) {
            icon.classList.toggle("fn__none", readOnly);
            icon.classList.toggle("code-files-view__icon--disabled", !available);
            icon.setAttribute("aria-disabled", String(!available));
        }
    };

    const syncWrap = (): void => {
        const on = wrapOn();
        wrapIcon.classList.toggle("code-files-view__icon--active", on);
        wrapIcon.setAttribute("aria-pressed", String(on));
    };
    const syncIcons = (): void => {
        searchIcon.setAttribute("aria-label", t("find"));
        copyIcon.setAttribute("aria-label", t("copyFile"));
        downloadIcon.setAttribute("aria-label", t("downloadFile"));
        undoIcon.setAttribute("aria-label", t("undo"));
        redoIcon.setAttribute("aria-label", t("redo"));
        saveIcon.setAttribute("aria-label", dirty ? t("saveDirty") : t("save"));
        saveIcon.classList.toggle("code-files-view__icon--dirty", dirty);
        readonlyIcon.setAttribute("aria-label", readOnly ? t("switchToEdit") : t("switchToPreview"));
        readonlyIcon.innerHTML = `<svg><use xlink:href="#${readOnly ? "iconEdit" : "iconEye"}"></use></svg>`;
        wrapIcon.setAttribute("aria-label", t("lineWrap"));
        languageLabel.textContent = editor ? language : "";
        languageLabel.setAttribute("aria-label", t("languageLabel"));
        // Mirror the dirty state to the tab head so unsaved tabs are visible
        // in the tab bar, like SiYuan's own editor tabs.
        const title = host.headElement?.querySelector(".item__text");
        if (title) {
            const base = baseNameWithoutID(link.slice("assets/".length));
            title.textContent = dirty ? `• ${base}` : base;
        }
        syncHistory();
        syncWrap();
    };

    const save = async (): Promise<boolean> => {
        if (!ref || !editor) {
            return false;
        }
        if (readOnly) {
            showMessage(t("readonlyEditor"));
            return false;
        }
        const data: AssetText = {text: editor.state.doc.toString(), eol, bom};
        const error = await writeAssetText(ref, data);
        if (error) {
            debug("save failed", ref.apiPath, error);
            showMessage(`${t("saveFailed")}: ${error}`, 6000, "error");
            return false;
        }
        dirty = false;
        syncIcons();
        debug("saved", ref.apiPath);
        showMessage(t("saved"), 2000);
        return true;
    };

    const tab: IEditorTab = {
        link,
        element: root,
        isDirty: () => dirty,
        save,
        discard: () => {
            dirty = false;
            syncIcons();
        },
        dispose: () => {
            disposed = true;
            debug("dispose tab", {link, dirty, readOnly});
            if (editor) {
                editor.destroy();
                editor = undefined;
            }
            registry.delete(tab);
            if (focused === tab) {
                focused = undefined;
            }
            root.remove();
        },
        focus: () => {
            editor?.focus();
        },
    };

    root.addEventListener("focusin", () => {
        focused = tab;
    });
    saveIcon.addEventListener("click", () => {
        void save();
    });
    downloadIcon.addEventListener("click", () => {
        if (ref) {
            options.onDownload(ref, fileName);
        }
    });
    searchIcon.addEventListener("click", () => {
        if (editor) {
            toggleSearchPanel(editor);
        }
    });
    undoIcon.addEventListener("click", () => {
        if (editor && !readOnly && canCodeUndo(editor)) {
            applyCodeUndo(editor);
        }
    });
    redoIcon.addEventListener("click", () => {
        if (editor && !readOnly && canCodeRedo(editor)) {
            applyCodeRedo(editor);
        }
    });
    wrapIcon.addEventListener("click", () => {
        if (!editor) {
            return;
        }
        wrapOverride = !wrapOn();
        setCodeEditorLineWrap(editor, wrapOverride);
        syncWrap();
    });
    copyIcon.addEventListener("click", () => {
        if (!editor) {
            return;
        }
        void copyText(editor.state.doc.toString()).then(
            () => showMessage(t("copied")),
            (error: unknown) => {
                console.error(error);
                showMessage(t("copyFailed"));
            },
        );
    });
    searchIcon.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (editor) {
            closeSearch(editor);
        }
    });
    readonlyIcon.addEventListener("click", () => {
        readOnly = !readOnly;
        if (editor) {
            setCodeEditorReadOnly(editor, readOnly);
        }
        syncIcons();
    });
    languageLabel.addEventListener("click", () => {
        openLanguageMenu(languageLabel, language, t, (picked) => {
            language = picked;
            if (editor) {
                setCodeEditorLanguage(editor, picked);
            }
            syncIcons();
        });
    });

    registry.add(tab);
    host.element.append(root);
    syncIcons();
    placeholder(t("loading"));

    void (async () => {
        if (config()?.readonly) {
            placeholder(t("workspaceReadonly"), true);
            return;
        }
        const resolved = await resolveAsset(link);
        if (disposed) {
            return;
        }
        if (resolved.kind === "error") {
            debug("resolve failed", {link, message: resolved.message});
            placeholder(t("openFailed", {message: resolved.message}), true);
            return;
        }
        ref = resolved.ref;
        fileName = ref.link.split("/").pop() ?? ref.link;
        debug("resolved", {link: ref.link, apiPath: ref.apiPath, size: ref.size});
        if (ref.size > options.maxSizeMB * 1024 * 1024) {
            debug("too large", {size: ref.size, limitMB: options.maxSizeMB});
            placeholder(t("tooLarge", {size: megabytes(ref.size), limit: options.maxSizeMB}), true);
            return;
        }
        let data: AssetText;
        try {
            data = await readAssetText(ref);
        } catch (error) {
            debug("read failed", ref.apiPath, error);
            placeholder(t("openFailed", {message: error instanceof Error ? error.message : String(error)}), true);
            return;
        }
        if (disposed) {
            return;
        }
        eol = data.eol;
        bom = data.bom;
        language = guessLanguage(ref.link);
        dirty = false;
        await loadHljs();
        if (disposed) {
            return;
        }
        mount.innerHTML = "";
        editor = createCodeEditor(mount, {
            doc: data.text,
            language,
            readOnly,
            showLineNumbers: lineNumbersWanted(),
            lineWrap: lineWrapWanted(),
            ligatures: ligaturesWanted(),
            tabSpaces: editorConf()?.codeTabSpaces ?? 4,
            t,
            onContextMenu: (event) => {
                if (editor) {
                    openEditorMenu(
                        {view: editor, t, readOnly, onSave: () => void save()},
                        event.clientX,
                        event.clientY,
                    );
                }
            },
            onChange: () => {
                if (!dirty) {
                    dirty = true;
                    syncIcons();
                    return;
                }
                syncHistory();
            },
        });
        syncIcons();
        editor.focus();
        debug("editor ready", {link: ref.link, language, readOnly, length: data.text.length});
    })();

    return tab;
}

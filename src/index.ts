import {
    Dialog,
    Menu,
    Plugin,
    Setting,
    confirm,
    getActiveEditor,
    getAllEditor,
    showMessage,
} from "siyuan";
import "./index.scss";
import {ICONS} from "./icons";
import {
    PREVIEW_TAB_TYPE,
    guardTab,
    openPreview,
    renderPreview,
    type PreviewController,
} from "./preview";
import {
    DEFAULT_SETTINGS,
    normalizeSettings,
    type CodeFilesSettings,
} from "./settings";
import {
    ASSETS_DIR,
    baseNameWithoutID,
    copyText,
    isScriptPath,
    postJSON,
    previewLinkOf,
    resolvePreviewAction,
    toAssetLink,
    toMarkdownLink,
} from "./shared";
import {watchCodeTheme} from "./theme";
import {allTabs} from "./view";

const DOCK_TYPE = "code_files_dock";

interface AssetEntry {
    name: string;
    isDir: boolean;
    updated?: number;
}

interface UploadResponse {
    errFiles?: string[];
    succMap?: Record<string, string>;
}
export default class ScriptAssetsPlugin extends Plugin {
    private element: HTMLElement | undefined;
    private settings: CodeFilesSettings = {...DEFAULT_SETTINGS};
    private refreshTimer: number | undefined;

    /**
     * Plugin.i18n is typed Record<string, JSONValue>; our locale files only
     * contain strings, so narrow once here instead of at every call site.
     */
    private get strings(): Record<string, string> {
        return this.i18n as unknown as Record<string, string>;
    }

    async onload() {
        this.addIcons(ICONS);
        watchCodeTheme(this);
        // Last resort: browser/Electron window close bypasses removeTab.
        window.addEventListener("beforeunload", this.confirmUnsavedUnload);
        try {
            this.settings = normalizeSettings(await this.loadData("settings.json"));
        } catch {
            this.settings = {...DEFAULT_SETTINGS};
        }
        this.eventBus.on("open-asset", (event: CustomEvent<{path?: string; event?: MouseEvent;}>) => {
            const link = previewLinkOf(event.detail?.path);
            const config = (window.siyuan?.config?.editor as {assetOpen?: Record<string, string>;} | undefined)
                ?.assetOpen;
            const action = resolvePreviewAction(config, event.detail?.event);
            if (!link || !action) {
                return;
            }
            event.preventDefault();
            openPreview(this.name, this.app, link, action, {
                forceTab: this.settings.openPosition === "tab",
                startEditing: this.settings.noteDefault === "edit",
            }, () => this.getOpenedTab() as never);
        });
        this.addDock({
            config: {
                icon: "iconCode",
                position: "LeftBottom",
                size: {width: 260, height: 0},
                title: this.strings.codeFiles,
            },
            data: {},
            type: DOCK_TYPE,
            init: (dock) => this.renderDock(dock.element as HTMLElement),
            resize: () => {
                // SiYuan has no dock-shown hook; resize fires when the panel
                // is revealed (and while dragging the splitter), so debounce.
                window.clearTimeout(this.refreshTimer);
                this.refreshTimer = window.setTimeout((): void => void this.refresh(), 300);
            },
        });
        const controllers = new WeakMap<object, Promise<PreviewController>>();
        this.addTab({
            type: PREVIEW_TAB_TYPE,
            init: (custom) => {
                const data = custom.data as {link?: string; startEditing?: boolean;} | undefined;
                const headElement = custom.tab?.headElement;
                const pending = renderPreview(
                    custom.element as HTMLElement,
                    data?.link ?? "",
                    this.strings,
                    data?.startEditing === true,
                    headElement,
                );
                controllers.set(custom, pending);
                guardTab(custom, pending, this.strings);
            },
            beforeDestroy() {
                const custom = this as object;
                void controllers.get(custom)?.then((controller) => controller.dispose());
                controllers.delete(custom);
            },
        });

        this.addCommand({
            langKey: "insertReference",
            langText: this.strings.insertReference,
            hotkey: "",
            callback: () => this.pickAndInsert(),
        });

        const setting = new Setting({});
        this.setting = setting;
        const selectRow = (
            title: string,
            description: string,
            value: string,
            options: Array<{value: string; label: string;}>,
            onChange: (next: string) => void,
        ) => {
            setting.addItem({
                description,
                title,
                actionElement: (() => {
                    const select = document.createElement("select");
                    select.className = "b3-select fn__flex-center";
                    for (const option of options) {
                        const element = document.createElement("option");
                        element.value = option.value;
                        element.textContent = option.label;
                        element.selected = option.value === value;
                        select.appendChild(element);
                    }
                    select.addEventListener("change", () => {
                        onChange(select.value);
                        void this.saveData("settings.json", this.settings);
                    });
                    return select;
                })(),
            });
        };
        selectRow(
            this.strings.openPosition,
            this.strings.openPositionDesc,
            this.settings.openPosition,
            [
                {value: "right", label: this.strings.openPositionRight},
                {value: "tab", label: this.strings.openPositionTab},
            ],
            (next) => {
                this.settings.openPosition = next === "tab" ? "tab" : "right";
            },
        );
        selectRow(
            this.strings.noteDefault,
            this.strings.noteDefaultDesc,
            this.settings.noteDefault,
            [
                {value: "preview", label: this.strings.modePreview},
                {value: "edit", label: this.strings.modeEdit},
            ],
            (next) => {
                this.settings.noteDefault = next === "edit" ? "edit" : "preview";
            },
        );
        selectRow(
            this.strings.dockDefault,
            this.strings.dockDefaultDesc,
            this.settings.dockDefault,
            [
                {value: "preview", label: this.strings.modePreview},
                {value: "edit", label: this.strings.modeEdit},
            ],
            (next) => {
                this.settings.dockDefault = next === "edit" ? "edit" : "preview";
            },
        );
    }

    onLayoutReady() {
        void this.refresh();
    }

    async onunload() {
        window.clearTimeout(this.refreshTimer);
        window.removeEventListener("beforeunload", this.confirmUnsavedUnload);
        this.element = undefined;
    }

    private readonly confirmUnsavedUnload = (event: BeforeUnloadEvent): void => {
        if (allTabs().some((tab) => tab.isDirty())) {
            event.preventDefault();
        }
    };

    private renderDock(host: HTMLElement) {
        const root = document.createElement("div");
        root.className = "code-files";
        root.innerHTML = `<div class="code-files__toolbar">
<input type="checkbox" data-action="select-all" class="b3-checkbox" title="${this.strings.selectAll}">
<button data-action="new" class="b3-button b3-button--text" title="${this.strings.newScript}">+</button>
<button data-action="delete" class="b3-button b3-button--text" title="${this.strings.deleteScript}"><svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg></button>
<button data-action="refresh" class="b3-button b3-button--text" title="${this.strings.refresh}"><svg class="b3-button__icon"><use xlink:href="#iconRefresh"></use></svg></button>
<span class="fn__flex-1"></span>
<button data-action="close" class="b3-button b3-button--text" title="${this.strings.close}">×</button>
</div>
<div class="code-files__list fn__flex-1"></div>`;
        root.querySelector('[data-action="new"]').addEventListener("click", () => void this.createScript());
        root.querySelector('[data-action="refresh"]').addEventListener("click", () => void this.refresh());
        root.querySelector('[data-action="delete"]').addEventListener("click", () => void this.deleteSelected());
        root.querySelector('[data-action="select-all"]').addEventListener("change", (event) => {
            const checked = (event.target as HTMLInputElement).checked;
            root.querySelectorAll<HTMLInputElement>('[data-action="select"]').forEach((box) => {
                box.checked = checked;
            });
        });
        root.querySelector('[data-action="close"]').addEventListener("click", () => {
            document.querySelector(`.dock .dock__item[data-type="${this.name}${DOCK_TYPE}"]`)?.dispatchEvent(
                new MouseEvent("click", {bubbles: true}),
            );
        });
        this.element = root.querySelector(".code-files__list") as HTMLElement;
        host.appendChild(root);
    }

    private async listScripts(): Promise<string[]> {
        const response = await postJSON<AssetEntry[]>("/api/file/readDir", {path: ASSETS_DIR});
        if (response.code !== 0) {
            throw new Error(response.msg || "readDir failed");
        }
        const entries = response.data ?? [];
        return entries
            .filter((entry) => !entry.isDir && isScriptPath(entry.name))
            .map((entry) => entry.name)
            .sort((a, b) => a.localeCompare(b));
    }

    private async refresh() {
        const list = this.element;
        if (!list) {
            return;
        }
        list.innerHTML = "";
        let scripts: string[];
        try {
            scripts = await this.listScripts();
        } catch (error) {
            console.error(error);
            showMessage(this.strings.loadFailed);
            return;
        }
        if (scripts.length === 0) {
            list.innerHTML = `<div class="b3-list--empty">${this.strings.noScripts}</div>`;
            return;
        }
        for (const name of scripts) {
            const row = document.createElement("div");
            row.className = "b3-list-item";
            // Display the name the user typed; the kernel-suffixed asset name
            // stays in data-name for open/insert/copy/delete.
            const display = baseNameWithoutID(name);
            row.innerHTML = `<input type="checkbox" data-action="select" class="b3-checkbox" data-name="${name}">
<span class="b3-list-item__text" data-action="open" title="${name}">${display}</span>
<span class="b3-list-item__meta fn__flex">
<button data-action="insert" class="b3-button b3-button--text" title="${this.strings.insertReferenceTip}"><svg class="b3-button__icon"><use xlink:href="#iconRef"></use></svg></button>
<button data-action="copy" class="b3-button b3-button--text" title="${this.strings.copyPath}">⧉</button>
</span>`;
            row.querySelector('[data-action="open"]').addEventListener("click", () => {
                openPreview(this.name, this.app, toAssetLink(name), undefined, {
                    forceTab: this.settings.openPosition === "tab",
                    startEditing: this.settings.dockDefault === "edit",
                }, () => this.getOpenedTab() as never);
            });
            const insertButton = row.querySelector('[data-action="insert"]');
            // Keep the editor selection: mousedown on a button blurs the editor.
            insertButton.addEventListener("mousedown", (event) => event.preventDefault());
            insertButton.addEventListener("click", (event) => {
                event.stopPropagation();
                void this.insertReference(name);
            });
            row.querySelector('[data-action="copy"]').addEventListener("click", (event) => {
                event.stopPropagation();
                void copyText(toAssetLink(name)).then(
                    () => showMessage(this.strings.copied),
                    (error: unknown) => {
                        console.error(error);
                        showMessage(this.strings.copyFailed);
                    },
                );
            });
            list.appendChild(row);
        }
    }

    private async deleteSelected() {
        const selected = this.element?.querySelectorAll<HTMLInputElement>('[data-action="select"]:checked');
        const names = Array.from(selected ?? []).map((box) => box.dataset.name ?? "").filter((name) => name !== "");
        if (names.length === 0) {
            showMessage(this.strings.noSelection);
            return;
        }
        confirm(
            this.strings.deleteScript,
            this.strings.confirmDeleteBatch.replace("${count}", String(names.length)),
            async () => {
                let failed = 0;
                for (const name of names) {
                    try {
                        const response = await postJSON<null>("/api/file/removeFile", {path: `${ASSETS_DIR}/${name}`});
                        if (response.code !== 0) {
                            throw new Error(response.msg || "removeFile failed");
                        }
                    } catch (error) {
                        console.error(error);
                        failed++;
                    }
                }
                if (failed > 0) {
                    showMessage(this.strings.deleteFailed);
                } else {
                    showMessage(this.strings.deleted);
                }
                await this.refresh();
            },
        );
    }

    private async createScript() {
        const dialog = new Dialog({
            content: `<div class="b3-dialog__content"><input class="b3-text-field fn__block" value="main.py"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel">${this.strings.cancel}</button><button class="b3-button b3-button--text">${this.strings.save}</button></div>`,
            title: this.strings.newScript,
            width: "360px",
        });
        const input = dialog.element.querySelector("input") as HTMLInputElement;
        input.focus();
        input.select();
        const {promise, resolve} = Promise.withResolvers<string | undefined>();
        const buttons = dialog.element.querySelectorAll(".b3-dialog__action button");
        (buttons[0] as HTMLButtonElement).addEventListener("click", () => {
            dialog.destroy();
            resolve(undefined);
        });
        const submit = () => {
            const value = input.value;
            dialog.destroy();
            resolve(value);
        };
        (buttons[1] as HTMLButtonElement).addEventListener("click", submit);
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                submit();
            }
        });
        const confirmed = await promise;
        if (!confirmed) {
            return;
        }
        const trimmed = confirmed.trim();
        if (!isScriptPath(trimmed) || trimmed.includes("/") || trimmed.includes("\\")) {
            showMessage(this.strings.invalidName);
            return;
        }
        try {
            const existing = (await this.listScripts()).find((name) =>
                baseNameWithoutID(name).toLowerCase() === trimmed.toLowerCase()
            );
            if (existing) {
                showMessage(this.strings.alreadyExists, 7000, "error");
                return;
            }
        } catch (error) {
            console.error(error);
            showMessage(this.strings.loadFailed);
            return;
        }
        const form = new FormData();
        form.append("assetsDirPath", "/assets/");
        form.append("file[]", new File(["#!/usr/bin/env python3\n"], trimmed, {type: "text/plain"}));
        try {
            const response = await fetch("/api/asset/upload", {body: form, method: "POST"});
            const result = await response.json() as {code: number; msg: string; data: UploadResponse;};
            if (result.code !== 0 || Object.keys(result.data?.succMap ?? {}).length === 0) {
                throw new Error(result.msg || "upload failed");
            }
            showMessage(this.strings.created);
            await this.refresh();
        } catch (error) {
            console.error(error);
            showMessage(this.strings.createFailed);
        }
    }
    private targetEditor() {
        try {
            const active = getActiveEditor();
            if (active) {
                return active;
            }
        } catch {
            // Fall through to the first open editor.
        }
        const editors = getAllEditor();
        return editors.length > 0 ? editors[0] : undefined;
    }

    private async pickAndInsert() {
        const editor = this.targetEditor();
        if (!editor) {
            showMessage(this.strings.noEditor);
            return;
        }
        let scripts: string[];
        try {
            scripts = await this.listScripts();
        } catch (error) {
            console.error(error);
            showMessage(this.strings.loadFailed);
            return;
        }
        if (scripts.length === 0) {
            showMessage(this.strings.noScripts);
            return;
        }
        const menu = new Menu("codeFilesInsert");
        for (const name of scripts) {
            menu.addItem({
                icon: "iconCode",
                id: name,
                label: baseNameWithoutID(name),
                click: () => this.insertReference(name),
            });
        }
        const rect = editor.protyle.element.getBoundingClientRect();
        menu.open({x: rect.left, y: rect.top});
    }

    private async insertReference(name: string) {
        const editor = this.targetEditor();
        if (!editor) {
            showMessage(this.strings.noEditor);
            return;
        }
        editor.focus();
        const html = editor.protyle.lute?.InlineMd2BlockDOM(toMarkdownLink(name)) ?? toMarkdownLink(name);
        editor.insert(html);
        showMessage(this.strings.referenceInserted);
    }
}

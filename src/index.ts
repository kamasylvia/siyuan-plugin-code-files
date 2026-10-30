import {
    Dialog,
    Menu,
    Plugin,
    Setting,
    confirm,
    getAllEditor,
    showMessage,
} from "siyuan";
import "./index.scss";
import {
    PREVIEW_TAB_TYPE,
    openPreview,
    renderPreview,
} from "./preview";
import {
    ASSETS_DIR,
    copyText,
    isScriptPath,
    postJSON,
    previewLinkOf,
    resolvePreviewAction,
    toAssetLink,
    toMarkdownLink,
} from "./shared";

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

    async onload() {
        this.eventBus.on("open-asset", (event: CustomEvent<{path?: string; event?: MouseEvent;}>) => {
            const link = previewLinkOf(event.detail?.path);
            const config = (window.siyuan?.config?.editor as {assetOpen?: Record<string, string>;} | undefined)
                ?.assetOpen;
            const action = resolvePreviewAction(config, event.detail?.event);
            if (!link || !action) {
                return;
            }
            event.preventDefault();
            openPreview(this.name, this.app, link, action, () => this.getOpenedTab() as never);
        });
        this.addDock({
            config: {
                icon: "iconCode",
                position: "LeftBottom",
                size: {width: 260, height: 0},
                title: this.i18n.codeFiles,
            },
            data: {},
            type: DOCK_TYPE,
            init: (dock) => this.renderDock(dock.element),
        });
        this.addTab({
            type: PREVIEW_TAB_TYPE,
            init: (custom) => {
                const link = (custom.data as {link?: string;} | undefined)?.link ?? "";
                void renderPreview(custom.element, link, this.i18n as unknown as Record<string, string>);
            },
        });

        this.addCommand({
            langKey: "insertReference",
            langText: this.i18n.insertReference,
            hotkey: "",
            callback: () => this.pickAndInsert(),
        });

        const setting = new Setting({
            confirmCallback: () => this.saveData("config", {}),
        });
        setting.addItem({
            key: "hint",
            value: "",
            type: "textinput",
            title: this.i18n.codeFilesTip,
            description: "",
            action: {},
        });
    }

    onLayoutReady() {
        void this.refresh();
    }

    async onunload() {
        this.element = undefined;
    }

    private renderDock(host: HTMLElement) {
        const root = document.createElement("div");
        root.className = "code-files";
        root.innerHTML = `<div class="code-files__toolbar">
<button data-action="new" class="b3-button b3-button--text">${this.i18n.newScript}</button>
<button data-action="refresh" class="b3-button b3-button--text">${this.i18n.refresh}</button>
<span class="fn__flex-1"></span>
<button data-action="close" class="b3-button b3-button--text" title="${this.i18n.close}">×</button>
</div>
<div class="code-files__list fn__flex-1"></div>`;
        root.querySelector('[data-action="new"]').addEventListener("click", () => void this.createScript());
        root.querySelector('[data-action="refresh"]').addEventListener("click", () => void this.refresh());
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
            showMessage(this.i18n.loadFailed);
            return;
        }
        if (scripts.length === 0) {
            list.innerHTML = `<div class="b3-list--empty">${this.i18n.noScripts}</div>`;
            return;
        }
        for (const name of scripts) {
            const row = document.createElement("div");
            row.className = "b3-list-item";
            row.innerHTML = `<span class="b3-list-item__text">${name}</span>
<span class="b3-list-item__meta fn__flex">
<button data-action="open" class="b3-button b3-button--text" title="${this.i18n.openScript}">↗</button>
<button data-action="insert" class="b3-button b3-button--text" title="${this.i18n.insertReferenceTip}">+</button>
<button data-action="copy" class="b3-button b3-button--text" title="${this.i18n.copyPath}">⧉</button>
<button data-action="delete" class="b3-button b3-button--text" title="${this.i18n.deleteScript}"><svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg></button>
</span>`;
            row.querySelector('[data-action="open"]').addEventListener("click", (event) => {
                event.stopPropagation();
                openPreview(this.name, this.app, toAssetLink(name), undefined, () => this.getOpenedTab() as never);
            });
            row.querySelector('[data-action="insert"]').addEventListener("click", (event) => {
                event.stopPropagation();
                void this.insertReference(name);
            });
            row.querySelector('[data-action="copy"]').addEventListener("click", (event) => {
                event.stopPropagation();
                void copyText(toAssetLink(name)).then(
                    () => showMessage(this.i18n.copied),
                    (error: unknown) => {
                        console.error(error);
                        showMessage(this.i18n.copyFailed);
                    },
                );
            });
            row.querySelector('[data-action="delete"]').addEventListener("click", (event) => {
                event.stopPropagation();
                void this.deleteScript(name);
            });
            list.appendChild(row);
        }
    }

    private async createScript() {
        const dialog = new Dialog({
            content: `<div class="b3-dialog__content"><input class="b3-text-field fn__block" value="main.py"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel">${this.i18n.cancel}</button><button class="b3-button b3-button--text">${this.i18n.save}</button></div>`,
            title: this.i18n.newScript,
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
            showMessage(this.i18n.invalidName);
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
            showMessage(this.i18n.created);
            await this.refresh();
        } catch (error) {
            console.error(error);
            showMessage(this.i18n.createFailed);
        }
    }
    private async pickAndInsert() {
        const editors = getAllEditor();
        if (editors.length === 0) {
            showMessage(this.i18n.noEditor);
            return;
        }
        let scripts: string[];
        try {
            scripts = await this.listScripts();
        } catch (error) {
            console.error(error);
            showMessage(this.i18n.loadFailed);
            return;
        }
        if (scripts.length === 0) {
            showMessage(this.i18n.noScripts);
            return;
        }
        const menu = new Menu("codeFilesInsert");
        for (const name of scripts) {
            menu.addItem({
                icon: "iconCode",
                id: name,
                label: name,
                click: () => this.insertReference(name),
            });
        }
        const rect = editors[0].protyle.element.getBoundingClientRect();
        menu.open({x: rect.left, y: rect.top});
    }

    private async insertReference(name: string) {
        const editors = getAllEditor();
        if (editors.length === 0) {
            showMessage(this.i18n.noEditor);
            return;
        }
        const editor = editors[0];
        const html = editor.protyle.lute?.InlineMd2BlockDOM(toMarkdownLink(name)) ?? toMarkdownLink(name);
        editor.insert(html);
        showMessage(this.i18n.referenceInserted);
    }

    private async deleteScript(name: string) {
        confirm(
            this.i18n.deleteScript,
            this.i18n.confirmDelete.replace("${name}", name),
            async () => {
                try {
                    const response = await postJSON<null>("/api/file/removeFile", {path: `${ASSETS_DIR}/${name}`});
                    if (response.code !== 0) {
                        throw new Error(response.msg || "removeFile failed");
                    }
                    showMessage(this.i18n.deleted);
                    await this.refresh();
                } catch (error) {
                    console.error(error);
                    showMessage(this.i18n.deleteFailed);
                }
            },
        );
    }
}

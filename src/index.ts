import {
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
            langKey: "codeFiles",
            langText: this.i18n.codeFilesTip,
            hotkey: "",
            callback: () => this.refresh(),
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
</div>
<div class="code-files__list fn__flex-1"></div>`;
        root.querySelector('[data-action="new"]').addEventListener("click", () => void this.createScript());
        root.querySelector('[data-action="refresh"]').addEventListener("click", () => void this.refresh());
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
<button data-action="delete" class="b3-button b3-button--text" title="${this.i18n.deleteScript}">×</button>
</span>`;
            row.querySelector('[data-action="open"]').addEventListener("click", (event) => {
                event.stopPropagation();
                openPreview(this.name, this.app, toAssetLink(name), undefined, () => this.getOpenedTab() as never);
            });
            row.querySelector('[data-action="insert"]').addEventListener("click", (event) => {
                event.stopPropagation();
                void this.insertReference(name);
            });
            row.querySelector('[data-action="copy"]').addEventListener("click", async (event) => {
                event.stopPropagation();
                await navigator.clipboard.writeText(toAssetLink(name));
                showMessage(this.i18n.copied);
            });
            row.querySelector('[data-action="delete"]').addEventListener("click", (event) => {
                event.stopPropagation();
                void this.deleteScript(name);
            });
            list.appendChild(row);
        }
    }

    private async createScript() {
        const name = window.prompt(this.i18n.newScriptName, "main.py");
        if (!name) {
            return;
        }
        const trimmed = name.trim();
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

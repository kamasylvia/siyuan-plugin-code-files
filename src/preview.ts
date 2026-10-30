import {
    openTab,
    showMessage,
} from "siyuan";
import {makeT} from "./i18n";
import type {AssetOpenAction} from "./shared";
import {createView} from "./view";

export const PREVIEW_TAB_TYPE = "script_preview";

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

export interface PreviewController {
    isDirty: () => boolean;
    save: () => Promise<boolean>;
    dispose: () => void;
}

export const renderPreview = async (
    host: HTMLElement,
    link: string,
    i18n: Record<string, string>,
    initialEditing: boolean,
): Promise<PreviewController> => {
    const t = makeT(i18n);
    const tab = createView({element: host, data: {link}}, t, {
        initialEditing,
        maxSizeMB: 5,
        onDownload: (ref, fileName) => {
            void downloadScript(ref.link, fileName, i18n.downloadFailed);
        },
    });
    return {isDirty: tab.isDirty, save: tab.save, dispose: tab.dispose};
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

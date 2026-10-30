import type {Tab} from "siyuan";
import {
    openTab,
    showMessage,
} from "siyuan";
import {openConfirmDialog} from "./dialog";
import {makeT} from "./i18n";
import {
    baseNameWithoutID,
    type AssetOpenAction,
} from "./shared";
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
    headElement?: HTMLElement,
): Promise<PreviewController> => {
    const t = makeT(i18n);
    const tab = createView({element: host, data: {link}, headElement}, t, {
        initialEditing,
        maxSizeMB: 5,
        onDownload: (ref, fileName) => {
            void downloadScript(ref.link, fileName, i18n.downloadFailed);
        },
    });
    return {isDirty: tab.isDirty, save: tab.save, dispose: tab.dispose};
};

export interface GuardedModel {
    data?: {link?: string;};
    tab?: Tab;
}

/**
 * Wrap removeTab so dirty tabs ask before closing. Every close path
 * (×, middle-click, double-click, tab menu, shortcut, replace, over-limit)
 * funnels through Wnd.removeTab, so a single guard covers them all.
 * beforeDestroy cannot await a dialog, hence the pre-close interception.
 */
export const guardTab = (
    model: GuardedModel,
    pending: Promise<PreviewController>,
    i18n: Record<string, string>,
): void => {
    const head = model.tab;
    const wnd = head?.parent;
    if (!head || !wnd) {
        return;
    }
    const original = wnd.removeTab.bind(wnd);
    let asking = false;
    wnd.removeTab = (id: string, ...rest: [boolean?, boolean?, boolean?]) => {
        if (asking || id !== head.id) {
            original(id, ...rest);
            return;
        }
        void pending.then((controller) => {
            if (!controller.isDirty()) {
                original(id, ...rest);
                return;
            }
            asking = true;
            // Switch to the dirty tab so the dialog context is visible.
            wnd.switchTab(head.headElement, true);
            openConfirmDialog({
                cancelLabel: i18n.closeCancel,
                text: i18n.unsavedPrompt,
                title: i18n.unsavedTitle,
                onCancel: () => {
                    asking = false;
                },
                actions: [
                    {
                        label: i18n.closeDiscard,
                        danger: true,
                        onClick: () => {
                            asking = false;
                            original(id, ...rest);
                        },
                    },
                    {
                        label: i18n.closeSave,
                        primary: true,
                        onClick: () => {
                            void controller.save().then((ok) => {
                                asking = false;
                                if (ok) {
                                    original(id, ...rest);
                                }
                            });
                        },
                    },
                ],
            });
        });
    };
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
            title: baseNameWithoutID(link.slice("assets/".length)),
        },
        keepCursor: placement === "background" ? true : undefined,
        position,
    });
};

// Multi-button confirm dialog.
//
// Ported verbatim from wmy2981/editor-siyuan (src/dialog.ts): the public
// confirm() only offers two fixed buttons, while close confirmation needs
// save / discard / cancel.
import {Dialog} from "siyuan";
import {escapeHtml} from "./util";

export interface IDialogAction {
    label: string;
    primary?: boolean;
    danger?: boolean;
    onClick: () => void;
}

function renderText(text: string): string {
    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");
}

function blockEscape(event: KeyboardEvent): void {
    if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }
}

let openedCount = 0;

export const confirmDialogOpen = (): boolean => openedCount > 0;

export function openConfirmDialog(options: {
    title: string;
    text: string;
    actions: IDialogAction[];
    cancelLabel?: string;
    onCancel?: () => void;
    dismissable?: boolean;
}): void {
    const buttons = options.actions.map((action, index) => {
        const modifier = action.danger ?
            "b3-button--remove" :
            (action.primary ? "b3-button--text" : "b3-button--cancel");
        return `<div class="fn__space"></div><button class="b3-button ${modifier}" data-action="${index}">${
            escapeHtml(action.label)
        }</button>`;
    }).join("");
    const dismissable = options.dismissable !== false;
    const cancelButton = options.cancelLabel ?
        `<button class="b3-button b3-button--cancel" data-action="cancel">${escapeHtml(options.cancelLabel)}</button>` :
        "";
    let handled = false;
    const dialog = new Dialog({
        title: options.title,
        width: "520px",
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword">${renderText(options.text)}</div>
</div>
<div class="b3-dialog__action">
    ${cancelButton}${buttons}
</div>`,
        disableClose: !dismissable,
        destroyCallback: () => {
            openedCount--;
            if (!dismissable) {
                window.removeEventListener("keydown", blockEscape, true);
            }
            if (!handled) {
                options.onCancel?.();
            }
        },
    });
    openedCount++;
    if (!dismissable) {
        window.addEventListener("keydown", blockEscape, true);
    }
    dialog.element.addEventListener("click", (event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
        if (!target) {
            return;
        }
        const value = target.dataset.action;
        const action = value === "cancel" ? undefined : options.actions[Number(value)];
        if (!action && value !== "cancel") {
            return;
        }
        handled = true;
        dialog.destroy();
        if (action) {
            action.onClick();
        } else {
            options.onCancel?.();
        }
    });
}

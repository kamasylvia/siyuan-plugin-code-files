// Shared script-asset conventions between the frontend and the kernel plugin.
//
// A script asset is a text file under data/assets/ whose extension marks it as
// executable content. Storage always goes through the kernel asset pipeline,
// so every file carries the kernel-assigned `name-<NodeID>.ext` form and all
// references must use the returned path verbatim.

export const ASSETS_DIR = "data/assets";
export const SCRIPT_EXTENSIONS: Record<string, true> = {
    ".py": true,
    ".js": true,
    ".mjs": true,
    ".cjs": true,
    ".ts": true,
    ".sh": true,
    ".bash": true,
    ".zsh": true,
    ".rb": true,
    ".pl": true,
    ".php": true,
    ".lua": true,
    ".r": true,
    ".jl": true,
};
export const isScriptPath = (path: string): boolean => {
    const dot = path.lastIndexOf(".");
    if (dot < 0) {
        return false;
    }
    return SCRIPT_EXTENSIONS[path.slice(dot).toLowerCase()] === true;
};

// Asset links are stored as `assets/<file>` inside notes.
export const toAssetLink = (fileName: string): string => `assets/${fileName}`;

// Strip the kernel-assigned `-<NodeID>` suffix: `main-20240101-abcdef.py`
// becomes `main.py`. Node IDs are 14 digits + `-` + 7 alphanumerics.
export const baseNameWithoutID = (fileName: string): string => fileName.replace(/-\d{14}-[a-z0-9]{7}(?=\.[^.]+$)/, "");

export const toMarkdownLink = (fileName: string): string =>
    `[${baseNameWithoutID(fileName)}](${toAssetLink(fileName)})`;

export const stripQuery = (link: string): string => {
    const cut = link.search(/[?#]/);
    return cut < 0 ? link : link.slice(0, cut);
};

export const previewLinkOf = (path: string | null | undefined): string | undefined => {
    if (!path || !path.startsWith("assets/")) {
        return undefined;
    }
    const link = stripQuery(path);
    return isScriptPath(link) ? link : undefined;
};

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
    ".py": "python",
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".rb": "ruby",
    ".pl": "perl",
    ".php": "php",
    ".lua": "lua",
    ".r": "r",
    ".jl": "julia",
};

export const languageOf = (fileName: string): string => {
    const dot = fileName.lastIndexOf(".");
    if (dot < 0) {
        return "plaintext";
    }
    return LANGUAGE_BY_EXTENSION[fileName.slice(dot).toLowerCase()] ?? "plaintext";
};

export interface ApiEnvelope<T> {
    code: number;
    msg: string;
    data: T;
}

// The petal fetchPost returns Promise<void> (callback style); use raw fetch
// to get the JSON envelope directly. The host wraps window.fetch with the
// app-ID header, so plain calls carry authentication.
export const postJSON = async <T>(url: string, body: unknown): Promise<ApiEnvelope<T>> => {
    const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: {"Content-Type": "application/json"},
        method: "POST",
    });
    if (!response.ok) {
        throw new Error(`${url} HTTP ${response.status}`);
    }
    return await response.json() as ApiEnvelope<T>;
};

// Mirror writeText: navigator.clipboard rejects outside secure contexts
// (remote kernels over plain HTTP), so fall back to execCommand.
export const copyText = async (text: string): Promise<void> => {
    try {
        await navigator.clipboard.writeText(text);
        return;
    } catch (error) {
        console.error(error);
    }
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.focus();
    helper.select();
    try {
        if (!document.execCommand("copy")) {
            throw new Error("execCommand copy returned false");
        }
    } finally {
        helper.remove();
    }
};

export type AssetOpenAction =
    | "follow-tab"
    | "current"
    | "right"
    | "bottom"
    | "background"
    | "new-window"
    | "app"
    | "folder";

export interface AssetOpenConfig {
    click?: string;
    ctrlClick?: string;
    altClick?: string;
    shiftClick?: string;
}

// Mirror resolveAssetOpenGesture: a single modifier picks the gesture,
// otherwise it is a plain click. For scripts the plugin treats the file as
// previewable, so the raw configured action is used instead of the kernel's
// rewritten detail.action (which demotes unlisted extensions to app/current).
export const resolvePreviewAction = (
    config: AssetOpenConfig | undefined,
    event: {altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean;} | undefined,
): AssetOpenAction | undefined => {
    const ctrl = event?.ctrlKey === true || event?.metaKey === true;
    const count = Number(event?.altKey === true) + Number(event?.shiftKey === true) + Number(ctrl);
    let gesture: keyof AssetOpenConfig = "click";
    if (count === 1) {
        if (event?.altKey === true) {
            gesture = "altClick";
        } else if (event?.shiftKey === true) {
            gesture = "shiftClick";
        } else {
            gesture = "ctrlClick";
        }
    }
    const action = config?.[gesture] ?? (gesture === "click" ? "follow-tab" : undefined);
    if (
        action === "follow-tab" || action === "current" || action === "right" ||
        action === "bottom" || action === "background"
    ) {
        return action;
    }
    return undefined;
};

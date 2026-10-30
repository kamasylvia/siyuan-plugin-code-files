// Asset locating, reading, and writing.
//
// Ported from wmy2981/editor-siyuan (src/asset.ts): resolve the `assets/`
// link through the kernel (notebook-level assets, ?box=, encryption-safe),
// stat the size before reading (the kernel reads whole files into memory),
// and preserve the original BOM and line-ending style on write-back.
import {postJSON} from "./shared";

const GET_FILE = "/api/file/getFile";
const PUT_FILE = "/api/file/putFile";
const RESOLVE_ASSET = "/api/asset/resolveAssetPath";
const STAT_ASSET = "/api/asset/statAsset";
const WORKSPACE_INFO = "/api/system/getWorkspaceInfo";

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

export interface AssetRef {
    /** Normalized link (query stripped), also the tab key. */
    link: string;
    /** Workspace-relative path, e.g. /data/assets/xxx.py. */
    apiPath: string;
    size: number;
}

export interface AssetText {
    /** Body with newlines normalized to \n. */
    text: string;
    eol: "\n" | "\r\n";
    bom: boolean;
}

export type ResolveResult = {kind: "ok"; ref: AssetRef;} | {kind: "error"; message: string;};

const normalizeRoot = (path: string): string => path.replaceAll("\\", "/").replace(/\/+$/, "");

let cachedRoot: string | undefined;

const workspaceDir = async (): Promise<string | undefined> => {
    if (cachedRoot) {
        return cachedRoot;
    }
    const fromConfig = (window.siyuan?.config?.system as {workspaceDir?: string;} | undefined)?.workspaceDir;
    if (fromConfig) {
        cachedRoot = normalizeRoot(fromConfig);
        return cachedRoot;
    }
    try {
        const info = await postJSON<{workspaceDir?: string;}>(WORKSPACE_INFO, {});
        if (info.code !== 0 || !info.data?.workspaceDir) {
            return undefined;
        }
        cachedRoot = normalizeRoot(info.data.workspaceDir);
        return cachedRoot;
    } catch {
        return undefined;
    }
};

const toApiPath = (absolute: string, root: string): string | undefined => {
    if (!absolute) {
        return undefined;
    }
    const normalized = absolute.replaceAll("\\", "/");
    if (!normalized.startsWith(`${root}/data/`)) {
        return undefined;
    }
    return normalized.slice(root.length);
};

export const resolveAsset = async (link: string): Promise<ResolveResult> => {
    if (!link.startsWith("assets/")) {
        return {kind: "error", message: "not an asset link"};
    }
    try {
        const resolved = await postJSON<string>(RESOLVE_ASSET, {path: link});
        if (resolved.code !== 0) {
            return {kind: "error", message: resolved.msg || `code ${resolved.code}`};
        }
        const root = await workspaceDir();
        const apiPath = root ? toApiPath(resolved.data, root) : undefined;
        if (!apiPath) {
            return {kind: "error", message: "encrypted or outside workspace"};
        }
        const stat = await postJSON<{size: number;}>(STAT_ASSET, {path: link});
        if (stat.code !== 0) {
            return {kind: "error", message: stat.msg || `code ${stat.code}`};
        }
        return {kind: "ok", ref: {link: link.split("?")[0], apiPath, size: stat.data.size}};
    } catch (error) {
        return {kind: "error", message: error instanceof Error ? error.message : String(error)};
    }
};

export const readAssetText = async (ref: AssetRef): Promise<AssetText> => {
    const response = await fetch(GET_FILE, {method: "POST", body: JSON.stringify({path: ref.apiPath})});
    if (response.status !== 200) {
        let message = `HTTP ${response.status}`;
        try {
            message = ((await response.json()) as {msg?: string;}).msg || message;
        } catch {
            // Keep the HTTP status for non-JSON responses.
        }
        throw new Error(message);
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    const bom = buffer.length >= 3 && buffer[0] === UTF8_BOM[0] && buffer[1] === UTF8_BOM[1] &&
        buffer[2] === UTF8_BOM[2];
    const raw = new TextDecoder("utf-8").decode(bom ? buffer.subarray(3) : buffer);
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    return {text: raw.replaceAll("\r\n", "\n").replaceAll("\r", "\n"), eol, bom};
};

export const writeAssetText = async (ref: AssetRef, data: AssetText): Promise<string | undefined> => {
    const text = data.eol === "\r\n" ? data.text.replaceAll("\n", "\r\n") : data.text;
    const bytes = new TextEncoder().encode(text);
    const body = new FormData();
    body.append("path", ref.apiPath);
    body.append("isDir", "false");
    body.append(
        "file",
        new Blob(data.bom ? [UTF8_BOM, bytes] : [bytes], {type: "text/plain"}),
        ref.apiPath.split("/").pop() ?? "file",
    );
    try {
        const response = await fetch(PUT_FILE, {method: "POST", body});
        const result = await response.json() as {code: number; msg: string;};
        return result.code === 0 ? undefined : (result.msg || `code ${result.code}`);
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
};

import type * as kernel from "siyuan/kernel";
import {
    ASSETS_DIR,
    isScriptPath,
} from "./shared";

// Maximum script bytes returned to the model in one capability call.
const MAX_SCRIPT_BYTES = 256 * 1024;

interface KernelEnvelope<T> {
    code: number;
    msg: string;
    data: T;
}

class ScriptAssetsKernel {
    private readonly siyuan: kernel.ISiyuan = siyuan;

    constructor() {
        this.siyuan.plugin.lifecycle.onload = this.onload.bind(this);
        this.siyuan.plugin.lifecycle.onunload = this.onunload.bind(this);
    }

    private async onload(): Promise<void> {
        const {agent, logger} = this.siyuan;
        const capability = await agent.registerCapability(
            "get_referenced_scripts",
            {
                title: "Get referenced scripts",
                description:
                    "Resolve asset links in a document and return every referenced script file with its content, so an external AI agent can fetch scripts locally and run them itself",
                inputSchema: {
                    type: "object",
                    properties: {
                        docID: {
                            type: "string",
                            description: "Document block ID whose asset references should be resolved",
                        },
                        includeContent: {
                            type: "boolean",
                            description: "Return file content inline (default true); set false for paths only",
                        },
                    },
                    required: ["docID"],
                },
                outputSchema: {
                    type: "object",
                    properties: {
                        scripts: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    path: {type: "string"},
                                    content: {type: "string"},
                                    truncated: {type: "boolean"},
                                },
                                required: ["path"],
                            },
                        },
                    },
                    required: ["scripts"],
                },
                effects: {localRead: true},
            },
            async (input: Record<string, any>) => this.getReferencedScripts(input),
        );
        await logger.debug("Code files capability registered:", capability.name);
    }

    private async onunload(): Promise<void> {
        await this.siyuan.agent.unregisterCapability("get_referenced_scripts");
    }

    private async post<T>(path: `/api/${string}`, body: unknown): Promise<T> {
        const response = await this.siyuan.client.fetch(path, {
            body: JSON.stringify(body),
            method: "POST",
        });
        const envelope = await response.json() as KernelEnvelope<T>;
        if (!response.ok || envelope.code !== 0) {
            throw new Error(envelope.msg || `request ${path} failed with status ${response.status}`);
        }
        return envelope.data;
    }

    // /api/file/getFile returns raw bytes (SuccessBinary), not a JSON envelope.
    private async getFileText(path: string): Promise<string> {
        const response = await this.siyuan.client.fetch("/api/file/getFile", {
            body: JSON.stringify({path}),
            method: "POST",
        });
        if (!response.ok) {
            throw new Error(`request /api/file/getFile failed with status ${response.status}`);
        }
        return response.text();
    }

    private async getReferencedScripts(input: Record<string, any>) {
        const docID = String(input.docID ?? "");
        if (docID === "") {
            throw new Error("docID is required");
        }
        const includeContent = input.includeContent !== false;
        const refs = await this.post<string[]>("/api/asset/getDocAssets", {id: docID});
        const scripts: Array<{path: string; content?: string; truncated?: boolean;}> = [];
        for (const ref of refs) {
            const path = String(ref ?? "");
            if (!path.startsWith("assets/") || !isScriptPath(path)) {
                continue;
            }
            const entry: {path: string; content?: string; truncated?: boolean;} = {path};
            if (includeContent) {
                const fileName = path.slice("assets/".length);
                const content = await this.getFileText(`${ASSETS_DIR}/${fileName}`);
                if (content.length > MAX_SCRIPT_BYTES) {
                    entry.content = content.slice(0, MAX_SCRIPT_BYTES);
                    entry.truncated = true;
                } else {
                    entry.content = content;
                }
            }
            scripts.push(entry);
        }
        return {scripts};
    }
}

new ScriptAssetsKernel();

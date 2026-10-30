# 代码文件 Code Files

[English](./README.md)

把代码文件存为思源资源，带语法高亮与行号预览，用普通 Markdown 链接在笔记中引用，并暴露给 AI 智能体——长代码不再污染 `.sy` 文件。

## 工作方式

* **存**：代码文件经内核资源管线落在 `data/assets/`，上传、去重、同步、历史全继承。
* **引**：笔记里只存一行 `[name](assets/...)` 链接，文档保持干净。
* **预览**：点击链接打开只读页签，语法高亮 + 行号 + 下载按钮，与官方 PDF 行为一致。
* **管**：dock 面板列出、新建、引用、删除代码文件。
* **暴露**：内核插件注册 `get_referenced_scripts` 智能体能力（同时投影给外部 MCP 客户端），解析文档的资源引用并返回每个文件的路径与内容。AI 在本地拉取文件自己执行——本插件永不执行代码。

## 使用方法

1. 从左侧 dock 栏打开代码文件面板。
2. 点「新建文件」创建代码文件，或管理已在 `data/assets/` 中的文件。
3. 把光标放在笔记中想插入引用的位置，点文件行右侧的引用图标按钮（块引用符号）：一行 `[name](assets/...)` 链接即插入。也可以在命令面板运行「插入引用」命令，从菜单点选文件。
4. 点击链接在右侧分栏打开预览页签（与 PDF 一致）：只读态带语法高亮、行号、复制、下载；切换到编辑态可直接修改保存。关闭有未保存修改的页签时会询问保存/不保存/取消；未保存的页签在页签栏带 `•` 前缀。

## 开发

* `pnpm i` 安装依赖
* `pnpm run dev` 实时编译
* 提交前跑 `pnpm test`、`pnpm run lint`、`pnpm run format`、`pnpm run typecheck`
* `pnpm run build` 产出 `dist/` 与 `package.zip`

## 文件

* `src/index.ts`：前端 dock 面板（列表、新建、插入引用、删除）
* `src/kernel.ts`：后端智能体能力 `get_referenced_scripts`
* `src/shared.ts`：前后端共享的脚本扩展名约定

## 致谢

编辑器页签（CodeMirror 装配、操作条、搜索、菜单、主题跟随、资源读写）移植改编自 wmy2981 的 [editor-siyuan](https://github.com/wmy2981/editor-siyuan)（MIT），详见 LICENSE。

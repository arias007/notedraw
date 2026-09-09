# Contributing to NoteDraw

感谢你为 NoteDraw 提交问题、改进代码或补充文档。NoteDraw 是一个面向 Obsidian 的插件：它把绘图、文字编辑、Markdown 排版和跨视图坐标保持放在同一套 controller 中。提交改动前，请先阅读本文和 [docs/architecture.md](docs/architecture.md)。

## 项目结构

| 路径 | 作用 |
| --- | --- |
| `src/notedraw-plugin.js` | 插件入口、Obsidian 生命周期、surface/controller、工具栏、绘制交互、历史、保存调度和公开 API。 |
| `src/element-layout.mjs` | 带 Markdown 锚点的元素框、相对投影、关系稳定和跨视图布局。 |
| `src/layout-coordinates.mjs` | 响应式点、客户端坐标和 canvas 坐标之间的转换。 |
| `src/reading-layout.mjs` | 阅读视图、虚拟 Markdown section 和视图切换时的布局辅助。 |
| `src/canvas-sizing.mjs` | canvas 尺寸、窗口化渲染、像素预算和缩放后的可见窗口。 |
| `src/drawing-persistence.mjs` | drawing save 请求合并、快照物化和跨 controller 保留记录。 |
| `src/markdown-*.mjs` | Markdown source identity、拖拽目标、并列行和块记录。 |
| `src/note-flow-layout.mjs` | NoteFlow 行、预留 Markdown 空间和并列元素分配。 |
| `src/connector-*.mjs` | 连接线端点、关系组和绑定几何。 |
| `tests/*.test.mjs` | 纯函数测试和源码契约/回归测试；所有测试都可在没有 Obsidian 的情况下运行。 |
| `esbuild.config.mjs` | 将 `src/notedraw-plugin.js` 打包为根目录的 `main.js`。 |
| `manifest.json` / `versions.json` | Obsidian 插件版本和最低 Obsidian 版本声明。 |
| `styles.css` | NoteDraw shell、toolbar、canvas、Markdown frame 和 reading zoom 样式。 |

功能排查时，优先从 `src/notedraw-plugin.js` 找到 controller 调用点，再把纯计算提取到对应的 `.mjs` 模块和测试中。不要把新的布局规则散落到 pointer handler 或 CSS 中。

## 本地开发

需要 Node.js 18 或更新版本。

```bash
npm install
npm test
npm run build
npm run check
```

提交前建议运行完整验证：

```bash
npm run verify
git diff --check
```

`npm run build` 会生成根目录 `main.js`。不要手工编辑 `main.js`；源码改动应放在 `src/`，然后重新构建。

### 在 Obsidian 中试用

将构建产物 `main.js`、`manifest.json` 和 `styles.css` 复制到测试 vault 的 `.obsidian/plugins/notedraw/`，启用 NoteDraw 后重载插件。测试完成后，先确认版本和控制台无错误，再提交代码。不要把个人 vault、绘图 JSON、调试日志、token 或其他本机路径提交到仓库。

## 修改约定

1. 先为用户可见的 bug 写一个最小回归测试，再修改实现。
2. 坐标和布局改动必须说明坐标基准：canvas normalized、surface pixel、Markdown line anchor 或 document-relative。
3. reading view 的视觉缩放不能改写源 Markdown 的换行；source/edit view 的布局缩放才允许重新排版。
4. 交互高频路径应使用 animation frame 或轻量局部刷新；不要在每个 pointer move 中运行完整 Markdown remap、Vault I/O 或全量 `render()`。
5. 历史操作必须保持 undo/redo 栈对称，并在当前 controller 立即显示结果；持久化可以异步，但不能成为界面更新的前置条件。
6. 保存、布局和 controller 刷新必须可重复执行；遇到异步 Markdown 重建时，应使用 generation/token 或可取消的调度，避免旧请求覆盖新状态。
7. 兼容旧 drawing 数据时，优先在 normalize/migration 层处理，不要破坏现有字段或把修复后的坐标写回错误的 frame。

## 提交 Issue

请提供：

- Obsidian 和 NoteDraw 版本、操作系统和视图类型（reading/source/embed/webview）。
- 最小复现步骤，以及期望结果和实际结果。
- 是否与 split view、窗口尺寸、Ctrl+/−、触摸缩放、Markdown 重排或 NoteFlow 并列有关。
- 如果是性能问题，请说明连续操作次数和延迟发生在操作期间还是操作结束后。
- 可以公开的截图或短视频；请遮挡个人笔记内容和路径。

当前重点回归项包括：

- [Issue #2](https://github.com/arias007/notedraw/issues/2)：Ctrl+/− 后标记必须继续跟随 Markdown，不能回到原始绝对位置/尺寸。
- [Issue #3](https://github.com/arias007/notedraw/issues/3)：连续 undo/redo 必须立即响应，不得等待延迟保存或重复排队全量刷新。
- [Issue #4](https://github.com/arias007/notedraw/issues/4)：贡献流程和模块边界保持可查阅。

## Pull Request

PR 标题请简洁说明结果，例如 `Fix viewport zoom anchor preservation`。正文请包含：

1. 修复的行为和根因。
2. 影响的模块和兼容性考虑。
3. 新增或更新的测试。
4. `npm run verify` 和 `git diff --check` 的结果。
5. 如果涉及 UI，附上复现前后截图或录屏。

一个 PR 尽量只处理一个用户问题。大型重构请先开 Issue 讨论范围，避免把坐标契约、持久化格式和 UI 改动混在一起。

## 发布检查

维护者发布新版本时，需要同步修改 `package.json`、`package-lock.json`、`manifest.json` 和 `versions.json`，然后运行完整验证并只发布 Obsidian 所需的 `main.js`、`manifest.json`、`styles.css` 三个资产。标签使用裸版本号，例如 `3.7.9`。


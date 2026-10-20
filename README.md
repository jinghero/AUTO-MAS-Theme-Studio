# MAS 创作工具箱

独立的 Windows 主题工坊与桌宠工具，包含图片导入、主题预览、OpenAI 兼容生图、主题 ZIP 导出、桌宠动画预览和独立桌宠包导出。

- 主题采用标准 `theme.json` + 图片素材的 ZIP 格式，可导入 AUTO-MAS。
- 预览复用 MAS 的导航、主页组件与 Ant Design Vue 主题算法。
- 右侧预览铺满可用区域，宽高随窗口、最大化和全屏同步调整。
- 内置背景、封面、图标、静态桌宠、光标五类生图提示词。
- 桌宠支持动作切换、逐帧播放、图集检查和标准 `mascot.json` ZIP 导出。

## 运行

需要 Windows 和 Node.js 22.16 或更新版本。在此目录打开 PowerShell：

```powershell
npm ci
npm start
```

依赖在本项目内安装，不需要安装或克隆 AUTO-MAS。已包含构建好的 MAS 预览资源，可直接启动。

## 构建

```powershell
# 修改 preview-src 后重新生成 MAS 预览
npm run build:preview

# 打包 Windows 便携版
npm run build
```

输出位于 `dist/MAS创作工具箱` 和 `dist/MAS创作工具箱-便携版.zip`。

仅在维护上游快照时，`node setup.cjs` 从 AUTO-MAS 的 `upstream/dev` 更新主题校验模块，`node prepare-preview.cjs` 更新 MAS 布局与主页组件。它们默认使用相邻 `../AUTO-MAS`，也可通过 `AUTO_MAS_REPO` 指定目录。日常启动、构建和验证无需运行这两条命令。

## 目录

- `app/`：Electron 主进程、主题编辑器、AI 接口和完整运行资源。
- `app/mascot-tool/`：合并的桌宠工具源码。
- `app/compat/`：MAS 主题/桌宠校验代码及原始 TypeScript。
- `preview-src/`：MAS 预览源码、复用组件与来源参考。
- `app/mas-preview/`：已构建的预览运行资源，首次启动可直接使用。
- `verify*.cjs`：本地验证脚本。
- `使用说明.txt`、示例 ZIP：工具用法和示例资源。

草稿在 `data/`，验证产物在 `qa/`，打包产物在 `dist/`；这些目录及 `node_modules/` 均已加入忽略规则。

## 验证

```powershell
npm test
```

验证默认使用仓库附带的示例主题与桌宠。设置 `THEME_FIXTURE` 后，主题往返检查也可使用其他兼容的主题 ZIP。AI 检查使用本地模拟服务，不消耗实际 API 额度。

打包后可运行 `npm run check:packaged`，验证便携版 EXE 的主题编辑、桌宠工具和 AI 接口流程。

## 持续集成

向 `main` 推送或提交以 `main` 为目标的 PR 时，GitHub Actions 会在 Windows 上安装锁定依赖、构建 MAS 预览、运行源码回归、打包并验证便携版 EXE。也可在 Actions 页面手动运行。

成功后，运行页面的 Artifacts 提供 `MAS-Theme-Studio-Windows-x64` 下载，保留 14 天；失败时截图与 JSON 报告保留 7 天。CI 不需要生图 API Key。

## 下载与发布

在 [Releases](https://github.com/jinghero/AUTO-MAS-Theme-Studio/releases/latest) 下载便携 ZIP，解压后双击 `MAS主题工坊.exe` 即可使用，无需 Node.js。发布页同时提供 `SHA256SUMS.txt` 校验文件。

维护者推送 `v` 开头的版本标签（如 `v1.0.0`）后，Release 工作流会检查标签与根目录、应用及锁文件的版本是否一致，复用完整 Windows CI，通过后上传便携 ZIP 和 SHA-256 校验文件。包含 `-` 的版本标签发布为预发布版本，其余发布为正式版。普通分支推送不会发布 Release。

## AI 生图

在「AI 生图」中填写 OpenAI Images API 兼容地址、模型名和 API Key。默认地址为 `https://api.openai.com/v1`，默认模型名为 `gpt-image-2`，可修改为服务商提供的名称。

「参考图」可添加最多 4 张 PNG、JPEG 或 WebP，单张不超过 8 MB、合计不超过 16 MB。可预览、单独移除，并在提示词里说明参考哪张图的人物、配色或风格。生成时通过标准 `multipart/form-data` 上传到 `/images/edits`，服务商和模型需支持该接口；不选参考图时使用 `/images/generations`。完整接口地址会按是否选择参考图自动切换。参考图仅本次运行使用，不写入草稿或导出的主题包。

也可点击「根据参考图生成提示词」：在「参考图转提示词设置」填写支持图片输入的看图模型，默认复用生图地址和密钥；生图服务没有看图能力时，可勾选「使用独立的看图服务」填写另一组地址和密钥。看图使用兼容 `/chat/completions` 的多模态接口，结合当前用途、风格和参考图生成中文候选提示词。候选可编辑，点击「使用此提示词」后才替换当前提示词；失败、取消或切换主题不会覆盖原文。点击时会上传参考图与用途要求并由所选服务计费，密钥仅在本次运行的内存中使用。

图片生成支持 `data[0].b64_json` 或 `data[0].url` 返回格式，需使用 Images API；仅提供聊天接口的服务可用于看图转提示词，不能用于图片生成。不支持异步任务轮询接口。生图按所填服务商的规则计费。密钥仅本次运行使用，不写入草稿、主题包或日志。本地素材导入和导出可离线进行。

本项目采用 AGPL-3.0，参见 [LICENSE](LICENSE)。上游代码、依赖及素材说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目是独立工具，并非 AUTO-MAS 官方发布物。

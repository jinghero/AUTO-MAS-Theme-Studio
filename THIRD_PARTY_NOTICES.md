# 第三方代码与素材

本项目整体以 GNU AGPL v3 发布，全文见 [LICENSE](LICENSE)。

## AUTO-MAS

- 上游：[AUTO-MAS-Project/AUTO-MAS](https://github.com/AUTO-MAS-Project/AUTO-MAS)
- 版权：AUTO-MAS Team，原文件中的版权说明保持不变。
- 许可：AGPL-3.0。
- `src/compat/` 包含资源包校验模块的原始 TypeScript，快照提交见 `src/compat/SOURCE.txt`，配套声明位于 `src/types/mascotPack.d.ts`。构建时自动编译为 `.build/app/compat/` 中的 JavaScript。
- `preview-src/` 包含复用的导航、主页组件、样式、词表及适配代码；`source-reference/` 保留来源参考。
- AUTO-MAS 图标用于标识被预览的应用。

## 运行与界面依赖

Electron、Chromium、Vue、Vue Router、Vue I18n、Ant Design Vue、Ant Design Icons、adm-zip 等遵循各自许可证。依赖清单与锁定版本见 `package.json`、`package-lock.json`；预览构建附带的许可见 `.build/app/mas-preview/licenses/`（便携包的 `app.asar` 中为 `mas-preview/licenses/`）。Electron 与 Chromium 的许可随 Windows 便携包一同提供，adm-zip 许可在打包时一并复制。

## 示例资源

仓库内示例主题和桌宠用于演示格式与功能。林间背景为程序绘制的几何图案，奶油猫为本工具使用的演示桌宠。用户导入的其他主题、私人图片与 API 密钥均不属于仓库内容。

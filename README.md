# 墨骰工坊 · InkDice

<img src="prototype/assets/inkdice-logo.svg" width="96" height="96" alt="墨骰工坊：骰面与笔尖">

让填卡少一点繁琐，让冒险多一点自由。

面向 D&D 5E（2014）、5R（2024）与 CoC 七版的 Windows 桌面人物卡工具，由 [ZerDarOn](https://github.com/ZerDarOn) 开发与维护。

**[下载发行版](https://github.com/ZerDarOn/InkDice/releases/latest)** · **[反馈问题 / 提出建议](https://github.com/ZerDarOn/InkDice/issues/new/choose)**

## 使用

在 Releases 下载 Windows x64 安装版 `InkDice-Setup-版本-win-x64.exe`，或完整解压 `InkDice-版本-win-x64.zip` 后运行 `InkDice.exe`。免安装版不能只复制 EXE。

发行包包含当前 5E / 5R 与 CoC 资料，无需安装 Node.js 或启动网页服务器。首次启动显示使用说明，之后可从「关于墨骰工坊」重新查看。

- 分系统创建人物，管理职业、技能、装备、法术、伙伴及背景资料。
- 候选检索与自动填入结合，保留玩家手动修改能力。
- 导出人物 JSON 备份与多工作表 Excel，支持立绘。
- 悬浮助手支持资料查询、3D 骰子与自行配置服务的 AI 人物问答。
- 纯 JSON 资料包支持导入、启用、停用和移除；外部脚本插件宿主尚未开放。
- 安装版提供卸载入口及安装时的版本比较；没有联网自动更新。

人物保存在本机。浏览器人物迁移到桌面版，请先导出 JSON 再导入；Excel 是导出时的快照，不替代完整 JSON 备份。

## 从源码运行

使用 **Node.js 24**。浏览器预览和 Node 测试使用内置模块，无需先安装桌面开发依赖。

```sh
npm start
```

打开 `http://127.0.0.1:4173/prototype/`。服务器只监听本机回环地址。

**资料库单独准备：** Git 不跟踪 5E / 5R SQLite 二进制资料库。请从同版本免安装 ZIP 取出 `resources/library/content-library.sqlite`，复制到源码的 `local-data/content-library.sqlite`。没有此文件时，预览仍可手填，但 D&D 资料检索不可用；数据库集成测试和桌面打包也需要此文件。CoC 的生成目录随前端源码提供。

```sh
# 准备资料库后运行测试
npm test

# 安装桌面开发依赖
npm install

# 启动桌面版
npm run desktop

# 构建 Windows x64 安装版和 ZIP（在 Windows 上运行）
npm run desktop:package
```

Node.js / Electron / electron-builder 版本与构建配置见 `package.json`、`electron-builder.yml`。本次源码与 0.1.6 成品的运行代码一致；Python 导入脚本为可选开发工具，需要相应的原始资料及 openpyxl、Pillow 或 lxml。应用正常运行不依赖这些 Python 工具。

## 目录

- `prototype/`：人物卡界面、计算与自动填入、AI、骰子及 CoC 实现。
- `packages/`：共享规则核心和 D&D 两版适配器。
- `desktop/`：Electron、安全边界、资料库启动及 NSIS 安装配置。
- `tools/`：本机服务、资料导入、构建和集成检查工具。
- `tests/`：规则与功能回归测试。
- `schemas/`：数据格式；运行时资料包格式为 `runtime-content-pack.schema.json`。
- `examples/`：合成示例人物。
- [插件与 AI 接口说明](docs/插件接口与AI对话.md)。

原始 Excel / CHM、个人存档、API 密钥、测试缓存与历史截图不在源码仓库中。EXE 和 ZIP 通过 Releases 分发，不放入 Git 历史。

## 当前边界

资料与自动化仍可能存在遗漏，不代表收录全部出版物或自动执行所有规则。请核对原始资料，并与主持人确认。

AI 会向你配置的服务发送当前人物摘要、匹配资料及近期对话；密钥仅保留在当前会话。AI 不自动改卡，回答可能有误。

0.1.6 已通过 281 项 Node 测试、23 项 NSIS 版本比较检查以及成品启动、资料库和 Excel 导出检查。未对用户真实 AI 服务验收；未实际执行安装、升级及卸载流程。发行程序未进行数字签名。

## 反馈与参与

欢迎提交 Issue 描述问题或建议。请提供版本、系统、复现步骤、预期和实际结果。截图请遮挡个人信息，不要提交 API 密钥、私人存档或整本规则资料。

源码现已公开；目前暂未指定项目整体的开源许可证。第三方组件保留各自许可（例如 `prototype/vendor/JSZIP-LICENSE.txt`），资料内容的权利归各自权利人所有。公开源码不改变相关资料的权利归属。

这是独立开发工具，并非 D&D、Call of Cthulhu 或相关权利方的官方产品，也不代表其认可或背书。

感谢参与试用、指出问题和提供建议的朋友们。人物属于玩家，故事属于同桌的每一个人。

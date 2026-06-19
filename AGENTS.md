## 个人偏好
- 始终使用中文回答，除非指定了回复语言。
- 如果项目下有 `CHANGELOG.md`，做任何重要的更改后记得更新，需附带日期；不存在则不要为了单次改动强行新建。

## 项目概览
- 这是一个 Sui 学习和实验仓库，主要包含 TypeScript 脚本 demo、Move 合约 demo、以及 booklit 文档内容。
- `ts-demos/` 是 TypeScript demo 工作区，使用 `pnpm`、`tsx` 和 `tsc`。
- `move-demos/` 下是多个独立 Move package，每个子目录通常有自己的 `Move.toml`。
- `booklit/` 与 `temp/` 多为文档或临时资料，除非任务明确涉及，不要顺手整理或重构。

## 工作边界
- 用户给出明确文件、目录、协议或脚本名时，只在该范围内做最小必要改动。
- 不要覆盖或回滚用户已有未提交改动；开始改代码前先看 `git status --short`。
- 涉及真实链上交易、私钥、助记词、RPC、赞助交易或主网资产时，先确认运行目标和风险，不要擅自广播交易。
- 不要把私钥、助记词、access token、sponsor credential 或 RPC 密钥写入仓库；需要本地配置时优先使用环境变量或未追踪的本地文件。

## TypeScript 约定
- 在 `ts-demos/` 内运行命令，例如：
  - `pnpm type-check`
  - `pnpm build`
  - `pnpm format:check`
  - `pnpm format`
- 新增脚本优先放在 `ts-demos/src/` 下，并复用已有 helper，例如 `src/helpers/`、`src/utils/`、`src/config.ts`。
- 保持 TypeScript `strict` 通过；对链上对象、coin type、amount、digest 等字段尽量使用明确类型或 SDK 类型。
- 调试链上调用时优先打印 transaction digest、object id、coin type、amount 和 RPC/network 信息，便于复现。

## Move 约定
- 修改 `move-demos/<package>/` 时，在对应 package 目录内运行 Sui Move 命令。
- 常用验证命令：
  - `sui move build`
  - `sui move test`
- 每个 Move package 的 `Move.toml`、`sources/`、`tests/` 彼此独立，避免跨 package 混改。

## 验证与交付
- 代码改动后，根据影响面选择最小验证命令；TypeScript 优先 `pnpm type-check`，Move 优先对应 package 的 `sui move build` 或 `sui move test`。
- 如果因为缺少依赖、网络、RPC、钱包或本地 Sui CLI 无法验证，要在最终回复里明确说明。
- 最终回复简短说明改了什么、验证了什么，以及任何剩余风险。

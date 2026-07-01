# Kickoff Lock Agent 中文开发计划

## 1. 产品定位

Kickoff Lock Agent 是一个世界杯 AI 预测封存与赛后验证产品。

用户在比赛开赛前选择一场比赛，让 agent 生成预测、理由、关键球员和信心等级，然后点击 Lock，把预测封存成 Filecoin-style prediction capsule。比赛结束后，用户同步或手动输入赛果，agent 评分并生成 proof card，最后写入 tournament memory。

一句话：

> 开赛前封存你的世界杯预测，终场后证明你真的早就说过。

英文提交表达：

> Seal your World Cup prediction before kickoff. Prove it after the final whistle.

## 2. 核心目标

这个项目要做成可提交的完整产品，而不是 MVP。

必须具备：

- 可访问的 React + Vite + TypeScript 前端。
- 世界杯比赛面板。
- AI prediction agent flow。
- Lock-before-kickoff 状态机。
- Filecoin-style proof capsule。
- Reveal & score 流程。
- Proof card。
- Tournament memory dashboard。
- ESPN / worldcup26 / seed 数据 fallback。
- Demo proof mode。
- Real Synapse/Filecoin adapter。
- README、SUBMISSION.md、AI_BUILD_LOG.md。
- 适合截图和录 demo video 的稳定流程。

## 3. 用户主流程

1. 用户打开应用。
2. 用户选择一场世界杯比赛。
3. 用户输入预测意图。
4. Agent 生成比分、关键球员、理由和信心等级。
5. 用户可编辑 agent 输出。
6. 用户点击 Lock before kickoff。
7. App 生成 capsule hash、timestamp、CID、PieceCID、proof status。
8. Locked prediction 变成只读。
9. 用户输入或同步实际比分。
10. Agent 计算预测得分并解释。
11. App 生成 proof card。
12. 记录进入 tournament memory。

## 4. 数据源方案

外部数据源只用于比赛和赛果同步，不是产品核心。

优先级：

1. ESPN scoreboard API
2. worldcup26.ir API
3. 本地 seed 数据
4. 手动输入赛果

ESPN endpoint：

```txt
https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard
```

worldcup26 endpoint：

```txt
https://worldcup26.ir/get/games
```

规则：

- ESPN 成功时，用 ESPN 数据。
- ESPN 失败时，自动 fallback 到 worldcup26。
- worldcup26 失败时，自动 fallback 到 seed。
- 外部 API 全失败时，用户仍能用 seed + manual result 完成主流程。
- UI 必须显示当前 match source。

## 5. 模块计划

### 5.1 Match Board

功能：

- 展示比赛列表。
- 展示主队、客队、阶段、开赛时间、状态、数据源。
- 状态包括 upcoming、finished、locked、revealed。
- 支持从列表选择比赛。
- 支持强制 fallback 测试。

### 5.2 Prediction Agent

功能：

- 用户输入预测意图。
- Agent 生成预测比分。
- Agent 生成关键球员或关键因素。
- Agent 生成 reasoning。
- Agent 生成 confidence。
- 用户可编辑 agent 输出。

### 5.3 Kickoff Lock

功能：

- 用户点击 Lock before kickoff。
- App 生成 sealed capsule。
- App 生成 payload hash。
- App 生成 sealed timestamp。
- App 生成 demo CID / PieceCID。
- Lock 后 prediction 不可编辑。
- 如果是开赛后预测，必须标记为 late / practice，不能伪装赛前封存。

### 5.4 Filecoin Proof Panel

功能：

- 显示 proof mode：demo 或 real。
- 显示 CID。
- 显示 PieceCID。
- 显示 hash。
- 显示 sealed timestamp。
- 显示 proof status。
- 支持导入 real proof JSON。
- Demo proof 必须清楚标记，不得伪装真实上链。

### 5.5 Synapse/Filecoin Adapter

功能：

- 提供 `scripts/seal-with-synapse.mjs`。
- 支持读取 capsule JSON。
- 使用 `SYNAPSE_PRIVATE_KEY` 执行真实上传。
- 上传成功后输出 proof JSON。
- 无私钥时给出清楚错误，不泄露密钥。

### 5.6 Reveal & Score

功能：

- 用户输入实际比分。
- 用户输入关键球员或结果备注。
- App 对比 prediction 和 actual。
- App 输出总分。
- App 输出分项解释。

评分维度：

- 胜负是否正确。
- 比分是否完全正确。
- 净胜球是否正确。
- 关键球员是否命中。
- 信心等级是否合理。
- 理由是否足够清楚。

### 5.7 Proof Card

功能：

- 展示比赛。
- 展示预测比分。
- 展示实际比分。
- 展示得分。
- 展示 sealed before kickoff 或 late practice。
- 展示 CID。
- 支持复制 X 分享文案。

### 5.8 Tournament Memory

功能：

- 记录 sealed predictions。
- 记录 revealed predictions。
- 展示平均分。
- 展示最佳分数。
- 展示每场预测摘要。

### 5.9 文档

必须包含：

- README.md
- SUBMISSION.md
- AI_BUILD_LOG.md
- .env.example
- demo proof JSON 示例

README 必须说明：

- 产品是什么。
- 如何运行。
- 数据源 fallback。
- Filecoin 使用方式。
- Demo mode 和 real proof 的边界。
- Synapse adapter 怎么用。

## 6. 简洁验收清单

验收只按下面 15 条判断：

1. 用户可以选择一场比赛。
2. 用户可以生成或编辑预测。
3. 用户可以在开赛前 Lock 预测。
4. Locked prediction 不可编辑。
5. App 显示 CID、hash、timestamp、proof status。
6. 用户可以输入实际比分并 reveal。
7. App 能计算分数并解释原因。
8. Proof card 清楚、适合截图和分享。
9. Memory dashboard 会记录 revealed predictions。
10. ESPN 失败时能 fallback 到 worldcup26 或 seed。
11. 没有 API key 或 Filecoin private key 时，app 仍能用 demo mode 完成主流程。
12. Demo mode 必须清楚标记。
13. Real Synapse adapter 存在，并在 README 中说明。
14. 桌面和移动端布局可用，无明显错位或横向溢出。
15. `bun run build` 通过，浏览器无阻断型 console error。

## 7. 最终交付物

- 本地可运行应用。
- 可部署静态站点。
- GitHub public repo。
- Live demo 链接。
- Screenshot。
- Demo video。
- README。
- SUBMISSION.md。
- AI_BUILD_LOG.md。
- Public X post。
- Loops submission。

## 8. 完成标准

完成时，评委应该能一眼看懂：

- 这是一个世界杯 AI agent 产品。
- 它不是普通预测表单。
- 它有完整的赛前封存、赛后揭晓、评分和记忆闭环。
- Filecoin 是 proof 和 memory 机制的一部分。
- Demo mode 很清楚，real Synapse adapter 也存在。

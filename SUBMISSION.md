# Kickoff Lock Agent - 新版提交文案与 Demo 脚本

## 一句话

Kickoff Lock Agent 是一个面向世界杯的预测证明产品：用户在开球前锁定比分、晋级路径或玩法判断，系统用实时比赛数据和可验证 proof capsule 把预测变成赛后可追溯、可分享、可排名的链上记忆。

## 报名表短文案

World Cup predictions usually disappear into screenshots and chat history. Kickoff Lock Agent turns every call into a timestamped, data-backed proof capsule: pick a match, let the agent reason over fixtures, odds and context, lock the prediction before kickoff, then reveal and score it after the result is known. The product adds match intelligence, multi-mode gameplay, proof verification, memory wall, account readiness and shareable cards so fans can compete on trust instead of hindsight.

## 报名表中文主文案

Kickoff Lock Agent 把世界杯预测从“赛前随口一说”升级成“赛后可验证的个人战绩”。用户选择一场比赛后，Agent 会结合赛程、队伍信息、赔率信号和上下文生成预测理由；一旦锁定，预测内容会进入只读 proof capsule，展示 hash、timestamp、CID / PieceCID、数据来源、封存状态和赛后评分。

这版已经不是 MVP：产品包含实时比赛看板、数据源健康雷达、预测锁定流程、Verify Proof 页面、Memory Wall、账号/云同步准备、世界杯多玩法模式，以及面向生产环境的验收证据。API-Football、The Odds API、公开足球数据源和 Supabase 配置已经接入到生产检查体系中；Filecoin / Synapse 封存路径也被设计成可替换的真实上传适配器，并用 UI 和脚本把“哪些已经完成、哪些需要生产密钥或部署”清楚呈现出来。

我们认为它适合世界杯场景的原因很直接：世界杯有天然的赛前承诺、赛后争议、社交传播和排名需求。Kickoff Lock Agent 不只是做一个预测小游戏，而是做一个可信的球迷战绩层，让每一次大胆判断都能被保存、验证、复盘和分享。

## 英文提交文案

Kickoff Lock Agent is a trust layer for World Cup prediction games. Fans make a call before kickoff, lock it into a read-only proof capsule, and reveal it after the final whistle. Each capsule carries the prediction, reasoning, timestamp, hash, provider metadata, CID-style proof fields, scoring outcome and share-ready memory.

The product combines three things judges can evaluate quickly: live match intelligence, a clear lock-and-reveal workflow, and production readiness evidence. The app now includes a match board, provider health checks, odds/data enrichment, multiple World Cup game modes, proof verification, memory wall, account/cloud readiness, share cards and automated acceptance evidence. It is built to fail transparently: when a provider, Filecoin seal endpoint or cloud sync path is not fully available, the UI marks the gap instead of pretending the proof is complete.

For the World Cup, this creates a useful primitive: predictions become durable artifacts. Friends, creators, communities and sponsors can run prediction leagues where every locked call is timestamped, scored, and remembered.

## 推荐提交字段

- Project name: Kickoff Lock Agent
- Tagline: Lock World Cup predictions before kickoff. Prove them after the final whistle.
- Category: AI Agents / Sports / Consumer Social / Filecoin Proofs
- Live demo: https://olive8882-1996.github.io/kickoff-lock-agent/
- Repository: https://github.com/olive8882-1996/kickoff-lock-agent
- Demo video: https://olive8882-1996.github.io/kickoff-lock-agent/kickoff-lock-demo.webm
- Screenshot: https://olive8882-1996.github.io/kickoff-lock-agent/kickoff-lock-screenshot.png
- Public X post: https://x.com/martin_moh53075/status/2075114399623491949

## 评委视角亮点

- 不是单页 MVP：已覆盖预测、锁定、验证、复盘、分享、排行榜/账号准备、多玩法和生产验收。
- 真实世界杯语境：赛程、赔率、队伍、玩法和赛后评分都围绕“开球前承诺”设计。
- Proof-first 体验：锁定后不可编辑，hash、timestamp、CID-style 字段、proof 状态和导入验证入口都直接展示。
- 数据源透明：API-Football、The Odds API、公开数据源、fixture fallback 与 provider readiness 都有 UI 和证据文件。
- 可扩展商业场景：适合球迷竞猜、KOL 预测战绩、品牌活动、社区排行榜和赛后内容传播。
- 诚实的生产口径：未完成的生产部署、Filecoin seal endpoint 或云端 schema 会在验收雷达中显示，不做假完成。

## 90 秒 Demo 视频脚本

0-10 秒：开场

旁白：这是 Kickoff Lock Agent，一个为世界杯预测设计的 AI proof 产品。它解决的问题很简单：赛前预测如何在赛后还能被信任？

画面：展示首页首屏、世界杯视觉、核心指标和 Lock before kickoff 的产品主张。

10-25 秒：实时比赛与数据源

旁白：用户先进入 Match Board。这里不是静态样例，而是把公开赛程、API-Football、The Odds API 和本地 fallback 串成一个可观测的数据层。每个 provider 的状态都会被展示出来。

画面：切到 Match Board，滚动展示比赛卡片、数据健康、provider readiness。

25-45 秒：锁定预测

旁白：选择比赛后，Agent 生成比分判断、信心、理由和风险信号。点击 lock 后，预测变成只读 capsule，赛后不能再改口。

画面：展示预测卡、proof capsule、hash、timestamp、CID-style 字段和锁定状态。

45-60 秒：世界杯玩法

旁白：除了单场比分，产品还有 knockout path、parlay、upset watch、group path、penalty pressure 等玩法。世界杯不是一场比赛，而是一整套可封存的判断。

画面：切到 Game Modes，展示多玩法卡片和 bracket/path 证明。

60-75 秒：验证与复盘

旁白：赛后用户可以导入 proof 或输入结果，系统会解释预测命中程度，并把结果沉淀到 Memory Wall。

画面：切到 Verify Proof，再切到 Memory Wall，展示验证入口和复盘记录。

75-90 秒：生产就绪

旁白：最后是 Account 和生产验收。Supabase、数据源、Filecoin seal、分享图和自动化验收都被拆成清晰的 readiness 项。它不是只会演示的原型，而是一个正在走向真实上线的产品。

画面：切到 Account，展示 readiness radar / evidence 区域，最后回到 Match Board 或首页收尾。

## 30 秒短视频脚本

旁白：Kickoff Lock Agent turns World Cup predictions into proof. Pick a match, let the agent reason with fixture and odds data, then lock your call before kickoff. After the match, reveal the result, verify the proof, score the prediction and share the memory. It is a prediction game, a trust layer and a fan identity primitive in one product.

画面：首屏 -> Match Board -> proof capsule -> Game Modes -> Verify Proof -> Memory Wall。

## 录制检查清单

- 首屏能看到品牌、世界杯视觉和核心主张。
- Match Board 能看到比赛数据、provider 状态和真实数据源配置。
- Proof capsule 能看到 lock、hash、timestamp、CID-style 字段和只读状态。
- Game Modes 至少展示 4 个世界杯玩法。
- Verify Proof 与 Memory Wall 都出现在视频里。
- Account / readiness 区域能证明项目有生产验收意识。
- 视频长度控制在 60-100 秒，节奏清楚，不需要展示密钥。

## 需要诚实说明的边界

当前本地构建已经接入真实 Supabase URL、API-Football key 和 The Odds API key，并通过数据源检查。公开部署前，浏览器端数据密钥应迁移到 Cloudflare Pages Functions / data proxy，Filecoin Synapse 也应使用服务端 seal endpoint 承接真实私钥与上传 token。提交文案可以强调“真实数据源接入”和“Filecoin/Synapse-ready proof pipeline”，不要宣称所有公开环境都已经完成真实链上封存。

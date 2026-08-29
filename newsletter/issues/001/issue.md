# Tech Bridge Skill Letter 001

## 把 Agent 从「会聊天」升级成「会交付」的 8 个 Skills

**本期版本：** 2026-08-28
**适合：** 已经在使用 Claude Code、Codex 或其他 Agent 工具，希望进入真实交付阶段的人。
**不适合：** 只想收藏工具名单，或还没有安装任何 Agent 工具的初学者。

---

这不是一份「最热 Skills 排行榜」。

排行榜告诉你什么正在流行，但不告诉你：

- 它会不会在不该触发时占用大量上下文；
- 它会不会执行未声明的脚本、读取凭证或发送数据；
- 它是否真的改善交付，还是只增加一套仪式；
- 它在 Claude Code、Codex 和其他容器中是否真的兼容。

我从官方仓库、主流 Skill 市场和实际工作流里筛了一轮，最后只留下 8 个。它们不是平行工具，而是一条交付链：

> **发现 → 审计 → 创建 → 设计 → 执行 → 调试 → 验证 → 业务落地**

## 先看结论

| 优先级 | Skill | 作用 | 本期结论 |
| --- | --- | --- | --- |
| P0 | skill-supply-chain-audit | 安装前检查供应链风险 | 本期必装，已打包 |
| P0 | systematic-debugging | 禁止没有根因的猜测式修复 | 强烈推荐 |
| P0 | verification-before-completion | 用现场证据代替「应该完成了」 | 强烈推荐 |
| P1 | find-skills | 降低重复搜索与重造成本 | 推荐 |
| P1 | frontend-design | 降低模板化 AI 页面 | 推荐 |
| P1 | agent-browser | 把代码验证推进到真实浏览器 | 有条件推荐 |
| P2 | skill-creator | 把重复工作流固化成 Skill | 高阶推荐 |
| P2 | lark-base | 让 Agent 进入真实经营数据 | 中国业务场景推荐 |

## 01. find-skills

**来源：** Vercel Labs
**买手结论：** 推荐，但搜索结果不是安全背书。
**最佳触发：** 你准备第三次手写同一类工作流时。

它会先查 skills.sh 及官方源，再按任务、来源、维护活跃度和仓库信号缩小候选范围。真正价值不是帮你多装 Skill，而是减少从零搜索的成本。

```bash
npx skills add https://github.com/vercel-labs/skills --skill find-skills
```

**我会怎么用：** 先让它找 5 个候选，再用本期的 `skill-supply-chain-audit` 逐个审计，而不是直接批量安装。

## 02. skill-supply-chain-audit

**来源：** Tech Bridge 原创
**买手结论：** 本期必装。
**本期交付：** 完整 Skill 已放入 Skill Pack，可直接安装。

这是为本期专门制作的「Skill 入库门禁」，检查来源与固定版本、触发范围、脚本、网络、凭证、删除、对外写入、许可证和兼容性。

默认只做静态检查，不执行刚下载的安装器、脚本或命令。输出不是一句「看起来没问题」，而是：

> **PASS / CONDITIONAL / REJECT + 风险分数 + 数据边界 + 修复清单**

## 03. skill-creator

**来源：** Anthropic
**买手结论：** 高阶推荐，不要为一次性任务造 Skill。
**最佳触发：** 某个流程已经稳定重复三次，而且每次都有可检查的输出。

```bash
npx skills add https://github.com/anthropics/skills --skill skill-creator
```

它不只生成说明文件，还包含测试用例、有 Skill / 无 Skill 对照、表现评分和触发描述优化。

**风险边界：** 附带 Python 评估脚本。执行前应先审计依赖、输出目录与是否上传数据。

## 04. frontend-design

**来源：** Anthropic
**买手结论：** 推荐，它解决「视觉方向」，不代替用户测试。
**最佳触发：** 开始写前端代码之前，而不是页面已经写完之后。

```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
```

它要求 Agent 先建立视觉方向、字体、色彩、构图和唯一记忆点，再写界面，能显著减少「又一个 AI SaaS 模板」。

**风险边界：** 它擅长美术指导，不等于自动完成可用性、访问性、性能和真实业务验收。

## 05. agent-browser

**来源：** Vercel Labs
**买手结论：** 有条件推荐。价值很高，权限也很高。
**最佳触发：** 你已有本地或测试环境，需要验证真实用户路径时。

```bash
npx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser
npm install -g agent-browser
agent-browser install
```

它让 Agent 真正导航、点击、填表、截图和检查网页，把「代码看起来对」推进到「真实浏览器可用」。

**风险边界：** 它可能接触会话、Cookie、表单与网页数据。付款、发布、删除、对外消息和敏感账号操作前必须停下确认。

## 06. systematic-debugging

**来源：** obra/superpowers
**买手结论：** 强烈推荐。
**最佳触发：** 测试失败、线上异常、依赖冲突或「刚才还能用」时。

```bash
npx skills add https://github.com/obra/superpowers --skill systematic-debugging
```

它强制 Agent 在修改代码前先复现、收集证据、追踪数据流、提出单一假设，再用最小变更验证。

**它不会让代码自动变聪明，但会阻止 Agent 在没有根因时连续猜测。**

## 07. verification-before-completion

**来源：** obra/superpowers
**买手结论：** 强烈推荐，也是最容易被忽略的一个。
**最佳触发：** Agent 准备说「完成」、「已修复」、「已推送」之前。

```bash
npx skills add https://github.com/obra/superpowers --skill verification-before-completion
```

它要求 Agent 先找到能证明结论的命令或后台状态，现场执行并读取完整输出，才能宣布完成。

**风险边界：** Skill 不能替你定义「什么算完成」。提交代码、生产可访问、支付到账、内容送达，是四种不同的证据。

## 08. lark-base

**来源：** 飞书官方 lark-cli Skill 包
**买手结论：** 中国业务场景推荐，对外写入必须读回。
**最佳触发：** 你希望 Agent 不只出文字，而是真正维护客户、商机、订单、收支、项目和自动化。

它能让 Agent 在飞书多维表格中维护业务数据，并进一步组装表单、仪表盘和 Workflow。

**风险边界：** 这是本期唯一一个默认可写入外部业务数据的 Skill。写入、删除、权限和 Workflow 操作前，先读取真实结构并确认目标；完成后必须读回记录。

---

## 三套可直接复用的组合

### A. 做一个真正可用的新功能

`find-skills → skill-supply-chain-audit → frontend-design → agent-browser → verification-before-completion`

适合官网、SaaS、内部工具和交互原型。关键不是「写完代码」，而是真实浏览器中的任务路径已通过。

### B. 修一个总是反复出现的 Bug

`systematic-debugging → verification-before-completion`

先给根因证据，再给最小修复，最后给现场回归结果。这两个 Skill 一起用，比多装五个生成代码的 Skill 更有价值。

### C. 让 Agent 真正进入业务

`skill-supply-chain-audit → lark-base → verification-before-completion`

先审计飞书的权限和数据边界，再执行写入，最后读回记录。这是「生成一段建议」与「更新了经营系统」之间的区别。

## 45 分钟安装顺序

1. **0–10 分钟：** 安装本期 Skill Pack 里的 `skill-supply-chain-audit`。
2. **10–20 分钟：** 用它审计 `systematic-debugging` 和 `verification-before-completion`。
3. **20–30 分钟：** 安装这两个底线 Skill，并选一个真实 Bug 测试。
4. **30–40 分钟：** 按当前任务三选一：`frontend-design` / `agent-browser` / `lark-base`。
5. **40–45 分钟：** 删掉不会在本月使用的候选，并记录已安装 Skill 的版本。

## 7 天实战挑战

- **Day 1：** 列出当前 Agent 工作台里的全部 Skills。
- **Day 2：** 对权限最高的 3 个做静态审计。
- **Day 3：** 用 systematic-debugging 复现一个旧 Bug。
- **Day 4：** 为这个 Bug 写清楚验收证据。
- **Day 5：** 用 agent-browser 或其他真实环境工具跑一次用户路径。
- **Day 6：** 把一个已稳定重复的流程写成 Skill 初稿。
- **Day 7：** 删掉一个低频、高权限、无验收标准的 Skill。

## 本期最终判断

成熟的 Agent 工作台不是 Skill 越多越好。它至少需要四个底层能力：

- 知道去哪里找能力；
- 知道安装前如何审计；
- 知道出问题时如何找根因；
- 知道什么证据才算真正完成。

买手服务的价值，不是把互联网再复制一遍。而是帮你省掉搜索、试错和取舍的时间，只把那些真正改变交付质量的能力留下来。

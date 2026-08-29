# Issue 001 Sources and Audit Notes

Audit date: 2026-08-28

| Skill | Source | Pinned commit / version | License | Static validation | Runtime status | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| find-skills | https://github.com/vercel-labs/skills | 435076e78988e1e6ec40d00b0b1d76bdbbc5419a | MIT | Pass | Install command not executed in subscriber environment | Recommend |
| skill-supply-chain-audit | Tech Bridge original | Issue 001 package | Tech Bridge subscriber license | Pass | Validator pass | Recommend |
| skill-creator | https://github.com/anthropics/skills | 3b3fad96af16a10759d930941b4520ba0c40edae | Apache-2.0 component license | Pass | Python eval scripts not executed | Advanced / conditional |
| frontend-design | https://github.com/anthropics/skills | 3b3fad96af16a10759d930941b4520ba0c40edae | Apache-2.0 component license | Pass | Instruction-only; visual result depends on host agent | Recommend |
| agent-browser | https://github.com/vercel-labs/agent-browser | fbd046c23a2c1156891bda294aaaee715c23b3f1 | Apache-2.0 | Extra hidden frontmatter field fails local validator | CLI not installed in audit environment | Conditional |
| systematic-debugging | https://github.com/obra/superpowers | b36e0829c6d0140e93cfef2ca599b1b07d4a7797 | MIT | Pass | Helper shell script not executed | Recommend |
| verification-before-completion | https://github.com/obra/superpowers | b36e0829c6d0140e93cfef2ca599b1b07d4a7797 | MIT | Pass | Behavior depends on project acceptance criteria | Recommend |
| lark-base | Feishu official lark-cli Skill bundle | local version 1.2.2 | Not redistributed in this pack | Extra version frontmatter field fails local validator | lark-cli installed; user identity needs refresh | Conditional / business use |

## Distribution decision

- External Skill source files are not copied into the subscriber package.
- The issue provides official source links, pinned versions, install commands, buyer notes, and test boundaries.
- Only the original skill-supply-chain-audit Skill is distributed directly.
- Re-audit a source before replacing a pinned commit with a newer version.

## Security note

Popularity and scanner badges are discovery signals, not proof of safety. agent-browser can access browser sessions and web data; lark-base can write external business data; skill-creator includes executable Python tooling. These three require explicit dependency and permission review.

# Tech Bridge Skill Pack 001

This pack accompanies Tech Bridge Skill Letter 001.

## Included directly

- skill-supply-chain-audit — Tech Bridge original Skill for provenance, script, permission, data-flow, license, and compatibility review before installation.

## Curated external Skills

External Skills are not copied into this pack. Install only what you need from canonical sources after reviewing the issue audit notes.

    npx skills add https://github.com/vercel-labs/skills --skill find-skills
    npx skills add https://github.com/anthropics/skills --skill skill-creator
    npx skills add https://github.com/anthropics/skills --skill frontend-design
    npx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser
    npx skills add https://github.com/obra/superpowers --skill systematic-debugging
    npx skills add https://github.com/obra/superpowers --skill verification-before-completion

lark-base is distributed through Feishu's official lark-cli Skill bundle and requires Feishu authorization.

## Recommended order

1. Install skill-supply-chain-audit from this pack.
2. Audit every external Skill before installation.
3. Establish debugging and verification guardrails.
4. Add design, browser, and business Skills only when a real task requires them.
5. Create new Skills only after a workflow repeats often enough to justify maintenance.

## Compatibility

- Claude Code: standard SKILL.md packages are supported; some sources also offer plugins.
- Codex: install in the user or project Skill directory supported by the current Codex host.
- Other agents: verify discovery path, allowed frontmatter fields, and tool permissions before assuming compatibility.

## Important

Installing a Skill is equivalent to trusting a dependency that can influence an agent's decisions. Read its instructions and scripts before use.

# Skill Supply Chain Risk Rubric

## Verdicts

### PASS

No unresolved high-impact behavior was found. The package purpose, permissions, scripts, source, and license are coherent. Installation may proceed with the documented dependencies and normal approval boundaries.

### CONDITIONAL

The Skill can be useful, but installation should wait until named risks are accepted or remediated. Typical reasons include broad permissions, optional telemetry, unpinned downloads, tool-specific assumptions, missing runtime proof, or scripts that require explicit review.

### REJECT

Do not install in the current form. Use when the package hides or misrepresents behavior, exfiltrates data, requests unnecessary credential access, disables approval controls, executes opaque payloads, has destructive defaults, or has unacceptable provenance/licensing risk.

## Severity

| Severity | Meaning |
| --- | --- |
| Critical | Credible path to secret theft, arbitrary execution outside the stated purpose, destructive behavior, or approval bypass. |
| High | Unnecessary sensitive access, hidden uploads, persistent configuration changes, or material behavior not disclosed by the trigger. |
| Medium | Broad permissions, unpinned dependencies, unsafe defaults, weak validation, unclear telemetry, or significant compatibility gaps. |
| Low | Documentation, maintainability, naming, trigger precision, or minor portability problems. |

## Scorecard

Score each dimension from 0 to 2.

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Provenance | Unknown or misleading | Known but weakly pinned | Canonical and pinned |
| License | Missing/incompatible | Ambiguous by component | Clear and compatible |
| Trigger fidelity | Misleading/broad | Mostly aligned | Precise and aligned |
| Executable transparency | Opaque | Partially explained | Fully inventoried |
| Permission minimization | Excessive | Some avoidable access | Necessary and scoped |
| Data boundary | Hidden/exfiltrating | Partially documented | Explicit and minimal |
| Dependency hygiene | Unpinned/unsafe | Mixed | Pinned and reproducible |
| Operational safety | Destructive/unbounded | Guardrails incomplete | Bounded and approval-aware |
| Compatibility | Misrepresented | Limited proof | Clearly documented/tested |
| Maintenance | Abandoned/unknown | Irregular | Current and traceable |

Interpretation:

- `17–20`: PASS, absent any Critical/High finding.
- `11–16`: CONDITIONAL.
- `0–10`: REJECT or substantial remediation.
- Any unresolved Critical finding forces REJECT.

## Report format

```markdown
# Skill audit: <name>

## Verdict
PASS | CONDITIONAL | REJECT

## Executive summary
<What it does, trust boundary, and decision.>

## Findings
### [Severity] Finding title
- Evidence: `path:line`
- Impact:
- Required action:

## Permissions and data flow
- Reads:
- Writes:
- Executes:
- Network destinations:
- Sensitive data exposure:

## Provenance
- Source:
- Commit/tag:
- License:
- Last maintained:

## Compatibility
- Claude Code:
- Codex:
- Other runtimes:
- Runtime proof performed:

## Score
<N>/20

## Unverified areas
- ...
```

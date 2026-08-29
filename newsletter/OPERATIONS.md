# Tech Bridge Skill Letter Operations

## Product promise

- One-time annual purchase, 365 days, no auto-renewal.
- Public price: CNY 999. Founding offer: CNY 666.
- At least one issue per month and at least 12 issues per service term.
- Each issue contains 5-10 curated Skills plus buyer notes, audit boundaries, combinations, and an original pack when useful.
- The community is for advanced Skill composition and production practice. It is not basic installation support, private consulting, or custom development.

## Monthly production cycle

1. Collect candidates only from canonical repositories and official marketplaces.
2. Pin the audited commit or release. Record the license and maintenance date.
3. Run static review before any script or installer is executed.
4. Test only the candidates whose permissions and dependencies are acceptable.
5. Select a coherent workflow, not a flat list of popular tools.
6. Write `issue.md`, `sources.md`, `manifest.json`, `email.html`, and the original Skill Pack.
7. Validate links, JSON, Skill frontmatter, archive contents, HTML rendering, and unsubscribe handling.
8. Upload the ZIP to the private `SKILL_PACKS` Workers KV namespace. Move to R2 when an issue exceeds the practical KV artifact size.
9. Send a Resend test to an internal address and verify the actual attachment/download.
10. Broadcast to the active Skill Letter segment only after the test receipt is confirmed.

## Payment delivery

- Stripe Checkout uses the internal plan key `skill_email_365` for backward compatibility.
- New orders carry `offer=founding_666` and `first_issue=001` metadata.
- Stripe webhook records the subscriber, revenue, Feishu notification, Resend contact/segment, and first-issue delivery. The Worker reuses or creates the `Tech Bridge AI Skills Active` segment and caches its ID in KV.
- The private ZIP endpoint requires a paid Stripe session and an HMAC token before reading the KV object.
- WeCom uses the price-independent rule key `website_skill_letter_annual` and tag `AI Skills年度订阅`.

## Issue 001 release object

```text
issue-001/techbridge-skill-pack-001.zip
```

The ZIP must include:

- `issue.md`
- `sources.md`
- `manifest.json`
- `START-HERE.md`
- `skill-supply-chain-audit/`

Do not include API keys, subscriber data, local browser state, research clones, or external Skill source code.

## Completion evidence

An issue is not complete when files merely exist locally. Completion requires:

1. ZIP hash and archive listing recorded.
2. Private KV object uploaded and readable through the paid download endpoint.
3. Resend test email delivered with working attachment/link.
4. Stripe test or controlled live payment returns to the success page.
5. Supabase, Feishu revenue, Feishu notification, Resend segment, and WeCom attribution are read back.

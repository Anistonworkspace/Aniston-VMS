---
name: design-review
description: Adversarial review of the latest system-design ADR. Runs agent-code-review + agent-logic-analyzer + agent-security against the ADR + PRD + ERD and reports gaps BEFORE any code lands.
---

# /design-review — Adversarial review of the system design

Takes the latest `memory/decisions/ADR-*-system-design-*.md` and hands it to
three review agents in parallel. Reports gaps categorized by severity.

Prerequisites: at least one system-design ADR exists. Run `/design-first`
first if it doesn't.

---

## Usage

```
/design-review                     # reviews the newest ADR-*-system-design-*.md
/design-review ADR-0009            # reviews a specific ADR
```

---

## Flow

1. **Locate the target ADR.** Newest by number, or the one named.
2. **Load associated PRD + ERD** — cross-file consistency check; if the PRD's
   Screens section conflicts with the established visual language in
   `docs/04-uiux-brief.md` / `docs/actual-design.png` (soft-SaaS tokens —
   rounded white cards, slate sidebar, status-pill semantics), flag it as a
   LOW finding rather than silently inventing a new look.
3. **Spawn 3 reviewers in parallel** (via the `Workflow` tool if available,
   sequentially otherwise):
   - `agent-code-review` — reads the API contract table + state machines,
     flags any that violate MVC / envelope / middleware order rules.
   - `agent-logic-analyzer` — enum completeness, self-approval gaps, race
     conditions in workflows, missing rollback states.
   - `agent-security` — RBAC matrix coverage, sensitive-field encryption,
     input validation gaps, secret handling.
4. **Aggregate findings** into a single report with unique IDs.
5. **Write review record** to
   `memory/decisions/ADR-<N>-design-review-<date>.md` — so you have an audit
   trail of what was flagged and how it was addressed.

---

## Output format

```
## Design Review — ADR-0009 (FleetWatch)

### CRITICAL
- [SEC-001] camera.credentials.write permission has no encrypted-field discipline
  Location: ADR-0009 § API contract, row "PATCH /api/cameras/:id/credentials"
  Fix: add `rtspPasswordEncrypted` to the Camera entity in ERD; call out AES-256-GCM in NFRs.

### HIGH
- [LOGIC-001] Incident state machine has ESCALATED but no RESOLVED handler in Q4
  Location: ADR-0009 § Core workflows
  Fix: add RESOLVED as terminal state; explain operator-side acknowledgment path.

### MEDIUM
- [REVIEW-001] RBAC matrix row "cameras.publish" doesn't exist in "actions" enum
  Location: ADR-0009 § RBAC matrix
  Fix: either add a "publish" action or model publish as a cameras.update mutation with a status field.

### LOW
- [DOC-001] PRD success metric #3 ("good coverage") is not numeric
  Location: docs/prd-fleetwatch.md line 22
  Fix: name a specific metric — mean time-to-acknowledge ≤ 5 min, or 95%+ of cameras healthy at any time.

### Score: 7.5/10 — solid but 1 CRITICAL blocker; fix before /build-loop.
```

---

## Rules the review enforces

- Every finding has a unique ID (`SEC-NNN`, `LOGIC-NNN`, `REVIEW-NNN`, `DOC-NNN`).
- Every finding has: location, description, fix.
- CRITICAL blockers cannot be ignored — running `/build-loop` after a
  design-review with unresolved CRITICAL findings is refused.
- HIGH + MEDIUM are warnings — user can proceed but should note them in a
  follow-up ADR.

---

## When to use

- **After every `/design-first` run.** Non-negotiable if the design will
  drive `/build-loop`.
- **After major ADR revisions** — every time the design shifts, re-review.
- **Before onboarding a fresher** — a reviewed design is your onboarding doc.

---

## Rules to enforce

- `.claude/rules/rule-audit-standards.md` — every finding follows the
  ID + severity + location + fix format
- `.claude/rules/rule-memory-system.md` — the review record lands in
  `memory/decisions/ADR-<N>-design-review-<date>.md`

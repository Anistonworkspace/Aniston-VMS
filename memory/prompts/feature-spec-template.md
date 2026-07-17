# Prompt Template — Feature Specification

Use this before building any significant new feature.  
Fill it out first, then paste into Claude to get a plan.

---

## Prompt to paste

```
/start

I want to build a new feature. Here is the complete spec:

**Feature name:** <name>

**User story:**
As a <role>, I want <feature> so that <benefit>.

**Acceptance criteria:**
- [ ] <criterion 1>
- [ ] <criterion 2>
- [ ] <criterion 3>

**Roles and permissions:**
| Action | SUPER_ADMIN | ADMIN | MANAGER | EMPLOYEE |
|--------|-------------|-------|---------|----------|
| View   | ✅ | ✅ | ✅ own team | ✅ own only |
| Create | ✅ | ✅ | ❌ | ❌ |
| Edit   | ✅ | ✅ | ❌ | ❌ |
| Delete | ✅ | ✅ | ❌ | ❌ |
| Approve| ✅ | ✅ | ✅ own team | ❌ |

**Status / workflow (if applicable):**
States: DRAFT → SUBMITTED → APPROVED / REJECTED → CLOSED
Transitions:
- DRAFT → SUBMITTED: triggered by EMPLOYEE (submit button)
- SUBMITTED → APPROVED: triggered by MANAGER (approve button)
- SUBMITTED → REJECTED: triggered by MANAGER (reject button)
- APPROVED / REJECTED → CLOSED: triggered by ADMIN (archive button)
Terminal states: CLOSED

**API endpoints:**
- GET    /api/<resource>        — list, paginated, ?status=&page=&limit=
- POST   /api/<resource>        — create
- GET    /api/<resource>/:id    — get one
- PATCH  /api/<resource>/:id    — update (DRAFT only)
- DELETE /api/<resource>/:id    — soft delete (ADMIN only)
- POST   /api/<resource>/:id/submit   — DRAFT → SUBMITTED
- POST   /api/<resource>/:id/approve  — SUBMITTED → APPROVED
- POST   /api/<resource>/:id/reject   — SUBMITTED → REJECTED

**Database model:**
<ModelName> fields:
- id, organizationId, createdAt, updatedAt, deletedAt (standard)
- <field1>: <type>
- <field2>: <type>
- status: <ENUM_NAME> @default(DRAFT)

**Frontend:**
- List page at /dashboard/<resource>
- Filters: status dropdown, date range picker
- Create button → modal form
- Detail view → status badge + action buttons based on role + status
- Real-time updates via socket (no page refresh needed)

**Notifications:**
- On SUBMITTED: notify MANAGER via socket + email
- On APPROVED: notify EMPLOYEE via socket + email
- On REJECTED: notify EMPLOYEE via socket + email with reason

Please write a plan in memory/plans/_active/ and wait for my approval before writing code.
```

---

## Tips for a good spec

- **Be specific about who can do what** — vague RBAC leads to security bugs
- **Define ALL status values upfront** — adding states later breaks the state machine
- **Name the terminal states** — these are irreversible by design
- **Describe the notification** — who gets notified, when, and what message

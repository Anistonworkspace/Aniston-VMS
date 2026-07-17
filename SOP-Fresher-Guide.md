> **⚠️ LEGACY WALKTHROUGH.** This SOP predates the generic-skeleton reframe and uses a full example
> app to teach the workflow. The mechanics (design-first → build-loop → verify) still apply, but the
> boilerplate now ships no app code. For the current, accurate map start at
> [`.claude/GUIDE.md`](.claude/GUIDE.md) and [`docs/NEW-MACHINE-SETUP.md`](docs/NEW-MACHINE-SETUP.md).

> **FOR CLAUDE WEB (claude.ai):** You are receiving this file to generate a clean, formatted PDF-ready SOP document for a fresher developer. Format it with clear headings, numbered steps, tables, and code blocks. Do not summarize — output the full document exactly as written below, formatted for professional PDF export. Title: "SOP — Building Applications with the Aniston Technologies Boilerplate + Claude Code"

---

# Standard Operating Procedure
## Building Applications with the Aniston Technologies Boilerplate + Claude Code

**Version:** 2.0  
**Date:** 18 May 2026  
**Prepared by:** Aniston Technologies LLP  
**Audience:** Fresher Developers — Day 1 Onboarding  

---

## Table of Contents

1. [What Is This Document?](#1-what-is-this-document)
2. [How the Boilerplate Works — Read This First](#2-how-the-boilerplate-works--read-this-first)
3. [What Is Already Built For You](#3-what-is-already-built-for-you)
4. [Tools to Install Before Anything Else](#4-tools-to-install-before-anything-else)
5. [Project Folder Map](#5-project-folder-map)
6. [STEP-BY-STEP: First Time Setup (Do Once)](#6-step-by-step-first-time-setup-do-once)
7. [STEP-BY-STEP: Start Work Every Day](#7-step-by-step-start-work-every-day)
8. [STEP-BY-STEP: Build a New Feature](#8-step-by-step-build-a-new-feature)
9. [STEP-BY-STEP: Fix a Bug](#9-step-by-step-fix-a-bug)
10. [STEP-BY-STEP: End of Day Wrap-Up](#10-step-by-step-end-of-day-wrap-up)
11. [How Claude Code Works in This Project](#11-how-claude-code-works-in-this-project)
12. [All Slash Commands — What Each One Does](#12-all-slash-commands--what-each-one-does)
13. [The Tech Stack Explained Simply](#13-the-tech-stack-explained-simply)
14. [The 3 User Roles](#14-the-3-user-roles)
15. [The 6 Database Models Already Built](#15-the-6-database-models-already-built)
16. [Backend Rules — Never Break These](#16-backend-rules--never-break-these)
17. [Frontend Rules — Never Break These](#17-frontend-rules--never-break-these)
18. [Database Rules — Never Break These](#18-database-rules--never-break-these)
19. [How the Memory System Works](#19-how-the-memory-system-works)
20. [Prompt Templates — Copy and Paste These](#20-prompt-templates--copy-and-paste-these)
21. [Common Mistakes to Avoid](#21-common-mistakes-to-avoid)
22. [Quick Reference Card](#22-quick-reference-card)

---

## 1. What Is This Document?

This SOP is your complete guide for taking the Aniston Technologies boilerplate and building a real production application on top of it using **Claude Code** as your AI coding assistant.

**How to use this document:**
- Read Section 2 and 3 first — understand what you are getting.
- Do Section 6 once to set up your machine.
- Follow Sections 7–10 every single day.
- Keep this document open on a second screen while working.

Do not skip any section. Do not improvise until you have followed this document at least 5 times.

---

## 2. How the Boilerplate Works — Read This First

Think of the boilerplate as a **fully built application skeleton**. It is like the frame and foundation of a building — the structure, wiring, and plumbing are already done. Your job is to add the rooms (features) on top.

### How the three parts connect

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER / APP                         │
│                                                             │
│   React 18 Frontend (port 5173)                             │
│   - Shows the UI                                            │
│   - Calls the backend API using RTK Query                   │
│   - Updates in real-time via Socket.io                      │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTP + WebSocket
┌────────────────────────▼────────────────────────────────────┐
│   Node.js + Express Backend (port 4000)                     │
│   - Handles all API requests                                │
│   - Checks authentication and permissions                   │
│   - Runs business logic                                     │
│   - Sends emails via background queues                      │
│   - Pushes real-time events via Socket.io                   │
└────────────────────────┬────────────────────────────────────┘
                         │  Prisma ORM
┌────────────────────────▼────────────────────────────────────┐
│   PostgreSQL Database + Redis Cache                         │
│   - PostgreSQL stores all your data permanently             │
│   - Redis stores sessions, job queues, and cache            │
│   - Both run in Docker on your local machine                │
└─────────────────────────────────────────────────────────────┘
```

### What happens when a user does something

Every user action follows this exact path — always:

```
1. User clicks a button in the browser
2. React component calls an RTK Query hook
3. RTK Query sends an HTTP request to the backend API
4. Express router receives the request
5. authenticate middleware verifies the JWT token
6. requirePermission middleware checks the user's role
7. validateRequest middleware checks the request data
8. Controller parses the request and calls the service
9. Service runs the business logic
10. Prisma sends a query to PostgreSQL
11. Data comes back up the chain
12. Socket.io emits a real-time event if needed
13. Frontend cache is invalidated so the UI updates
14. User sees the result without a page refresh
```

This path is the same for every single feature. When you build something new, you are filling in steps 4–12 for your specific feature.

### How Claude Code fits in

Claude Code is an AI assistant that lives inside your VS Code terminal. It has read the project's rules, conventions, and memory. When you describe what you want to build, it knows:
- What files to create
- What code patterns to follow
- Which security rules to apply
- Where to register the new code

You tell it what to build in plain English. It writes the code. You test it.

---

## 3. What Is Already Built For You

Do not build any of these again. They exist and work.

| Feature | Where it lives | What it does |
|---|---|---|
| User registration | `backend/src/modules/auth/` | New user signs up with email + password |
| Login | `backend/src/modules/auth/` | Validates credentials, returns JWT access + refresh tokens |
| JWT authentication | `backend/src/middleware/auth.ts` | Every request checks the token automatically |
| Token refresh | `backend/src/modules/auth/` | Refreshes expired access tokens silently |
| Logout | `backend/src/modules/auth/` | Revokes the refresh token |
| Role-Based Access Control | `shared/src/permissions.ts` | 3 roles, each with defined permissions |
| Password hashing | Built into auth service | bcrypt with 12 rounds |
| AES-256-GCM encryption | `backend/src/utils/encryption.ts` | For sensitive fields like secret tokens |
| Audit logging | `backend/src/utils/auditLogger.ts` | Records every create/update/delete |
| File upload middleware | `backend/src/middleware/upload.ts` | Upload images, documents, PDFs |
| Email sending | `backend/src/services/email.ts` | Transactional emails via BullMQ queue |
| Background job queues | `backend/src/jobs/` | BullMQ workers for email + notifications |
| Real-time events | `backend/src/sockets/` | Socket.io with JWT auth, org rooms |
| Swagger API docs | Auto-generated | At http://localhost:4000/api/docs |
| PDF generation | `backend/src/utils/pdfGenerator.ts` | Generate PDF reports |
| Excel export | `backend/src/utils/excelExporter.ts` | Export data to Excel |
| Error handling | `backend/src/middleware/errorHandler.ts` | Catches all errors, safe responses |
| Rate limiting | `backend/src/middleware/rateLimiter.ts` | 50 req/15min auth, 100 req/min others |
| Dashboard page | `frontend/src/features/dashboard/` | Landing page after login |
| Login page | `frontend/src/features/auth/` | Glassmorphism UI, form validation |
| Auth state management | `frontend/src/features/auth/authSlice.ts` | Redux slice for user session |
| 401 auto-refresh | Built into RTK Query base | Silently refreshes token on 401 |
| Glassmorphism design system | `frontend/src/styles/globals.css` | Consistent UI across all pages |
| PWA (installable app) | Vite PWA plugin + `sw.ts` | Installs on Android/iOS home screen |
| Offline fallback page | `frontend/public/offline.html` | Shows when user has no internet |
| CI/CD pipeline | `.github/workflows/` | Auto test + deploy on push |
| Docker infrastructure | `docker/` | Postgres + Redis, one command start |

---

## 4. Tools to Install Before Anything Else

Install all of these in order. Do not skip any.

### Step 1 — Install Node.js

Go to https://nodejs.org and download Node.js version 20 or higher (LTS).

Verify it worked:
```bash
node --version
# Must show: v20.x.x or higher
```

### Step 2 — Install Docker Desktop

Go to https://www.docker.com/products/docker-desktop and install Docker Desktop.

Open Docker Desktop and make sure it is running (you will see the whale icon in your system tray).

Verify it worked:
```bash
docker --version
# Must show: Docker version ...
```

### Step 3 — Install Git

Go to https://git-scm.com and install Git.

```bash
git --version
# Must show: git version ...
```

### Step 4 — Install VS Code

Go to https://code.visualstudio.com and install VS Code.

After installing, open VS Code and install these extensions (press Ctrl+Shift+X to open Extensions):
- **Claude Code** (by Anthropic) — your AI assistant
- **Prisma** — database schema highlighting
- **Tailwind CSS IntelliSense** — CSS autocomplete
- **ESLint** — code quality checking
- **Prettier** — code formatting

The project already has a file `.vscode/extensions.json` that will suggest these automatically when you open the project.

### Step 5 — Install Claude Code CLI

Open your terminal and run:

```bash
npm install -g @anthropic/claude-code
```

Then type `claude` in the terminal. It will ask you to log in with your Anthropic account. Log in once and it stays logged in.

Verify:
```bash
claude --version
# Must show a version number
```

---

## 5. Project Folder Map

Study this map. Memorize it. Every feature you build touches these same folders.

```
Boiler Plate Code/
│
├── frontend/                  ← Everything the user SEES (React app)
│   └── src/
│       ├── app/               ← App shell, Redux store, providers, layout
│       ├── components/        ← Reusable UI pieces (Button, Card, Modal, etc.)
│       │   └── layout/        ← Sidebar, Topbar, AppShell
│       ├── features/          ← ONE FOLDER PER FEATURE (auth, dashboard, etc.)
│       │   ├── auth/          ← Login page, auth Redux slice, auth API
│       │   └── dashboard/     ← Dashboard page and API
│       ├── hooks/             ← useAuth, useAppDispatch, useToast, etc.
│       ├── lib/               ← RTK Query API slices, socket client, utilities
│       └── router/            ← Page routes + auth guards
│
├── backend/                   ← Everything on the SERVER (Node.js API)
│   └── src/
│       ├── modules/           ← ONE FOLDER PER FEATURE (auth module is the example)
│       │   └── auth/          ← auth.routes.ts, auth.controller.ts, auth.service.ts
│       ├── middleware/        ← auth, RBAC, validation, upload, error handler
│       ├── services/          ← Email service, storage service
│       ├── jobs/              ← BullMQ background job workers
│       ├── sockets/           ← Socket.io real-time event handlers
│       ├── utils/             ← encryption, auditLogger, pdfGenerator, excelExporter
│       ├── config/            ← env vars, Swagger config
│       ├── lib/               ← Prisma client, Redis client
│       ├── app.ts             ← Express app setup (register routes here)
│       └── server.ts          ← Server entry point
│
├── shared/                    ← Code used by BOTH frontend and backend
│   └── src/
│       ├── enums.ts           ← UserRole, UserStatus, ApprovalStatus, etc.
│       ├── permissions.ts     ← Who can do what (RBAC matrix)
│       ├── types.ts           ← TypeScript types used everywhere
│       └── schemas/           ← Zod validation schemas
│
├── prisma/                    ← Database definition
│   ├── schema.prisma          ← Your database tables (models) live here
│   └── seed.ts                ← Demo data: 1 org, 3 users
│
├── docker/                    ← Local database and Redis setup
│   ├── docker-compose.yml     ← Postgres + Redis (standard)
│   ├── docker-compose.dev.yml ← Lightweight daily dev
│   └── docker-compose.fullstack.yml ← All 4 services
│
├── scripts/                   ← One-command setup scripts
│   ├── setup.sh               ← macOS / Linux / WSL2
│   └── setup.ps1              ← Windows PowerShell
│
├── memory/                    ← AI memory system (Claude reads and writes here)
│   ├── INDEX.md               ← Start here — project map
│   ├── project-state.md       ← What is built, what is pending
│   ├── coordination/          ← Locks, handoffs, shared context
│   ├── plans/                 ← Active and archived plans
│   ├── sessions/              ← Session logs written by /done
│   └── prompts/               ← Reusable prompt templates
│
├── .claude/                   ← Claude Code configuration
│   ├── rules/                 ← 15 rule files Claude follows automatically
│   ├── agents/                ← 17 specialist AI agents
│   ├── commands/              ← 16 slash commands (/start, /done, /new-module, etc.)
│   └── skills/                ← 7 code pattern libraries Claude uses
│
├── .github/workflows/         ← CI/CD (auto test + deploy)
├── e2e/                       ← Playwright end-to-end tests
├── docs/                      ← Architecture diagrams, API conventions, ERD
├── CLAUDE.md                  ← Instructions Claude reads about this project
├── AGENTS.md                  ← Cross-tool agent guide
└── GETTING_STARTED.md         ← Quick start guide
```

**The pattern you will repeat for every feature:**

```
prisma/schema.prisma          ← Add the database table
shared/src/enums.ts           ← Add status enums
shared/src/types.ts           ← Add TypeScript types
shared/src/permissions.ts     ← Add who can do what
backend/src/modules/<name>/   ← Add routes, controller, service, validation
backend/src/app.ts            ← Register the new routes
frontend/src/features/<name>/ ← Add the RTK Query API and page component
frontend/src/router/          ← Add the page route
```

---

## 6. STEP-BY-STEP: First Time Setup (Do Once)

Do this once when you first receive the project. Never repeat it.

---

### STEP 1 of 6 — Clone the project

```bash
git clone <repo-url-given-by-your-lead>
cd boilerplate-app
```

Open this folder in VS Code:
```bash
code .
```

---

### STEP 2 of 6 — Run the one-command setup

**On Windows (PowerShell):**
```powershell
.\scripts\setup.ps1
```

**On macOS / Linux / WSL2:**
```bash
bash scripts/setup.sh
```

This single command does everything automatically:
- Copies `.env.example` to `.env`
- Generates all secret keys for you
- Starts Docker (PostgreSQL + Redis)
- Installs all npm dependencies
- Runs database migrations
- Seeds the database with demo users

Wait for it to finish. It will print "Setup complete!" when done.

---

### STEP 3 of 6 — Start the development server

```bash
npm run dev
```

This starts both the backend (port 4000) and frontend (port 5173) at the same time.

---

### STEP 4 of 6 — Verify everything is running

Open these in your browser:

| URL | What you should see |
|---|---|
| http://localhost:5173 | The login page (glassmorphism design) |
| http://localhost:4000/api/health | `{"success":true,"data":{"status":"ok"}}` |
| http://localhost:4000/api/docs | Swagger API documentation |

If all three work, setup is complete.

---

### STEP 5 of 6 — Log in with the demo accounts

The seed created 3 test users. All have password: **`Password123!`**

| Email | Role | What they can do |
|---|---|---|
| `admin@example.com` | SUPER_ADMIN | Full access to everything |
| `orgadmin@example.com` | ADMIN | Manages everything within their organization |
| `member@example.com` | MEMBER | Can only see and edit records they own |

Log in with each one. See how the UI changes based on the role.

---

### STEP 6 of 6 — Open Claude Code and run /start

In VS Code, open the Claude Code panel (click the Claude icon in the sidebar or open the terminal and type `claude`).

In the chat, type:
```
/start
```

Claude will read the memory system and report back everything that is already built, what is pending, and what commands are available. You are now ready to work.

---

## 7. STEP-BY-STEP: Start Work Every Day

Do this in order, every morning, before writing any code.

---

### STEP 1 — Make sure Docker is running

Open Docker Desktop. If you see the green "Engine running" status, you are ready.

If Docker is not running, the database and Redis won't start and your app will fail.

---

### STEP 2 — Start the dev server

```bash
npm run dev
```

Wait until you see both:
```
[backend]  Server running on port 4000
[frontend] Local: http://localhost:5173
```

---

### STEP 3 — Open Claude Code and run /start

In VS Code, open the Claude chat and type:
```
/start
```

Claude will:
- Check for any unfinished work from yesterday
- Report what is built and what is pending
- Tell you about any active plans or handoffs
- Be ready to help you build

**Never skip /start.** Claude without memory is Claude without context — it will make assumptions that conflict with project decisions.

---

### STEP 4 — Check what you are working on today

After `/start` shows the project context, tell Claude what you want to work on:

```
Today I need to build [feature name].
What is the best approach given what is already here?
```

Claude will plan before writing code.

---

## 8. STEP-BY-STEP: Build a New Feature

This is the sequence for building any new feature. Follow all 10 steps, in order, every time.

---

### STEP 1 — Describe the full feature to Claude

Before Claude writes any code, give it the complete picture:

```
I need to build a [FEATURE NAME] module.

What it does:
[Describe in 2-3 sentences what this feature does]

Data it stores:
- [field 1]: [type and description]
- [field 2]: [type and description]

Business rules:
- [rule 1 — e.g. a user can only submit one item per day]
- [rule 2 — e.g. a MEMBER can only view items they own]
- [rule 3 — e.g. once approved, it cannot be cancelled]

Status states (if it has a workflow):
DRAFT → PENDING → APPROVED or REJECTED

Who can do what:
- SUPER_ADMIN: full access
- ADMIN: [what they can do]
- MEMBER: [what they can do]

Please write your plan before any code.
```

Read the plan Claude writes. If something is wrong, correct it now. This saves hours later.

---

### STEP 2 — Use /new-module to scaffold everything

Once the plan looks right, type:

```
/new-module [feature-name]
```

For example: `/new-module item`

Claude will automatically create all 10 pieces:

| Step | What is created | Where |
|---|---|---|
| 1 | Plan file | `memory/plans/_active/` |
| 2 | Routes file | `backend/src/modules/item/item.routes.ts` |
| 3 | Controller file | `backend/src/modules/item/item.controller.ts` |
| 4 | Service file | `backend/src/modules/item/item.service.ts` |
| 5 | Validation file | `backend/src/modules/item/item.validation.ts` |
| 6 | Route registration | `backend/src/app.ts` |
| 7 | RTK Query API slice | `frontend/src/features/item/itemApi.ts` |
| 8 | Page component | `frontend/src/features/item/ItemPage.tsx` |
| 9 | Router wiring | `frontend/src/router/AppRouter.tsx` |
| 10 | Sidebar nav item | `frontend/src/components/layout/Sidebar.tsx` |

After Claude creates these, it will also prompt you to:
- Add the Prisma model to `prisma/schema.prisma`
- Add permissions to `shared/src/permissions.ts`
- Add enums to `shared/src/enums.ts`

---

### STEP 3 — Update the Prisma schema

Claude will write the schema. After it does, look at the model. Every model must have these fields:

```prisma
model Item {
  id             String    @id @default(uuid())
  organizationId String
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?          // soft delete — always nullable

  // indexes — mandatory
  @@index([organizationId])
  @@index([status])                 // add for any field used in WHERE
}
```

After reviewing, run:
```bash
npm run db:generate    # updates the Prisma client
npm run db:migrate     # creates a new migration and applies it
```

When prompted, give your migration a name like `add_item_table`.

---

### STEP 4 — Run the app and test manually

Open http://localhost:5173 and test the feature:

| Test | What to check |
|---|---|
| Create | Can I submit a new record? Does it appear in the list? |
| List | Does the list load? Does it paginate? |
| Approve | Can an ADMIN approve it? |
| Permission block | If I log in as MEMBER, can I see the approve button? (Answer: no) |
| Real-time | When I approve it, does the member's screen update without refresh? |
| Empty state | What happens when there are no records? |
| Error state | What happens if I submit invalid data? |

---

### STEP 5 — Check the API docs

Go to http://localhost:4000/api/docs and verify the new endpoints appear.

---

### STEP 6 — Run a quality check

Tell Claude:
```
/audit item
```

Claude checks all 10 quality dimensions (logic, security, data integrity, frontend wiring, performance, observability, DevOps, mobile/PWA, testing, compliance). Fix anything that comes back as CRITICAL or HIGH before continuing.

---

### STEP 7 — Write tests

```
/add-tests item
```

Claude writes unit tests for the service and API endpoint tests.

---

### STEP 8 — Run tests

```bash
npm test
```

All tests must pass before you consider the feature done.

---

### STEP 9 — Run a type check

```bash
npm run typecheck
```

Zero TypeScript errors required.

---

### STEP 10 — Save to memory

```
/done
```

Claude saves everything to the memory system so tomorrow's session knows what was built.

---

## 9. STEP-BY-STEP: Fix a Bug

When something is broken, follow this sequence.

---

### STEP 1 — Collect all the information first

Before telling Claude anything, collect:

1. **What you did** — exact steps to reproduce
2. **What you expected** — what should have happened
3. **What happened** — what actually happened
4. **The error message** — from the browser console (F12 → Console) or the terminal

---

### STEP 2 — Tell Claude the full bug report

```
There is a bug in the [feature name] module.

To reproduce:
1. Log in as [role]
2. Go to [page]
3. Click [button] / submit [form]
4. [describe what happens]

Expected: [what should happen]
Actual: [what is happening]

Error from browser console:
[paste error here]

Error from terminal (backend logs):
[paste error here]

File and line if known: [path:line]
```

---

### STEP 3 — For critical bugs use /fix-critical

If the bug affects production or causes data loss:
```
/fix-critical
```

This runs the safe fix process: severity assessment, plan, fix, test, rollback plan.

---

### STEP 4 — Trace the full path if the bug is unclear

```
/trace [the action that is failing]
```

Claude traces every layer from UI to database and identifies where it breaks.

---

### STEP 5 — Test the fix manually

After Claude applies the fix, test the same steps that caused the bug. Also test surrounding features to make sure nothing else broke.

---

### STEP 6 — Save to memory

```
/done
```

---

## 10. STEP-BY-STEP: End of Day Wrap-Up

Do this before you close VS Code, every day.

---

### STEP 1 — Make sure tests pass

```bash
npm test
npm run typecheck
```

Never leave broken tests overnight.

---

### STEP 2 — Save progress to memory

In the Claude chat:
```
/done
```

Claude will:
- Update `memory/project-state.md` with what was built today
- Write a session log to `memory/sessions/`
- Release any file locks
- Write handoff notes if work is incomplete
- Archive the plan if the feature is complete

This takes 30 seconds and saves hours tomorrow.

---

### STEP 3 — Stop the dev server

Press `Ctrl+C` in the terminal where `npm run dev` is running.

---

### STEP 4 — Stop Docker (optional)

Only needed if you want to free up memory. Docker Desktop will stop automatically when you restart.

```bash
cd docker
docker compose down
```

You do NOT need to do this every day. Leave Docker running between sessions if you prefer.

---

## 11. How Claude Code Works in This Project

Claude Code is pre-configured with the full project context. Here is what that means:

### What Claude reads automatically

Every time you start a session, Claude reads:

| File | What it contains |
|---|---|
| `CLAUDE.md` | Project overview, stack, key URLs, architecture decisions |
| `.claude/rules/*.md` | 15 binding rules about backend, frontend, database, security, API format, git safety |
| `.claude/agents/*.md` | 17 specialist agents (database auditor, security scanner, logic analyzer, etc.) |
| `.claude/skills/*.md` | 7 code pattern libraries (MVC patterns, RTK Query patterns, state machine patterns, etc.) |
| `memory/INDEX.md` | Project map and orientation |
| `memory/project-state.md` | What is built, pending, and broken |

### What happens automatically (hooks)

The project has hooks that fire automatically:

| When | What happens |
|---|---|
| You type a prompt | Claude detects the task type and loads the right specialist agent |
| You stop Claude | A session stub is written to `memory/sessions/` automatically |
| You save a file | Reminders fire about schema sync and auth sensitivity |
| You run a dangerous command | It is blocked before execution |

### How to give Claude good instructions

| Bad (too vague) | Good (specific) |
|---|---|
| "build something" | "Build an Item module. Members submit records. Admins approve." |
| "fix the bug" | "POST /api/items returns 500. Error: [paste error]. Fix it." |
| "add a feature" | "Add an optional comment field (max 500 chars) to the Item model." |
| "make it look better" | "The table on ItemPage overflows on mobile. Fix the responsive layout." |

**Rule:** Tell Claude who, what, where, and why. Never just what.

---

## 12. All Slash Commands — What Each One Does

| Command | When to use it | What it does |
|---|---|---|
| `/start` | First thing every session | Loads memory, reports project state, shows pending work |
| `/done` | Last thing every session | Saves progress, writes session log, releases locks |
| `/compact-save` | After context compaction warning | Saves mid-session state so work can resume |
| `/new-module <name>` | Building a new feature | Scaffolds complete backend + frontend module (10 steps) |
| `/health` | Something is not starting | Checks Docker, database, environment variables, all services |
| `/fix-critical` | Production bug / data loss | Safe fix process: severity → plan → fix → test → rollback plan |
| `/audit` | Before releasing a feature | 10-dimension quality check: logic, security, data, performance, etc. |
| `/security-scan` | Security review | OWASP Top 10, JWT, encryption, secrets, CORS, audit logs |
| `/trace <action>` | Debug a broken workflow | Traces full path: UI → API → middleware → service → DB → socket → UI |
| `/explain <topic>` | Understanding existing code | Explains any module, function, or concept in the codebase |
| `/optimize` | Performance issues | Finds N+1 queries, missing indexes, slow endpoints, bundle size |
| `/migrate` | Database schema changes | Safe migration workflow with backup and staging check |
| `/add-tests <module>` | After building a feature | Writes unit tests and integration tests |
| `/document <module>` | Documentation | Generates JSDoc and Swagger comments |
| `/deploy` | Release to production | Pre-deploy checks, build, migrate, PM2 reload |
| `/release-check` | Before any deployment | Full quality gate: tests, coverage, security, artifacts |

---

## 13. The Tech Stack Explained Simply

### Frontend — What Users See

| Technology | Plain English | When you use it |
|---|---|---|
| React 18 | Builds the UI with components | Every page and button |
| Vite | Runs the dev server, builds the app | Already set up — just run `npm run dev` |
| TypeScript | JavaScript with types | Everything — no plain JS |
| Tailwind CSS | CSS classes in HTML | All styling — no separate CSS files |
| shadcn/ui | Ready-made UI components | Buttons, modals, forms, tables, dropdowns |
| Redux Toolkit | Stores login state globally | Auth state only — not server data |
| RTK Query | Fetches data from the API | Every API call — never use fetch() directly |
| React Hook Form | Manages form state | Every form |
| Zod | Validates form inputs | All form schemas |
| Framer Motion | Animations | Page transitions, modals opening/closing |
| Socket.io-client | Receives real-time updates | Live data without page refresh |
| React Router | Handles page navigation | URL routing with auth guards |

### Backend — The Server

| Technology | Plain English | When you use it |
|---|---|---|
| Express | HTTP server framework | All API routes |
| TypeScript | Typed JavaScript | Everything |
| Prisma ORM | Queries the database | All database operations |
| Zod | Validates incoming request data | All API input validation |
| bcryptjs | Hashes passwords securely | Auth only — already set up |
| jsonwebtoken | Creates JWT tokens | Auth only — already set up |
| BullMQ | Background job queues | Email, notifications |
| Socket.io | Pushes real-time events | Live UI updates |
| Nodemailer | Sends emails | All email sending |
| Multer | Handles file uploads | Upload images and documents |
| Helmet | Sets security headers | Already active — do not touch |
| Winston | Structured logging | Use `logger.info()`, `logger.error()` |
| PDFKit | Generates PDF files | Report generation |
| ExcelJS | Generates Excel files | Data export |

### Infrastructure

| Technology | Plain English | When you use it |
|---|---|---|
| PostgreSQL 16 | The main database | Stores all your data permanently |
| Redis 7 | Fast in-memory store | Sessions, job queues, cache |
| Docker Compose | Runs Postgres + Redis locally | `npm run docker:dev` to start |
| Nginx | Web server for production | Serves the frontend, proxies backend |
| PM2 | Process manager in production | Keeps backend running, restarts on crash |
| GitHub Actions | Automated CI/CD pipeline | Tests run on every PR, deploys on main merge |

---

## 14. The 3 User Roles

This project has exactly **3 roles**. Every feature you build must define what each role can do.

| Role | Who they are | Typical access |
|---|---|---|
| `SUPER_ADMIN` | Platform owner — Aniston Technologies or the top admin | Full access to everything, including deleting organizations |
| `ADMIN` | Company administrator | Manages everything within their organization |
| `MEMBER` | Restricted role | Can only see and edit records they own |

### How permissions work

Permissions are defined in `shared/src/permissions.ts`. Each resource has 4 actions:

```typescript
export const PERMISSIONS = {
  'items': {
    read:   [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER],
    create: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER],
    update: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    delete: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },
};
```

On the backend, check permissions like this:
```typescript
router.patch('/:id/approve', authenticate, requirePermission('items', 'update'), controller.approve);
```

On the frontend, hide buttons based on role:
```typescript
import { hasPermission } from '@boilerplate/shared/permissions';

{hasPermission(user.role, 'items', 'update') && (
  <Button>Approve</Button>
)}
```

---

## 15. The 6 Database Models Already Built

The schema has 6 models. You will add new models for each new feature.

| Model | What it stores |
|---|---|
| `Organization` | The company/tenant. Every record belongs to one organization. |
| `User` | Login credentials, role, status. Linked to one Organization. |
| `RefreshToken` | JWT refresh tokens. Revoked on logout. |
| `Category` | Categories within an organization — a grouping for items. |
| `Item` | A primary record — linked to User. Stores sensitive fields encrypted. |
| `AuditLog` | Records every create, update, delete action for compliance. |

### What every model must have

```prisma
model YourModel {
  id             String    @id @default(uuid())    // always UUID, never integer
  organizationId String                             // always present for org-scoped data
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?                          // soft delete — never hard delete

  @@index([organizationId])                         // always index this
}
```

---

## 16. Backend Rules — Never Break These

These are not preferences. They are enforced by `.claude/rules/rule-backend.md` and Claude will apply them automatically. You must understand them too.

---

### Rule 1 — organizationId in every query

```typescript
// WRONG — any user can access any record across all organizations
const record = await prisma.item.findUnique({ where: { id } });

// CORRECT — scoped to the user's organization
const record = await prisma.item.findUnique({
  where: { id, organizationId: req.user.organizationId }
});
```

Where does `organizationId` come from? Always from `req.user.organizationId` — set by the auth middleware from the JWT. **Never** from the request body. Users can fake body data. They cannot fake a JWT.

---

### Rule 2 — Middleware order is fixed

Every route must have middleware in this exact sequence. Never change it.

```typescript
router.post(
  '/',
  authenticate,                            // 1. verify JWT
  requirePermission('items', 'create'),    // 2. check role
  validateRequest(CreateItemSchema),       // 3. validate input
  itemController.create                    // 4. handle request
);
```

---

### Rule 3 — Controllers are thin

```typescript
// Controller — only 3 responsibilities: parse, call service, respond
async create(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await itemService.create(req.user, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);   // always pass to error handler
  }
}
```

All business logic goes in the service. Never put if/else business rules in a controller.

---

### Rule 4 — Transactions for multi-table writes

```typescript
// If you touch more than one table, wrap in a transaction
const result = await prisma.$transaction(async (tx) => {
  const record = await tx.item.update({
    where: { id, organizationId },
    data: { status: 'APPROVED' }
  });
  await tx.notification.create({ data: { ... } });
  return record;
});
```

---

### Rule 5 — Audit log every change

```typescript
await auditLogger.log({
  action: AuditAction.APPROVE,
  userId: req.user.id,
  organizationId: req.user.organizationId,
  resource: 'Item',
  resourceId: record.id,
});
```

---

### Rule 6 — Use optimistic locking for status changes

```typescript
// WRONG — race condition: two admins could approve simultaneously
const record = await prisma.item.findUnique({ where: { id } });
// ... time passes, another request runs here ...
await prisma.item.update({ where: { id }, data: { status: 'APPROVED' } });

// CORRECT — only updates if status is still PENDING
const updated = await prisma.item.updateMany({
  where: { id, organizationId, status: 'PENDING' },
  data: { status: 'APPROVED' }
});
if (updated.count === 0) throw new ConflictError('Item already processed');
```

---

### Rule 7 — Always filter soft-deleted records

```typescript
// WRONG — includes deleted records
await prisma.item.findMany({ where: { organizationId } });

// CORRECT
await prisma.item.findMany({ where: { organizationId, deletedAt: null } });
```

---

### Rule 8 — API response format is always this envelope

```json
// Success
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 100 } }

// Error
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Record not found" } }
```

Never return raw data. Never expose stack traces.

---

## 17. Frontend Rules — Never Break These

Enforced by `.claude/rules/rule-frontend.md`.

---

### Rule 1 — Only use RTK Query for API calls

```typescript
// WRONG — raw fetch
const res = await fetch('/api/items');

// WRONG — axios directly
const res = await axios.get('/api/items');

// CORRECT — RTK Query hook
const { data, isLoading, error } = useGetItemsQuery();
```

RTK Query gives you caching, loading states, error states, and automatic cache invalidation for free.

---

### Rule 2 — Every RTK Query endpoint needs tags

```typescript
// In your API slice
getItems: builder.query({
  query: () => '/items',
  providesTags: ['Item'],       // required for list queries
}),

approveItem: builder.mutation({
  query: (id) => ({ url: `/items/${id}/approve`, method: 'PATCH' }),
  invalidatesTags: ['Item'],    // required — refreshes the list
}),
```

---

### Rule 3 — Always handle loading, error, and empty states

```typescript
const { data, isLoading, error } = useGetItemsQuery();

if (isLoading) return <div className="flex justify-center"><Loader2 className="animate-spin" /></div>;
if (error)     return <div className="text-red-500">Failed to load. Please refresh.</div>;
if (!data?.length) return <div className="text-gray-500">No items found.</div>;

return <ItemTable data={data} />;
```

---

### Rule 4 — Show toasts on every mutation

```typescript
const [approve] = useApproveItemMutation();

const handleApprove = async (id: string) => {
  try {
    await approve(id).unwrap();
    toast.success('Item approved');
  } catch {
    toast.error('Failed to approve item');
  }
};
```

---

### Rule 5 — Check role before rendering admin actions

```typescript
import { hasPermission } from '@boilerplate/shared/permissions';
import { useAuth } from '@/hooks/useAuth';

const { user } = useAuth();

{hasPermission(user.role, 'items', 'update') && (
  <Button onClick={() => handleApprove(item.id)}>Approve</Button>
)}
```

---

### Rule 6 — Glassmorphism styling

The design system uses these CSS classes. Apply them consistently:

| Pattern | Classes |
|---|---|
| Card background | `bg-white/60 backdrop-blur-md border border-white/30 shadow-glass` |
| Primary button | `bg-indigo-600 hover:bg-indigo-700 text-white` |
| Input | Use `<Input />` from `@/components/ui` |
| Heading font | `font-sora` |
| Body font | `font-dm-sans` |
| Data / numbers | `font-jetbrains` |

---

## 18. Database Rules — Never Break These

Enforced by `.claude/rules/rule-database.md`.

---

### Rule 1 — Every model has mandatory fields

```prisma
model YourModel {
  id             String    @id @default(uuid())    // UUID, never auto-increment integer
  organizationId String                             // multi-tenancy scoping
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?                          // soft delete field
}
```

---

### Rule 2 — Indexes are mandatory

```prisma
@@index([organizationId])              // always
@@index([status])                      // if you filter by status
@@index([categoryId])                  // if you filter by category
@@index([deletedAt])                   // helps soft-delete queries
```

---

### Rule 3 — Enums must be in two places

When you add an enum to `prisma/schema.prisma`, you must also add it to `shared/src/enums.ts`. They must match exactly.

```prisma
// prisma/schema.prisma
enum Priority {
  LOW
  MEDIUM
  HIGH
}
```

```typescript
// shared/src/enums.ts — must be identical
export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}
```

---

### Rule 4 — Sensitive fields use AES-256-GCM encryption

If a field stores sensitive data (secret tokens, ID numbers, phone number in some contexts), the field name must end in `Encrypted`:

```prisma
secretEncrypted  String?
```

Use the encryption utility:
```typescript
import { encrypt, decrypt } from '@/utils/encryption.js';

// Store
const secretEncrypted = encrypt(plainSecret);

// Read
const secret = decrypt(item.secretEncrypted);
```

---

### Rule 5 — Development vs production migration commands

```bash
# Development only (local machine):
npm run db:migrate      # creates migration file + applies it
npm run db:generate     # regenerates Prisma client after schema change

# Production only — NEVER use db:push or db:migrate in production:
DATABASE_URL=$PROD_URL npx prisma migrate deploy
```

**Never run `db:push` on any database that has real data.** It skips the migration history and can cause data loss.

---

## 19. How the Memory System Works

The `memory/` folder is the project's shared brain. All Claude Code sessions read and write to it. This is how Claude remembers what was built in previous sessions.

### What each file does

| File | Purpose |
|---|---|
| `memory/INDEX.md` | The entry point — always read first |
| `memory/project-state.md` | What is built, what is pending, known issues |
| `memory/coordination/locks.md` | Which files are being edited (prevents conflicts) |
| `memory/coordination/handoffs.md` | Unfinished work left by previous sessions |
| `memory/coordination/shared-context.md` | Discoveries that all future sessions should know |
| `memory/plans/_active/` | In-flight feature plans |
| `memory/plans/_archive/` | Completed plans |
| `memory/sessions/` | Session logs written by `/done` |
| `memory/sessions/compact/` | Context compaction saves written by `/compact-save` |
| `memory/prompts/` | Reusable prompt templates |

### Your only job with memory

You do not manage memory files manually. Claude does it.

Your only responsibilities:
1. Type `/start` at the beginning of every session
2. Type `/done` at the end of every session

If Claude's session is interrupted (context compaction), type:
```
/compact-save
```

Then start a new session and type `/start` — it will recover from the compact save.

---

## 20. Prompt Templates — Copy and Paste These

Copy the template that matches your task, fill in the brackets, paste into Claude.

---

### Template A — Build a new feature

```
I need to build a [FEATURE NAME] module.

What it does: [1-2 sentence description]

Business entities:
- [Entity 1]: [what data it holds]
- [Entity 2]: [what data it holds]

Business rules:
- [Rule 1]
- [Rule 2]

Status workflow:
[DRAFT] → [PENDING] → [APPROVED] or [REJECTED]

Who can do what:
- SUPER_ADMIN: full access
- ADMIN: [their access]
- MEMBER: [their access — usually their own records only]

Special security concerns:
- [e.g. a user cannot approve their own item]
- [e.g. only shows records the current user owns]

Please write your full plan before any code.
Then use /new-module [name] to scaffold it.
```

---

### Template B — Add a field to an existing model

```
Add a [FIELD NAME] field to the [ModelName] model.

Field details:
- Type: [String / Int / Boolean / DateTime / Enum name]
- Required or optional: [required / optional]
- Default value: [value or "none"]
- Validation: [max length, allowed values, format]
- Encrypted: [yes — ends in Encrypted / no]

Where it should appear in the UI:
- In the create form: [yes / no]
- In the list table: [yes / no]
- In the detail/edit view: [yes / no]

Update these files:
1. prisma/schema.prisma — add field + index if filtered
2. shared/src/types.ts — update TypeScript type
3. backend validation schema
4. frontend form and table

Do not create a migration yet. I will run npm run db:migrate manually.
```

---

### Template C — Fix a bug

```
There is a bug in the [FEATURE NAME] module.

To reproduce:
1. Log in as [role] — [email]
2. Go to [page URL]
3. [Exact action — click X, fill in Y, submit]
4. [What happens]

Expected: [what should happen]
Actual: [what is happening]

Error from browser (F12 → Console):
[paste here]

Error from terminal (backend):
[paste here]

File / line number if known:
[paste here]

Please trace the full path from UI → API → service → database and identify where it breaks.
```

---

### Template D — Debug a failing API endpoint

```
The [GET/POST/PATCH/DELETE] /api/[path] endpoint is not working.

Request I sent (from Swagger or Postman):
[paste request body and headers]

Response I got:
[paste full response]

Backend terminal output:
[paste logs]

What I expected:
[describe expected response]

Please trace: route → middleware → controller → service → Prisma and find the exact issue.
```

---

### Template E — Add real-time updates to a feature

```
The [FEATURE NAME] module needs real-time updates.

When [event — e.g. "an admin approves an item"], all members on 
the dashboard should see the status update immediately without refreshing.

Please:
1. Add a socket emit in the backend service after the status change
2. Add the socket listener in the frontend feature
3. Trigger RTK Query cache invalidation from the socket event

Follow the pattern in backend/src/sockets/ and the existing socket client.
```

---

### Template F — Run a full quality audit

```
Run /audit on the [FEATURE NAME] module.

Check all 10 dimensions:
1. Logic — business rules, state transitions, edge cases
2. Security — auth, IDOR, injection, org scoping
3. Data integrity — transactions, soft delete, constraints
4. Frontend wiring — dead buttons, stale cache, mobile overflow
5. Performance — N+1 queries, missing indexes, pagination
6. Observability — logs, error tracking, audit trail
7. DevOps — migration safety, rollback plan
8. Mobile/PWA — touch targets, offline behavior
9. Testing — missing unit tests, RBAC test matrix
10. Compliance — secrets, data retention, encryption

Give me:
- A score out of 10
- Every CRITICAL and HIGH finding with exact file + line
- What to fix first
```

---

## 21. Common Mistakes to Avoid

Study this list. These are the most frequent errors freshers make.

---

### Mistake 1 — Building what is already built

The boilerplate already has login, auth, JWT, file upload, email, audit logging, RBAC. Do not rebuild these. Ask Claude what is already there before starting.

---

### Mistake 2 — Forgetting organizationId in a query

```typescript
// This returns data from ALL organizations — a critical security bug
await prisma.item.findMany({ where: { status: 'PENDING' } });

// Always include organizationId from req.user — never from req.body
await prisma.item.findMany({
  where: { status: 'PENDING', organizationId: req.user.organizationId }
});
```

---

### Mistake 3 — Hard-deleting records

```typescript
// NEVER do this
await prisma.item.delete({ where: { id } });

// Always soft delete
await prisma.item.update({ where: { id }, data: { deletedAt: new Date() } });
```

---

### Mistake 4 — Not filtering soft-deleted records

```typescript
// Returns deleted records — wrong
await prisma.item.findMany({ where: { organizationId } });

// Correct — always add deletedAt: null
await prisma.item.findMany({ where: { organizationId, deletedAt: null } });
```

---

### Mistake 5 — Using fetch() or axios in React components

```typescript
// Wrong
const [data, setData] = useState([]);
useEffect(() => { fetch('/api/items').then(r => r.json()).then(setData); }, []);

// Correct — RTK Query only
const { data } = useGetItemsQuery();
```

---

### Mistake 6 — Skipping /start and /done

Without `/start`, Claude does not know project history and will write code that conflicts with decisions made in previous sessions. Without `/done`, tomorrow's session starts blind and repeats work.

---

### Mistake 7 — Running db:push in production

`db:push` skips migration history. In production this can corrupt the database. Always use `npx prisma migrate deploy` in production.

---

### Mistake 8 — Putting business logic in controllers

```typescript
// WRONG — controller doing business logic
async approve(req, res, next) {
  const item = await prisma.item.findUnique({ where: { id: req.params.id } });
  if (item.ownerId === req.user.id) throw new Error('Cannot self-approve');
  if (item.status !== 'PENDING') throw new Error('Already processed');
  await prisma.item.update({ ... });
  // etc.
}

// CORRECT — controller calls service, service does the logic
async approve(req, res, next) {
  try {
    const result = await itemService.approve(req.user, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
```

---

### Mistake 9 — Committing .env files

The `.env` file contains secrets. It is in `.gitignore`. Never `git add .env`. If you accidentally do, rotate all keys immediately before anything else.

---

### Mistake 10 — Skipping tests

You must run `npm test` and `npm run typecheck` before finishing any feature. A feature that does not type-check is not done. A feature with failing tests is not done.

---

## 22. Quick Reference Card

### Every day — in order

```
Morning:
  1. Open Docker Desktop (check it is running)
  2. npm run dev
  3. Open Claude Code → /start

During work:
  4. Build features with /new-module
  5. Test manually at http://localhost:5173
  6. Check API at http://localhost:4000/api/docs

End of day:
  7. npm test && npm run typecheck
  8. Claude Code → /done
  9. Ctrl+C to stop dev server
```

### Key URLs while running

| URL | What it shows |
|---|---|
| http://localhost:5173 | Your app (frontend) |
| http://localhost:4000/api/health | Backend health — must return `{"success":true}` |
| http://localhost:4000/api/docs | Swagger — all API endpoints with schemas |

### Seed users (password for all: `Password123!`)

| Email | Role |
|---|---|
| `admin@example.com` | SUPER_ADMIN |
| `orgadmin@example.com` | ADMIN |
| `member@example.com` | MEMBER |

### Database commands

```bash
npm run db:generate    # After changing schema.prisma — updates Prisma client
npm run db:migrate     # Creates + applies a named migration
npm run db:push        # Dev only — quick schema sync without migration file
npm run db:seed        # Re-creates the 3 demo users
npm run db:studio      # Opens Prisma Studio GUI at http://localhost:5555
```

### Docker commands

```bash
# Start (recommended for daily dev)
cd docker && docker compose -f docker-compose.dev.yml up -d

# Check running containers
docker ps

# Stop
docker compose down
```

### The feature build sequence (always in this order)

```
1. prisma/schema.prisma          — add the table
2. npm run db:migrate            — apply it
3. shared/src/enums.ts           — add status enums (must match schema)
4. shared/src/types.ts           — add TypeScript types
5. shared/src/permissions.ts     — define who can do what
6. backend/src/modules/<name>/   — routes, controller, service, validation
7. backend/src/app.ts            — register the routes
8. frontend/src/features/<name>/ — RTK Query API slice + page
9. frontend/src/router/          — add the page route
10. /done                        — save to memory
```

### The 3 roles

```
SUPER_ADMIN → Full platform access
ADMIN       → Full access within their organization
MEMBER      → Their own records only
```

### Claude Code slash commands quick list

```
/start          → Load memory — run first
/done           → Save memory — run last
/compact-save   → Save after context compaction
/new-module X   → Scaffold new feature module
/health         → Check dev environment
/fix-critical   → Fix production bug
/audit          → Quality check (10 dimensions)
/security-scan  → Security audit
/trace X        → Debug full workflow
/explain X      → Understand existing code
/add-tests X    → Write tests for a module
/optimize       → Find performance issues
/migrate        → Safe migration workflow
/deploy         → Deploy to production
```

---

*Aniston Technologies LLP — Internal Development SOP*  
*Version 2.0 — 18 May 2026*  
*For questions: anistondeveloperteam@gmail.com*

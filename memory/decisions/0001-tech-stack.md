# ADR 0001 — Fullstack Tech Stack

**Status:** Accepted
**Date:** 2026-05-17
**Deciders:** Aniston Technologies LLP
**Supersedes:** —

## Context

We need a reusable fullstack boilerplate that:

- Ships as a Progressive Web App (browser-installable, offline-capable)
- Targets Android (APK + Play Store AAB) via the same web codebase
- Targets iOS (IPA) via the same web codebase
- Has a Windows desktop agent for activity tracking (separate app, sharing the same monorepo)
- Supports an AI service for OCR + scoring (Python ecosystem)
- Enforces multi-tenancy, RBAC, audit logging out of the box

## Decision

**Frontend**

- React 18 + Vite 5 (fast dev, esbuild + Rollup production builds)
- TypeScript strict mode
- Tailwind CSS v3 (utility-first, fits glassmorphism style)
- shadcn/ui (Radix primitives, locally vendored — no runtime dependency)
- Redux Toolkit + RTK Query (caching, invalidation, generated hooks)
- Framer Motion (animations, popovers)
- React Hook Form + Zod resolver (forms)
- lucide-react (icons)
- vite-plugin-pwa with `injectManifest` strategy (Workbox custom service worker)

**Backend**

- Node.js 20 + Express 4 + TypeScript (mature, vast middleware ecosystem)
- Prisma 6 ORM over PostgreSQL 16
- ioredis + Redis 7 (cache + BullMQ broker)
- BullMQ (background jobs: email, notifications)
- Socket.io (real-time)
- helmet, cors, cookie-parser, express-rate-limit, multer (standard middleware)
- bcryptjs + jsonwebtoken (auth)
- Zod (validation everywhere)
- Nodemailer (email transport, queued via BullMQ)
- PDFKit + ExcelJS (report exports)

**Mobile / desktop**

- Capacitor (Android + iOS native wrappers around the PWA)
- Electron (Windows desktop agent for activity tracking)

**AI**

- Python FastAPI microservice in `ai-service/`, called via HTTP from the Node backend's `services/ai.service.ts`
- pytesseract for OCR, DeepSeek API for scoring

**Infra**

- Docker Compose for local PostgreSQL + Redis + AI service
- PM2 on EC2 for production process management
- Nginx as reverse proxy + TLS termination
- GitHub Actions for CI/CD

**Testing**

- Vitest (unit + integration)
- Playwright (E2E)
- supertest (API integration)

## Consequences

**Positive**

- Single web codebase reused across browser PWA, Android, and iOS
- Familiar Node ecosystem; type safety end-to-end via shared package
- Redis + BullMQ unlocks queued workloads (email, notifications, report exports) without separate worker process management
- Prisma's typed client eliminates a class of runtime errors

**Negative**

- Capacitor adds a build step and native toolchain dependency (Android Studio, Xcode)
- Electron adds bundle size for the desktop agent
- Python AI service introduces a second language runtime; cross-cutting concerns (logging, metrics) must be duplicated
- RTK Query has a learning curve compared to plain `fetch` + React Query

**Trade-offs explicitly accepted**

- We chose React 18 (not 19) for ecosystem maturity at scaffold time. Upgrade is a future ADR.
- We chose Express 4 (not 5 or Fastify) because most middleware ecosystem is still 4-first.

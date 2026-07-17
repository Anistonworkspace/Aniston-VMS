# Prompt Template — Bug Report

Copy this prompt into Claude Code when reporting and fixing a bug.  
Replace everything in `<angle brackets>`.

---

## Prompt to paste

```
/start

I have a <P0 / P1 / P2 / P3> bug in the <module-name> module.

**Symptom:**
<What the user sees or what error is thrown>

**Steps to reproduce:**
1. <step>
2. <step>
3. <step>

**Expected behavior:**
<What should happen>

**Actual behavior:**
<What actually happens — paste the error message or screenshot description>

**Affected users:**
<All users / MANAGER role only / users in a specific org / etc.>

**Error logs (if available):**
<paste relevant backend logs or browser console errors>

**Suspected area:**
<backend/src/modules/<name>/<file> around line <N>>
OR
<frontend/src/features/<name>/<file>>
OR
<not sure — please investigate>

Please use /fix-critical to write a safe fix plan and wait for my approval before changing any code.
```

---

## Severity quick reference

| Severity | Response | What it means |
|----------|----------|---------------|
| P0 | Immediate | Production down, data loss, security breach |
| P1 | Within 24h | Major feature broken, authentication broken |
| P2 | This sprint | Feature degraded, workaround exists |
| P3 | Backlog | Cosmetic, minor annoyance |

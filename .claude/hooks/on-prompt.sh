#!/bin/bash
# UserPromptSubmit hook — fires before every user message.
# Detects the intent of the user's prompt and injects agent/skill dispatch
# instructions into Claude's context so the right agent fires automatically.
#
# Claude Code reads this script's stdout as additional context before responding.

set -uo pipefail

INPUT=$(cat)
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
LOG_DIR="$REPO_ROOT/.claude/logs"
mkdir -p "$LOG_DIR"

# ── Setup Doctor — run ONCE PER DAY (first prompt of the day) ─────────────────
# Checks the AI-tool setup (Node/Python/Graphify/handoff/pxpipe). If required
# tools are missing, injects the report + a HARD-GATE directive so Claude
# auto-fixes and does NOT build until green. Silent 1-liner when healthy.
DOCTOR_MARK="$LOG_DIR/.doctor-$(date '+%Y-%m-%d')"
if [ ! -f "$DOCTOR_MARK" ] && [ -x "$REPO_ROOT/.claude/hooks/doctor.sh" ]; then
  rm -f "$LOG_DIR"/.doctor-20* 2>/dev/null   # clear yesterday's markers
  touch "$DOCTOR_MARK"
  DOC_OUT=$(bash "$REPO_ROOT/.claude/hooks/doctor.sh" 2>/dev/null)
  if [ -f "$LOG_DIR/.doctor-green" ]; then
    echo "✅ AI-tools setup: all required tools ready (Setup Doctor, daily check)."
    echo ""
  else
    echo "$DOC_OUT"
    echo ""
    echo "**HARD GATE — setup incomplete.** Before scaffolding/building/modifying any"
    echo "project code: run the auto-fixes above (\`bash .claude/hooks/doctor.sh --fix\`),"
    echo "then tell the user the exact remaining steps + the specific issue. Only proceed"
    echo "to build once \`bash .claude/hooks/doctor.sh --quiet\` exits 0. See rule-completion-standards.md."
    echo ""
  fi
fi

# ── Extract prompt text from JSON payload ─────────────────────────────────────
# node is a hard project dep at v18+, so prefer it over python3 (the MS Store
# shim on fresher Windows laptops silently exits 49 and the grep fallback breaks
# on escaped quotes in real Claude payloads).
PROMPT=""

if command -v node &>/dev/null; then
  PROMPT=$(printf '%s' "$INPUT" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  try {
    const o = JSON.parse(d);
    let p = String(o.prompt ?? o.message ?? o.content ?? '');
    if (!p && Array.isArray(o.messages)) {
      for (let i = o.messages.length - 1; i >= 0 && !p; i--) {
        const m = o.messages[i];
        if (m?.role !== 'user') continue;
        const c = m.content;
        if (typeof c === 'string') { p = c; }
        else if (Array.isArray(c)) {
          for (let j = c.length - 1; j >= 0; j--) {
            const b = c[j];
            if (b?.type === 'text' && b.text) { p = b.text; break; }
          }
        }
      }
    }
    process.stdout.write(p.slice(0, 4000));
  } catch { process.stdout.write(''); }
});
" 2>/dev/null || echo "")
fi

# Fallback (only used if node is missing — warn once)
if [ -z "$PROMPT" ] && ! command -v node &>/dev/null; then
  if [ ! -f "$LOG_DIR/.node-missing-warned" ]; then
    echo "WARN: node not found on PATH — .claude hooks will be degraded. Install Node 18+." >&2
    touch "$LOG_DIR/.node-missing-warned"
  fi
  PROMPT=$(printf '%s' "$INPUT" | grep -oE '"(prompt|message|content)"[[:space:]]*:[[:space:]]*"[^"]{5,}"' 2>/dev/null \
    | head -1 | sed 's/.*": "//' | sed 's/"$//' || echo "")
fi

# If still empty, skip dispatch
if [ -z "$PROMPT" ]; then
  exit 0
fi

P=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

# Skip skill injection for VERY short prompts (< 3 words). Lowered from 15 because
# fresher prompts like "add a confirmation popup" (4 words) or "the deploy is broken"
# (4 words) are exactly the short high-signal ones we want to dispatch on.
WORD_COUNT=$(echo "$P" | wc -w | tr -d ' ')
if [ "$WORD_COUNT" -lt 3 ]; then
  exit 0
fi

# ── Graphify-first mode (toggle: .claude/graph-mode = on|off) ─────────────────
# When ON, force a codebase-graph check BEFORE editing on any code-change-intent
# prompt. When OFF (default), normal behavior — graph used only when needed.
# Toggle with /graph-always on|off, or edit .claude/graph-mode.
# Bulletproof read: keep ONLY letters (strips whitespace, newlines, and any
# PowerShell UTF-16/BOM bytes), then lowercase — so `echo on`, Set-Content, or a
# hand-edit in any encoding all resolve to "on"/"off" correctly.
GRAPH_MODE=$(tr -cd 'a-zA-Z' < "$REPO_ROOT/.claude/graph-mode" 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo "off")
if [ "$GRAPH_MODE" = "on" ] && echo "$P" | grep -qE "build|change|edit|refactor|\badd\b|update|fix|move|rename|delete|remove|implement|create|modify|replace|migrate|wire|connect|scaffold|new module|new feature"; then
  echo "## Graphify-first mode: ON"
  echo ""
  echo "Before editing any file for this request, FIRST query the codebase graph to see the blast"
  echo "radius: run \`/graph inbound <target>\` (or \`python -m graphify explain \"<name>\"\`), state what"
  echo "depends on what you're about to change, THEN edit. (Turn off with \`/graph-always off\`.)"
  echo ""
fi

# ── Keyword → dispatch mapping ────────────────────────────────────────────────
AGENTS=()
SKILLS=()
RULES=()
COMMANDS=()    # surfaced as "Suggested slash command" so freshers discover the right one

# ─ UI / Design / Frontend visuals ─────────────────────────────────────────────
# Expanded vocabulary so common fresher UI words trigger the design-system guard.
if echo "$P" | grep -qE "ui|ux|component|page|screen|design|layout|style|color|button|form|modal|sidebar|header|nav|card|table|icon|theme|dark mode|responsive|mobile|animation|tailwind|css|glassmorphism|floating.card|popup|dialog|drawer|sheet|tooltip|toast|popover|dropdown|accordion|tab|tabs|wizard|stepper|avatar|badge|breadcrumb|snackbar|banner|widget|tile|empty state|skeleton"; then
  AGENTS+=("agent-ui-ux" "agent-frontend-wiring")
  SKILLS+=("skill-ui-ux-checklist.md" "skill-rtk-query-patterns.md" "skill-form-patterns.md" "skill-table-patterns.md" "skill-modal-patterns.md")
  RULES+=("rule-frontend.md")
fi

# ─ New module / feature / CRUD scaffold ───────────────────────────────────────
# Two-part trigger:
#   (a) explicit pattern: "new module", "scaffold", "crud", etc. — always fires.
#   (b) action verb (build/create/implement/scaffold) AND a module-shaped noun
#       (module/feature/endpoint/route/crud/api) co-occur anywhere. This catches
#       "build a new orders module" without firing on "add a tooltip".
if echo "$P" | grep -qE "new module|new feature|scaffold|\bcrud\b|new endpoint|new route" \
   || ( echo "$P" | grep -qE "\b(build|create|implement|scaffold)\b" \
        && echo "$P" | grep -qE "\b(module|feature|endpoint|route|crud)\b" ); then
  AGENTS+=("agent-planner" "agent-code-review")
  SKILLS+=("skill-mvc-patterns.md" "skill-prisma-patterns.md" "skill-audit-log-patterns.md")
  RULES+=("rule-mvc-architecture.md" "rule-backend.md" "rule-api.md")
  COMMANDS+=("/new-module <name>")
fi

# ─ Bug / Error / Fix ──────────────────────────────────────────────────────────
if echo "$P" | grep -qE "bug|error|crash|fix|broken|fails|not working|exception|undefined|null|typeerror|500|404|cannot read|cannot find|unexpected|why is|what is wrong"; then
  AGENTS+=("agent-debugger" "agent-logic-analyzer")
  SKILLS+=("skill-error-handling-patterns.md")
  RULES+=("rule-bug-fix-process.md")
  COMMANDS+=("/fix-critical <description>")
fi

# ─ Tests ──────────────────────────────────────────────────────────────────────
if echo "$P" | grep -qE "test|spec|coverage|playwright|vitest|unit test|e2e|integration test|write tests|add tests|testing"; then
  AGENTS+=("agent-testing" "agent-test-writer")
  SKILLS+=("skill-testing-patterns.md")
  RULES+=("rule-testing-standards.md")
  COMMANDS+=("/add-tests <target>")
fi

# ─ Security / Auth / RBAC / Encryption ───────────────────────────────────────
if echo "$P" | grep -qE "security|auth|login|jwt|permission|rbac|role|vulnerability|owasp|xss|injection|token|encrypt|decrypt|pii|aadhaar|pan card|aes|sensitive data"; then
  AGENTS+=("agent-api-security" "agent-security")
  SKILLS+=("skill-auth-patterns.md" "skill-rbac-advanced-patterns.md" "skill-encryption-patterns.md" "skill-input-sanitization-patterns.md")
  RULES+=("rule-security-rbac.md" "rule-secrets-policy.md")
  COMMANDS+=("/security-scan")
fi

# ─ Database / Prisma / Migration ──────────────────────────────────────────────
if echo "$P" | grep -qE "database|migration|schema|prisma|model|relation|index|seed|column|table|foreign key|soft delete"; then
  AGENTS+=("agent-database")
  SKILLS+=("skill-prisma-patterns.md")
  RULES+=("rule-database.md" "rule-database-migrations.md")
  COMMANDS+=("/migrate <description>")
fi

# ─ DevOps / Deploy / CI ───────────────────────────────────────────────────────
# Tightened: bare "build" was firing on "build a button" / "build a popup".
# Require build to be modified by job|pipeline|artifact OR another devops word present.
if echo "$P" | grep -qE "deploy|ci|docker|nginx|pm2|github actions|pipeline|release|production|workflow|devops|build (job|pipeline|artifact|step|target)"; then
  AGENTS+=("agent-devops")
  SKILLS+=("skill-monitoring-patterns.md")
  COMMANDS+=("/deploy" "/release-check")
fi

# ─ Performance / Optimization / Caching ──────────────────────────────────────
if echo "$P" | grep -qE "performance|slow|n\+1|n1|query time|bundle|optimize|cache|paginate|pagination|speed|redis cache"; then
  AGENTS+=("agent-performance")
  SKILLS+=("skill-prisma-patterns.md" "skill-caching-patterns.md")
  RULES+=("rule-api.md")
  COMMANDS+=("/optimize <target>")
fi

# ─ State machine / Workflow / Approval ───────────────────────────────────────
if echo "$P" | grep -qE "workflow|state machine|status|approval|transition|state|flow|approve|reject|cancel"; then
  AGENTS+=("agent-logic-analyzer")
  SKILLS+=("skill-state-machine-patterns.md")
  RULES+=("rule-state-machines.md")
  COMMANDS+=("/trace <workflow>")
fi

# ─ Audit / Code review ────────────────────────────────────────────────────────
if echo "$P" | grep -qE "review|audit|check|is this correct|is this right|validate|verify|look at|inspect"; then
  AGENTS+=("agent-code-review")
  RULES+=("rule-audit-standards.md")
  COMMANDS+=("/audit")
fi

# ─ Memory / Session ───────────────────────────────────────────────────────────
if echo "$P" | grep -qE "/start|/done|memory|session|context|handoff|compact|project state"; then
  AGENTS+=("agent-memory")
  COMMANDS+=("/start" "/done")
fi

# ─ Help / Discovery (any "what can I do" / "what commands" prompt) ────────────
if echo "$P" | grep -qE "what (can|commands|slash)|how do i|where is|list (commands|slash|skills)|help me find|show me|/help"; then
  COMMANDS+=("/help")
fi

# ─ Proxy / Cost / Token budget ────────────────────────────────────────────────
if echo "$P" | grep -qE "token cost|token bill|cheaper|reduce token|save token|compression|proxy|pxpipe|headroom|api bill|context bloat"; then
  COMMANDS+=("/proxy-start" "/proxy-status")
fi

# ─ Codebase graph / dependency tracing / Graphify ─────────────────────────────
if echo "$P" | grep -qE "what depends|who calls|dependency|dependencies|blast radius|codebase graph|graphify|impact of|references to|call graph|inbound|explain this file"; then
  SKILLS+=("skill-codebase-graph-patterns.md")
  COMMANDS+=("/graph")
fi

# ─ Modern UI — Hero / landing / spotlight ─────────────────────────────────────
if echo "$P" | grep -qE "hero|landing page|spotlight|gradient text|animated grid|marketing page|top of page"; then
  AGENTS+=("agent-ui-ux")
  SKILLS+=("skill-modern-hero-patterns.md" "skill-ui-ux-checklist.md")
fi

# ─ Modern UI — Layout (bento / marquee / sticky-scroll / parallax) ────────────
if echo "$P" | grep -qE "bento|marquee|sticky scroll|scroll story|parallax|magnetic button|logo strip|logo carousel"; then
  AGENTS+=("agent-ui-ux")
  SKILLS+=("skill-modern-layout-patterns.md" "skill-ui-ux-checklist.md")
fi

# ─ Modern UI — Advanced motion (Framer Motion) ────────────────────────────────
if echo "$P" | grep -qE "shared layout|layoutid|framer motion|spring physics|stagger|motion value|use.?transform|use.?scroll|count.?up|scroll progress|tilt card|animatepresence"; then
  AGENTS+=("agent-ui-ux")
  SKILLS+=("skill-modern-motion-patterns.md" "skill-ui-ux-checklist.md")
fi

# ─ Modern UI — Command palette (Cmd+K) ────────────────────────────────────────
if echo "$P" | grep -qE "cmd\+k|ctrl\+k|command palette|quick action|fuzzy search|palette|cmdk"; then
  AGENTS+=("agent-ui-ux")
  SKILLS+=("skill-command-palette-patterns.md" "skill-keyboard-shortcuts-patterns.md" "skill-ui-ux-checklist.md")
fi

# ─ Modern UI — Drag & Drop (dnd-kit) ──────────────────────────────────────────
if echo "$P" | grep -qE "drag|drop|dnd|dnd.kit|sortable|kanban|reorder|drop zone|multi.select drag"; then
  AGENTS+=("agent-ui-ux")
  SKILLS+=("skill-drag-drop-patterns.md" "skill-ui-ux-checklist.md")
fi

# ─ Modern UI — Empty states ───────────────────────────────────────────────────
if echo "$P" | grep -qE "empty state|no data|no results|first run|nothing to show|zero state|blank state"; then
  AGENTS+=("agent-ui-ux")
  SKILLS+=("skill-empty-state-patterns.md" "skill-ui-ux-checklist.md")
fi

# ─ Modern UI — Onboarding flow ────────────────────────────────────────────────
if echo "$P" | grep -qE "onboarding|welcome flow|multi.step signup|first.time setup|guided tour|walkthrough|product tour"; then
  AGENTS+=("agent-ui-ux")
  SKILLS+=("skill-onboarding-flow-patterns.md" "skill-form-patterns.md" "skill-ui-ux-checklist.md")
fi

# ─ System design first / greenfield / start a new project ─────────────────────
if echo "$P" | grep -qE "start a new project|new app|greenfield|design the system|user stories|from scratch|before we code|system design|architecture up front"; then
  AGENTS+=("agent-system-designer")
  SKILLS+=("skill-system-design-patterns.md" "skill-ddd-bounded-contexts-patterns.md")
  COMMANDS+=("/design-first")
fi

# ─ Design review / design gap check ───────────────────────────────────────────
if echo "$P" | grep -qE "design review|design gap|review the design|is my design good|adr review|prd review"; then
  COMMANDS+=("/design-review")
fi

# ─ DDD / bounded context / large domain ───────────────────────────────────────
if echo "$P" | grep -qE "bounded context|context map|ubiquitous language|anti.corruption|split the domain|too many entities|10\+ entities"; then
  AGENTS+=("agent-logic-creator" "agent-system-designer")
  SKILLS+=("skill-ddd-bounded-contexts-patterns.md" "skill-domain-modeling-patterns.md")
fi

# ─ Build-loop / test-first / end-to-end feature / no half-built features ──────
if echo "$P" | grep -qE "build.?loop|test.?first|test.?driven|tdd|loop until|until tests pass|complete feature|end.?to.?end|end to end|no half.?built|fully wired|feature with tests|complete implementation"; then
  AGENTS+=("agent-completion-loop" "agent-planner" "agent-code-review")
  SKILLS+=("skill-tdd-loop-patterns.md" "skill-wire-completeness-patterns.md" "skill-mvc-patterns.md")
  RULES+=("rule-completion-standards.md" "rule-testing-standards.md")
  COMMANDS+=("/build-loop <name>")
fi

# ─ Wire-completeness / verify wired / end-to-end trace ────────────────────────
if echo "$P" | grep -qE "wire.?complete|verify.?wired|end.?to.?end trace|12.?hop|is it wired|missing wire|stale ui|invalidatesTags|cache invalidation|audit trail"; then
  SKILLS+=("skill-wire-completeness-patterns.md")
  RULES+=("rule-completion-standards.md")
  COMMANDS+=("/verify-wired <name>")
fi

# ─ Socket / Realtime / Notifications ─────────────────────────────────────────
if echo "$P" | grep -qE "socket|realtime|real.time|websocket|emit|broadcast|notification|bell|unread|live update|push notification"; then
  AGENTS+=("agent-frontend-wiring")
  SKILLS+=("skill-socket-patterns.md" "skill-notification-patterns.md")
fi

# ─ File upload / Export / Import / Bulk ──────────────────────────────────────
if echo "$P" | grep -qE "upload|file upload|image upload|csv|import|export|pdf|excel|report|download|bulk|batch|mass update"; then
  AGENTS+=("agent-planner")
  SKILLS+=("skill-file-upload-patterns.md" "skill-report-export-patterns.md" "skill-bulk-operations-patterns.md")
fi

# ─ Observability / Logging / Health ──────────────────────────────────────────
if echo "$P" | grep -qE "log|logging|monitor|observability|health check|sentry|alert|trace|winston|audit log|error tracking"; then
  AGENTS+=("agent-observability")
  SKILLS+=("skill-monitoring-patterns.md" "skill-audit-log-patterns.md")
  COMMANDS+=("/health")
fi

# ─ Charts / Dashboard / Analytics ────────────────────────────────────────────
if echo "$P" | grep -qE "chart|graph|dashboard|kpi|stats|analytics|recharts|bar chart|line chart|donut|pie chart|metric"; then
  AGENTS+=("agent-ui-ux")
  SKILLS+=("skill-chart-patterns.md")
fi

# ─ Webhooks / Integrations ────────────────────────────────────────────────────
if echo "$P" | grep -qE "webhook|hmac|outgoing|incoming webhook|integration|third.party|stripe|github webhook|payload"; then
  AGENTS+=("agent-api-security")
  SKILLS+=("skill-webhook-patterns.md")
fi

# ─ PWA / Offline / Service Worker ─────────────────────────────────────────────
if echo "$P" | grep -qE "pwa|service worker|workbox|offline|install prompt|manifest|web app|installable"; then
  AGENTS+=("agent-ui-ux")
  SKILLS+=("skill-pwa-patterns.md")
fi

# ─ Electron / Desktop app ─────────────────────────────────────────────────────
if echo "$P" | grep -qE "electron|desktop app|tray|windows app|ipc|auto.update|nsis|installer|exe"; then
  AGENTS+=("agent-electron" "agent-devops")
  SKILLS+=("skill-electron-patterns.md")
fi

# ─ i18n / Localisation ────────────────────────────────────────────────────────
if echo "$P" | grep -qE "i18n|locale|translation|language|hindi|arabic|rtl|multilingual|internation|localiz"; then
  AGENTS+=("agent-ui-ux")
  SKILLS+=("skill-i18n-patterns.md")
fi

# ─ Multi-tenancy / Organizations / Plans ─────────────────────────────────────
if echo "$P" | grep -qE "multi.tenant|multitenant|subdomain|organization|tenant|saas plan|subscription|onboard"; then
  AGENTS+=("agent-planner")
  SKILLS+=("skill-multitenancy-patterns.md")
  RULES+=("rule-security-rbac.md")
fi

# ─ Infinite scroll / Virtual list / Cursor pagination ────────────────────────
if echo "$P" | grep -qE "infinite scroll|virtual list|cursor pagination|load more|intersection observer|scroll"; then
  AGENTS+=("agent-performance")
  SKILLS+=("skill-infinite-scroll-patterns.md")
fi

# ─ Capacitor / Mobile App ─────────────────────────────────────────────────────
if echo "$P" | grep -qE "capacitor|android|ios|mobile app|apk|ipa|fcm|deep link|safe area|native"; then
  AGENTS+=("agent-devops")
  SKILLS+=("skill-capacitor-patterns.md")
fi

# ─ Rate limiting ──────────────────────────────────────────────────────────────
if echo "$P" | grep -qE "rate limit|rate.limit|throttle|too many requests|429|brute force"; then
  AGENTS+=("agent-api-security")
  SKILLS+=("skill-rate-limiting-patterns.md")
  RULES+=("rule-api.md")
fi

# ─ Search / Filter / Sort ─────────────────────────────────────────────────────
if echo "$P" | grep -qE "filter|search|sort|debounce|query param|url sync|filterable|sortable"; then
  AGENTS+=("agent-frontend-wiring")
  SKILLS+=("skill-search-filter-patterns.md")
fi

# ─ Documentation / Swagger / README / ADR ────────────────────────────────────
if echo "$P" | grep -qE "documentation|swagger|jsdoc|readme|adr|api doc|openapi|inline comment"; then
  AGENTS+=("agent-docs")
  COMMANDS+=("/document <target>")
fi

# ─ Refactor / Duplication ─────────────────────────────────────────────────────
if echo "$P" | grep -qE "duplicate|duplication|copy.paste|copy paste|dry|extract function|extract component|refactor|tidy up|clean up"; then
  AGENTS+=("agent-refactor" "agent-planner")
fi

# ─ Domain modeling / DDD / Aggregates ────────────────────────────────────────
if echo "$P" | grep -qE "domain|aggregate|value object|bounded context|ddd|entity|invariant|ubiquitous language|anti.corruption|domain event|repository pattern"; then
  AGENTS+=("agent-logic-creator")
  SKILLS+=("skill-domain-modeling-patterns.md" "skill-business-rules-patterns.md")
  RULES+=("rule-mvc-architecture.md")
fi

# ─ Business rules / Specifications / Policies ────────────────────────────────
if echo "$P" | grep -qE "business rule|specification|policy|rule table|validation rule|guard|precondition|eligibility|can.*apply|can.*approve"; then
  AGENTS+=("agent-logic-creator")
  SKILLS+=("skill-business-rules-patterns.md" "skill-state-machine-patterns.md")
fi

# ─ Saga / Orchestration / Outbox / Process manager ───────────────────────────
if echo "$P" | grep -qE "saga|orchestration|choreography|outbox|process manager|compensation|rollback step|idempotency|durable|long.running|multi.step"; then
  AGENTS+=("agent-logic-creator" "agent-logic-analyzer")
  SKILLS+=("skill-workflow-orchestration-patterns.md" "skill-state-machine-patterns.md")
  RULES+=("rule-state-machines.md")
fi

# ─ Keyboard shortcuts / Hotkeys / Command palette ────────────────────────────
if echo "$P" | grep -qE "keyboard|shortcut|hotkey|command palette|ctrl\+k|cmd\+k|focus trap|accessibility|a11y|tab order|arrow key|escape key"; then
  AGENTS+=("agent-ui-ux")
  SKILLS+=("skill-keyboard-shortcuts-patterns.md" "skill-ui-ux-checklist.md")
  RULES+=("rule-frontend.md")
fi

# ─ Result type / Circuit breaker / Retry ─────────────────────────────────────
if echo "$P" | grep -qE "result type|circuit breaker|retry|backoff|dead.letter|jitter|fallback|resilience"; then
  AGENTS+=("agent-logic-creator" "agent-debugger")
  SKILLS+=("skill-error-handling-patterns.md" "skill-background-jobs-patterns.md")
fi

# ─ Email / Transactional email / SMTP ────────────────────────────────────────
if echo "$P" | grep -qE "email|smtp|nodemailer|send mail|welcome email|password reset email|template|transactional|otp mail|verification email"; then
  AGENTS+=("agent-planner")
  SKILLS+=("skill-email-patterns.md" "skill-background-jobs-patterns.md")
fi

# ─ CI / CD / GitHub Actions / Deploy pipeline ────────────────────────────────
if echo "$P" | grep -qE "github actions|ci.cd|pipeline|workflow yaml|\.github|action|deploy job|release job|lint job|test job|build job|continuous integration|continuous deploy"; then
  AGENTS+=("agent-devops")
  SKILLS+=("skill-ci-cd-patterns.md")
fi

# ── Output dispatch context ───────────────────────────────────────────────────
# Exit cleanly only if NOTHING matched. Previously only AGENTS was checked, which
# silenced COMMANDS-only branches like /help discovery.
if [ ${#AGENTS[@]} -eq 0 ] && [ ${#SKILLS[@]} -eq 0 ] && [ ${#RULES[@]} -eq 0 ] && [ ${#COMMANDS[@]} -eq 0 ]; then
  exit 0
fi

# Deduplicate, preserving INSERTION ORDER (primary intent first) and dropping empties.
# awk '!seen' keeps first occurrence; sort -u would lose the relevance ordering.
dedup_nonempty() {
  printf '%s\n' "$@" | grep -v '^[[:space:]]*$' | awk '!seen[$0]++'
}
mapfile -t AGENTS_UNIQUE   < <(dedup_nonempty "${AGENTS[@]}")
# Cap SKILLS to the top 3 by relevance (insertion order) — loading fewer skill files
# per prompt keeps token spend down. The full catalog is in docs/reference-index.md.
mapfile -t SKILLS_UNIQUE   < <(dedup_nonempty "${SKILLS[@]}" | head -3)
mapfile -t RULES_UNIQUE    < <(dedup_nonempty "${RULES[@]}")
mapfile -t COMMANDS_UNIQUE < <(dedup_nonempty "${COMMANDS[@]}")

echo "## Auto-dispatch context"
echo ""
if [ ${#AGENTS_UNIQUE[@]} -gt 0 ]; then
  echo "**Agents to apply** (read their files in .claude/agents/ and follow their checklists):"
  for a in "${AGENTS_UNIQUE[@]}"; do echo "- $a"; done
  echo ""
fi
if [ ${#SKILLS_UNIQUE[@]} -gt 0 ]; then
  echo "**Skills to read** (in .claude/skills/ — use these code patterns, not custom ones):"
  for s in "${SKILLS_UNIQUE[@]}"; do echo "- $s"; done
  echo ""
fi
if [ ${#RULES_UNIQUE[@]} -gt 0 ]; then
  echo "**Rules enforced** (in .claude/rules/ — violations must be caught before completing the task):"
  for r in "${RULES_UNIQUE[@]}"; do echo "- $r"; done
  echo ""
fi
if [ ${#COMMANDS_UNIQUE[@]} -gt 0 ]; then
  echo "**Suggested slash commands** (the user can type one of these to get a focused workflow — surface them if relevant):"
  for c in "${COMMANDS_UNIQUE[@]}"; do echo "- \`$c\`"; done
  echo ""
fi
echo "Apply these agents and patterns to the current task."

exit 0

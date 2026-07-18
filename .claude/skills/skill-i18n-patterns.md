# Skill — i18n Patterns

The Aniston VMS operator UI (`frontend/`) ships in `en-IN`, `hi-IN`, and
`ar-AE`. Mechanics: `react-i18next` + `i18next-browser-languagedetector`,
one locale JSON per language, an RTL flip for Arabic, and locale-aware
date/number formatting — never a hardcoded format string. Canon:
`docs/02-TRD.md` (supported locales / operator UI requirements).

---

## Setup

```typescript
// frontend/src/lib/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en-IN',
    supportedLngs: ['en-IN', 'hi-IN', 'ar-AE'],
    defaultNS: 'common',
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
    interpolation: { escapeValue: false },
  });

i18n.on('languageChanged', (lng) => {
  document.documentElement.dir = lng === 'ar-AE' ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
});

export default i18n;
```

## Locale files

```json
// frontend/src/locales/en-IN.json
{
  "cameras": { "title": "Cameras", "empty": "No cameras in this zone yet" },
  "incidents": {
    "title": "Incidents",
    "count_one": "{{count}} open incident",
    "count_other": "{{count}} open incidents",
    "confirmAcknowledge": "Acknowledge incident {{ref}}?"
  },
  "health": { "status_CAMERA_OFFLINE": "Camera offline", "status_VIDEO_HEALTHY": "Healthy" }
}
```

```json
// frontend/src/locales/hi-IN.json
{
  "cameras": { "title": "कैमरे", "empty": "इस ज़ोन में अभी कोई कैमरा नहीं है" },
  "incidents": { "title": "घटनाएँ", "count_one": "{{count}} खुली घटना", "count_other": "{{count}} खुली घटनाएँ" }
}
```

```json
// frontend/src/locales/ar-AE.json
{
  "cameras": { "title": "الكاميرات", "empty": "لا توجد كاميرات في هذه المنطقة بعد" },
  "incidents": { "title": "الحوادث", "count_one": "{{count}} حادثة مفتوحة", "count_other": "{{count}} حوادث مفتوحة" }
}
```

## RTL support (ar-AE)

Use logical Tailwind properties in shared shell components (`LiveWallGrid`,
`IncidentKanban`, `EscalationTimeline`) — `ps-4`/`pe-4`, `text-start`/`text-end`
— never hardcoded `pl-4`/`text-left`, or the layout mirrors incorrectly under
`ar-AE`. The `dir`/`lang` flip on `<html>` is handled centrally in
`frontend/src/lib/i18n.ts` above — components should never set `dir`
themselves.

## Component usage

```tsx
// frontend/src/components/ui/LanguageSwitcher.tsx
import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  return (
    <select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}>
      <option value="en-IN">English</option>
      <option value="hi-IN">हिन्दी</option>
      <option value="ar-AE">العربية</option>
    </select>
  );
}
```

```tsx
// frontend/src/features/incidents/IncidentKanban.tsx
import { useTranslation } from 'react-i18next';
import { useListIncidentsQuery } from './incidents.api';

export function IncidentKanban() {
  const { t } = useTranslation();
  const { data } = useListIncidentsQuery({});
  const openCount = data?.data.filter((i) => i.status === 'OPEN').length ?? 0;

  return (
    <>
      <h2>{t('incidents.title')}</h2>
      <p>{t('incidents.count', { count: openCount })}</p>
      {/* an incident ref like ANI-CAM-2026-000145 is NEVER passed through t() — it's an identifier, not UI copy */}
    </>
  );
}
```

## Formatters — locale-aware, never hand-rolled

```typescript
// frontend/src/lib/formatters.ts
export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

// Drives the "last seen" freshness label on HealthScoreRing / PlatformHealthTile —
// a HealthCheck that's 40 minutes stale should read "40m ago", not a raw ISO string.
export function formatRelative(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return formatDateTime(iso, 'en-IN');
}

export function formatCameraCount(count: number, locale: string): string {
  // en-IN uses Indian digit grouping (1,23,456); ar-AE uses Arabic-Indic separators — Intl handles both
  return new Intl.NumberFormat(locale).format(count);
}
```

## Zod schema for incident/health timestamps

```typescript
// frontend/src/lib/schemas.ts
import { z } from 'zod';
import { parseISO, isValid } from 'date-fns';

export const LocaleDateSchema = z.string().refine((val) => isValid(parseISO(val)), {
  message: 'Invalid date',
});
```

## NEVER do this

```typescript
// ❌ WRONG — hand-rolled date string instead of Intl/formatters.ts
const label = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;

// ❌ WRONG — translating a data identifier
t(incident.ref); // "ANI-CAM-2026-000145" is not a translation key

// ❌ WRONG — manual pluralization instead of _one/_other keys
const label = count === 1 ? 'incident' : 'incidents';
```

## Checklist

- [ ] No hardcoded English string in a component — every label goes through `t('namespace.key')`
- [ ] Pluralization uses `_one`/`_other` keys (`incidents.count_one` / `incidents.count_other`), not manual `count === 1 ? … : …`
- [ ] Dates/numbers go through `formatters.ts` (`Intl.DateTimeFormat` / `Intl.NumberFormat`), never an inline hand-built string
- [ ] Identifiers (`CAM-042`, `ANI-CAM-2026-000145`) are never passed through `t()` — they're data, not copy
- [ ] `ar-AE` flips `dir="rtl"` and layout uses logical Tailwind classes
- [ ] A new key is added to all three locale files (`en-IN.json`, `hi-IN.json`, `ar-AE.json`) in the same commit
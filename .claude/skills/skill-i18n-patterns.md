# Skill — Internationalisation (i18n) Patterns

i18next setup, translation files, en-IN locale, plurals, date/currency formatting, RTL.

---

## i18next setup

```typescript
// frontend/src/lib/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import enIN from '../locales/en-IN.json';
import hiIN from '../locales/hi-IN.json';
import arAE from '../locales/ar-AE.json';    // RTL

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en-IN',
    supportedLngs: ['en-IN', 'hi-IN', 'ar-AE'],
    defaultNS:   'common',
    resources: {
      'en-IN': { common: enIN },
      'hi-IN': { common: hiIN },
      'ar-AE': { common: arAE },
    },
    interpolation: {
      escapeValue: false,    // React escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;

// In main.tsx:
// import './lib/i18n';    // initialize before rendering
```

---

## Translation file structure (en-IN.json)

```json
{
  "common": {
    "save":     "Save",
    "cancel":   "Cancel",
    "delete":   "Delete",
    "edit":     "Edit",
    "loading":  "Loading…",
    "error":    "Something went wrong"
  },
  "nav": {
    "dashboard":  "Dashboard",
    "items":      "Items",
    "reports":    "Reports",
    "settings":   "Settings"
  },
  "item": {
    "title":        "Items",
    "add":          "Add Item",
    "edit":         "Edit Item",
    "notFound":     "Item not found",
    "confirmDelete":"Are you sure you want to remove {{name}}?",
    "count_one":    "{{count}} item",
    "count_other":  "{{count}} items",
    "status": {
      "PENDING":   "Pending",
      "APPROVED":  "Approved",
      "REJECTED":  "Rejected",
      "CANCELLED": "Cancelled"
    },
    "quota": "{{count}} credit remaining",
    "quota_other": "{{count}} credits remaining"
  },
  "date": {
    "format": "DD/MM/YYYY",
    "locale": "en-IN"
  }
}
```

---

## Using translations in components

```typescript
// frontend/src/features/items/ItemList.tsx
import { useTranslation } from 'react-i18next';

export function ItemList({ items, count }: { items: Item[]; count: number }) {
  const { t } = useTranslation('common');

  return (
    <div>
      <h1 className="text-lg font-semibold">{t('item.title')}</h1>
      <p className="text-sm text-[var(--secondary-text-color)]">
        {t('item.count', { count })}    {/* plurals handled automatically */}
      </p>

      {/* Status badge translation */}
      {items.map(item => (
        <span key={item.id} className="badge">
          {t(`item.status.${item.status}`)}
        </span>
      ))}
    </div>
  );
}

// Interpolation:
// t('item.confirmDelete', { name: 'John Doe' })
// → "Are you sure you want to remove John Doe?"
```

---

## Date / number formatting — en-IN locale

```typescript
// frontend/src/lib/formatters.ts
import { format, parseISO } from 'date-fns';
import { enIN } from 'date-fns/locale';

// Date formatting
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd/MM/yyyy', { locale: enIN });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, "dd/MM/yyyy 'at' hh:mm a", { locale: enIN });
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return formatDate(d);
}

// Currency — Indian Rupee
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style:    'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
  // → "₹1,23,456"
}

// Number with Indian comma grouping
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
  // → "1,23,456"
}
```

---

## Language switcher component

```typescript
// frontend/src/components/ui/LanguageSwitcher.tsx
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिंदी' },
  { code: 'ar-AE', label: 'العربية' },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const handleChange = (code: string) => {
    i18n.changeLanguage(code);
    // RTL support — set dir attribute on <html>
    document.documentElement.dir = code === 'ar-AE' ? 'rtl' : 'ltr';
    document.documentElement.lang = code;
  };

  return (
    <select
      value={i18n.language}
      onChange={e => handleChange(e.target.value)}
      className="input-field text-sm h-8 px-2"
    >
      {LANGUAGES.map(l => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
```

---

## RTL support

```css
/* globals.css — RTL-aware layout */
[dir="rtl"] .sidebar {
  left:  unset;
  right: 0;
}

[dir="rtl"] .page-content {
  margin-left:  unset;
  margin-right: var(--sidebar-width);
}

/* Use logical properties instead of left/right: */
.badge       { margin-inline-start: 8px; }   /* instead of margin-left */
.icon        { padding-inline-end:  4px; }   /* instead of padding-right */
.flex-row    { flex-direction: row; }         /* row auto-reverses in RTL with flex */

/* Tailwind v3 — use ms-*/me-*/ps-*/pe-*/start-*/end-* utilities: */
/* ms-2 = margin-inline-start: 8px (auto RTL-aware) */
```

---

## Backend — locale-aware date validation

```typescript
// backend — accept DD/MM/YYYY from en-IN locale, convert to ISO for storage
import { parse, isValid } from 'date-fns';

const LocaleDateSchema = z.string().transform((val, ctx) => {
  // Accept ISO format OR DD/MM/YYYY
  const iso   = new Date(val);
  const local = parse(val, 'dd/MM/yyyy', new Date());

  if (isValid(iso)) return iso.toISOString();
  if (isValid(local)) return local.toISOString();

  ctx.addIssue({ code: 'custom', message: 'Invalid date format. Use DD/MM/YYYY or YYYY-MM-DD' });
  return z.NEVER;
});
```

---

## Checklist

- [ ] `i18n.ts` initialised before the React tree renders (`import './lib/i18n'` at the top of main.tsx)
- [ ] All user-facing strings use `t()` — no hardcoded English strings in components
- [ ] Plural keys use `_one` / `_other` suffixes — not manual ternaries
- [ ] Date format matches locale: `DD/MM/YYYY` for en-IN, not `MM/DD/YYYY`
- [ ] Currency formatted with `Intl.NumberFormat('en-IN', { currency: 'INR' })`
- [ ] `document.dir` set to `"rtl"` when Arabic locale is selected
- [ ] Tailwind logical properties (`ms-`, `me-`, `ps-`, `pe-`) used instead of `l-`/`r-` for RTL-safe layouts
- [ ] Language preference saved to `localStorage` — persists across sessions
- [ ] Translation files are flat JSON — no nested nesting beyond 2 levels
- [ ] Missing translation keys fall back to `en-IN` — no empty labels shown

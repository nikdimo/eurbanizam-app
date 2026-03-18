# Replit UI Redesign — Porting Guide for Cursor

## Branch: `replit-ui-redesign`
## Reference files in `_prototype/`
- `FinanceCaseWorkspace.tsx` — full component (source of truth)
- `index.css` — CSS variables / color tokens
- `StatusBadge.tsx` — invoice status badge component
- `StatPill.tsx` — header stat pill component

---

## Porting rules
1. **Copy JSX verbatim** from `FinanceCaseWorkspace.tsx`. Do not rewrite or paraphrase markup.
2. **Only swap** data bindings (`MOCK_DATA.*` → real props) and handlers (`setData(...)` → real API calls).
3. **Do not refactor** class names, element nesting, or component structure.
4. First align CSS tokens (`_prototype/index.css` vs `apps/web/src/app/globals.css`), then port JSX.
5. Add `"general"` as valid value to `email_type` enum (Zod schema + DB).

---

## Must-match checklist

### 1. Header / Stat Pills
- Case title + case ID + request type badge — left aligned
- 4 stat pills right-aligned: CONTRACT / INVOICED / PAID / OUTSTANDING
- PAID = green text, OUTSTANDING = orange/red text
- Refresh icon button at far right
- Source: `StatPill.tsx` — copy directly, do not rewrite

### 2. Tab bar
- 3 tabs: "Invoices & Payments" / "Communication" / "Contract Profile"
- Sticky below header
- "Create invoice / payment" button at far right of tab bar

### 3. Invoices & Payments tab — layout
- Overdue alert banner (amber, full width) when any invoice is overdue
- Left column: timeline grouped by date (date label as section header)
- Right column: sticky draft/edit panel (Invoice + Payment toggle)
- No invoice table — timeline only

### 4. Timeline items
- **Invoice row**: document icon · "INVOICE · #NNN" + StatusBadge + OVERDUE badge if applicable · amount right · chevron right
- **Payment row**: green dot · "PAYMENT RECEIVED" label · amount in green right
- **Email row**: envelope icon · "INVOICE EMAIL SENT" or "REMINDER SENT" label in teal/amber · "View →" link right
- Colored left dot per type: teal=email, green=payment, red=overdue, grey=neutral
- Clicking an invoice row opens it in the right panel for editing
- Clicking an email row opens email preview in the right panel

### 5. Right panel — 3 modes
- **Draft New**: "Draft New" header, Invoice | Payment toggle buttons
- **Editing**: blue header bar with PencilLine icon, "Editing NNN", StatusBadge, "New ×" escape button
- **Email Preview**: amber (reminder) or sky (invoice email) header, email metadata, body preview, "Reply / Follow up" footer button

### 6. Communication tab — 4-step flow
- Step 1 (pick type): 3 cards — Invoice Email / Payment Reminder / General Email
- Step 2 (pick invoice): list of invoices with status + overdue indicators
- Step 3 (compose): pre-filled form, back navigation, send button
- Step 4 (sent): confirmation card with "New Email" + "Send Another" actions
- Arriving via "Send Invoice" / "Send Reminder" from Invoices tab skips to Step 3

### 7. Email history (Communication tab)
- Each sent email is a row in a list
- Clicking a row expands it inline (accordion) showing full body
- Color coding: amber header = reminder, sky header = invoice, purple header = general

### 8. Contract Profile tab
- Client info from `custom_fields` (Name, Email, Alternate emails, Company, Address)
- Case notes editable textarea
- Reminder settings (toggle + day intervals)

---

## Color tokens to verify (from `index.css`)
Check these CSS variables match between `_prototype/index.css` and `globals.css`:
- `--primary` (blue — used for active tab, buttons, editing header)
- `--destructive` (red — overdue badges)
- `--muted` / `--muted-foreground`
- `--border`
- `--background` / `--card`

## No custom Tailwind config
The prototype uses the default shadcn/ui Tailwind setup. All customization is via CSS variables in `index.css`.

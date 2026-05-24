# ReadableHTML

From scanned PDF to interactive study page. A polished static landing page plus an
alpha backend (auth, document library, persistent notes) powered by Supabase.

## Quick start

```bash
npm install
cp .env.example .env.local           # then fill in Supabase keys
npm run dev
```

Open http://localhost:3000.

## Backend setup (alpha)

The backend uses **Supabase** for auth, database, and file storage.
Processing is **mocked** — every upload produces the same synthetic
5-section study page so you can test the reading flow without real OCR.

### 1. Create a Supabase project

Sign up at <https://supabase.com> and create a new project. Note your project
URL and the **anon public** API key (Project Settings → API).

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-public-key>
```

### 3. Run the SQL migrations

Apply the three SQL files in `supabase/migrations/` in order. The simplest path:
copy each file into the Supabase SQL Editor and run.

```
supabase/migrations/0001_init.sql      # tables + triggers
supabase/migrations/0002_rls.sql       # row level security policies
supabase/migrations/0003_storage.sql   # 'documents' bucket + storage policies
```

If you use the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 4. Auth settings (optional, for alpha convenience)

Supabase enables email confirmation by default. For faster local testing:

- Authentication → Providers → Email → **Confirm email: off**

You can re-enable confirmation before going public.

### 5. Run

```bash
npm run dev
```

Visit http://localhost:3000, click **Sign up**, then upload a PDF from the
dashboard. The document moves through `uploaded → queued → processing → ready`
and the reading page becomes available at `/documents/<id>`.

## Routes

| Path | Description |
| --- | --- |
| `/` | Marketing landing page + in-page interactive demo (localStorage notes) |
| `/login`, `/signup` | Email / password auth |
| `/auth/callback` | Email-confirmation redirect target |
| `/dashboard` | Authenticated — list of your documents, upload entry point |
| `/documents/[id]` | Authenticated — reading page backed by Supabase |

Unauthenticated requests to `/dashboard` or `/documents/*` are redirected to
`/login?next=<original-path>` by `middleware.ts`.

## Data model

```
profiles            — one row per auth.users, auto-created on signup
documents           — one row per uploaded PDF (status state machine)
document_pages      — sections produced by processing (mocked for alpha)
annotations         — highlights, notes, quotes, glossary, AI-explanation history
processing_jobs     — audit trail per processing run
```

Row Level Security is enabled on every table. A user can only read or write
their own rows. The `documents` storage bucket uses the same convention:
object paths begin with the user's UUID, and storage RLS allows access only
when `(storage.foldername(name))[1] = auth.uid()::text`.

### Document status state machine

```
uploaded → queued → processing → ready
                              ↘ failed
                              ↘ needs_ocr  ──► (OCR pipeline, beta)
                                                  ↓
                                       ocr_queued → ocr_processing
                                                  ↘ ocr_ready
                                                  ↘ ocr_failed
```

Text-extraction processing runs inside `runBasicPdfProcessing()` in
`lib/documents/actions.ts` using `unpdf`. Documents that look scanned
land in `needs_ocr` and surface an honest "OCR is required" panel — no
synthetic content. The OCR branch (`ocr_*` states + `ocr_jobs` table +
`runOcrForDocument()` in `lib/documents/ocr.ts`) is scaffolded but
**not active** in the alpha; the "Run OCR (beta)" button is disabled
until an OCR provider is wired up.

## OCR architecture (stub)

`lib/documents/ocr.ts` exposes `runOcrForDocument(documentId)` — the
single entry point for the future OCR pipeline. Today it returns an
error ("OCR is not yet available on the alpha. OCR integration is
coming soon."). When integrating a provider (Chandra, Tesseract, etc.):

1. Bump `ALPHA_LIMITS.ocrJobs` in `lib/usage/quota.ts` and the matching
   `consume_quota('ocr_job')` limit in
   `supabase/migrations/0007_ocr_stub.sql`.
2. Set the provider's env vars (see `.env.example` `OCR_PROVIDER=…`).
3. Fill in `runOcrForDocument()` per the contract documented at the
   top of `lib/documents/ocr.ts`.
4. Enable the "Run OCR (beta)" button in
   `app/documents/[id]/DocumentClient.tsx`.

No callers besides that button need to change.

## What's _not_ in here

This is an **alpha**. Intentionally absent:

- Real OCR (architecture stub only — scanned PDFs surface an honest "OCR required" panel)
- Public document sharing
- Payments / billing
- Team accounts / shared libraries
- Admin dashboard
- Email templates / branded transactional email

## Project layout

```
app/
  page.tsx                       # server entry → HomeClient
  HomeClient.tsx                 # marketing landing + in-page demo
  layout.tsx                     # html + theme bootstrap
  globals.css
  login/, signup/, auth/callback/
  dashboard/                     # library + upload
  documents/[id]/                # auth-protected reading page
components/                       # shared UI (TopBar, Hero, Sidebar, ReadingView, …)
lib/
  content.ts                     # synthetic source content (also used as mock seed)
  supabase/                      # server, client, middleware adapters
  auth/actions.ts                # signin/signup/signout server actions
  documents/                     # types, synthetic builder, document actions
  annotations/actions.ts         # save/delete annotation server actions
supabase/migrations/             # SQL migrations
middleware.ts                    # session refresh + protected-route redirects
```

## Tech

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- lucide-react icons

## License

Not yet licensed. Add a `LICENSE` file before publishing.

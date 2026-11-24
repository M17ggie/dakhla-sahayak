# दाखला सहाय्यक: Dakhla Sahayak

A Marathi-first workflow tool for Tehsil office staff in Maharashtra who process Income
Certificate (उत्पन्नाचा दाखला) applications. The clerk, the Talathi and the Naib Tehsildar work on
the same file through three steps. AI assistance at each step catches problems early and drafts
the paperwork. The officer always makes the final call.

- **Live demo:** https://dakhla-sahayak.vercel.app
- **Language:** Marathi by default, with a one-click English switch for reviewers

| Role | Username | Password | What they do |
| --- | --- | --- | --- |
| Revenue Assistant (clerk) | `clerk` | `Clerk@123` | Step 1: document scrutiny |
| Talathi (village officer) | `talathi` | `Talathi@123` | Step 2: field verification |
| Naib Tehsildar | `officer` | `Officer@123` | Step 3: final decision |
| All roles (for quick testing) | `demo` | `Demo@123` | Every step |

The login page lists these accounts; clicking one fills in the form.

## 1. The problem and who it affects

An income certificate is one of the most requested documents at a Tehsil office. Students need it
for scholarships and admissions, families need it for EWS certificates and housing schemes, and
elderly and destitute people need it for pensions such as the Sanjay Gandhi Niradhar scheme.

**How it works on the ground.** The citizen applies through Aaple Sarkar or a Setu / service
centre, attaching:

- Aadhaar
- proof of residence (ration card or electricity bill)
- an income self-declaration
- income proof that depends on occupation: a 7/12 land extract for farmers, a salary slip, or an ITR

Then:

1. A **revenue assistant (clerk)** scrutinises the documents.
2. The **Talathi** verifies residence and income in the village and records a panchnama in front of
   two local witnesses.
3. The **Naib Tehsildar** decides.

The service has a time limit under the Maharashtra Right to Public Services Act. This demo uses
15 days; it is a single constant, `SLA_DAYS`.

**What goes wrong today:**

- **Incomplete files are found late.** A missing self-declaration or a name that differs between
  Aadhaar and the 7/12 extract is often noticed only after a field visit. The citizen then travels
  back to the office, sometimes more than once.
- **Mixed scripts hide mismatches.** One document says "Ganesh Balu Patil", another
  "गणपत बाळू पाटील". Comparing names across English and Marathi by eye is slow and error-prone.
- **There is no sense of priority.** Files are worked first-in-first-out or by whoever shouts
  loudest, so applications quietly cross the legal deadline.
- **Field reports are rewritten by hand.** The Talathi notes facts in the village and later writes a
  formal panchnama in Marathi.
- **Decisions are hard to audit.** It is not easy to see who did what, when and why.

Those affected are the three office roles above (often working on shared desktops, or on phones in
the field with weak connectivity) and, most of all, the citizens whose scholarship or pension waits
on this certificate.

## 2. What the application does

| Step | Who | What they see and do | Possible actions |
| --- | --- | --- | --- |
| **Dashboard** | Everyone | Their queue, ranked by urgency (overdue → due soon → number of issues found). Counts of pending, overdue and due-in-2-days. Search works in either script: `ganesh` finds गणेश. | Open a file |
| **1. कागदपत्र छाननी**<br>Document scrutiny | Clerk | AI document check, checklist, findings and a draft SMS for the applicant. A document can be added by photo (OCR). | Send for field verification · Return to applicant |
| **2. स्थळ पडताळणी**<br>Field verification | Talathi | AI visit checklist built from step 1's findings. A short mobile-friendly form for the visit, which the AI turns into a formal Marathi panchnama for the Talathi to edit. | Send for decision · Send back to scrutiny |
| **3. अंतिम निर्णय**<br>Final decision | Naib Tehsildar | The field report, plus an AI brief: points for and against, a suggested action with its reason, and a draft order. | Approve (issues a printable certificate) · Reject · Return to applicant · Send for re-verification |
| **History** | Everyone | Timeline of every action: who, when, remarks, every AI run and whether the decision followed or overrode the AI suggestion. | — |
| **Impact metrics** | Everyone | Days to decision, % decided within the deadline, return rate, rework, and agreement with the AI. | — |

Rules enforced on the server:

- Only the role that owns a step can act on it.
- Returning or rejecting needs remarks.
- A file cannot reach the decision step without a field report and a verified income.
- If two people act on the same file at once, the second gets a "file has moved on" message instead
  of a silent overwrite.
- While a file is with the applicant, the deadline clock pauses. When it comes back complete, the
  clock restarts.

## 3. Where AI helps, and why

AI is used only where it removes real work or catches real errors:

| Where | What the AI does | Why it helps |
| --- | --- | --- |
| **On arrival** | Every new application is checked automatically. | The dashboard can rank risky files before anyone opens them. |
| **Step 1** | Checks required documents for the applicant's occupation. Compares names across documents in any script (Devanagari ↔ Latin transliteration + phonetic keys + Jaro-Winkler; handles word order, titles and initials). Matches the address to the village. Compares salary slip, ITR and land holding against the declared income. Drafts the SMS listing exactly what the applicant must fix. | Catches the "come back with another document" cases at the first desk, not after a field visit. |
| **Step 1, OCR** | Reads a photo of a document in the browser (Tesseract.js, Marathi + English) and extracts the name, salary, income or land area for the clerk to confirm. | Digitises paper documents without typing; the extracted data feeds the same checks. |
| **Step 2** | Builds a visit checklist from step 1's findings ("ask about the ₹2,64,000 salary on the slip"). Writes the formal panchnama from a short form. Compares verified with declared income. | The Talathi checks what matters for this case and gets a ready report. |
| **Step 3** | Summarises the case into points for and against, suggests an action with a confidence level and a reason, and drafts the approval or rejection order. | The officer decides faster with the evidence in one place. |

**Why there is no external LLM, by design:**

- **Privacy.** Citizen Aadhaar, income and family data never leaves the office's server. OCR runs in
  the officer's own browser.
- **Explainable and auditable.** Every finding is a specific, checkable rule with a reason. That
  suits decisions that can be appealed.
- **No invented facts in legal documents.** Drafts are filled-in templates written in correct
  official Marathi, and the officer edits them before use.
- **Free and always available.** No API key, rate limit or per-request cost, so it works the same
  for every reviewer and every taluka.

**Human in the loop:**

- The AI never submits anything.
- Suggestions are shown next to the action buttons (the suggested one is outlined), but the officer
  chooses.
- Each action records which AI suggestion was on screen, so overrides are visible in the history and
  the metrics.

**Room to grow:** all AI sits behind one interface (`src/lib/ai/assistant.ts`). A self-hosted Indic
language model could be plugged in later for free-text summaries without changing any screen,
because results are stored as codes + parameters, not sentences.

## 4. Measuring impact

The Impact metrics page computes these from the real records. In a pilot I would compare them
against a baseline taken from the current registers for the same months.

| Metric | Why it matters | Target direction |
| --- | --- | --- |
| Average days from submission to decision | The citizen's actual wait | ↓ |
| % decided within the service deadline | Legal compliance under the RTS Act | ↑ |
| % of applications returned to the applicant, and at which step | Returns at step 1 are cheap; returns after a field visit are expensive. The tool should move returns earlier and reduce them overall. | Earlier and ↓ |
| Rework (sent back to scrutiny or re-verification) | Quality of the first pass | ↓ |
| AI agreement rate, and an override review | Too low means the rules need fixing; near 100% with no overrides could mean rubber-stamping, so a sample of agreed cases should be audited. | Stable and high, with audited overrides |
| Citizen visits per application (from Setu centre logs) | The real cost to the citizen | ↓ |

**Pilot design:**

- Run 8 weeks in two talukas: one using the tool, one comparable taluka as a control.
- Collect a 4-week baseline from the registers.
- Interview staff in weeks 2 and 6 about time spent per file and what they distrust in the
  suggestions.
- Retune the rule thresholds (for example, how much income gap is acceptable) from the override log.

**Why I think it will work:**

- The biggest delays come from incomplete files found late and from files nobody noticed were near
  the deadline. Both are fixed at the first desk and on the dashboard, with almost no extra work for
  staff.
- The tool follows the existing roles and paperwork (panchnama, order, certificate) instead of
  inventing a new process, so there is little to learn.
- It works on a phone in the field.

## 5. Main technical decisions

- **Next.js 16** (App Router, Server Components, Server Actions), TypeScript, Tailwind CSS.
  - One deployable app with no separate API to secure.
  - All permission checks run on the server.
  - I turned Next 16's Cache Components off: every page is per-user and changes on every action, so
    request-time rendering is simpler and correct.
- **Postgres via Drizzle ORM, with two drivers:**
  - **PGlite** (Postgres compiled to WebAssembly) locally: `npm run dev` needs no database install.
    Data lives in `./.pglite`.
  - **Neon** serverless Postgres in production (`DATABASE_URL`).
  - Same SQL migrations for both. They run automatically on start-up, and demo data seeds itself on
    first run, behind an advisory lock so two simultaneous cold starts cannot double-seed.
- **The domain logic is pure and tested.** `workflow.ts` (state machine and permissions),
  `priority.ts` (deadline and ranking) and `ai/*` (rules, matching, OCR extraction) have no
  framework code, and unit tests cover them.
- **Every step is atomic.** A transition locks the row (`SELECT … FOR UPDATE`) and writes the state
  change plus its audit event in one transaction.
- **Localisation: no user-facing text in code.**
  - All UI text, AI explanations and document templates live in `messages/mr.json` (default) and
    `messages/en.json` (next-intl, ICU messages).
  - Missing keys fall back to Marathi, and a test checks both files have the same keys.
  - The AI returns codes + parameters and is rendered in the viewer's language, so the same history
    reads correctly in Marathi or English.
  - Adding Hindi means adding `messages/hi.json` and one line in `src/i18n/config.ts`.
  - OCR keywords (`src/lib/ai/ocr-keywords.json`) and demo citizen data (`src/db/fixtures/*.json`)
    are also data files, not code.
- **Marathi typography.**
  - Mukta, a Devanagari font designed for screens.
  - Taller line height for Devanagari.
  - Marathi month names with Latin digits, as on Aaple Sarkar and as staff type them.
  - Whole sentences in the JSON (never sentence fragments joined in code), so Marathi grammar stays
    correct.
- **Built for field use.** Mobile-first layouts, large tap targets, high contrast for daylight,
  camera capture for document photos, and OCR in the browser.
- **Auth.** Encrypted cookie sessions (iron-session) with bcrypt password hashes; roles are stored
  per user.

## 6. Running it locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev          # http://localhost:3000, creates and seeds the local database on first request
```

Other commands:

```bash
npm test             # 120 unit and integration tests
npm run typecheck
npm run lint
npm run build && npm start
npm run db:reset     # delete the local database; it is re-created with fresh demo data on next start
```

The demo data dates are relative to the day the database is created, so deadlines always look
current.

### Deploying (Vercel + Neon, both free)

1. Push the repository to GitHub, then **Import** it on vercel.com. `vercel.json` pins the
   framework to Next.js; if the preset is ever set to "Other" by hand, the build runs as a static
   site and fails looking for a `public` output directory.
2. In the Vercel project, go to **Storage → Create Database → Neon**. This sets `DATABASE_URL`.
3. Add `SESSION_SECRET` (any random string of 32+ characters, e.g. `openssl rand -base64 32`).
   Without it the app falls back to a public development secret and logs a warning; sessions could
   then be forged.
4. Deploy. The first request creates the tables and loads the demo data.

### A 3-minute walkthrough

1. Log in as **clerk**. The dashboard is sorted by urgency.
2. Open **गणेश बाळू पाटील**. The AI found that the 7/12 extract is in the name गणपत. Click
   **हा मसुदा वापरा** (use this draft) to put the SMS into remarks, then return the file to the
   applicant.
3. Open **अनिल दत्तात्रय शिंदे**. The salary slip shows more than the declared income, so the AI
   suggests a field visit. Click **कागदपत्र जोडा / स्कॅन करा → नमुना वेतन पत्रक वापरा**
   (add / scan a document → use the sample salary slip) to see OCR read a Marathi salary slip.
4. Log in as **talathi** and open **महेश विठ्ठल मोरे**. Generate the visit checklist, fill in the
   short form, draft the panchnama, and send it for decision.
5. Log in as **officer**. **प्रकाश नामदेव गायकवाड** is overdue and sits at the top. On
   **वैशाली सुभाष कुलकर्णी** the AI suggests returning for a revised declaration, because the field
   visit found undeclared income. Approve **महेश** and print the certificate.
6. Check the history panel and the **परिणाम मापन** (impact metrics) page. Switch to English at any
   time.

### Project structure

```
messages/                 mr.json (default) and en.json: all user-facing text
drizzle/                  SQL migrations (generated from src/db/schema.ts)
src/app/login             login page and session actions
src/app/(app)/            dashboard, application detail, certificate, impact metrics
src/components/           shared UI; components/application/* are the three step panels,
                          documents + OCR, history and the action bar
src/lib/workflow.ts       stages, roles, allowed actions, validation (pure)
src/lib/priority.ts       deadline status and dashboard ranking (pure)
src/lib/ai/               rules engine, name matching, transliteration, OCR field extraction,
                          and assistant.ts, the one interface the screens talk to
src/server/repo.ts        data access, transitions in transactions, metrics
src/server/session.ts     encrypted cookie sessions
src/db/                   schema, client (PGlite / Neon), seed + fixtures
test/                     unit tests, plus repo tests against an in-memory Postgres
```

### Known limitations

- Documents are represented by the data read from them. In production they would also be stored as
  files and fetched from Aaple Sarkar / DigiLocker instead of re-entered.
- The income thresholds (20% gap for documents, 25% after the field visit) are reasonable defaults,
  not official rules. They should be set with the department.
- `SLA_DAYS = 15` has not been checked against the notified list of services under the Right to
  Public Services Act.
- The officer can approve a file where the AI suggested returning it for a revised declaration; the
  certificate then carries the assessed income rather than the declared one. The override is
  recorded in the history and counted in the metrics, but it is not blocked. Whether it should be is
  a departmental decision (seed application 001022 is this case).
- OCR accuracy depends on photo quality. The clerk always reviews extracted values before saving.
- Search filters the whole register in memory, which suits a taluka handling tens of files a week. A
  larger register would want the phonetic key in a generated column.
- No offline mode yet. A Talathi with no network can fill the form but needs connectivity to submit.

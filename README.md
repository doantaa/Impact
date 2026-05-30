# Impact
![Image](https://cdn.jsdelivr.net/gh/repixelhouse/personal-cdn@main/portfolio/thumbnail.jpg)
Impact turns fuzzy product ideas into a crisp, shareable *impact brief* in minutes — know your work’s worth in under 5 minutes. Capture initiative context, pick the right metrics, estimate delivery resources, pull comparable benchmarks, and generate scenario-based outputs you can export and circulate with stakeholders.

## What you get

Impact produces a decision-ready brief that helps teams align on:
- What success looks like (metrics, baselines, benchmarks)
- How much it might cost (resources → estimated cost)
- What range of outcomes to expect (Worst / Base / Best scenarios)

## Key features

### 1) Multi-draft workflow (Home)

- Create a new brief anytime (does not overwrite previous work)
- Continue or delete an existing draft
- Drafts are stored in the browser’s localStorage (no account required)

### 2) Guided stepper (New brief)

Impact guides users through a structured flow:

1. **Summary**
   - Capture the initiative essentials (goal, template, product type, target users, timeline, release approach, owner, stakeholders).

2. **Metrics**
   - Shows the full metric catalog.
   - Marks recommended metrics (badge) based on the Summary (AI-backed when available; falls back to a rule-based recommender).
   - Users choose which metrics will be tracked for the initiative.

3. **Resources (Required)**
   - Engineering / Design / PM-Other effort in **person-weeks**.
   - Fully-loaded cost rate in **IDR / person-week**.
   - Used to estimate:
     - **Total effort** (person-weeks)
     - **Estimated cost** = total effort × cost rate
     - A proxy for **execution complexity** (used as an input signal for confidence)

   Person-week definition:
   - 1 person-week = 1 person working full-time for 1 week
   - Example: 2 engineers × 3 weeks = 6 person-weeks

4. **Baselines (Optional)**
   - Collapsible section (accordion), because baselines are optional.
   - Per-metric baseline accordion lets you provide:
     - Current value (e.g., 10%)
     - Unit
     - Time window (e.g., last 30 days)
     - Provenance (Observed / Estimated)
     - Notes

5. **Benchmark**
   - Live benchmark search runs automatically when entering this step (if env vars are configured).
   - Searches for publicly available sources (articles, reports, case studies, journals) relevant to the initiative and selected metrics.
   - Manual benchmark sources can also be added (URL + title + metric + excerpt).

6. **Scenarios & Output**
   - Fully generated (no user inputs on this step).
   - Presents a scenario dashboard across:
     - **Worst**
     - **Base**
     - **Best**
   - Renders the final brief as formatted markdown (ready to share).
   - Export downloads the output as files (Markdown + JSON).

### 3) Safe fallbacks (works without cloud setup)

- If Vertex AI credentials are not configured, Impact still works end-to-end:
  - Metric recommendation falls back to a rule-based approach.
  - Benchmarking can be done via manual sources.

## Export artifacts

When you export from the final step, Impact downloads:
- A `.md` file (rendered brief content in Markdown)
- A `.json` file (full draft state for reuse/debugging)

## Repo structure

- `impact_app/` — Next.js app (App Router)
- `PRD.md` — product requirements doc

## Tech overview

- Framework: Next.js (App Router), React
- Draft storage: browser localStorage
- AI-backed endpoints (optional):
  - Metric recommendation (Vertex AI)
  - Benchmark live search via grounding (Vertex AI + Google Search grounding)
  - Narrative generation (Vertex AI), with template fallback

## Run locally

```bash
cd impact_app
npm install
cp .env.example .env.local
npm run dev
```

Open: http://localhost:3000

## Environment variables (optional, for live benchmark search)

To enable **live benchmark search** (Vertex AI Gemini + Google Search grounding), fill `.env.local`:

- `GCP_PROJECT_ID`
- `GCP_LOCATION` (default `us-central1`)
- `GCP_SERVICE_ACCOUNT_JSON` (service account JSON as a single-line string)
- `VERTEX_MODEL` (optional; defaults to `.env.example`)

If these are not set, the app still works, but benchmarks must be added manually.

Security note:
- Do not commit `.env.local`.
- Keep service account permissions minimal and rotate keys if needed.

## Common tasks

From `impact_app/`:

- `npm run dev` — start the local dev server
- `npm test` — run unit tests (Vitest)
- `npm run build` — production build (Next.js)

## Tests & build

```bash
cd impact_app
npm test
npm run build
```

## Troubleshooting

- **Env changes not applied**: restart the dev server after editing `.env.local`.
- **Invalid service account JSON**: ensure `GCP_SERVICE_ACCOUNT_JSON` is a single-line JSON string and that `private_key` contains escaped `\n`.
- **Vertex AI errors (403/404)**: confirm Vertex AI API is enabled, model/region is available, and service account has the required permissions.

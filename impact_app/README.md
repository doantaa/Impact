# Impact App

Next.js app for generating an *impact brief* that’s decision-ready:
- Draft-first workflow (create, continue, delete) saved in your browser.
- Guided wizard from Summary → Metrics → Resources/Baselines → Benchmark → Scenarios & Output.
- Dashboard-style output and rendered markdown that you can export and share.

## Run the app

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open: http://localhost:3000

## Environment variables

Copy `.env.example` to `.env.local` and fill the values.

Required (to enable benchmark live search via Vertex AI grounding):
- `GCP_PROJECT_ID`
- `GCP_LOCATION` (default `us-central1`)
- `GCP_SERVICE_ACCOUNT_JSON` (service account JSON as a single-line string)
- `VERTEX_MODEL`

Optional:
- `NEXT_PUBLIC_ANALYTICS_ENDPOINT` (default `/api/events`)

If benchmark env vars are not set, the app still works, but benchmarks must be added manually.

## User flow

1. **Home**
   - `New brief` creates a new draft.
   - Drafts are stored in the browser localStorage so you can pick up where you left off.

2. **Summary**
   - Capture the core initiative context (goal, template, product type, target users, timeline, release approach, owner, stakeholders).

3. **Metrics**
   - The app flags recommended metrics based on the Summary (“Recommended” badge), but you stay in control and can select any metrics.

4. **Resources (Required)**
   - Engineering / Design / PM-Other effort in **person-weeks**.
   - Fully-loaded cost rate in **IDR / person-week**.
   - Used to estimate cost and as a practical proxy for execution complexity.

   Person-week quick definition:
   - 1 person-week = 1 person working full-time for 1 week.
   - Example: 2 engineers × 3 weeks = 6 person-weeks.

5. **Baselines (Optional)**
   - The entire baselines section can be collapsed (accordion) since it is optional.
   - Each metric baseline is also collapsible.

6. **Benchmark**
   - Live search runs automatically when you enter the Benchmark step (if env vars are set).
   - Manual benchmark form is available to add your own sources when needed.

7. **Scenarios & Output**
   - Fully generated (no inputs).
   - Shows the scenario dashboard across `Worst / Base / Best`.
   - Shows rendered markdown output ready for stakeholder sharing.
   - Export downloads the final output.

## Tests & build

```bash
npm test
npm run build
```

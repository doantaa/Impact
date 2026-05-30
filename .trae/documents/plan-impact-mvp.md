# Plan Pengerjaan — Impact (MVP)

## Summary

Membangun web app “Impact” (MVP) sesuai PRD untuk menghasilkan **Impact Brief** (Markdown) lewat wizard: Intake → rekomendasi metrik → input baseline → benchmark lookup (live web search) → skenario & confidence → preview → export.

Keputusan yang sudah dikunci dari diskusi:
- Platform: web app
- Persistensi: localStorage, export download (JSON + Markdown)
- Share: cukup via file download
- Benchmark “live”: pakai Google Cloud (tanpa Vertex AI Search index); MVP pakai **Gemini on Vertex AI + Grounding with Google Search** sebagai retrieval, dengan fallback manual URL
- LLM: opsional, dibatasi untuk benchmark retrieval + (opsional) copywriting narasi; perhitungan angka tetap deterministik dan auditable

## Current State Analysis

Repo saat ini hanya berisi [PRD.md](file:///Users/doanta/Development/lemmetrae/Impact/PRD.md) dan belum ada codebase aplikasi. Artinya implementasi dilakukan dari nol: scaffold web app, data model, UI wizard, dan service benchmark/estimasi.

## Proposed Changes

### 1) Scaffold web app (Next.js + TypeScript)

**Tujuan:** fondasi UI + API route untuk integrasi Vertex AI (server-side), sesuai target deploy Vercel/Netlify.

**Yang dibuat**
- `package.json` + tooling (Next.js, TypeScript, lint/format bila perlu)
- `src/app/**` untuk UI (App Router)
- `src/components/**` untuk komponen UI
- `src/lib/**` untuk domain logic (rules, estimasi, generator markdown)
- `src/pages/api/**` atau `src/app/api/**` (tergantung router yang dipilih) untuk endpoint serverless:
  - `POST /api/benchmarks/search` → query → hasil `BenchmarkSource[]`
  - `POST /api/narrative/draft` (opsional) → bantu draft narasi (tanpa angka)

**Keamanan & konfigurasi**
- Semua kredensial GCP hanya lewat env var (Vercel/Netlify secrets), tidak ada yang di-commit:
  - `GCP_PROJECT_ID`
  - `GCP_LOCATION`
  - `GCP_SERVICE_ACCOUNT_JSON` (string JSON) atau mekanisme credentials yang didukung environment
  - `VERTEX_MODEL` (default mis. `gemini-2.0-flash` atau setara yang tersedia di Vertex)
- Rate limit sederhana per IP/session untuk endpoint benchmark (proteksi abuse) jika diperlukan untuk demo publik.

### 2) Domain model & state management wizard

**Tujuan:** memodelkan entitas PRD dan memastikan tiap output dapat diaudit balik ke input/sumber/asumsi.

**Yang dibuat**
- `src/lib/domain/types.ts`
  - `Initiative`, `Metric`, `MetricRecommendation`, `Baseline`, `BenchmarkSource`, `Assumption`, `Scenario`, `ImpactBrief`
- `src/lib/domain/templates.ts`
  - Definisi template (use case) + field tambahan per template (yang PRD jelaskan)
- `src/lib/state/briefStore.ts`
  - State machine wizard (step, validation, progress)
  - Persist/load ke localStorage (key versioning + migrasi ringan)

**Aturan validasi (sesuai PRD)**
- Metrik minimal ≥ 3.
- Baseline: validasi range dasar (persentase 0–100 bila unit %, angka tidak boleh negatif).
- Support “unknown” (null) dengan dampak ke confidence.

### 3) F1 — Initiative Intake Wizard

**UI**
- Halaman “New Brief”
- Form: title, templateType, productType, target users, timeline/release approach, stakeholders, goal
- Output: “initiative card” (ringkasan di workspace)

**Acceptance (PRD)**
- First pass ≤ 3 menit (lebih ke desain UI ringkas & default yang masuk akal)
- Menghasilkan draft `Initiative` dan draft brief

### 4) F2 — Metric Recommendation Engine (rule-based)

**Tujuan:** rekomendasi 3–8 metrik, lengkap definisi, formula, “why”, data requirements.

**Yang dibuat**
- `src/lib/metrics/catalog.ts` → katalog metrik + definisi/formula
- `src/lib/metrics/recommender.ts` → rules mapping dari PRD (use case → impact type → metric set)

**Output UI**
- List ranked + toggle untuk select/deselect + edit label/notes
- Tag: leading/lagging + category (revenue/cost/risk/strategic)

### 5) F3 — Baseline Capture (manual)

**UI**
- Tabel metrik terpilih → input baseline value, unit, window, provenance (Observed/Estimated/Unknown), note
- Completeness indicator (mis. “5/8 input tersedia”)

**Rules**
- Unknown tetap boleh lanjut, tetapi confidence turun dan brief menampilkan checklist data yang kurang.

### 6) F4 — Benchmark Library + Retrieval (live web search)

Karena belum ada Vertex AI Search index, implementasi MVP:
- Serverless endpoint memanggil **Gemini on Vertex AI** dengan konfigurasi **Grounding with Google Search** untuk mendapatkan:
  - URL sumber
  - judul/publisher/tanggal (jika tersedia)
  - excerpt/klaim utama (ringkas)
  - alasan relevansi untuk metrik terkait
- UI menampilkan hasil per metrik + memungkinkan user:
  - attach benchmark ke metrik tertentu
  - edit excerpt (mis. parafrase) dengan tetap mempertahankan URL
  - tambah benchmark manual via URL (fallback)

**Yang dibuat**
- `src/lib/benchmarks/queryBuilder.ts` → prompt/query template per metrik & konteks
- `src/lib/benchmarks/extract.ts` → normalisasi output model menjadi `BenchmarkSource[]`
- `src/app/api/benchmarks/search/route.ts` (atau ekuivalen) → endpoint

**Data policy**
- Hanya URL publik; tidak menyimpan konten halaman penuh, hanya metadata + excerpt.
- Jika hasil mengarah ke paywall, tandai sebagai Low relevance dan minta user pilih sumber lain.

### 7) F5 — Scenario Estimation Model + Confidence + ImpactScore

**Tujuan:** best/base/worst + confidence; tidak ada “angka tunggal kebenaran”.

**Yang dibuat**
- `src/lib/estimation/scenario.ts`
  - Per-metrik delta:
    - Jika metrik punya formula sederhana (contoh PRD UI flow): hitung incremental completions = volume × (new−old)
    - Jika tidak ada volume/revenue: tampilkan delta pada metrik + rubrik ImpactScore
  - Rollup ke bucket: revenue/cost/risk/strategic (sebagai skor/narasi jika tanpa dolar)
- `src/lib/estimation/confidence.ts`
  - Score 0–100 berbasis:
    - baseline completeness
    - benchmark relevance (H/M/L → bobot)
    - execution complexity (input sederhana dari user)
    - measurement plan quality (proxy: apakah metrik & window terdefinisi)
- `src/lib/estimation/impactScore.ts`
  - Default rubrik RICE-like: 0.25/0.5/1/2/3 (sesuai PRD)
  - Output selalu menyertakan: “Why this score”, asumsi utama, benchmark pendukung

**UI**
- Editor asumsi (uplift range, cost estimate, volume bucket, risk reduction likelihood)
- Tampilkan best/base/worst + confidence drivers + audit links (klik item → asal datanya)

### 8) F6 — Impact Brief Generator (Markdown) + Export

**Tujuan:** menghasilkan memo satu halaman yang bisa diedit dan diekspor.

**Yang dibuat**
- `src/lib/brief/markdown.ts` → generator Markdown dengan struktur PRD:
  - Summary
  - Metrics (definisi + why)
  - Baselines
  - Benchmarks (citations)
  - Scenarios
  - Confidence & Assumptions ledger
  - Risks, Dependencies, Ask
- `src/lib/brief/narrative.ts` (opsional LLM)
  - Draft paragraf narasi berdasarkan initiative + metrik + hasil skenario
  - Tidak membuat angka baru; hanya menyusun kalimat
- UI preview Markdown + inline edit (textarea/MD editor sederhana)
- Export:
  - Download `impact-brief_<slug>_<date>.md`
  - Download `impact-brief_<slug>_<date>.json` (untuk re-import)

### 9) Instrumentation events (demo)

**Tujuan:** memenuhi PRD analytics event minimal untuk demo.

**Yang dibuat**
- `src/lib/analytics/events.ts`
  - Emit event ke `console` (MVP) dan/atau endpoint sederhana `POST /api/events` (opsional)
  - Event list: `brief_create_started`, `template_selected`, `metrics_recommended_viewed`, `metric_edited`, `baseline_added`, `benchmark_added`, `scenario_generated`, `brief_exported`

## Assumptions & Decisions

- Stack: Next.js + TypeScript; styling minimal (Tailwind atau CSS modules) dipilih saat eksekusi berdasarkan kebutuhan kecepatan dan konsistensi UI.
- Vertex AI Search “murni” tidak dipakai di MVP karena belum ada index; diganti Gemini + grounding (lebih sesuai kebutuhan “search web + citations”).
- Semua computation untuk scenario/confidence/impact score deterministik dan dapat diaudit.
- Karena target deploy Vercel/Netlify: tidak mengandalkan penulisan file server-side; export via download.

## Verification (Definition of Done)

### Functional checks (manual)
- Bisa menyelesaikan wizard end-to-end dan menghasilkan Impact Brief preview.
- Metric recommendation:
  - Setiap template menghasilkan minimal 2 leading + 1 lagging + 1 cost/risk bila relevan.
- Baseline:
  - Input invalid ditolak; unknown diterima dan menurunkan confidence.
- Benchmark:
  - Search menghasilkan minimal 1–3 sumber untuk 1 metrik populer (mis. conversion rate / retention) bila kredensial Vertex tersedia.
  - Bisa attach source ke metrik dan tampil di brief dengan URL.
- Scenario & confidence:
  - Best/base/worst muncul; tiap angka punya link ke baseline+assumption+benchmark.
  - Confidence score dan driver tampil.
- Export:
  - Download Markdown dan JSON berhasil, konten sesuai struktur PRD.

### Automated checks (minimum)
- Unit test untuk:
  - recommender rules (per template)
  - confidence scoring (completeness/relevance)
  - markdown generator (snapshot-ish, tanpa network)

## Eksekusi Setelah Plan Disetujui

Setelah plan ini disetujui:
- Scaffold project dan dependency.
- Implement domain + UI wizard step-by-step (F1→F6).
- Integrasi endpoint benchmark retrieval dengan Vertex AI (Gemini + grounding).
- Tambahkan test minimal.
- Jalankan build + verifikasi basic flows.


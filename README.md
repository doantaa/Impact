# Impact

Web app untuk membuat *impact brief* secara cepat: input ringkasan inisiatif, pilih metrik, tambah resource + baseline, tarik benchmark, lalu menghasilkan output (scenarios + ringkasan) yang siap diekspor.

## Struktur repo

- `impact_app/` — aplikasi Next.js (App Router)
- `PRD.md` — PRD produk

## Menjalankan aplikasi (lokal)

```bash
cd impact_app
npm install
cp .env.example .env.local
npm run dev
```

Buka: http://localhost:3000

## Environment variables (opsional, untuk live benchmark search)

Jika ingin fitur **live search** benchmark (Vertex AI Gemini + grounding Google Search), isi `.env.local`:

- `GCP_PROJECT_ID`
- `GCP_LOCATION` (default `us-central1`)
- `GCP_SERVICE_ACCOUNT_JSON` (service account JSON dalam bentuk string 1 baris)
- `VERTEX_MODEL` (opsional; default mengikuti `.env.example`)

Jika env tidak diisi, aplikasi tetap bisa digunakan, namun benchmark perlu ditambahkan secara manual.

## Testing & build

```bash
cd impact_app
npm test
npm run build
```


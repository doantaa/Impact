# Impact App

Aplikasi Next.js untuk membuat *impact brief*:
- Multi-draft di Home (bisa lanjutkan/hapus).
- Stepper wizard dari Ringkasan → Metrik → Baselines/Resources → Benchmark → Skenario & Output.
- Output berupa dashboard + ringkasan yang bisa diekspor.

## Menjalankan aplikasi

```bash
npm install
cp .env.example .env.local
npm run dev
```

Buka: http://localhost:3000

## Environment variables

Copy `.env.example` ke `.env.local` lalu isi.

Wajib (untuk benchmark live search via Vertex AI grounding):
- `GCP_PROJECT_ID`
- `GCP_LOCATION` (default `us-central1`)
- `GCP_SERVICE_ACCOUNT_JSON` (service account JSON dalam bentuk string 1 baris)
- `VERTEX_MODEL`

Opsional:
- `NEXT_PUBLIC_ANALYTICS_ENDPOINT` (default `/api/events`)

Jika env benchmark tidak diisi, aplikasi tetap bisa digunakan, namun benchmark perlu ditambahkan secara manual.

## Alur penggunaan

1. **Home**
   - `New brief` membuat draft baru.
   - Draft tersimpan di localStorage browser.

2. **Ringkasan**
   - Isi informasi inti (goal, template type, product type, target users, timeline, release approach, owner, stakeholders).

3. **Metrik**
   - Aplikasi menandai metrik yang direkomendasikan (badge “Direkomendasikan”) berdasarkan Ringkasan, tetapi user bisa memilih metrik mana saja.

4. **Resources (Wajib)**
   - Eng effort / Design effort / PM-Other effort dalam **person-weeks**.
   - Fully-loaded cost rate dalam **IDR / person-week**.
   - Dipakai untuk estimasi cost dan proxy execution complexity.

   Definisi cepat person-week:
   - 1 person-week = 1 orang bekerja full-time selama 1 minggu.
   - Contoh: 2 engineer × 3 minggu = 6 person-weeks.

5. **Baselines (Opsional)**
   - Bisa ditutup (accordion) karena opsional.
   - Di dalamnya tiap metric baseline juga accordion per metrik.

6. **Benchmark**
   - Live search berjalan otomatis saat masuk ke step Benchmark (jika env tersedia).
   - Form “Tambah benchmark manual” tersedia untuk menambah sumber sendiri.

7. **Skenario & Output**
   - Fully generated (tanpa input).
   - Menampilkan scenario dashboard `Worst / Base / Best`.
   - Menampilkan output markdown yang sudah dirender.
   - Tombol export mengunduh output.

## Testing & build

```bash
npm test
npm run build
```

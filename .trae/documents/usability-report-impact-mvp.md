# Usability Testing Sederhana — Impact (MVP)

Tanggal: 2026-05-30  
Build: local dev (`/new`)  

## Ringkasan

Wizard Impact Brief sudah dapat menyelesaikan alur end-to-end (Intake → Metrik → Baseline → Benchmark → Skenario → Pratinjau → Ekspor). Namun ada beberapa friction usability yang berpotensi membuat user:
- merasa sudah mengisi baseline padahal output export tidak memuat baseline,
- merasa rekomendasi metrik “tidak nyambung” dengan goal,
- bingung soal asumsi karena label masih berbentuk key teknis,
- mengekspor brief yang belum lengkap tanpa sadar.

## Metode

Metode ini adalah **cognitive walkthrough + heuristic inspection** (bukan uji pengguna langsung).

Persona yang disimulasikan:
- PM / Product Ops
- Engineering Lead
- Designer / UX Researcher

Skala severity:
- **High**: berpotensi menyebabkan output salah/misleading atau user gagal mencapai tujuan utama.
- **Medium**: menghambat dan menurunkan trust, tapi masih bisa selesai dengan trial-and-error.
- **Low**: polish/kecepatan, tidak memblok.

## Task Scenarios & Hasil

### Persona 1 — PM

**Task:** Buat brief cepat → generate skenario → ekspor untuk dibagikan.

Temuan:
- **High — Baseline terlihat ada di UI, tapi export bisa menampilkan “(no baselines)”.**  
  Penyebab: baseline default dibuat sebagai variabel UI, tidak selalu dipersist ke `draft.baselines`. Output Markdown hanya membaca `brief.baselines`.
- **High — Rekomendasi metrik tidak berubah mengikuti goal statement.**  
  Penyebab: rekomendasi hanya di-recompute saat template berubah, bukan saat goal berubah.
- **Medium — User bisa loncat step via stepper dan mengekspor brief yang belum valid tanpa warning.**  
  Penyebab: stepper bisa di-klik langsung; validasi hanya saat tombol “Lanjut”; tombol “Ekspor” selalu aktif.
- **Medium — Error hanya global list, tidak menunjuk field spesifik dan tidak memindahkan fokus.**

### Persona 2 — Engineering Lead

**Task:** Pilih template Tech Debt → isi asumsi & kompleksitas → yakinkan confidence → ekspor.

Temuan:
- **High — Input assumptions memakai key teknis (mis. `uplift_pct_base`) tanpa label manusia dan tanpa menampilkan rationale.**  
  Dampak: rawan salah isi, terutama jika stakeholder non-teknis ikut mengisi/review.
- **Medium — Benchmark search error masih “teknis” (konfigurasi env) dan tidak menawarkan fallback yang jelas.**  
  Meski sudah ada input manual, user perlu diarahkan.
- **Medium — UI hanya menampilkan skor confidence total; drivers/breakdown tidak terlihat di UI.**

### Persona 3 — Designer

**Task:** Pahami definisi metrik & kebutuhan data → bantu menulis narasi → pastikan output konsisten.

Temuan:
- **Medium — Data requirements untuk metrik tidak tampil di UI (baru muncul di export).**
- **Medium — Konsistensi bahasa campur (Indonesia/Inggris) menurunkan kejelasan & trust.**

## Heuristic Notes (Singkat)

- **Visibility of system status:** tidak ada indikator kelengkapan (baseline x/y, benchmark count) yang selalu terlihat.
- **Match to real world:** assumptions memakai key teknis, bukan bahasa user.
- **Error prevention:** export bisa dilakukan walau step penting belum valid.
- **Recognition over recall:** user harus mengingat apa yang sudah diisi karena tidak ada summary panel.

## Rekomendasi (Prioritas)

### P0 (disarankan segera)

- **Persist baseline untuk semua metrik terpilih (default Unknown)** sehingga output export tidak misleading.
- **Recompute rekomendasi metrik saat goal berubah** (debounce) atau sediakan tombol “Regenerate recommendations”.
- **Perbaiki UX error konfigurasi benchmark**: “Benchmark search belum aktif di environment ini” + CTA ke “Tambah benchmark manual”.
- **Guard export**: tampilkan warning/disable sampai intake+metrics valid minimal (title+goal + ≥3 metrik).

### P1

- **Human-friendly assumptions**: mapping key→label, tampilkan rationale, group field (Uplift/Volume/Complexity/TechDebt).
- **Tampilkan confidence drivers** di UI (breakdown sederhana) + saran “cara menaikkan confidence”.
- **Stepper dengan status** (current/completed/locked) agar non-linear navigation tidak membingungkan.

### P2

- Konsistenkan bahasa UI (Indonesia penuh untuk MVP demo).
- Tampilkan data requirements di kartu metrik (collapsible).
- Inline validation per field + auto-scroll/focus ke error pertama.

## Data yang Masih Perlu Diputuskan (untuk iterasi UX)

- Target pengguna utama untuk demo: internal builder saja, atau juga stakeholder non-teknis?
- Output export harus Bahasa Indonesia full atau bilingual?


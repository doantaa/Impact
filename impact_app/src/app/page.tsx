import { AppShell } from "@/components/AppShell";
import { DraftCard } from "@/components/DraftCard";

export default function Home() {
  return (
    <AppShell title="Impact">
      <div className="grid gap-8 md:grid-cols-2 md:items-start">
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Impact Brief</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Wizard untuk membuat memo keputusan 1 halaman: metrik, baseline, benchmark publik, skenario (best/base/worst),
            confidence, dan ImpactScore yang transparan.
          </p>
          <div className="mt-4 grid gap-2 text-sm text-zinc-700">
            <div>1) Pilih template inisiatif</div>
            <div>2) Review metrik yang direkomendasikan</div>
            <div>3) Isi baseline (boleh unknown)</div>
            <div>4) Cari benchmark publik + citation</div>
            <div>5) Set asumsi → generate skenario</div>
            <div>6) Preview & export Markdown</div>
          </div>
        </div>
        <DraftCard />
      </div>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { deleteDraft, listDrafts } from "@/lib/state/briefStore";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function DraftCard() {
  const [drafts, setDrafts] = useState(() => listDrafts());
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  const items = useMemo(() => {
    return drafts
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((d) => ({
        ...d,
        updatedLabel: d.updatedAt ? new Date(d.updatedAt).toLocaleString() : "",
      }));
  }, [drafts]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-zinc-950">Workspace</div>
        <Link
          href="/new"
          className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Buat baru
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="mt-3 text-sm text-zinc-600">Belum ada draft.</div>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((d) => (
            <div key={d.id} className="rounded-md border border-zinc-200 p-3">
              <div className="text-sm font-semibold tracking-tight text-zinc-950">{d.title}</div>
              <div className="mt-1 text-xs text-zinc-600">
                {d.templateType} • step: {d.step} • {d.updatedLabel}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/new?id=${encodeURIComponent(d.id)}`}
                  className="inline-flex h-8 items-center justify-center rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
                >
                  Lanjutkan
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setPendingDelete({ id: d.id, title: d.title });
                  }}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Hapus draft?"
        description={pendingDelete ? `Draft "${pendingDelete.title}" akan dihapus dari browser ini.` : undefined}
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteDraft(pendingDelete.id);
          setDrafts(listDrafts());
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

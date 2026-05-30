"use client";

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 shadow-lg">
        <div className="text-sm font-semibold tracking-tight text-zinc-950">{props.title}</div>
        {props.description ? <div className="mt-2 text-sm text-zinc-700">{props.description}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            {props.cancelLabel || "Batal"}
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {props.confirmLabel || "Hapus"}
          </button>
        </div>
      </div>
    </div>
  );
}


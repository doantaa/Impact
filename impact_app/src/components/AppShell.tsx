import Link from "next/link";

export function AppShell(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Impact
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Home
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{props.children}</main>
    </div>
  );
}

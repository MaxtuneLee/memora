export function ShortcutHint({
  keys,
  label,
}: {
  keys: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
      <kbd className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-md border border-[#e5e0d8] bg-[#f7f4ef] px-1.5 font-medium text-zinc-500">
        {keys}
      </kbd>
      <span>{label}</span>
    </div>
  );
}

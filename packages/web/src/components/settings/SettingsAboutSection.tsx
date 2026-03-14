import { ArrowUpRightIcon, GithubLogoIcon } from "@phosphor-icons/react";

const APP_DESCRIPTION = "Local-first multimodal learning and memory workspace.";
const SUPPORT_URL = "https://github.com/maxtunelee/memora/issues";

const formatBuildChannel = (channel: string): string => {
  return channel
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

function MetaBadge({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-sm">
      <span className="text-[10px] font-semibold tracking-[0.18em] text-zinc-400 uppercase">
        {label}
      </span>
      <span className="font-semibold text-zinc-900">{value}</span>
    </div>
  );
}

function FactItem({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-zinc-400 uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

export default function SettingsAboutSection() {
  const buildChannel = formatBuildChannel(import.meta.env.MODE);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-[#fcfaf5]">
        <div className="grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="relative overflow-hidden bg-[#879a62] p-5 sm:p-7">
            <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_top_left,rgba(255,255,255,0.2),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.16),transparent_30%),linear-gradient(135deg,transparent_0%,transparent_38%,rgba(255,255,255,0.08)_38%,rgba(255,255,255,0.08)_40%,transparent_40%,transparent_100%)]" />
            <div className="relative rounded-[24px] border border-black/10 bg-[#1d1c1a] p-5 text-zinc-200 shadow-[0_28px_60px_rgba(29,28,26,0.24)] sm:p-6">
              <div className="flex gap-2">
                <span className="size-2.5 rounded-full bg-white/16" />
                <span className="size-2.5 rounded-full bg-white/16" />
                <span className="size-2.5 rounded-full bg-white/16" />
              </div>

              <div className="mt-6">
                <p className="text-[11px] font-semibold tracking-[0.2em] text-zinc-500 uppercase">
                  Memora
                </p>
                <p className="mt-3 max-w-xs text-xl leading-8 font-semibold text-[#f7f3ea]">
                  A calm, local workspace for transcripts, files, and memory.
                </p>
              </div>

              <div className="mt-8 space-y-3 border-t border-white/8 pt-5 text-sm text-zinc-300">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">Version</span>
                  <span className="font-medium text-zinc-100">{__APP_VERSION__}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">Build</span>
                  <span className="font-medium text-zinc-100">{buildChannel}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">Storage</span>
                  <span className="font-medium text-zinc-100">Browser local-first</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">Support</span>
                  <span className="font-medium text-zinc-100">GitHub Issues</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center px-6 py-7 sm:px-8 sm:py-9">
            <p className="text-[11px] font-semibold tracking-[0.22em] text-zinc-400 uppercase">
              About
            </p>
            <h3 className="mt-4 max-w-lg text-4xl leading-[0.95] font-semibold tracking-[-0.04em] text-zinc-950">
              Built to keep your workspace close.
            </h3>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-zinc-600">
              {APP_DESCRIPTION} Memora keeps files, settings, and workspace state
              in browser-managed storage, runs media tooling locally when the
              device supports it, and only uses external AI services when you
              explicitly configure a provider.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <MetaBadge label="Version" value={__APP_VERSION__} />
              <MetaBadge label="Build" value={buildChannel} />
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                <GithubLogoIcon className="size-4" weight="fill" />
                <span>Open GitHub Issues</span>
                <ArrowUpRightIcon className="size-3.5" />
              </a>
              <p className="text-sm text-zinc-500">
                Report bugs or request features for{" "}
                <span className="font-medium text-zinc-700">
                  maxtunelee/memora
                </span>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-zinc-200 bg-white px-5 py-4 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          <FactItem
            label="Storage"
            description="Workspace state lives locally first, with persistence controls available in settings."
          />
          <FactItem
            label="Runtime"
            description="Transcription and media processing stay in-browser when supported by the device."
          />
          <FactItem
            label="Support"
            description="GitHub Issues is the canonical place for bugs, feedback, and feature requests."
          />
        </div>
      </section>
    </div>
  );
}

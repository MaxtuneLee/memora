import { ArrowUpRightIcon, GithubLogoIcon } from "@phosphor-icons/react";

const APP_DESCRIPTION = "Local-first agent lives in your browser.";
const SUPPORT_URL = "https://github.com/maxtunelee/memora/issues";

const formatBuildChannel = (channel: string): string => {
  return channel
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-sm">
      <span className="text-[10px] font-semibold tracking-[0.18em] text-zinc-400 uppercase">
        {label}
      </span>
      <span className="font-semibold text-zinc-900">{value}</span>
    </div>
  );
}

function FactItem({ label, description }: { label: string; description: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-zinc-400 uppercase">{label}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

export default function SettingsAboutSection() {
  const buildChannel = formatBuildChannel(import.meta.env.MODE);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[28px] border border-zinc-200 bg-[#fcfaf5]">
        <div>
          <div className="flex flex-col justify-center px-6 py-7 sm:px-8 sm:py-9">
            <img src="/memora-with-title.png" alt="Memora" className="w-32" />
            <h3 className="mt-4 max-w-lg text-4xl leading-[0.95] font-semibold tracking-[-0.04em] text-zinc-950">
              Built to keep your workspace close
              <span className="text-[#aebe79]">.</span>
            </h3>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-zinc-600">
              {APP_DESCRIPTION} Memora keeps files, settings, and workspace state in browser
              storage.
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
              <p className="text-sm text-zinc-500">Report bugs or request features.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-zinc-200 bg-white px-5 py-4 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FactItem
            label="Your file, your way"
            description="Workspace state lives locally first, with persistence controls available in settings."
          />
          <FactItem
            label="Offline, but always accessible"
            description="Transcription and media processing stay in-browser when supported by the device."
          />
        </div>
      </section>
    </div>
  );
}

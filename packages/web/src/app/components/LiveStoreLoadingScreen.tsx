import { motion, useReducedMotion } from "motion/react";
import MemoraMascot from "@/components/assistant/MemoraMascot";
import type { LiveStoreLoadingStatus } from "../liveStoreLoadingStatus";

interface LiveStoreLoadingScreenProps {
  status: LiveStoreLoadingStatus;
}

const STAGE_COPY: Record<LiveStoreLoadingStatus["stage"], string> = {
  loading: "Waking up your workspace",
  migrating: "Updating local data",
  rehydrating: "Restoring your library",
  syncing: "Syncing recent changes",
};

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
const BACKGROUND_IMAGE = `
  radial-gradient(circle at 50% 24%, rgba(255, 250, 236, 0.98) 0%, rgba(255, 251, 242, 0.82) 34%, rgba(255, 251, 242, 0) 70%),
  radial-gradient(circle at 18% 78%, rgba(135, 154, 79, 0.12) 0%, rgba(135, 154, 79, 0) 42%),
  radial-gradient(circle at 88% 14%, rgba(196, 167, 111, 0.14) 0%, rgba(196, 167, 111, 0) 36%),
  linear-gradient(180deg, #fffdf8 0%, #fffbf2 52%, #f8f1e3 100%)
`;

export default function LiveStoreLoadingScreen({ status }: LiveStoreLoadingScreenProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const progressRatio =
    "progress" in status && status.progress.total > 0
      ? clamp(status.progress.done / status.progress.total, 0, 1)
      : 0;

  return (
    <div
      className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#fffbf2] px-6 py-10 text-[#171311]"
      role="status"
      aria-live="polite"
      style={{ backgroundImage: BACKGROUND_IMAGE }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute left-1/2 top-[18%] h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-[#fff7e7]/80 blur-[88px]"
          animate={
            shouldReduceMotion ? undefined : { opacity: [0.72, 1, 0.72], scale: [0.96, 1.04, 0.96] }
          }
          transition={{
            duration: 5.8,
            repeat: Number.POSITIVE_INFINITY,
            ease: EASE_OUT_QUINT,
          }}
        />
        <motion.div
          className="absolute -left-12 bottom-[-6rem] h-[18rem] w-[18rem] rounded-full bg-[#8ea15b]/12 blur-[96px]"
          animate={
            shouldReduceMotion
              ? undefined
              : { opacity: [0.28, 0.48, 0.28], scale: [0.94, 1.08, 0.94] }
          }
          transition={{
            duration: 7.2,
            repeat: Number.POSITIVE_INFINITY,
            ease: EASE_OUT_QUINT,
          }}
        />
        <motion.div
          className="absolute right-[-5rem] top-[-5rem] h-[16rem] w-[16rem] rounded-full bg-[#cfb27c]/16 blur-[80px]"
          animate={
            shouldReduceMotion ? undefined : { opacity: [0.22, 0.42, 0.22], scale: [1, 1.12, 1] }
          }
          transition={{
            duration: 6.4,
            repeat: Number.POSITIVE_INFINITY,
            ease: EASE_OUT_QUINT,
          }}
        />
      </div>

      <motion.div
        className="relative z-10 flex w-full max-w-sm flex-col items-center"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: EASE_OUT_QUINT }}
      >
        <MemoraMascot
          state="thinking"
          decorative
          animated={!shouldReduceMotion}
          className="size-[clamp(9.5rem,20vw,12rem)]"
        />

        <div className="mt-5 flex flex-col items-center gap-2 text-center">
          <p className="text-[clamp(1.55rem,2.8vw,1.9rem)] font-semibold tracking-[-0.05em] text-[#171311]">
            Preparing Memora
          </p>
          <p className="max-w-[17rem] text-sm leading-6 tracking-[0.01em] text-[#6c645a]">
            {STAGE_COPY[status.stage]}
          </p>
        </div>

        <div className="mt-8 w-full max-w-[15rem]">
          {"progress" in status ? (
            <div className="space-y-2.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-[#d9cfbf]/70">
                <motion.div
                  className="h-full rounded-full bg-[#1a1612]"
                  initial={{ scaleX: 0.02 }}
                  animate={{ scaleX: Math.max(progressRatio, 0.02) }}
                  transition={{ duration: 0.35, ease: EASE_OUT_QUINT }}
                  style={{ transformOrigin: "left center" }}
                />
              </div>
              <p className="text-center text-[0.68rem] uppercase tracking-[0.26em] text-[#8a7f72]">
                {status.progress.done} / {status.progress.total}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2.5">
              {[0, 1, 2].map((index) => (
                <motion.span
                  key={index}
                  className="h-2.5 w-2.5 rounded-full bg-[#1a1612]"
                  animate={
                    shouldReduceMotion
                      ? { opacity: 0.7 }
                      : {
                          opacity: [0.25, 1, 0.25],
                          scale: [0.86, 1, 0.86],
                          y: [0, -2, 0],
                        }
                  }
                  transition={{
                    duration: 1.35,
                    delay: index * 0.18,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

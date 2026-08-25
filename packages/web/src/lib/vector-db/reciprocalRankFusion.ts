export const DEFAULT_RRF_K = 60;
export const RRF_K_OPTIONS = [20, 40, 60, 80] as const;

export type RrfKOption = (typeof RRF_K_OPTIONS)[number];

export const normalizeRrfK = (value?: number): number => {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : DEFAULT_RRF_K;
};

export const getRrfContribution = (rank: number, weight: number, rrfK?: number): number => {
  if (!Number.isFinite(rank) || rank < 1 || !Number.isFinite(weight) || weight <= 0) return 0;
  return weight / (normalizeRrfK(rrfK) + Math.floor(rank));
};

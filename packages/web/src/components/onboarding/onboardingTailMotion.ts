export type TailPoint = [number, number];

export interface TailAvoidance {
  centerT: number;
  direction: TailPoint;
  startedAt: number;
  strength: number;
}

export const TAIL_AVOIDANCE_DURATION = 620;

const TAIL_AVOIDANCE_ENTER_DURATION = 140;
const TAIL_AVOIDANCE_EXIT_DELAY = 90;
const TAIL_TARGET_LENGTH = 830;
const TAIL_BEZIER_SAMPLE_COUNT = 96;
const TAIL_PATH_POINT_COUNT = 18;
export const TAIL_BONE_LENGTH = TAIL_TARGET_LENGTH / (TAIL_PATH_POINT_COUNT - 1);
const TAIL_PHASE_DIVISOR = 720;
const TAIL_AVOIDANCE_FORCE = 96;
const TAIL_AVOIDANCE_DISTANCE_SIGMA = 300;
const TAIL_AVOIDANCE_LOCAL_SIGMA = 0.22;
const TAIL_ROOT_ANCHOR_END = 0.18;
const TAIL_MAX_COMBINED_OFFSET = 112;

const easeInOutSine = (value: number): number => (1 - Math.cos(Math.PI * value)) / 2;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const getTailPhase = (elapsedMilliseconds: number): number =>
  elapsedMilliseconds / TAIL_PHASE_DIVISOR;

export const getTailBezierPoint = (phase: number, t: number): TailPoint => {
  const tipDirection = Math.sin(phase * 0.62 - 0.9);
  const arc = easeInOutSine(t);
  const taper = Math.pow(easeInOutSine(t), 1.45);
  const rootX = 288;
  const rootY = 60;
  const centerDrift = 100 * t * t;
  const leftCurl = Math.sin(Math.PI * t) * (178 - 54 * t);
  const softCounterCurl = Math.sin(Math.PI * t * 0.62) * 22 * t;
  const middleWeight = Math.sin(Math.PI * t);
  const lowerMiddleWeight = Math.sin(Math.PI * clamp01((t - 0.18) / 0.82));
  const linkedSwing = tipDirection * taper * 142;
  const tipFadeOut = 1 - easeInOutSine(clamp01((t - 0.7) / 0.3));
  const lowerTipFadeOut = 1 - easeInOutSine(clamp01((t - 0.78) / 0.22));
  const middleWave =
    Math.sin(phase * 0.72 + t * Math.PI * 1.7 - 0.6) * middleWeight * tipFadeOut * 24;
  const lowerWave =
    Math.sin(phase * 0.9 - t * Math.PI * 2.15 + 0.4) *
    Math.pow(lowerMiddleWeight, 1.25) *
    lowerTipFadeOut *
    10;
  const breathingCurve = Math.sin(phase * 0.42 + t * Math.PI * 1.15) * 6 * taper;
  const verticalWave = Math.sin(phase * 0.66 + t * Math.PI * 1.35) * middleWeight * 7;

  return [
    rootX -
      leftCurl +
      centerDrift +
      softCounterCurl +
      linkedSwing +
      middleWave +
      lowerWave +
      breathingCurve,
    rootY + 778 * arc + verticalWave,
  ];
};

const getDistance = ([x0, y0]: TailPoint, [x1, y1]: TailPoint): number =>
  Math.hypot(x1 - x0, y1 - y0);

const sampleTailBezier = (phase: number): TailPoint[] =>
  Array.from({ length: TAIL_BEZIER_SAMPLE_COUNT + 1 }, (_, index) =>
    getTailBezierPoint(phase, index / TAIL_BEZIER_SAMPLE_COUNT),
  );

const resampleByLength = (points: TailPoint[]): TailPoint[] => {
  const sampledPoints: TailPoint[] = [points[0]];
  let segmentIndex = 1;
  let walkedLength = 0;

  for (let index = 1; index < TAIL_PATH_POINT_COUNT; index += 1) {
    const targetLength = (TAIL_TARGET_LENGTH * index) / (TAIL_PATH_POINT_COUNT - 1);

    while (segmentIndex < points.length - 1) {
      const segmentLength = getDistance(points[segmentIndex - 1], points[segmentIndex]);
      if (walkedLength + segmentLength >= targetLength) break;
      walkedLength += segmentLength;
      segmentIndex += 1;
    }

    const previous = points[segmentIndex - 1];
    const next = points[segmentIndex];
    const segmentLength = Math.max(getDistance(previous, next), 0.001);
    const localT = clamp01((targetLength - walkedLength) / segmentLength);
    sampledPoints.push([
      previous[0] + (next[0] - previous[0]) * localT,
      previous[1] + (next[1] - previous[1]) * localT,
    ]);
  }

  return sampledPoints;
};

const getTailAvoidanceResponse = (avoidance: TailAvoidance, timestamp: number): number => {
  const elapsed = timestamp - avoidance.startedAt;
  if (elapsed < 0 || elapsed >= TAIL_AVOIDANCE_DURATION) return 0;

  const enter = easeInOutSine(clamp01(elapsed / TAIL_AVOIDANCE_ENTER_DURATION));
  const exit =
    1 -
    easeInOutSine(
      clamp01(
        (elapsed - TAIL_AVOIDANCE_EXIT_DELAY) /
          (TAIL_AVOIDANCE_DURATION - TAIL_AVOIDANCE_EXIT_DELAY),
      ),
    );
  return enter * exit;
};

export const getTailAvoidanceOffset = (
  t: number,
  avoidances: TailAvoidance[],
  timestamp: number,
): TailPoint => {
  if (t <= 0 || avoidances.length === 0) return [0, 0];

  const rootAnchor = easeInOutSine(clamp01(t / TAIL_ROOT_ANCHOR_END));
  let offsetX = 0;
  let offsetY = 0;

  for (const avoidance of avoidances) {
    const response = getTailAvoidanceResponse(avoidance, timestamp);
    if (response === 0) continue;

    const distanceFromImpact = t - avoidance.centerT;
    const localInfluence = Math.exp(
      -(distanceFromImpact * distanceFromImpact) /
        (2 * TAIL_AVOIDANCE_LOCAL_SIGMA * TAIL_AVOIDANCE_LOCAL_SIGMA),
    );
    const force = avoidance.strength * response * localInfluence * rootAnchor;
    offsetX += avoidance.direction[0] * force;
    offsetY += avoidance.direction[1] * force;
  }

  const offsetLength = Math.hypot(offsetX, offsetY);
  if (offsetLength <= TAIL_MAX_COMBINED_OFFSET) return [offsetX, offsetY];

  const scale = TAIL_MAX_COMBINED_OFFSET / offsetLength;
  return [offsetX * scale, offsetY * scale];
};

const applyTailAvoidance = (
  points: TailPoint[],
  avoidances: TailAvoidance[],
  timestamp: number,
): TailPoint[] => {
  if (avoidances.length === 0) return points;

  const walkedLengths = [0];
  let totalLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    totalLength += getDistance(points[index - 1], points[index]);
    walkedLengths.push(totalLength);
  }

  const safeTotalLength = Math.max(totalLength, 0.001);
  return points.map(([x, y], index) => {
    const [offsetX, offsetY] = getTailAvoidanceOffset(
      walkedLengths[index] / safeTotalLength,
      avoidances,
      timestamp,
    );
    return [x + offsetX, y + offsetY];
  });
};

interface ClosestTailLocation {
  point: TailPoint;
  segmentDirection: TailPoint;
  t: number;
  distance: number;
}

const getClosestTailLocation = (points: TailPoint[], target: TailPoint): ClosestTailLocation => {
  let closestPoint: TailPoint = points[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestSegmentDirection: TailPoint = [0, 1];
  let closestT = 0;
  const lastPointIndex = Math.max(1, points.length - 1);

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentX = end[0] - start[0];
    const segmentY = end[1] - start[1];
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    if (segmentLengthSquared <= Number.EPSILON) continue;

    const projection = clamp01(
      ((target[0] - start[0]) * segmentX + (target[1] - start[1]) * segmentY) /
        segmentLengthSquared,
    );
    const candidate: TailPoint = [
      start[0] + segmentX * projection,
      start[1] + segmentY * projection,
    ];
    const distance = getDistance(candidate, target);
    if (distance >= closestDistance) continue;

    const segmentLength = Math.sqrt(segmentLengthSquared);
    closestPoint = candidate;
    closestDistance = distance;
    closestSegmentDirection = [segmentX / segmentLength, segmentY / segmentLength];
    closestT = (index + projection) / lastPointIndex;
  }

  return {
    point: closestPoint,
    segmentDirection: closestSegmentDirection,
    t: closestT,
    distance: closestDistance,
  };
};

export const createTailAvoidance = (
  phase: number,
  target: TailPoint,
  startedAt: number,
  activeAvoidances: TailAvoidance[],
): TailAvoidance => {
  const currentPoints = getTailSkeleton(phase, activeAvoidances, startedAt);
  const closest = getClosestTailLocation(currentPoints, target);
  let normalX = -closest.segmentDirection[1];
  let normalY = closest.segmentDirection[0];
  const awayX = closest.point[0] - target[0];
  const awayY = closest.point[1] - target[1];

  if (awayX * normalX + awayY * normalY < 0) {
    normalX *= -1;
    normalY *= -1;
  }

  const proximity = Math.exp(
    -(closest.distance * closest.distance) /
      (2 * TAIL_AVOIDANCE_DISTANCE_SIGMA * TAIL_AVOIDANCE_DISTANCE_SIGMA),
  );

  return {
    centerT: closest.t,
    direction: [normalX, normalY],
    startedAt,
    strength: TAIL_AVOIDANCE_FORCE * proximity,
  };
};

export const getActiveTailAvoidances = (
  avoidances: TailAvoidance[],
  timestamp: number,
): TailAvoidance[] =>
  avoidances.filter(
    (avoidance) =>
      timestamp >= avoidance.startedAt && timestamp - avoidance.startedAt < TAIL_AVOIDANCE_DURATION,
  );

export const getTailSkeleton = (
  phase: number,
  avoidances: TailAvoidance[] = [],
  timestamp = 0,
): TailPoint[] =>
  resampleByLength(applyTailAvoidance(sampleTailBezier(phase), avoidances, timestamp));

export const buildTailPath = (
  phase: number,
  avoidances: TailAvoidance[] = [],
  timestamp = 0,
): string => {
  const points = getTailSkeleton(phase, avoidances, timestamp);
  const path = [`M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[Math.min(points.length - 1, index + 2)];
    const control1X = current[0] + (next[0] - previous[0]) / 6;
    const control1Y = current[1] + (next[1] - previous[1]) / 6;
    const control2X = next[0] - (afterNext[0] - current[0]) / 6;
    const control2Y = next[1] - (afterNext[1] - current[1]) / 6;

    path.push(
      `C ${control1X.toFixed(2)} ${control1Y.toFixed(2)} ${control2X.toFixed(2)} ${control2Y.toFixed(2)} ${next[0].toFixed(2)} ${next[1].toFixed(2)}`,
    );
  }

  return path.join(" ");
};

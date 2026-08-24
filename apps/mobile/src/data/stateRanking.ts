import absStates2021 from "./absStates2021.json";
import type {
  OccurrenceFeature,
  OccurrenceFeatureCollection,
} from "./occurrenceLoader";

type Position = [number, number];
type LinearRing = Position[];
type PolygonCoordinates = LinearRing[];

type BoundaryPolygon = {
  rings: PolygonCoordinates;
  bounds: [number, number, number, number];
};

type StateBoundary = {
  stateCode: string;
  stateName: string;
  polygons: BoundaryPolygon[];
};

export type StateOccurrenceRanking = {
  stateCode: string;
  stateName: string;
  count: number;
};

export type StateRankingResult = {
  rankings: StateOccurrenceRanking[];
  unassignedCount: number;
};

function polygonBounds(rings: PolygonCoordinates): BoundaryPolygon["bounds"] {
  const outerRing = rings[0];
  const longitudes = outerRing.map(([longitude]) => longitude);
  const latitudes = outerRing.map(([, latitude]) => latitude);
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}

const STATE_BOUNDARIES: StateBoundary[] = absStates2021.features.map((feature) => ({
  stateCode: feature.properties.stateCode,
  stateName: feature.properties.stateName,
  polygons: (feature.geometry.coordinates as PolygonCoordinates[])
    .map((rings) => ({ rings, bounds: polygonBounds(rings) }))
    .sort((left, right) => {
      const leftArea = (left.bounds[2] - left.bounds[0]) * (left.bounds[3] - left.bounds[1]);
      const rightArea = (right.bounds[2] - right.bounds[0]) * (right.bounds[3] - right.bounds[1]);
      return rightArea - leftArea;
    }),
}));

const stateCache = new WeakMap<OccurrenceFeature, StateBoundary | null>();

function pointOnSegment(point: Position, start: Position, end: Position) {
  const [x, y] = point;
  const [startX, startY] = start;
  const [endX, endY] = end;
  const cross = (x - startX) * (endY - startY) - (y - startY) * (endX - startX);
  if (Math.abs(cross) > 1e-9) {
    return false;
  }
  return (
    x >= Math.min(startX, endX) &&
    x <= Math.max(startX, endX) &&
    y >= Math.min(startY, endY) &&
    y <= Math.max(startY, endY)
  );
}

function pointInRing(point: Position, ring: LinearRing) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const start = ring[previous];
    const end = ring[current];
    if (pointOnSegment(point, start, end)) {
      return true;
    }
    const crossesLatitude = start[1] > point[1] !== end[1] > point[1];
    const crossingLongitude =
      ((end[0] - start[0]) * (point[1] - start[1])) / (end[1] - start[1]) + start[0];
    if (crossesLatitude && point[0] < crossingLongitude) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point: Position, polygon: BoundaryPolygon) {
  const [longitude, latitude] = point;
  const [west, south, east, north] = polygon.bounds;
  if (longitude < west || longitude > east || latitude < south || latitude > north) {
    return false;
  }
  return pointInRing(point, polygon.rings[0]) &&
    polygon.rings.slice(1).every((hole) => !pointInRing(point, hole));
}

export function findAustralianState(feature: OccurrenceFeature) {
  const cached = stateCache.get(feature);
  if (cached !== undefined) {
    return cached;
  }

  const point = feature.geometry.coordinates;
  const state =
    STATE_BOUNDARIES.find((boundary) =>
      boundary.polygons.some((polygon) => pointInPolygon(point, polygon)),
    ) ?? null;
  stateCache.set(feature, state);
  return state;
}

export function rankOccurrencesByState(
  collection: OccurrenceFeatureCollection,
): StateRankingResult {
  const counts = new Map<string, StateOccurrenceRanking>();
  let unassignedCount = 0;

  for (const feature of collection.features) {
    const state = findAustralianState(feature);
    if (!state) {
      unassignedCount += 1;
      continue;
    }
    const current = counts.get(state.stateCode);
    counts.set(state.stateCode, {
      stateCode: state.stateCode,
      stateName: state.stateName,
      count: (current?.count ?? 0) + 1,
    });
  }

  return {
    rankings: [...counts.values()].sort(
      (left, right) => right.count - left.count || left.stateName.localeCompare(right.stateName),
    ),
    unassignedCount,
  };
}

export const STATE_BOUNDARY_SOURCE = {
  name: absStates2021.source,
  url: absStates2021.sourceUrl,
  generalisation: absStates2021.generalisation,
};

import CryptoJS from "crypto-js";

export interface IMarker {
  title: string;
  seconds: number;
  end_seconds?: number | null;
  primaryTag: { name: string };
}

// Use dynamic programming to find maximum weight independent set (ie the set of markers that have the highest total duration that don't overlap)
export function findMWIS(markers: IMarker[]): IMarker[] {
  if (!markers.length) return [];

  // Sort markers by end time
  markers = markers
    .slice()
    .sort((a, b) => (a.end_seconds || 0) - (b.end_seconds || 0));
  const n = markers.length;

  // Compute p(j) for each marker. This is the index of the marker that has the highest end time that doesn't overlap with marker j
  const p: number[] = new Array(n).fill(-1);
  for (let j = 0; j < n; j++) {
    for (let i = j - 1; i >= 0; i--) {
      if ((markers[i].end_seconds || 0) <= markers[j].seconds) {
        p[j] = i;
        break;
      }
    }
  }

  // Initialize M[j]
  // Compute M[j] for each marker. This is the maximum total duration of markers that don't overlap with marker j
  const M: number[] = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    const include =
      (markers[j].end_seconds || 0) - markers[j].seconds + (M[p[j]] || 0);
    const exclude = j > 0 ? M[j - 1] : 0;
    M[j] = Math.max(include, exclude);
  }

  // Reconstruct optimal solution
  const findSolution = (j: number): IMarker[] => {
    if (j < 0) return [];
    const include =
      (markers[j].end_seconds || 0) - markers[j].seconds + (M[p[j]] || 0);
    const exclude = j > 0 ? M[j - 1] : 0;
    if (include >= exclude) {
      return [...findSolution(p[j]), markers[j]];
    } else {
      return findSolution(j - 1);
    }
  };

  return findSolution(n - 1);
}

// Splits range markers into layers so that markers within a layer never overlap, filling the lower layers first.
export function layerRangeMarkers(markers: IMarker[]): IMarker[][] {
  const layers: IMarker[][] = [];
  let remainingMarkers = [...markers];

  while (remainingMarkers.length > 0) {
    const mwis = findMWIS(remainingMarkers);
    if (!mwis.length) break;

    layers.push(mwis);
    remainingMarkers = remainingMarkers.filter(
      (marker) => !mwis.includes(marker)
    );
  }

  return layers;
}

export function getTagColors(tagNames: string[]) {
  const baseHues: { [tag: string]: number } = {};
  for (const tag of tagNames) {
    baseHues[tag] = computeBaseHue(tag);
  }

  // Adjust hues to avoid similar colors
  const adjustedHues = adjustHues(baseHues);

  const tagColors: { [tag: string]: string } = {};
  for (const tag of tagNames) {
    tagColors[tag] = hueToColor(adjustedHues[tag]);
  }
  return tagColors;
}

// Helper methods translated from Python

// Compute base hue from tag name
function computeBaseHue(tag: string): number {
  const hash = CryptoJS.SHA256(tag);
  const hashHex = hash.toString(CryptoJS.enc.Hex);
  const hashInt = BigInt(`0x${hashHex}`);
  const baseHue = Number(hashInt % BigInt(360)); // Map to [0, 360)
  return baseHue;
}

// Calculate minimum acceptable hue difference based on number of tags
function calculateDeltaMin(N: number): number {
  const maxDeltaNeeded = 35;
  let scalingFactor: number;

  if (N <= 4) {
    scalingFactor = 0.8;
  } else if (N <= 10) {
    scalingFactor = 0.6;
  } else {
    scalingFactor = 0.4;
  }

  const deltaMin = Math.min((360 / N) * scalingFactor, maxDeltaNeeded);
  return deltaMin;
}

// Adjust hues to ensure minimum difference
function adjustHues(baseHues: { [tag: string]: number }): {
  [tag: string]: number;
} {
  const adjustedHues: { [tag: string]: number } = {};
  const tags = Object.keys(baseHues);
  const N = tags.length;
  const deltaMin = calculateDeltaMin(N);

  // Sort the tags by base hue
  const sortedTags = tags.sort((a, b) => baseHues[a] - baseHues[b]);
  // Get sorted base hues
  const baseHuesSorted = sortedTags.map((tag) => baseHues[tag]);

  // Unwrap hues to handle circular nature
  const unwrappedHues = [...baseHuesSorted];
  for (let i = 1; i < N; i++) {
    if (unwrappedHues[i] <= unwrappedHues[i - 1]) {
      unwrappedHues[i] += 360; // Unwrap by adding 360 degrees
    }
  }

  // Adjust hues to ensure minimum difference
  for (let i = 1; i < N; i++) {
    const requiredHue = unwrappedHues[i - 1] + deltaMin;
    if (unwrappedHues[i] < requiredHue) {
      unwrappedHues[i] = requiredHue; // Adjust hue minimally
    }
  }

  // Handle wrap-around difference
  const endGap = unwrappedHues[0] + 360 - unwrappedHues[N - 1];
  if (endGap < deltaMin) {
    // Adjust first and last hues minimally to increase end gap
    const adjustmentNeeded = (deltaMin - endGap) / 2;
    // Adjust the first hue backward, ensure it doesn't go below other hues
    unwrappedHues[0] = Math.max(
      unwrappedHues[0] - adjustmentNeeded,
      unwrappedHues[1] - 360 + deltaMin
    );
    // Adjust the last hue forward
    unwrappedHues[N - 1] += adjustmentNeeded;
  }

  // Wrap adjusted hues back to [0, 360)
  const adjustedHuesList = unwrappedHues.map((hue) => hue % 360);

  // Map adjusted hues back to tags
  for (let i = 0; i < N; i++) {
    adjustedHues[sortedTags[i]] = adjustedHuesList[i];
  }

  return adjustedHues;
}

// Convert hue to RGB color in hex format
function hueToColor(hue: number): string {
  // Convert hue from degrees to [0, 1)
  const hueNormalized = hue / 360.0;
  const saturation = 0.65;
  const value = 0.95;
  const rgb = hsvToRgb(hueNormalized, saturation, value);
  const alpha = 0.6; // Set the desired alpha value here
  const rgbColor = `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(
    rgb[2]
  )}${toHex(Math.round(alpha * 255))}`;
  return rgbColor;
}

// Convert HSV to RGB
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r: number, g: number, b: number;
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
    default:
      r = v;
      g = t;
      b = p;
      break;
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Convert a number to two-digit hex string
function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

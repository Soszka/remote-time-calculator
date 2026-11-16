import { glyphInteriorDistance } from './liquid-distance-field';

export interface GlassMaskInput {
  alpha: Uint8ClampedArray;
  surface: Uint8ClampedArray;
  width: number;
  height: number;
  ratio: number;
}

/** Encode the original optical surface without doing this pixel loop in the UI. */
export function encodeGlassMask({ alpha, surface, width, height, ratio }: GlassMaskInput): Uint8ClampedArray {
  const distance = glyphInteriorDistance(alpha, width, height);
  for (let i = 0; i < distance.length; i++) {
    const pixel = i * 4;
    surface[pixel + 1] = surface[pixel + 3];
    if (distance[i] === 0 && surface[pixel + 1] < 2) {
      surface[pixel] = surface[pixel + 2] = 0;
      surface[pixel + 3] = 255;
      continue;
    }
    const x = i % width, y = Math.floor(i / width);
    let smoothed = 0, weights = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
      const weight = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
      smoothed += Math.max(0, distance[(y + dy) * width + x + dx] - .5) * weight;
      weights += weight;
    }
    const encoded = Math.round(Math.min(32, smoothed / weights / ratio) * 65535 / 32);
    surface[pixel] = encoded >>> 8;
    surface[pixel + 2] = encoded & 255;
    surface[pixel + 3] = 255;
  }
  return surface;
}

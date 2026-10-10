// Separable squared Euclidean distance transform of the glyph's interior.
// Unlike a blurred outline, this describes the rounded surface across a stroke.
export function glyphInteriorDistance(alpha: Uint8ClampedArray, width: number, height: number): Float32Array {
  const size = Math.max(width, height);
  const field = new Float32Array(width * height);
  const line = new Float32Array(size);
  const output = new Float32Array(size);
  const sites = new Int32Array(size);
  const cuts = new Float64Array(size + 1);

  const transform = (count: number): void => {
    let k = 0;
    sites[0] = 0;
    cuts[0] = -Infinity;
    cuts[1] = Infinity;
    for (let q = 1; q < count; q++) {
      let intersection: number;
      do {
        const previous = sites[k];
        intersection = (line[q] + q * q - line[previous] - previous * previous) / (2 * (q - previous));
        if (intersection <= cuts[k]) k--;
        else break;
      } while (k >= 0);
      k++;
      sites[k] = q;
      cuts[k] = intersection!;
      cuts[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < count; q++) {
      while (cuts[k + 1] < q) k++;
      const delta = q - sites[k];
      output[q] = delta * delta + line[sites[k]];
    }
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) line[x] = alpha[(y * width + x) * 4 + 3] >= 128 ? 1e10 : 0;
    transform(width);
    field.set(output.subarray(0, width), y * width);
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) line[y] = field[y * width + x];
    transform(height);
    for (let y = 0; y < height; y++) field[y * width + x] = Math.sqrt(output[y]);
  }
  return field;
}

import { glyphInteriorDistance } from './liquid-distance-field';

describe('Glass numeral surface', () => {
  it('measures the rounded stroke from its edge through its interior', () => {
    const pixels = new Uint8ClampedArray(9 * 9 * 4);
    for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) pixels[(y * 9 + x) * 4 + 3] = 255;
    const distance = glyphInteriorDistance(pixels, 9, 9);
    expect(distance[0]).toBe(0);
    expect(distance[2 * 9 + 2]).toBe(1);
    expect(distance[3 * 9 + 3]).toBe(2);
    expect(distance[4 * 9 + 4]).toBe(3);
  });

  it('uses Euclidean distances around curved corners', () => {
    const pixels = new Uint8ClampedArray(5 * 5 * 4).fill(255);
    pixels[3] = 0;
    const distance = glyphInteriorDistance(pixels, 5, 5);
    expect(distance[1 * 5 + 1]).toBeCloseTo(Math.sqrt(2));
    expect(distance[3 * 5 + 4]).toBe(5);
  });

  it('leaves an empty clock mask flat', () => {
    const distance = glyphInteriorDistance(new Uint8ClampedArray(8 * 3 * 4), 8, 3);
    expect(Array.from(distance)).toEqual(new Array(24).fill(0));
  });
});

// EVR-95. Pixel statistics run in a worker with one frame in flight.
export type Features = {
  brightness: number; red: number; green: number; blue: number; color: number;
  motion: number; directionX: number; directionY: number; changedFraction: number;
};
export type TargetColor = [number, number, number];
export function extractFeatures(data: Uint8ClampedArray, previous: Uint8ClampedArray | undefined,
  width: number, target: TargetColor, tolerance: number): Features {
  if (!data.length || data.length % 4 || !Number.isInteger(width) || width < 1 || data.length % (width * 4)) {
    throw new Error('Invalid image dimensions.');
  }
  const pixels = data.length / 4;
  let red = 0, green = 0, blue = 0, motion = 0, color = 0, changed = 0;
  let currentX = 0, currentY = 0, previousX = 0, previousY = 0, mass = 0, oldMass = 0;
  const compare = previous?.length === data.length;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    red += r; green += g; blue += b;
    const distance = Math.hypot(r - target[0], g - target[1], b - target[2]) / Math.sqrt(3);
    color += Math.max(0, 1 - distance / Math.max(0.01, tolerance));
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const x = (i / 4) % width, y = Math.floor(i / 4 / width);
    currentX += x * lum; currentY += y * lum; mass += lum;
    if (compare) {
      const old = (0.2126 * previous![i] + 0.7152 * previous![i + 1] + 0.0722 * previous![i + 2]) / 255;
      const delta = Math.abs(lum - old);
      motion += delta;
      if (delta > 0.04) changed++;
      previousX += x * old; previousY += y * old; oldMass += old;
    }
  }
  return { brightness: (0.2126 * red + 0.7152 * green + 0.0722 * blue) / pixels,
    red: red / pixels, green: green / pixels, blue: blue / pixels, color: color / pixels,
    motion: motion / pixels, changedFraction: changed / pixels,
    directionX: compare && mass > 0.001 && oldMass > 0.001 ? (currentX / mass - previousX / oldMass) / width : 0,
    directionY: compare && mass > 0.001 && oldMass > 0.001 ? (currentY / mass - previousY / oldMass) / (pixels / width) : 0 };
}


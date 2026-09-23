/**
 * Official Dlicom logo geometry (from dlicom.io/logo.svg, viewBox 40×24.96).
 * Used to draw the logo directly onto the canvas — e.g. on DLI coins —
 * at any resolution without an extra image request.
 */
export const LOGO_VIEWBOX = Object.freeze({ width: 40, height: 24.96 });

export const LOGO_PATHS = Object.freeze([
  'M39.3884 2.03184C40.4043 1.56394 40.0802 0 38.967 0H19.9199C14.4163 0 9.78699 3.85968 8.44412 9.09388H8.45669C8.29474 9.71071 8.1768 10.3454 8.10919 10.9962C8.06988 11.3993 8.04944 11.8073 8.04944 12.2218V12.6443C8.08246 13.8764 8.29002 15.0631 8.65012 16.1803L11.6661 14.7911L14.1599 13.6433L13.0152 12.4646L19.9921 5.28115L23.8023 9.20397L25.5209 8.41229L30.3593 6.18455L39.3869 2.0286L39.3884 2.03184Z',
  'M19.9903 8.02686L15.6819 12.4629L16.001 12.7932L21.9559 10.0522L19.9903 8.02686Z',
  'M0.611931 22.9281C-0.403873 23.3961 -0.0799483 24.96 1.03335 24.96H20.0805C25.5856 24.96 30.215 21.1003 31.5563 15.8661H31.5436C31.7056 15.2492 31.8236 14.6146 31.8911 13.9638C31.9305 13.5607 31.9508 13.1527 31.9508 12.7382V12.3157C31.9178 11.0836 31.7104 9.8969 31.3502 8.77979L28.3342 10.1689L25.8404 11.3167L26.985 12.4954L20.0082 19.6788L16.198 15.756L14.4794 16.5477L9.64095 18.7754L0.611931 22.9281Z',
  'M20.0069 16.9274L24.3155 12.4914L23.9947 12.1611L18.0414 14.9021L20.0069 16.9274Z',
  'M19.9904 8.03271L15.6819 12.4688L19.9904 16.9049L24.299 12.4688L19.9904 8.03271Z',
]);

let cached = null;

/** Lazily-built Path2D objects (browser only). */
export function getLogoPaths() {
  if (!cached) cached = LOGO_PATHS.map((d) => new Path2D(d));
  return cached;
}

/**
 * Draw the logo centred at (x, y) with the given width.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawLogo(ctx, x, y, width, color = '#ffffff') {
  const s = width / LOGO_VIEWBOX.width;
  ctx.save();
  ctx.translate(x - width / 2, y - (LOGO_VIEWBOX.height * s) / 2);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  for (const p of getLogoPaths()) ctx.fill(p);
  ctx.restore();
}

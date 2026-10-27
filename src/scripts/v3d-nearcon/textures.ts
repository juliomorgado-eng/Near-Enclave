// Sealed-invitation faces, painted once into channel-packed canvases. No text anywhere:
//   R = engraved frame + NEAR mark (inside the seal)
//   G = the hidden letter: abstract bars, only ever seen through frost
//   B = amber wax seal disc (front only)
import markSvg from '../../../public/assets/logos/near-mark.svg?raw';

export const TEX_W = 1024;
export const TEX_H = 646;

const paths = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => new Path2D(m[1]));

function layer(draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  draw(g);
  return g.getImageData(0, 0, TEX_W, TEX_H).data;
}

function pack(r: Uint8ClampedArray, gch: Uint8ClampedArray, b: Uint8ClampedArray) {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(TEX_W, TEX_H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r[i + 3];
    d[i + 1] = gch[i + 3];
    d[i + 2] = b[i + 3];
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export const SEAL = { x: TEX_W / 2, y: TEX_H / 2, r: 118 };

function frame(g: CanvasRenderingContext2D) {
  g.globalAlpha = 0.32;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(24, 24, TEX_W - 48, TEX_H - 48, 26);
  g.stroke();
  g.globalAlpha = 1;
}

// lines of a letter that can't be read: varied lengths, a heading block, a short sign-off
function bars(g: CanvasRenderingContext2D, seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const M = 92;
  g.fillRect(M, 92, 300, 30);
  const rows = 7;
  for (let i = 0; i < rows; i++) {
    const y = 176 + i * 44;
    const w = i === rows - 1 ? 260 : (TEX_W - M * 2) * (0.62 + rnd() * 0.38);
    g.fillRect(M, y, w, 14);
  }
  g.fillRect(TEX_W - M - 180, TEX_H - 104, 180, 14);
}

export function paintFront() {
  const mark = paths(markSvg);
  const R = layer((g) => {
    frame(g);
    // NEAR mark, centred in the seal
    const s = 8.4;
    g.save();
    g.translate(SEAL.x - 8 * s, SEAL.y - 8 * s);
    g.scale(s, s);
    mark.forEach((p) => g.fill(p));
    g.restore();
    // seal rim
    g.globalAlpha = 0.5;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(SEAL.x, SEAL.y, SEAL.r - 12, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  });
  const G = layer((g) => bars(g, 7));
  const B = layer((g) => {
    g.beginPath();
    g.arc(SEAL.x, SEAL.y, SEAL.r, 0, Math.PI * 2);
    g.fill();
  });
  return pack(R, G, B);
}

// Back: a record of who holds the invitation, drawn as abstract rows (no glyphs).
//   R = frame, row label stubs, small NEAR mark   G = public values (segmented bars)
//   B = row id band, (id+1)*40, so the shader can redact row by row
export const ROW_Y = [196, 286, 376, 466];
export function paintBack() {
  const mark = paths(markSvg);
  const R = layer((g) => {
    frame(g);
    const s = 2.6;
    g.save();
    g.translate(TEX_W - 92 - 16 * s, 80);
    g.scale(s, s);
    mark.forEach((p) => g.fill(p));
    g.restore();
    g.fillRect(92, 92, 210, 16);
    g.globalAlpha = 0.55;
    [120, 90, 140, 104].forEach((w, i) => g.fillRect(92, ROW_Y[i] - 6, w, 12));
    g.globalAlpha = 0.25;
    ROW_Y.forEach((y) => g.fillRect(92, y + 34, TEX_W - 184, 2));
    g.globalAlpha = 1;
  });
  const G = layer((g) => {
    let seed = 17;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    ROW_Y.forEach((y, i) => {
      let x = 360;
      const end = 360 + [520, 400, 470, 330][i];
      while (x < end) {
        const w = 14 + Math.floor(rnd() * 3) * 14;
        g.fillRect(x, y - 9, Math.min(w, end - x), 18);
        x += w + (rnd() < 0.25 ? 26 : 7);
      }
    });
  });
  const B = layer(() => {});
  // B carries the row ids as grey levels, read straight from the canvas (alpha stays 255)
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d')!;
  ROW_Y.forEach((y, i) => {
    const v = (i + 1) * 40;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, y - 44, TEX_W, 88);
  });
  const band = g.getImageData(0, 0, TEX_W, TEX_H).data;
  for (let i = 0; i < B.length; i += 4) B[i + 3] = band[i];
  return pack(R, G, B);
}

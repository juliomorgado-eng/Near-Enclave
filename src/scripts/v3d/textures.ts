// Keycard faces, painted once into channel-packed canvases:
//   front  R = print, G = engraved number, B = amber chip
//   back   R = print, G = values (wiped in per row), B = row id band (id+1)*40
import wordmarkSvg from '../../../public/assets/logos/near-wordmark.svg?raw';
import markSvg from '../../../public/assets/logos/near-mark.svg?raw';
import { CARD } from './card-data';

export const TEX_W = 1400;
export const TEX_H = 884;
const M = 78;

const paths = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => new Path2D(m[1]));
const MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';
const SANS = '"Archivo Variable", "Archivo", "Helvetica Neue", Arial, sans-serif';

function layer(draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.textBaseline = 'alphabetic';
  draw(g);
  return g.getImageData(0, 0, TEX_W, TEX_H).data;
}

function pack(r: Uint8ClampedArray, gch: Uint8ClampedArray, b: Uint8ClampedArray, bFromRed = false) {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(TEX_W, TEX_H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r[i + 3];
    d[i + 1] = gch[i + 3];
    d[i + 2] = bFromRed ? b[i] : b[i + 3];
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function spaced(g: CanvasRenderingContext2D, px: number) {
  try {
    (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  } catch {
    /* older engines */
  }
}

const CHIP = { x: M, y: 318, w: 176, h: 132, r: 24 };

export function paintFront() {
  const R = layer((g) => {
    // NEAR wordmark
    const h = 62;
    g.save();
    g.translate(M, M);
    g.scale(h / 86, h / 86);
    paths(wordmarkSvg).forEach((p) => g.fill(p));
    g.restore();
    g.font = `500 28px ${MONO}`;
    spaced(g, 7);
    g.textAlign = 'right';
    g.fillText(CARD.kind, TEX_W - M, M + 44);
    // chip contacts
    g.globalAlpha = 0.55;
    g.lineWidth = 3;
    const { x, y, w, h: ch } = CHIP;
    g.beginPath();
    g.moveTo(x + w * 0.36, y);
    g.lineTo(x + w * 0.36, y + ch);
    g.moveTo(x + w * 0.64, y);
    g.lineTo(x + w * 0.64, y + ch);
    g.moveTo(x, y + ch * 0.5);
    g.lineTo(x + w * 0.36, y + ch * 0.5);
    g.moveTo(x + w * 0.64, y + ch * 0.34);
    g.lineTo(x + w, y + ch * 0.34);
    g.moveTo(x + w * 0.64, y + ch * 0.66);
    g.lineTo(x + w, y + ch * 0.66);
    g.stroke();
    // inset hairline
    g.globalAlpha = 0.28;
    g.lineWidth = 2;
    rr(g, 30, 30, TEX_W - 60, TEX_H - 60, 40);
    g.stroke();
    g.globalAlpha = 1;
    g.textAlign = 'left';
    g.font = `500 32px ${MONO}`;
    spaced(g, 5);
    g.fillText(CARD.when, M, TEX_H - M - 98);
    g.textAlign = 'right';
    g.font = `600 30px ${SANS}`;
    spaced(g, 1);
    g.globalAlpha = 0.7;
    g.fillText('Enclave/27', TEX_W - M, TEX_H - M - 98);
    g.globalAlpha = 1;
  });
  const G = layer((g) => {
    g.font = `500 64px ${MONO}`;
    spaced(g, 3);
    g.textAlign = 'left';
    g.fillText(CARD.no, M - 4, TEX_H - M - 6);
  });
  const B = layer((g) => {
    const { x, y, w, h, r } = CHIP;
    rr(g, x, y, w, h, r);
    g.fill();
  });
  return pack(R, G, B);
}

export const ROW_Y = [318, 440, 562, 684];

export function paintBack() {
  const mark = paths(markSvg);
  const R = layer((g) => {
    g.font = `500 28px ${MONO}`;
    spaced(g, 6);
    g.textAlign = 'left';
    g.fillText(CARD.backTitle, M, M + 44);
    const s = 4.2;
    g.save();
    g.translate(TEX_W - M - 16 * s, M - 4);
    g.scale(s, s);
    mark.forEach((p) => g.fill(p));
    g.restore();
    g.font = `400 26px ${MONO}`;
    spaced(g, 5);
    CARD.rows.forEach((row, i) => {
      const y = ROW_Y[i];
      g.globalAlpha = 0.62;
      g.fillText(`${String(i + 1).padStart(2, '0')}  ${row.k}`, M, y);
      g.globalAlpha = 0.22;
      g.fillRect(M, y + 34, TEX_W - M * 2, 2);
    });
    g.globalAlpha = 0.28;
    g.lineWidth = 2;
    rr(g, 30, 30, TEX_W - 60, TEX_H - 60, 40);
    g.stroke();
    g.globalAlpha = 1;
  });
  const G = layer((g) => {
    g.font = `500 36px ${MONO}`;
    spaced(g, 4);
    g.textAlign = 'left';
    const X = 520;
    CARD.rows.forEach((row, i) => {
      const y = ROW_Y[i];
      if (row.redact) {
        // the holder stays private: three redaction bars
        [210, 150, 120].reduce((x, w) => {
          g.fillRect(x, y - 30, w, 36);
          return x + w + 18;
        }, X);
      } else g.fillText(row.v, X, y);
    });
    // proof line
    g.font = `600 30px ${MONO}`;
    spaced(g, 5);
    g.lineWidth = 5;
    const py = TEX_H - M - 6;
    g.beginPath();
    g.moveTo(M + 2, py - 14);
    g.lineTo(M + 14, py - 2);
    g.lineTo(M + 38, py - 30);
    g.stroke();
    g.fillText(CARD.proof, M + 62, py);
  });
  // row-id bands (B read from red so ids survive alpha)
  const B = layer((g) => {
    ROW_Y.forEach((y, i) => {
      const v = (i + 1) * 40;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(0, y - 60, TEX_W, 100);
    });
    g.fillStyle = 'rgb(120,120,120)'; // proof belongs to row 3 (privacy)
    g.fillRect(0, TEX_H - M - 70, TEX_W, 100);
  });
  return pack(R, G, B, true);
}

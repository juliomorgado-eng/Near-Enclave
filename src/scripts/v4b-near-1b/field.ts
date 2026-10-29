// Hero (flat): a solid vector cube drawn as projected polygons. Flat face fills (front green,
// top and sides in deeper greens), 1px hairline edges, no dither and no module grid.
// "NEAR Enclave 2027" is set vertically on the front face in real Space Grotesk bold: the face
// is near-affine (camera distance 40), so the text is drawn through the face's affine transform
// and keeps the cube's 3D perspective. Same pose, sway and pointer tilt as 1A; immediate entry.
import { C, clamp, fit, surface, lerp, easeOut, makeLoop, dotLayer, type Surface } from './common';

type V3 = [number, number, number];

const FX = 0.72;
const FY = 1.0;
const FZ = 0.72;
const D = 40;
const TOP = '#00A86C';
const SIDE = '#00754E';
const UNDER = '#0A4B35';

// faces: normal axis, sign, and the 4 corners (counter-clockwise seen from outside)
type Face = { ax: 0 | 1 | 2; sg: 1 | -1; pts: V3[] };
const FACES: Face[] = [];
for (const ax of [0, 1, 2] as const)
  for (const sg of [1, -1] as const) {
    const a = ((ax + 1) % 3) as 0 | 1 | 2;
    const b = ((ax + 2) % 3) as 0 | 1 | 2;
    const H: V3 = [FX, FY, FZ];
    const pts: V3[] = [];
    for (const [ua, ub] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p: V3 = [0, 0, 0];
      p[ax] = sg * H[ax];
      p[a] = ua * H[a];
      p[b] = ub * H[b];
      pts.push(p);
    }
    FACES.push({ ax, sg, pts });
  }

function rot(yaw: number, pitch: number, out: number[]) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
  out[0] = cy; out[1] = 0; out[2] = sy;
  out[3] = sx * sy; out[4] = cx; out[5] = -sx * cy;
  out[6] = -cx * sy; out[7] = sx; out[8] = cx * cy;
}

export type Field = { start(): void; setPaused(p: boolean): void; renderStatic(): void; resize(): void };

export function createField(cv: HTMLCanvasElement, opts: { reduce: boolean; fine: boolean; words: string[] }): Field | null {
  const s = surface(cv);
  if (!s) return null;
  const S: Surface = s;
  const R = new Array(9).fill(0);
  const ptr = { tx: 0, ttx: 0 };
  // entry: the first frame already shows the cube; complete in 0.6 s
  let t = 0, build = opts.reduce ? 1 : 0.35;
  const FAM = '"Space Grotesk Variable", "Space Grotesk", "Inter Tight Variable", system-ui, sans-serif';
  document.fonts?.load(`700 100px "Space Grotesk Variable"`).then(() => { if (!loop.on) frame(); }).catch(() => {});

  if (opts.fine && !opts.reduce) {
    const host = cv.parentElement!;
    host.addEventListener('pointermove', (e) => { ptr.ttx = (e.clientX / window.innerWidth) * 2 - 1; }, { passive: true });
    host.addEventListener('pointerleave', () => { ptr.ttx = 0; });
  }

  function layout() {
    const w = S.w, h = S.h;
    if (w >= 1024) return { cx: w * 0.73, cy: h * 0.47, sc: Math.min(h * 0.38, w * 0.25), mask: 0 as const };
    if (w >= 768) return { cx: w * 0.66, cy: h * 0.3, sc: Math.min(h * 0.24, w * 0.3), mask: 1 as const };
    return { cx: w * 0.55, cy: h * 0.295, sc: Math.min(h * 0.205, w * 0.46), mask: 1 as const };
  }

  // static fine-dot backdrop, masked like 1A's background field
  let bg: HTMLCanvasElement | null = null, bgKey = '';
  function backdrop(mk: 0 | 1) {
    const k = `${S.w}x${S.h}@${S.dpr}`;
    if (k === bgKey && bg) return bg;
    bgKey = k;
    const { cv: c, ctx } = dotLayer(S.w, S.h, S.dpr, 8, C.w500, 0.55);
    const g = mk === 0
      ? ctx.createLinearGradient(c.width * 0.36, 0, c.width * 0.58, 0)
      : ctx.createLinearGradient(0, c.height * 0.56, 0, c.height * 0.44);
    g.addColorStop(0, mk === 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    bg = c;
    return c;
  }

  function frame() {
    if (!fit(S)) return;
    const { ctx, w, h, dpr } = S;
    ctx.clearRect(0, 0, w, h);
    const { cx, cy, sc, mask: mk } = layout();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(backdrop(mk), 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ptr.tx = lerp(ptr.tx, ptr.ttx, 0.04);
    const yaw = 0.4 + Math.sin(t * 0.32) * 0.1 + ptr.tx * 0.12;
    const pitch = 0.3 + Math.sin(t * 0.21 + 1) * 0.04;
    rot(yaw, pitch, R);
    const e = easeOut(build);
    const k = sc * lerp(0.94, 1, e);
    const proj = (p: V3): [number, number] => {
      const u = R[0] * p[0] + R[1] * p[1] + R[2] * p[2];
      const v = R[3] * p[0] + R[4] * p[1] + R[5] * p[2];
      const z = R[6] * p[0] + R[7] * p[1] + R[8] * p[2];
      const f = D / (D - z);
      return [cx + u * f * k, cy - v * f * k];
    };
    const o: V3 = [R[6] * D, R[7] * D, R[8] * D];

    ctx.globalAlpha = clamp(build * 1.8);
    ctx.lineJoin = 'miter';
    let front: [number, number][] | null = null;
    for (const fc of FACES) {
      const c: V3 = [0, 0, 0];
      c[fc.ax] = fc.sg * [FX, FY, FZ][fc.ax];
      const n: V3 = [0, 0, 0];
      n[fc.ax] = fc.sg;
      const vis = (o[0] - c[0]) * n[0] + (o[1] - c[1]) * n[1] + (o[2] - c[2]) * n[2];
      if (vis <= 0) continue;
      const q = fc.pts.map(proj);
      ctx.beginPath();
      q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = fc.ax === 2 ? C.green : fc.ax === 1 ? (fc.sg > 0 ? TOP : UNDER) : SIDE;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      if (fc.ax === 2 && fc.sg > 0) front = q;
    }

    if (front) {
      // face-local frame: origin top-left of the face, x to the right, y down (in face units)
      const tl = proj([-FX, FY, FZ]), tr = proj([FX, FY, FZ]), bl = proj([-FX, -FY, FZ]);
      const MW = 720, MH = 1000; // FX:FY aspect
      const a = (tr[0] - tl[0]) / MW, b = (tr[1] - tl[1]) / MW;
      const c2 = (bl[0] - tl[0]) / MH, d2 = (bl[1] - tl[1]) / MH;

      // light sweep: a hairline travelling up the face (drawn in screen space so it stays 1px)
      const sweep = ((t * 0.16) % 1.6) - 0.3;
      if (sweep > 0 && sweep < 1) {
        const y = (1 - sweep) * 2 * FY - FY;
        const p0 = proj([-FX, y, FZ]), p1 = proj([FX, y, FZ]);
        ctx.globalAlpha = 0.55 * clamp(build * 1.8);
        ctx.strokeStyle = C.lime;
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.stroke();
      }

      ctx.save();
      ctx.setTransform(dpr * a, dpr * b, dpr * c2, dpr * d2, dpr * tl[0], dpr * tl[1]);
      const words = opts.words;
      ctx.font = `700 100px ${FAM}`;
      const wMax = Math.max(...words.map((wd) => ctx.measureText(wd).width));
      const fs = Math.min((MH * 0.86 * 100) / wMax, (MW * 0.88) / (words.length * 0.86));
      ctx.font = `700 ${fs}px ${FAM}`;
      ctx.textBaseline = 'alphabetic';
      const lh = fs * 0.86;
      const block = lh * words.length;
      ctx.translate(MW / 2, MH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = C.ink;
      words.forEach((wd, i) => {
        // words land left to right
        const ta = easeOut(clamp(((build - 0.35) / 0.65) * 1.6 - i * 0.25 + 0.12));
        if (ta <= 0) return;
        ctx.globalAlpha = ta;
        const y = -block / 2 + lh * (i + 1) - fs * 0.13;
        ctx.fillText(wd, -MH * 0.43 - (1 - ta) * 60, y);
      });
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  const loop = makeLoop(cv, (dt) => {
    t += dt;
    if (build < 1) build = Math.min(1, build + dt / 0.6);
    frame();
  });

  return {
    start() {
      frame();
      loop.start();
    },
    setPaused(p) { loop.pause(p); },
    renderStatic() { build = 1; t = 2.4; frame(); },
    resize() { if (!loop.on) frame(); },
  };
}

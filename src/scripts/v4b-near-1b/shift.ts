// Shift (flat): scattered fine dots (1.5px) joined by hairline links, an open network,
// converge onto the outline of a flat lock. The shackle draws in as a thick stroke
// (dash offset), the body fills as a solid green rect growing from the bottom with the
// keyhole cut out, then the shackle drops and seals in lime. Scroll-scrubbed; draws on demand.
import { C, clamp, ease, fit, hash, lerp, mulberry, surface } from './common';

const AW = 72;
const R_OUT = AW * 0.36;
const R_IN = AW * 0.245;
const RM = (R_OUT + R_IN) / 2; // shackle centreline radius
const SW = R_OUT - R_IN; // shackle stroke
const ARCH_CY = R_OUT;
const BODY_TOP = Math.round(AW * 0.6);
const BODY_H = Math.round(AW * 0.72);
const AH = BODY_TOP + BODY_H;
const CX = AW / 2;
const KEY_CY = BODY_TOP + BODY_H * 0.36;
const KEY_R = AW * 0.085;
const LEG = BODY_TOP + 1.5 - ARCH_CY; // straight leg length (tucks into the body)
const SH_LEN = 2 * LEG + Math.PI * RM;

/** point on the shackle centreline at arc length l (left leg bottom → arch → right leg bottom) */
function shacklePt(l: number): [number, number] {
  if (l < LEG) return [CX - RM, BODY_TOP + 1.5 - l];
  l -= LEG;
  const arc = Math.PI * RM;
  if (l < arc) {
    const a = Math.PI + l / RM;
    return [CX + Math.cos(a) * RM, ARCH_CY + Math.sin(a) * RM];
  }
  l -= arc;
  return [CX + RM, ARCH_CY + l];
}

type Dot = { tx: number; ty: number; sh: boolean; sx: number; sy: number; delay: number };
type Dust = { sx: number; sy: number; out: number };

export type Shift = { set(p: number): void; draw(): void };

export function createShift(cv: HTMLCanvasElement): Shift | null {
  const s = surface(cv);
  if (!s) return null;
  const S = s;
  const rnd = mulberry(20270401);
  const dots: Dot[] = [];
  const NS = 72;
  for (let i = 0; i < NS; i++) {
    const [tx, ty] = shacklePt(((i + 0.5) / NS) * SH_LEN);
    dots.push({ tx, ty, sh: true, sx: 0.04 + rnd() * 0.92, sy: 0.04 + rnd() * 0.92, delay: 0.3 + hash(i, 3) * 0.1 });
  }
  // body perimeter, then the keyhole ring
  const per = 2 * (AW + BODY_H);
  const NB = 120;
  for (let i = 0; i < NB; i++) {
    let l = ((i + 0.5) / NB) * per, tx: number, ty: number;
    if (l < AW) { tx = l; ty = BODY_TOP; }
    else if ((l -= AW) < BODY_H) { tx = AW; ty = BODY_TOP + l; }
    else if ((l -= BODY_H) < AW) { tx = AW - l; ty = AH; }
    else { l -= AW; tx = 0; ty = AH - l; }
    dots.push({ tx, ty, sh: false, sx: 0.04 + rnd() * 0.92, sy: 0.04 + rnd() * 0.92, delay: ((AH - ty) / AH) * 0.24 + hash(i, 5) * 0.1 });
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const ty = KEY_CY + Math.sin(a) * KEY_R;
    dots.push({ tx: CX + Math.cos(a) * KEY_R, ty, sh: false, sx: 0.04 + rnd() * 0.92, sy: 0.04 + rnd() * 0.92, delay: 0.2 + hash(i, 9) * 0.1 });
  }
  // network: every 3rd dot links to its two nearest hubs (scattered state)
  const hubs = dots.map((_, i) => i).filter((i) => i % 3 === 0);
  const links: [number, number][] = [];
  for (const i of hubs) {
    let a = -1, b = -1, da = Infinity, db = Infinity;
    for (const j of hubs) {
      if (j === i) continue;
      const dd = (dots[j].sx - dots[i].sx) ** 2 + (dots[j].sy - dots[i].sy) ** 2;
      if (dd < da) { b = a; db = da; a = j; da = dd; }
      else if (dd < db) { b = j; db = dd; }
    }
    if (a > i) links.push([i, a]);
    if (b > i) links.push([i, b]);
  }
  const dust: Dust[] = Array.from({ length: 260 }, () => ({ sx: rnd(), sy: rnd(), out: 0.2 + rnd() * 0.45 }));

  let p = 0;
  const pos = new Float32Array(dots.length * 2);

  function keyhole(ctx: CanvasRenderingContext2D, x0: number, y0: number, u: number) {
    ctx.beginPath();
    ctx.arc(x0 + CX * u, y0 + KEY_CY * u, KEY_R * u, 0, Math.PI * 2);
    ctx.rect(x0 + (CX - AW * 0.03) * u, y0 + KEY_CY * u, AW * 0.06 * u, BODY_H * 0.34 * u);
    ctx.rect(x0 + (CX - AW * 0.06) * u, y0 + (KEY_CY + BODY_H * 0.26) * u, AW * 0.12 * u, BODY_H * 0.08 * u);
    ctx.fill();
  }

  function draw() {
    if (!fit(S)) return;
    const { ctx, w, h } = S;
    ctx.clearRect(0, 0, w, h);
    const u = clamp(Math.min(w / (AW + 6), h / (AH + 8)), 2.5, 8);
    const x0 = Math.round((w - AW * u) / 2);
    const y0 = Math.round((h - AH * u) / 2 + u * 3);
    const seal = clamp((p - 0.66) / 0.14);
    const drop = (1 - ease(seal)) * 6;

    // dust: fine 1px dots that clear as the network closes
    ctx.fillStyle = C.w500;
    for (const d of dust) {
      const k = 1 - clamp(p / d.out);
      if (k <= 0) continue;
      ctx.globalAlpha = 0.7 * k;
      ctx.fillRect(Math.round(d.sx * w), Math.round(d.sy * h), 1, 1);
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i < dots.length; i++) {
      const m = dots[i];
      const lp = ease(clamp((p - m.delay) / 0.3));
      pos[i * 2] = lerp(m.sx * w, x0 + m.tx * u, lp);
      pos[i * 2 + 1] = lerp(m.sy * h, y0 + (m.ty - (m.sh ? drop : 0)) * u, lp);
    }

    // links: solid hairlines, fading as the dots lock in
    const linkA = 1 - clamp(p / 0.7);
    if (linkA > 0.01) {
      ctx.strokeStyle = C.w500;
      ctx.globalAlpha = 0.6 * linkA;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [i, j] of links) {
        ctx.moveTo(pos[i * 2], pos[i * 2 + 1]);
        ctx.lineTo(pos[j * 2], pos[j * 2 + 1]);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // guide: the lock outline as a hairline, visible while it assembles
    const guide = clamp(p * 3) * (1 - seal);
    if (guide > 0.01) {
      ctx.globalAlpha = 0.5 * guide;
      ctx.strokeStyle = C.dark;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + BODY_TOP * u + 0.5, AW * u - 1, BODY_H * u - 1);
      ctx.globalAlpha = 1;
    }

    // body: a solid rect growing from the bottom, keyhole cut out
    const bp = ease(clamp((p - 0.14) / 0.42));
    if (bp > 0) {
      const bh = BODY_H * u * bp;
      ctx.fillStyle = C.green;
      ctx.fillRect(x0, y0 + AH * u - bh, AW * u, bh);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      keyhole(ctx, x0, y0, u);
      ctx.restore();
    }

    // shackle: a thick stroke drawing in, then dropping into the body to seal
    const sp = ease(clamp((p - 0.3) / 0.36));
    if (sp > 0) {
      const yo = y0 - drop * u;
      ctx.save();
      // clip off the part of the legs that sits inside the body once it is filled
      ctx.beginPath();
      ctx.rect(0, 0, w, y0 + BODY_TOP * u + (bp > 0.98 ? 0 : (1 - bp) * BODY_H * u));
      ctx.clip();
      ctx.lineWidth = SW * u;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = seal > 0.5 ? C.lime : C.w300;
      ctx.setLineDash([SH_LEN * u, SH_LEN * u]);
      ctx.lineDashOffset = SH_LEN * u * (1 - sp);
      ctx.beginPath();
      ctx.moveTo(x0 + (CX - RM) * u, yo + (BODY_TOP + 1.5) * u);
      ctx.lineTo(x0 + (CX - RM) * u, yo + ARCH_CY * u);
      ctx.arc(x0 + CX * u, yo + ARCH_CY * u, RM * u, Math.PI, 0);
      ctx.lineTo(x0 + (CX + RM) * u, yo + (BODY_TOP + 1.5) * u);
      ctx.stroke();
      ctx.restore();
    }

    // dots on top: grey while travelling, green once placed, gone after the seal
    const dotA = 1 - clamp((p - 0.62) / 0.16);
    if (dotA > 0.01) {
      const ds = 1.5;
      for (const pass of [0, 1]) {
        ctx.fillStyle = pass ? C.green : C.w400;
        ctx.globalAlpha = dotA;
        ctx.beginPath();
        for (let i = 0; i < dots.length; i++) {
          const lp = ease(clamp((p - dots[i].delay) / 0.3));
          if ((lp >= 0.6 ? 1 : 0) !== pass) continue;
          ctx.rect(pos[i * 2] - ds / 2, pos[i * 2 + 1] - ds / 2, ds, ds);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  return {
    set(v: number) {
      if (Math.abs(v - p) < 0.0005) return;
      p = v;
      draw();
    },
    draw,
  };
}

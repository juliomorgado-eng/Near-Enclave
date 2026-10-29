// v4A-NEARCON 2A — line art geometry.
// Two 3D wire models (a New York city block and a bank vault) projected orthographically into a
// 400×400 box each frame, so they can turn on a turntable. Shared by the server render (static
// first frame / reduced motion) and by the client loop. Pure data, no DOM.

export type V3 = [number, number, number];
export type Seg3 = [V3, V3];
export type Layer = 'main' | 'fine' | 'acc';
export const LAYERS: Layer[] = ['main', 'fine', 'acc'];
export type Model = { main: Seg3[]; fine: Seg3[]; acc: Seg3[]; nodes: V3[]; blink: V3[] };
export type Cam = { th: number; el: number; s: number; cx: number; cy: number; R: number };
export type Frame = { d: string[]; pulse: string; nodes: [number, number, number][]; blink: [number, number][] };

const r1 = (n: number) => Math.round(n * 10) / 10;

/* ------------------------------ builders ------------------------------ */
function box(out: Seg3[], x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) {
  const p = (x: number, y: number, z: number): V3 => [x, y, z];
  const b = [p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)];
  const t = [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)];
  for (let i = 0; i < 4; i++) {
    out.push([b[i], b[(i + 1) % 4]]);
    out.push([t[i], t[(i + 1) % 4]]);
    out.push([b[i], t[i]]);
  }
}
function rect(out: Seg3[], cx: number, cy: number, w: number, d: number, z: number) {
  const a: V3[] = [[cx - w, cy - d, z], [cx + w, cy - d, z], [cx + w, cy + d, z], [cx - w, cy + d, z]];
  for (let i = 0; i < 4; i++) out.push([a[i], a[(i + 1) % 4]]);
}
/** circle in a plane: 'z' = horizontal (x,y), 'y' = facing the viewer (x,z) */
function ring(out: Seg3[], c: V3, rad: number, plane: 'z' | 'y', n = 40, a0 = 0, a1 = Math.PI * 2) {
  let prev: V3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    const u = Math.cos(t) * rad, v = Math.sin(t) * rad;
    const pt: V3 = plane === 'z' ? [c[0] + u, c[1] + v, c[2]] : [c[0] + u, c[1], c[2] + v];
    if (prev) out.push([prev, pt]);
    prev = pt;
  }
}
/** a stacked tower: tiers of [halfW, halfD, topZ] rising from the previous top */
function tiers(out: Seg3[], cx: number, cy: number, ts: [number, number, number][]) {
  let z = 0;
  for (const [w, d, h] of ts) {
    box(out, cx - w, cy - d, cx + w, cy + d, z, h);
    z = h;
  }
  return z;
}

/* ------------------------------ the city ------------------------------ */
// Manhattan in miniature: Empire State (setbacks + mast) at the centre, One World Trade (chamfered
// obelisk + spire), Chrysler (stacked arched crown + needle), low blocks with floors and a water tower,
// on a round street plate.
export function city(): Model {
  const main: Seg3[] = [], fine: Seg3[] = [], acc: Seg3[] = [];
  const nodes: V3[] = [], blink: V3[] = [];
  // plate + streets
  ring(main, [0, 0, 0], 1.62, 'z', 64);
  ring(fine, [0, 0, 0], 1.48, 'z', 56);
  for (let k = -2; k <= 2; k++) {
    const x = k * 0.62;
    const h = Math.sqrt(Math.max(0, 1.48 * 1.48 - x * x));
    fine.push([[x, -h, 0], [x, h, 0]]);
    fine.push([[-h, x, 0], [h, x, 0]]);
  }
  // Empire State
  const ex = 0, ey = 0.08;
  const top = tiers(main, ex, ey, [[0.36, 0.27, 1.0], [0.27, 0.2, 1.52], [0.19, 0.15, 1.92], [0.12, 0.1, 2.16], [0.07, 0.06, 2.32]]);
  for (let z = 0.16; z < 1.0; z += 0.14) rect(fine, ex, ey, 0.36, 0.27, z);
  for (let z = 1.12; z < 1.52; z += 0.13) rect(fine, ex, ey, 0.27, 0.2, z);
  acc.push([[ex, ey, top], [ex, ey, 2.95]]);
  blink.push([ex, ey, 2.95]);
  // One World Trade: podium + chamfered shaft (square base → 45° square top) + spire
  const wx = 0.92, wy = -0.42, wb = 0.2, wt = 0.15, wh = 2.25;
  box(main, wx - wb, wy - wb, wx + wb, wy + wb, 0, 0.22);
  const base: V3[] = [[wx - wb, wy - wb, 0.22], [wx + wb, wy - wb, 0.22], [wx + wb, wy + wb, 0.22], [wx - wb, wy + wb, 0.22]];
  const tp: V3[] = [[wx, wy - wt, wh], [wx + wt, wy, wh], [wx, wy + wt, wh], [wx - wt, wy, wh]];
  for (let i = 0; i < 4; i++) {
    main.push([base[i], base[(i + 1) % 4]]);
    main.push([tp[i], tp[(i + 1) % 4]]);
    main.push([base[i], tp[i]]);
    main.push([base[(i + 1) % 4], tp[i]]);
  }
  acc.push([[wx, wy, wh], [wx, wy, 2.82]]);
  blink.push([wx, wy, 2.82]);
  // Chrysler: shaft + four arched crown tiers + needle
  const cx = -0.86, cy = 0.34, cw = 0.17;
  box(main, cx - cw, cy - cw, cx + cw, cy + cw, 0, 1.36);
  for (let z = 0.2; z < 1.36; z += 0.16) rect(fine, cx, cy, cw, cw, z);
  for (let k = 0; k < 4; k++) {
    const w = cw - k * 0.035, z = 1.36 + k * 0.1;
    rect(main, cx, cy, w, w, z);
    // an arch on each face
    const arc = (axis: 'x' | 'y', side: number) => {
      let prev: V3 | null = null;
      for (let i = 0; i <= 10; i++) {
        const t = Math.PI - (Math.PI * i) / 10;
        const u = Math.cos(t) * w, v = z + Math.sin(t) * 0.09;
        const pt: V3 = axis === 'x' ? [cx + u, cy + side * w, v] : [cx + side * w, cy + u, v];
        if (prev) acc.push([prev, pt]);
        prev = pt;
      }
    };
    arc('x', -1); arc('x', 1); arc('y', -1); arc('y', 1);
  }
  acc.push([[cx, cy, 1.72], [cx, cy, 2.2]]);
  blink.push([cx, cy, 2.2]);
  // low blocks with floors
  const blocks: [number, number, number, number, number][] = [
    [-0.18, -0.95, 0.24, 0.2, 0.62], [0.32, -1.02, 0.17, 0.16, 0.86], [-0.98, -0.42, 0.2, 0.26, 0.96],
    [1.0, 0.42, 0.2, 0.24, 1.08], [0.44, 0.82, 0.2, 0.2, 0.74], [-0.42, 0.98, 0.25, 0.17, 0.5],
    [-1.12, 0.86, 0.15, 0.15, 0.64], [0.48, 0.0, 0.14, 0.18, 1.24], [-0.52, -0.36, 0.14, 0.14, 1.1],
  ];
  for (const [x, y, w, d, h] of blocks) {
    box(main, x - w, y - d, x + w, y + d, 0, h);
    for (let z = 0.18; z < h - 0.06; z += 0.17) rect(fine, x, y, w, d, z);
  }
  // water tower on the block at (1.0, 0.42)
  const tx = 1.02, ty = 0.42, tz = 1.08;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) main.push([[tx + a * 0.05, ty + b * 0.05, tz], [tx + a * 0.06, ty + b * 0.06, tz + 0.12]]);
  ring(main, [tx, ty, tz + 0.12], 0.085, 'z', 16);
  ring(main, [tx, ty, tz + 0.28], 0.085, 'z', 16);
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * Math.PI * 2 + 0.4;
    main.push([[tx + Math.cos(t) * 0.085, ty + Math.sin(t) * 0.085, tz + 0.12], [tx + Math.cos(t) * 0.085, ty + Math.sin(t) * 0.085, tz + 0.28]]);
    main.push([[tx + Math.cos(t) * 0.085, ty + Math.sin(t) * 0.085, tz + 0.28], [tx, ty, tz + 0.38]]);
  }
  // plate nodes
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    nodes.push([Math.cos(t) * 1.62, Math.sin(t) * 1.62, 0]);
  }
  return { main, fine, acc, nodes, blink };
}

/* ------------------------------ the vault ------------------------------ */
// A bank safe: a block on feet with a thick round door (frame, door slab, locking bolts), two
// hinges, and a spoked handle wheel whose angle `phi` turns.
const VW = 1, VD = 0.72, VZ0 = 0.16, VZ1 = 2.16, DZ = 1.16, FRONT = -VD;
export function vaultStatic(): Model {
  const main: Seg3[] = [], fine: Seg3[] = [], acc: Seg3[] = [];
  const nodes: V3[] = [], blink: V3[] = [];
  box(main, -VW, -VD, VW, VD, VZ0, VZ1);
  // feet
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(main, a * 0.86 - 0.1, b * 0.58 - 0.1, a * 0.86 + 0.1, b * 0.58 + 0.1, 0, VZ0);
  // front bevel + top bevel
  const bv = 0.1;
  const fb: V3[] = [[-VW + bv, FRONT, VZ0 + bv], [VW - bv, FRONT, VZ0 + bv], [VW - bv, FRONT, VZ1 - bv], [-VW + bv, FRONT, VZ1 - bv]];
  for (let i = 0; i < 4; i++) fine.push([fb[i], fb[(i + 1) % 4]]);
  rect(fine, 0, 0, VW - bv, VD - bv, VZ1);
  // door frame on the face, door slab standing proud of it, joined by its thickness
  ring(main, [0, FRONT, DZ], 0.8, 'y', 56);
  ring(fine, [0, FRONT, DZ], 0.72, 'y', 48);
  ring(main, [0, FRONT - 0.16, DZ], 0.72, 'y', 48);
  ring(fine, [0, FRONT - 0.16, DZ], 0.56, 'y', 44);
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2;
    fine.push([[Math.cos(t) * 0.72, FRONT, DZ + Math.sin(t) * 0.72], [Math.cos(t) * 0.72, FRONT - 0.16, DZ + Math.sin(t) * 0.72]]);
    // locking bolts around the slab
    nodes.push([Math.cos(t + 0.26) * 0.64, FRONT - 0.16, DZ + Math.sin(t + 0.26) * 0.64]);
  }
  // hinges on the left of the door
  for (const z of [DZ - 0.48, DZ + 0.36]) box(main, -0.94, FRONT - 0.2, -0.78, FRONT, z, z + 0.14);
  // axle to the wheel hub
  acc.push([[0, FRONT - 0.16, DZ], [0, FRONT - 0.3, DZ]]);
  // combination dial above the wheel
  ring(acc, [0, FRONT - 0.16, DZ + 0.46], 0.07, 'y', 16);
  blink.push([0, FRONT - 0.16, DZ + 0.46]);
  return { main, fine, acc, nodes, blink };
}
/** the turning handle wheel: hub, rim and six spokes with knobs past the rim */
export function vaultWheel(phi: number): { acc: Seg3[]; knobs: V3[] } {
  const acc: Seg3[] = [];
  const knobs: V3[] = [];
  const y = FRONT - 0.3;
  ring(acc, [0, y, DZ], 0.08, 'y', 14);
  ring(acc, [0, y, DZ], 0.34, 'y', 36, phi, phi + Math.PI * 2);
  for (let i = 0; i < 6; i++) {
    const t = phi + (i / 6) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    acc.push([[c * 0.08, y, DZ + s * 0.08], [c * 0.44, y, DZ + s * 0.44]]);
    knobs.push([c * 0.46, y, DZ + s * 0.46]);
  }
  return { acc, knobs };
}

/* ------------------------------ projection ------------------------------ */
// Orthographic: turn by `th` around z, then tilt the camera down by `el`. Depth (+ = away) picks
// one of three opacity buckets so the far side of a wire model reads as behind.
export function render(m: Model, cam: Cam, extra?: { acc: Seg3[]; knobs: V3[] }): Frame {
  const ct = Math.cos(cam.th), st = Math.sin(cam.th), ce = Math.cos(cam.el), se = Math.sin(cam.el);
  const P = (p: V3): [number, number, number] => {
    const xr = p[0] * ct - p[1] * st;
    const yr = p[0] * st + p[1] * ct;
    return [cam.cx + cam.s * xr, cam.cy - cam.s * (p[2] * ce + yr * se), yr / cam.R];
  };
  const out = new Array<string>(9).fill('');
  let pulse = '';
  const emit = (segs: Seg3[], li: number, isMain: boolean) => {
    for (const [a, b] of segs) {
      const A = P(a), B = P(b);
      const dep = (A[2] + B[2]) / 2;
      const k = dep < -0.12 ? 0 : dep < 0.34 ? 1 : 2;
      const s = `M${r1(A[0])} ${r1(A[1])}L${r1(B[0])} ${r1(B[1])}`;
      out[li * 3 + k] += s;
      if (isMain) pulse += s;
    }
  };
  emit(m.main, 0, true);
  emit(m.fine, 1, false);
  emit(m.acc, 2, false);
  if (extra) emit(extra.acc, 2, false);
  const nodes = [...m.nodes, ...(extra?.knobs ?? [])].map((p) => {
    const q = P(p);
    return [r1(q[0]), r1(q[1]), q[2] < -0.12 ? 0 : q[2] < 0.34 ? 1 : 2] as [number, number, number];
  });
  const blink = m.blink.map((p) => {
    const q = P(p);
    return [r1(q[0]), r1(q[1])] as [number, number];
  });
  return { d: out, pulse, nodes, blink };
}

/* ------------------------------ cameras ------------------------------ */
export const CAM = {
  city: { th: -0.62, el: 0.5, s: 88, cx: 200, cy: 292, R: 1.62 } as Cam,
  vault: { th: 0.34, el: 0.3, s: 110, cx: 200, cy: 322, R: 1.25 } as Cam,
};
export function vaultModel() {
  return vaultStatic();
}
export function first(kind: 'city' | 'vault'): Frame {
  if (kind === 'city') return render(city(), CAM.city);
  return render(vaultStatic(), CAM.vault, vaultWheel(0.3));
}

/* ------------------------------ 2D drawings ------------------------------ */
export type Seg = { d: string; o?: number; dash?: boolean };
const L2 = (a: [number, number], b: [number, number]) => `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}`;

/** low blocks of the skyline: [x0, x1, top] */
export const SKY_BLOCKS: [number, number, number][] = [
  [28, 52, 236], [52, 78, 214], [78, 98, 228], [146, 166, 204], [166, 188, 184],
  [284, 306, 196], [306, 330, 218], [330, 352, 206], [352, 374, 238],
];
/** spire tips: One World Trade, Empire State, Chrysler */
export const SKY_TIPS: [number, number][] = [[122, 58], [216, 54], [262, 74]];
/** lit windows: a deterministic scatter of small panes between the window rules */
export function skyLights() {
  const G = 272;
  const out: [number, number][] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [a, b, t] of SKY_BLOCKS) {
    for (let y = t + 10; y < G - 15; y += 9) {
      for (let x = a + 6; x <= b - 9; x += 6) if (rnd() < 0.16) out.push([x, y + 2.5]);
    }
  }
  // Empire State and Chrysler shafts
  for (let y = 178; y < G - 12; y += 10) for (const x of [204.5, 211, 217.5, 224]) if (rnd() < 0.12) out.push([x, y]);
  for (let y = 168; y < G - 12; y += 10) for (const x of [255, 261, 267]) if (rnd() < 0.14) out.push([x, y + 2]);
  return out;
}

/** New York skyline, frontal (Format). 400×400, ground at y=272. */
export function skyline() {
  const G = 272;
  const rc = (x0: number, x1: number, t: number) => `M${x0} ${G}V${t}H${x1}V${G}`;
  const lines: Seg[] = [];
  const fills: string[] = [];
  const blocks = SKY_BLOCKS;
  for (const [a, b, t] of blocks) lines.push({ d: rc(a, b, t), o: 0.9 });
  let win = '';
  for (const [a, b, t] of blocks) for (let y = t + 10; y < G - 6; y += 9) win += `M${a + 5} ${y}H${b - 5}`;
  lines.push({ d: win, o: 0.35 });
  const owtc = `M102 ${G}L106 112L138 112L142 ${G}Z`;
  fills.push(owtc);
  lines.push({ d: owtc });
  lines.push({ d: `M106 112L142 ${G}M138 112L102 ${G}`, o: 0.55 });
  lines.push({ d: 'M122 112V58M116 112V100H128V112', o: 0.9 });
  const esb = `M196 ${G}V168H202V146H208V124H212V108H220V124H224V146H230V168H236V${G}Z`;
  fills.push(esb);
  lines.push({ d: esb });
  lines.push({ d: 'M216 108V54', o: 0.9 });
  let esbWin = '';
  for (let x = 203; x <= 229; x += 6.5) esbWin += `M${x} 176V${G - 6}`;
  lines.push({ d: esbWin, o: 0.4 });
  const chr = `M248 ${G}V156H276V${G}Z`;
  fills.push(chr);
  lines.push({ d: chr });
  let arches = '';
  for (let i = 0; i < 4; i++) {
    const w = 14 - i * 3.2;
    const y = 156 - i * 11;
    arches += `M${r1(262 - w)} ${y}A${r1(w)} ${r1(w)} 0 0 1 ${r1(262 + w)} ${y}`;
  }
  lines.push({ d: arches });
  lines.push({ d: 'M262 112V74', o: 0.9 });
  let chrWin = '';
  for (let y = 166; y < G - 6; y += 10) chrWin += `M253 ${y}H271`;
  lines.push({ d: chrWin, o: 0.4 });
  lines.push({ d: `M8 ${G}H392` });
  lines.push({ d: 'M20 288q12 -5 24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0', o: 0.7 });
  lines.push({ d: 'M44 304q14 -5 28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0', o: 0.5 });
  lines.push({ d: 'M84 320q16 -5 32 0t32 0t32 0t32 0t32 0t32 0t32 0', o: 0.35 });
  lines.push({ d: `M64 ${G}V176M54 ${G}V176M54 176H64M54 196H64`, o: 0.85 });
  lines.push({ d: 'M59 176Q30 236 6 252M59 176Q84 220 98 230', o: 0.7 });
  lines.push({ d: 'M342 104m-20 0a20 20 0 1 0 40 0a20 20 0 1 0 -40 0', dash: true, o: 0.8 });
  return { lines, fills };
}

/** Isometric tower of ledger slabs that traces itself (Shift). 400×560 box. */
export function tower() {
  const S = 52, C30 = 0.8660254;
  const iso = (x: number, y: number, z: number): [number, number] => [200 + (x - y) * C30 * S, 470 + (x + y) * 0.5 * S - z * S - 1.5 * S];
  const out: Seg[] = [];
  const slab = (h0: number, h1: number, a: number, b: number, o = 1) => {
    const v = (x: number, y: number, z: number) => iso(x, y, z);
    const t = [v(a, a, h1), v(b, a, h1), v(b, b, h1), v(a, b, h1)];
    const bt = [v(b, a, h0), v(b, b, h0), v(a, b, h0)];
    let d = '';
    for (let i = 0; i < 4; i++) d += L2(t[i], t[(i + 1) % 4]);
    d += L2(bt[0], bt[1]) + L2(bt[1], bt[2]) + L2(t[1], bt[0]) + L2(t[2], bt[1]) + L2(t[3], bt[2]);
    out.push({ d, o });
  };
  // ground plate (open lattice)
  let g = '';
  for (let i = 0; i <= 4; i++) {
    g += L2(iso(i - 1, -1, 0), iso(i - 1, 3, 0));
    g += L2(iso(-1, i - 1, 0), iso(3, i - 1, 0));
  }
  out.push({ d: g, o: 0.35 });
  // slabs rising, each a little narrower
  const n = 7;
  for (let k = 0; k < n; k++) {
    const h0 = 0.15 + k * 0.62, h1 = h0 + 0.3;
    const inset = k * 0.07;
    slab(h0, h1, 0 + inset, 2 - inset, 1);
  }
  // core columns through the stack
  out.push({ d: L2(iso(1, 1, 0), iso(1, 1, 0.15 + n * 0.62 + 0.6)), o: 0.6, dash: true });
  for (const [x, y] of [[0.42, 0.42], [1.58, 0.42], [1.58, 1.58], [0.42, 1.58]]) out.push({ d: L2(iso(x, y, 0.15), iso(x, y, 0.15 + (n - 1) * 0.62 + 0.3)), o: 0.4 });
  const tip = iso(1, 1, 0.15 + n * 0.62 + 0.6);
  return { segs: out, tip };
}

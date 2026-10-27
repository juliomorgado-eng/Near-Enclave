// v4A-NEARCON — line art geometry. Every drawing lives in a 400×400 box whose
// circle is centred at (200,200), r = 190. Paths are plain SVG `d` strings.

export type Seg = { d: string; o?: number; dash?: boolean; fill?: boolean };

const r = (n: number) => Math.round(n * 10) / 10;

/* ---------- isometric frame shared by the lattice and the vault ---------- */
const S = 48;
const BASE = 176;
const C30 = 0.8660254;
export const iso = (x: number, y: number, z: number): [number, number] => [
  200 + (x - y) * C30 * S,
  BASE + (x + y) * 0.5 * S - z * S,
];
const L = (a: [number, number], b: [number, number]) => `M${r(a[0])} ${r(a[1])}L${r(b[0])} ${r(b[1])}`;
const poly = (pts: [number, number][], close = true) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${r(p[0])} ${r(p[1])}`).join('') + (close ? 'Z' : '');

function cubeEdges(x0: number, y0: number, x1: number, y1: number, h: number, skip: number[] = []): string {
  const v = (x: number, y: number, z: number) => iso(x, y, z);
  const e: [number, number][][] = [
    [v(x0, y0, 0), v(x1, y0, 0)], [v(x1, y0, 0), v(x1, y1, 0)], [v(x1, y1, 0), v(x0, y1, 0)], [v(x0, y1, 0), v(x0, y0, 0)],
    [v(x0, y0, h), v(x1, y0, h)], [v(x1, y0, h), v(x1, y1, h)], [v(x1, y1, h), v(x0, y1, h)], [v(x0, y1, h), v(x0, y0, h)],
    [v(x0, y0, 0), v(x0, y0, h)], [v(x1, y0, 0), v(x1, y0, h)], [v(x1, y1, 0), v(x1, y1, h)], [v(x0, y1, 0), v(x0, y1, h)],
  ];
  return e.filter((_, i) => !skip.includes(i)).map(([a, b]) => L(a, b)).join('');
}

/* ---------- open network / ledger lattice ---------- */
export function lattice() {
  const segs: Seg[] = [];
  // the open ground plane: 4×4 lattice
  for (let i = 0; i <= 3; i++) {
    segs.push({ d: L(iso(i, 0, 0), iso(i, 3, 0)), o: 0.55 });
    segs.push({ d: L(iso(0, i, 0), iso(3, i, 0)), o: 0.55 });
  }
  // ledger blocks: wireframe cells, each missing an edge (open)
  segs.push({ d: cubeEdges(0, 2, 1, 3, 1, [6]) });
  segs.push({ d: cubeEdges(1, 0, 2, 1, 2, [4]) });
  segs.push({ d: cubeEdges(2, 1, 3, 2, 1.35, [5]) });
  segs.push({ d: cubeEdges(0, 0, 1, 1, 0.6, [7]) });
  // network links between block tops (raised arcs)
  const tops: [number, number][] = [iso(0.5, 2.5, 1), iso(1.5, 0.5, 2), iso(2.5, 1.5, 1.35), iso(0.5, 0.5, 0.6)];
  const arc = (a: [number, number], b: [number, number], lift: number) => {
    const mx = (a[0] + b[0]) / 2;
    const my = Math.min(a[1], b[1]) - lift;
    return `M${r(a[0])} ${r(a[1])}Q${r(mx)} ${r(my)} ${r(b[0])} ${r(b[1])}`;
  };
  segs.push({ d: arc(tops[0], tops[1], 46) });
  segs.push({ d: arc(tops[1], tops[2], 30) });
  segs.push({ d: arc(tops[3], tops[1], 26) });
  segs.push({ d: arc(tops[0], tops[2], 70), dash: true });
  // antennas: floating peers wired down to free lattice points
  const peers: [number, number, number][] = [[3, 3, 1.1], [3, 0, 1.6], [1.6, 3, 0.9]];
  for (const [x, y, z] of peers) segs.push({ d: L(iso(x, y, 0), iso(x, y, z)), o: 0.8 });
  segs.push({ d: L(iso(3, 0, 1.6), iso(1.5, 0.5, 2)), dash: true });
  segs.push({ d: L(iso(3, 3, 1.1), iso(2.5, 1.5, 1.35)), dash: true });
  const nodes: [number, number][] = [];
  for (let x = 0; x <= 3; x++) for (let y = 0; y <= 3; y++) nodes.push(iso(x, y, 0));
  const hubs: [number, number][] = [...tops, ...peers.map(([x, y, z]) => iso(x, y, z))];
  return { segs, nodes, hubs };
}

/* ---------- sealed vault / enclave ---------- */
export function vault() {
  const segs: Seg[] = [];
  const H = 2;
  // visible faces, filled
  const top = poly([iso(0, 0, H), iso(3, 0, H), iso(3, 3, H), iso(0, 3, H)]);
  const left = poly([iso(0, 3, 0), iso(3, 3, 0), iso(3, 3, H), iso(0, 3, H)]);
  const right = poly([iso(3, 0, 0), iso(3, 3, 0), iso(3, 3, H), iso(3, 0, H)]);
  const fills = [top, left, right];
  // hidden back edges
  segs.push({ d: L(iso(0, 0, 0), iso(3, 0, 0)) + L(iso(0, 0, 0), iso(0, 3, 0)) + L(iso(0, 0, 0), iso(0, 0, H)), dash: true, o: 0.6 });
  // outline of the three faces
  segs.push({ d: top });
  segs.push({ d: left });
  segs.push({ d: right });
  // lid seam
  segs.push({ d: poly([iso(0.35, 0.35, H), iso(2.65, 0.35, H), iso(2.65, 2.65, H), iso(0.35, 2.65, H)]), o: 0.75 });
  segs.push({ d: poly([iso(1.2, 1.2, H), iso(1.8, 1.2, H), iso(1.8, 1.8, H), iso(1.2, 1.8, H)]), o: 0.75 });
  // sealed strata on the left face
  for (const z of [0.5, 1, 1.5]) segs.push({ d: L(iso(0.2, 3, z), iso(2.8, 3, z)), o: 0.7 });
  for (const x of [1, 2]) segs.push({ d: L(iso(x, 3, 0.2), iso(x, 3, 1.8)), o: 0.45 });
  // vault door on the right face (circle in the y/z plane)
  const ring = (rad: number, cy = 1.5, cz = 1) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      pts.push(iso(3, cy + rad * Math.cos(t), cz + rad * Math.sin(t)));
    }
    return poly(pts, false);
  };
  segs.push({ d: ring(0.78) });
  segs.push({ d: ring(0.58), o: 0.8 });
  segs.push({ d: ring(0.14) });
  let spokes = '';
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * Math.PI * 2 + 0.3;
    spokes += L(iso(3, 1.5 + 0.14 * Math.cos(t), 1 + 0.14 * Math.sin(t)), iso(3, 1.5 + 0.58 * Math.cos(t), 1 + 0.58 * Math.sin(t)));
  }
  segs.push({ d: spokes, o: 0.85 });
  // hinges + bolts
  segs.push({ d: L(iso(3, 0.45, 0.55), iso(3, 0.45, 0.75)) + L(iso(3, 0.45, 1.25), iso(3, 0.45, 1.45)) });
  for (const t of [0.25, 0.75]) {
    for (const z of [0.25, 1.75]) segs.push({ d: L(iso(3, t * 3 - 0.08, z), iso(3, t * 3 + 0.08, z)), o: 0.8 });
  }
  const nodes: [number, number][] = [iso(0, 0, H), iso(3, 0, H), iso(3, 3, H), iso(0, 3, H), iso(0, 3, 0), iso(3, 3, 0), iso(3, 0, 0)];
  return { segs, fills, nodes };
}

/* ---------- New York skyline ---------- */
export function skyline() {
  const G = 272; // ground
  const rect = (x0: number, x1: number, top: number) => `M${x0} ${G}V${top}H${x1}V${G}`;
  const lines: Seg[] = [];
  const fills: string[] = [];
  // background blocks
  const blocks: [number, number, number][] = [
    [28, 52, 236], [52, 78, 214], [78, 98, 228], [146, 166, 204], [166, 188, 184],
    [284, 306, 196], [306, 330, 218], [330, 352, 206], [352, 374, 238],
  ];
  for (const [a, b, t] of blocks) lines.push({ d: rect(a, b, t), o: 0.9 });
  // window rhythm on the background blocks
  let win = '';
  for (const [a, b, t] of blocks) {
    for (let y = t + 10; y < G - 6; y += 9) win += `M${a + 5} ${y}H${b - 5}`;
  }
  lines.push({ d: win, o: 0.35 });
  // One World Trade: chamfered taper + spire
  const owtc = `M102 ${G}L106 112L138 112L142 ${G}Z`;
  fills.push(owtc);
  lines.push({ d: owtc });
  lines.push({ d: `M106 112L142 ${G}M138 112L102 ${G}`, o: 0.55 });
  lines.push({ d: 'M122 112V58M116 112V100H128V112', o: 0.9 });
  // Empire State: setbacks + mast
  const esb = `M196 ${G}V168H202V146H208V124H212V108H220V124H224V146H230V168H236V${G}Z`;
  fills.push(esb);
  lines.push({ d: esb });
  lines.push({ d: 'M216 108V54', o: 0.9 });
  let esbWin = '';
  for (let x = 203; x <= 229; x += 6.5) esbWin += `M${x} 176V${G - 6}`;
  lines.push({ d: esbWin, o: 0.4 });
  // Chrysler: body, stacked arches, needle
  const chr = `M248 ${G}V156H276V${G}Z`;
  fills.push(chr);
  lines.push({ d: chr });
  let arches = '';
  for (let i = 0; i < 4; i++) {
    const w = 14 - i * 3.2;
    const y = 156 - i * 11;
    arches += `M${r(262 - w)} ${y}A${r(w)} ${r(w)} 0 0 1 ${r(262 + w)} ${y}`;
  }
  lines.push({ d: arches });
  lines.push({ d: 'M262 112V74', o: 0.9 });
  let chrWin = '';
  for (let y = 166; y < G - 6; y += 10) chrWin += `M253 ${y}H271`;
  lines.push({ d: chrWin, o: 0.4 });
  // ground + water
  lines.push({ d: `M8 ${G}H392` });
  lines.push({ d: 'M20 288q12 -5 24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0', o: 0.7 });
  lines.push({ d: 'M44 304q14 -5 28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0', o: 0.5 });
  lines.push({ d: 'M84 320q16 -5 32 0t32 0t32 0t32 0t32 0t32 0t32 0', o: 0.35 });
  // bridge: tower + cables to the left edge
  lines.push({ d: `M64 ${G}V176M54 ${G}V176M54 176H64M54 196H64`, o: 0.85 });
  lines.push({ d: 'M59 176Q30 236 6 252M59 176Q84 220 98 230', o: 0.7 });
  // sun ring
  lines.push({ d: 'M342 104m-20 0a20 20 0 1 0 40 0a20 20 0 1 0 -40 0', dash: true, o: 0.8 });
  return { lines, fills };
}

/* ---------- decorative digit rows ---------- */
export function digitRows(seed: number, rows = 3, groups = 9) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: { t: string; f: boolean }[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: { t: string; f: boolean }[] = [];
    for (let g = 0; g < groups; g++) {
      const len = 8 + Math.floor(rnd() * 14);
      let t = '';
      for (let k = 0; k < len; k++) t += Math.floor(rnd() * 10);
      row.push({ t, f: rnd() < 0.34 });
    }
    out.push(row);
  }
  return out;
}

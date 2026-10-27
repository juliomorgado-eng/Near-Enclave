// v4A-near · shared vector geometry (used by the Astro templates at build time and by the client scripts).
// All coordinates live in a 600 × 600 viewBox; the centre is (300, 300).

export type Pt = [number, number];
const C = 300;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const polar = (r: number, deg: number): Pt => {
  const a = (deg * Math.PI) / 180;
  return [r2(C + r * Math.cos(a)), r2(C + r * Math.sin(a))];
};

/* ------------------------------------------------------------------ */
/* Hero: open radial node diagram                                      */
/* ------------------------------------------------------------------ */
export const HERO = (() => {
  const inner = 104;
  const mid = 176;
  const outer = 252;
  const ring1A = [-62, 8, 62, 128, 188, 244];
  const ring2A = [-95, -35, 28, 92, 152, 214, 270];
  const n1 = ring1A.map((a) => polar(mid, a));
  const n2 = ring2A.map((a) => polar(outer, a));

  const L = (a: Pt, b: Pt) => `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
  // spokes leave the inner ring towards the first ring of nodes
  const spokes = ring1A.map((a, i) => L(polar(inner, a), n1[i])).join('');
  // links: every node of ring 1 reaches one or two nodes of ring 2
  const pairs: Array<[number, number]> = [
    [0, 0], [0, 1], [1, 1], [1, 2], [2, 3], [3, 3], [3, 4], [4, 5], [5, 5], [5, 6], [0, 6],
  ];
  const links = pairs.map(([a, b]) => L(n1[a], n2[b])).join('');
  const chords = [L(n1[0], n1[1]), L(n1[2], n1[3]), L(n1[4], n1[5])].join('');
  // strays run out of the frame: the network is open
  const strays = [0, 2, 4, 6]
    .map((i) => L(n2[i], polar(330, ring2A[i] + (i % 2 ? 6 : -6))))
    .join('');
  let ticks = '';
  for (let d = 0; d < 360; d += 5) {
    const major = d % 30 === 0;
    const a = polar(274, d - 90);
    const b = polar(major ? 290 : 282, d - 90);
    ticks += L(a, b);
  }
  const cross = [L([C, 196], [C, 6]), L([C, 404], [C, 594]), L([196, C], [6, C]), L([404, C], [594, C])].join('');
  // lime tag hangs off the node at -35° (upper right)
  const tagNode = n2[1];
  const elbow: Pt = [r2(tagNode[0] + 34), r2(tagNode[1] - 34)];
  const tagLeader = `M${tagNode[0]} ${tagNode[1]}L${elbow[0]} ${elbow[1]}L${r2(elbow[0] + 22)} ${elbow[1]}`;
  const tagRect = { x: r2(elbow[0] + 22), y: r2(elbow[1] - 8), w: 46, h: 16 };
  return { inner, mid, outer, n1, n2, spokes, links, chords, strays, ticks, cross, tagNode, tagLeader, tagRect };
})();

/* ------------------------------------------------------------------ */
/* Shift: open network → sealed enclosure                              */
/* ------------------------------------------------------------------ */
const SNAP = 25;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

export type Edge = { open: Pt[]; routed: Pt[]; closed: Pt[]; delay: number };

export const SEAL = { x: 150, y: 150, s: 300, center: [C, C] as Pt };

export const SHIFT = (() => {
  const ring1 = [-80, -20, 35, 95, 150, 205].map((a) => polar(150, a));
  const ring2 = [-110, -55, 0, 50, 115, 175, 235, 290].map((a) => polar(255, a));
  const nodes = [...ring1, ...ring2];
  const pairs: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
    [0, 6], [0, 7], [1, 8], [2, 9], [3, 10], [4, 11], [5, 12], [5, 13], [1, 7], [3, 9],
  ];
  // perimeter of the enclave: 4 sides × 4 segments, clockwise from the top-left corner
  const { x, y, s } = SEAL;
  const q = s / 4;
  const segs: Array<[Pt, Pt]> = [];
  for (let i = 0; i < 4; i++) segs.push([[x + q * i, y], [x + q * (i + 1), y]]);
  for (let i = 0; i < 4; i++) segs.push([[x + s, y + q * i], [x + s, y + q * (i + 1)]]);
  for (let i = 0; i < 4; i++) segs.push([[x + s - q * i, y + s], [x + s - q * (i + 1), y + s]]);
  for (let i = 0; i < 4; i++) segs.push([[x, y + s - q * i], [x, y + s - q * (i + 1)]]);

  const ang = (p: Pt) => Math.atan2(p[1] - C, p[0] - C);
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // pair each network edge with the perimeter segment closest in angle, so routes never cross the middle
  const edges = pairs.map(([a, b]) => ({ A: nodes[a], B: nodes[b] }));
  const byAngle = [...edges].sort((e, f) => ang(mid(e.A, e.B)) - ang(mid(f.A, f.B)));
  const segByAngle = [...segs].sort((p, q2) => ang(mid(p[0], p[1])) - ang(mid(q2[0], q2[1])));

  const out: Edge[] = byAngle.map((e, i) => {
    const [S0, S1] = segByAngle[i];
    // orient the segment so it starts at the end nearest to A (shorter travel)
    const d0 = Math.hypot(S0[0] - e.A[0], S0[1] - e.A[1]);
    const d1 = Math.hypot(S1[0] - e.A[0], S1[1] - e.A[1]);
    const [P, Q] = d0 <= d1 ? [S0, S1] : [S1, S0];
    const A: Pt = [snap(e.A[0]), snap(e.A[1])];
    const B: Pt = [snap(e.B[0]), snap(e.B[1])];
    return {
      open: [e.A, mid(e.A, e.B), e.B],
      routed: [A, [B[0], A[1]], B],
      closed: [P, mid(P, Q), Q],
      delay: (i % 4) * 0.035 + Math.floor(i / 4) * 0.012,
    };
  });
  return { nodes, edges: out };
})();

export const pathOf = (pts: Pt[]) => `M${r2(pts[0][0])} ${r2(pts[0][1])}` + pts.slice(1).map((p) => `L${r2(p[0])} ${r2(p[1])}`).join('');

/* ------------------------------------------------------------------ */
/* Format: Manhattan skyline, 1000 × 560 viewBox, horizon at y = 430   */
/* ------------------------------------------------------------------ */
export const SKY = (() => {
  const H = 430;
  const outlines: string[] = [];
  const details: string[] = [];
  const f = (n: number) => r2(n);

  // stepped tower: tiers bottom → top as [width, heightAboveHorizon]
  function tower(cx: number, tiers: Array<[number, number]>, spire = 0) {
    let d = `M${f(cx - tiers[0][0] / 2)} ${H}`;
    tiers.forEach(([w, h], i) => {
      const lx = cx - w / 2;
      if (i > 0) d += `L${f(lx)} ${f(H - tiers[i - 1][1])}`;
      d += `L${f(lx)} ${f(H - h)}`;
    });
    const top = tiers[tiers.length - 1];
    d += `L${f(cx + top[0] / 2)} ${f(H - top[1])}`;
    for (let i = tiers.length - 1; i >= 0; i--) {
      const rx = cx + tiers[i][0] / 2;
      d += `L${f(rx)} ${f(H - tiers[i][1])}`;
      d += `L${f(rx)} ${f(i > 0 ? H - tiers[i - 1][1] : H)}`;
    }
    outlines.push(d);
    if (spire) details.push(`M${f(cx)} ${f(H - top[1])}L${f(cx)} ${f(H - top[1] - spire)}`);
  }
  // window grid inside a box: vertical mullions + horizontal floors
  function windows(x0: number, x1: number, y0: number, y1: number, cols: number, rows: number) {
    let d = '';
    for (let i = 1; i < cols; i++) {
      const x = x0 + ((x1 - x0) * i) / cols;
      d += `M${f(x)} ${f(y0)}L${f(x)} ${f(y1)}`;
    }
    for (let j = 1; j < rows; j++) {
      const y = y0 + ((y1 - y0) * j) / rows;
      d += `M${f(x0)} ${f(y)}L${f(x1)} ${f(y)}`;
    }
    details.push(d);
  }
  function waterTower(cx: number, roof: number) {
    const y = H - roof;
    details.push(
      `M${f(cx - 4)} ${f(y)}L${f(cx - 5)} ${f(y - 8)}M${f(cx + 4)} ${f(y)}L${f(cx + 5)} ${f(y - 8)}` +
        `M${f(cx - 7)} ${f(y - 8)}L${f(cx + 7)} ${f(y - 8)}L${f(cx + 7)} ${f(y - 20)}L${f(cx - 7)} ${f(y - 20)}Z` +
        `M${f(cx - 8)} ${f(y - 20)}L${f(cx)} ${f(y - 28)}L${f(cx + 8)} ${f(y - 20)}`,
    );
  }

  // deterministic filler blocks
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // downtown, left → right
  tower(40, [[46, 92]]);
  waterTower(34, 92);
  tower(88, [[44, 150], [32, 168]]);
  windows(66, 110, H - 140, H - 8, 4, 10);
  // One World Trade Center: square base, chamfered shaft, antenna
  {
    const cx = 160;
    const bw = 62;
    const base = 48;
    const top = 330;
    const tw = 30;
    outlines.push(
      `M${cx - bw / 2} ${H}L${cx - bw / 2} ${H - base}L${cx - tw / 2} ${H - top}L${cx + tw / 2} ${H - top}L${cx + bw / 2} ${H - base}L${cx + bw / 2} ${H}`,
    );
    details.push(
      `M${cx - bw / 2} ${H - base}L${cx + bw / 2} ${H - base}M${cx - bw / 2} ${H - base}L${cx} ${H - top}M${cx + bw / 2} ${H - base}L${cx} ${H - top}` +
        `M${cx - tw / 2} ${H - top}L${cx} ${H - base}L${cx + tw / 2} ${H - top}` +
        `M${cx} ${H - top}L${cx} ${H - top - 66}M${cx - 6} ${H - top - 6}L${cx + 6} ${H - top - 6}`,
    );
  }
  tower(222, [[50, 120], [38, 136]]);
  windows(197, 247, H - 112, H - 6, 5, 8);
  tower(268, [[36, 176], [26, 196]], 18);
  tower(312, [[48, 98]]);
  waterTower(320, 98);
  // 432 Park: the pencil grid
  {
    const cx = 370;
    const w = 26;
    const h = 330;
    outlines.push(`M${cx - w / 2} ${H}L${cx - w / 2} ${H - h}L${cx + w / 2} ${H - h}L${cx + w / 2} ${H}`);
    windows(cx - w / 2, cx + w / 2, H - h, H, 3, 30);
  }
  tower(412, [[42, 140], [30, 150]]);
  // Empire State Building
  tower(478, [[84, 168], [66, 214], [48, 238], [30, 262], [18, 274], [9, 292]], 46);
  windows(436, 520, H - 160, H - 8, 7, 12);
  windows(445, 511, H - 208, H - 168, 6, 3);
  tower(540, [[40, 112]]);
  waterTower(548, 112);
  // Chrysler: stacked arches + needle
  {
    const cx = 594;
    tower(cx, [[52, 196], [40, 220], [32, 236]]);
    let arcs = '';
    const radii = [16, 12, 8.5, 5.5];
    let y = H - 236;
    radii.forEach((r, i) => {
      arcs += `M${f(cx - r)} ${f(y)}A${r} ${r * 1.15} 0 0 1 ${f(cx + r)} ${f(y)}`;
      // sunburst windows under each arch
      arcs += `M${f(cx)} ${f(y)}L${f(cx - r * 0.55)} ${f(y - r * 0.7)}M${f(cx)} ${f(y)}L${f(cx + r * 0.55)} ${f(y - r * 0.7)}`;
      y -= r * 0.9 + (i === 0 ? 4 : 2);
    });
    arcs += `M${cx} ${f(y + 2)}L${cx} ${f(y - 48)}`;
    details.push(arcs);
    windows(cx - 26, cx + 26, H - 188, H - 8, 5, 9);
  }
  tower(648, [[50, 134], [40, 150]]);
  // Central Park Tower
  tower(702, [[46, 246], [38, 296]], 22);
  windows(679, 725, H - 240, H - 6, 4, 14);
  tower(748, [[44, 120]]);
  waterTower(742, 120);
  tower(800, [[60, 188], [44, 212]], 12);
  windows(770, 830, H - 180, H - 6, 6, 9);
  // uptown fillers fade to the right edge
  let x = 850;
  while (x < 990) {
    const w = 26 + rnd() * 30;
    const h = 50 + rnd() * 90;
    tower(x + w / 2, [[w, h]]);
    if (rnd() > 0.55) waterTower(x + w / 2 - 4, h);
    x += w + 2;
  }
  // a run of low blocks between the hero towers keeps the street wall continuous
  const horizon = `M0 ${H}L1000 ${H}`;
  // water: rows of dashes ("waves, rows, repetition")
  const rows: string[] = [];
  for (let j = 0; j < 6; j++) {
    const y = H + 22 + j * 20;
    let d = '';
    let px = (j % 2) * 18;
    while (px < 1000) {
      const len = 30 + ((j * 37 + px) % 70);
      d += `M${f(px)} ${y}L${f(Math.min(1000, px + len))} ${y}`;
      px += len + 14 + ((j * 11 + px) % 22);
    }
    rows.push(d);
  }
  return { H, outlines, details, horizon, rows };
})();

// TWO LEDGERS — one full-screen WebGL pass behind the page.
// The same transaction feed is drawn on both sides of a single crisp line:
//   public side  → every glyph legible (time, counterparties, type, amount)
//   sealed side  → the same cells, redacted into shimmering blocks
// The line is "the primitive". Its position is driven by the page (hero → shift → stats).
import * as THREE from 'three';
import { ledgerRows } from './ledger';

export type SceneState = {
  split: number; // 0..1 along the active axis
  axis: number; // 0 = vertical line (split on x), 1 = horizontal line (split on y)
  field: number; // ledger opacity
  line: number; // line opacity
  flash: number; // primitive glow
  tint: number; // sealed-side background tint
};

const PRECISION = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const MAX_CLEAR = 12;
const FRAG = /* glsl */ `${PRECISION}
uniform sampler2D uTex;
uniform sampler2D uOcc;
uniform vec2 uTexSize;
uniform vec2 uGrid;
uniform vec2 uRes;
uniform float uPR;
uniform float uTime;
uniform float uSplit;
uniform float uAxis;
uniform float uField;
uniform float uLine;
uniform float uFlash;
uniform float uTint;
uniform float uScroll;
uniform float uReady;
uniform vec2 uMouse;
uniform vec4 uClear[${MAX_CLEAR}];
uniform float uClearN;

float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// one depth layer of the feed; s = signed distance (css px) from the line, > 0 on the sealed side
float layer(vec2 p, float scale, float rowPx, float vy, float par, float seedL, float s) {
  vec2 q = p / scale;
  float y = q.y + uTime * vy + uScroll * par;
  float row = floor(y / rowPx);
  float rh = h21(vec2(row, seedL));
  float x = q.x + uTime * (rh - 0.5) * 10.0 + rh * 5000.0;
  float k = (uTexSize.y / uGrid.y) / rowPx;          // texture px per layer px
  vec2 tc = vec2(x, y) * k;
  vec2 cellSz = uTexSize / uGrid;
  vec2 cf = tc / cellSz;
  vec2 cell = floor(cf);
  vec2 fr = fract(cf);
  float pub = texture2D(uTex, tc / uTexSize).a;
  vec2 oc = mod(cell, uGrid);
  float occ = texture2D(uOcc, (oc + 0.5) / uGrid).a;
  // sealed glyph: a redaction block in the same cell, slowly re-keyed
  float lvl = h21(oc + floor(uTime * 0.45 + h21(oc) * 9.0));
  float blk = step(0.04, fr.x) * step(fr.x, 0.96) * step(0.26, fr.y) * step(fr.y, 0.74);
  float sealA = occ * blk * (0.2 + 0.32 * lvl);
  // signed distance at the cell centre, so a cell flips whole (no half glyphs at the seam)
  vec2 cellScreen = cellSz / k * scale;
  float sc = s + mix((0.5 - fr.x) * cellScreen.x, (0.5 - fr.y) * cellScreen.y, uAxis);
  float zone = 110.0;
  float flip = step(0.0, sc) * step(h21(oc * 1.7 + 3.1) * zone, sc);
  // the occasional fresh transaction lights its row
  float hl = pow(max(0.0, sin(uTime * 0.18 + rh * 60.0)), 40.0);
  return mix(pub, sealA, flip) * (1.0 + hl * 0.8);
}

void main() {
  vec2 p0 = vec2(gl_FragCoord.x, uRes.y * uPR - gl_FragCoord.y) / uPR;   // css px, top-left origin
  // soft cursor repel
  vec2 d = p0 - uMouse;
  float l = length(d);
  float f = 1.0 - smoothstep(0.0, 170.0, l);
  vec2 p = p0 + d / max(l, 1.0) * f * f * 10.0;

  float s = mix(p0.x - uSplit * uRes.x, p0.y - uSplit * uRes.y, uAxis);

  // DOM copy punches a soft hole in the field (and in the line) so text never sits on glyphs
  float clr = 1.0;
  float clrL = 1.0;
  for (int i = 0; i < ${MAX_CLEAR}; i++) {
    if (float(i) >= uClearN) break;
    vec4 r = uClear[i];
    vec2 c = (r.xy + r.zw) * 0.5;
    vec2 hs = (r.zw - r.xy) * 0.5;
    vec2 dd = abs(p0 - c) - hs;
    float sd = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0);
    clr = min(clr, smoothstep(8.0, 96.0, sd));
    clrL = min(clrL, smoothstep(-14.0, 24.0, sd));
  }

  float nearL = layer(p, 1.0, 26.0, 7.0, 0.1, 1.0, s);
  float farL = layer(p * 1.0 + vec2(0.0, 0.0), 0.58, 26.0, 4.0, 0.04, 7.0, s);
  float edge = smoothstep(0.0, 110.0, p0.y) * smoothstep(0.0, 110.0, uRes.y - p0.y);
  float a = (nearL * 0.095 + farL * 0.035) * uField * clr * mix(0.55, 1.0, edge) * uReady;

  vec3 cream = vec3(0.922, 0.890, 0.827);
  float side = smoothstep(-0.5, 0.5, s);
  vec3 col = mix(vec3(0.0), vec3(0.047, 0.045, 0.042), side * uTint);
  col += cream * a;

  float lp = abs(s) * uPR;
  float core = 1.0 - smoothstep(0.4, 1.3, lp);
  float glow = exp(-abs(s) / 16.0) * 0.08 + uFlash * (exp(-abs(s) / 70.0) * 0.32 + exp(-abs(s) / 6.0) * 0.4);
  float lineMask = mix(1.0, clrL, 0.94);
  col += cream * (core * 0.9 + glow) * uLine * lineMask;
  gl_FragColor = vec4(col, 1.0);
}
`;

export type Scene = {
  state: SceneState;
  target: SceneState;
  setPointer(x: number, y: number): void;
  setClears(rects: Array<[number, number, number, number]>): void;
  setScroll(y: number): void;
  tick(dt: number): void;
  render(): void;
  snap(): void;
  pause(p: boolean): void;
  resize(): void;
  ready: Promise<void>;
  dispose(): void;
};

const COLS = 168;
const ROWS = 48;

async function buildTextures() {
  const font = '500 26px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';
  try {
    await document.fonts?.load(font, '0x→…');
  } catch {
    /* system mono is fine */
  }
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = font;
  const cw = g.measureText('0').width;
  const W = Math.round(cw * COLS);
  const rowH = 40;
  c.width = W;
  c.height = ROWS * rowH;
  g.font = font;
  g.textBaseline = 'middle';
  const cellW = W / COLS;
  const rows = ledgerRows(ROWS, COLS);
  const occ = new Uint8Array(COLS * ROWS * 4);
  const A = ['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.66)', 'rgba(255,255,255,1)'];
  rows.forEach((r, y) => {
    for (let x = 0; x < COLS; x++) {
      const ch = r.text[x];
      if (ch === ' ') continue;
      g.fillStyle = A[+r.weight[x]];
      g.fillText(ch, x * cellW + (cellW - g.measureText(ch).width) / 2, y * rowH + rowH / 2);
      const o = (y * COLS + x) * 4;
      occ[o] = occ[o + 1] = occ[o + 2] = 255;
      occ[o + 3] = 255;
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  const occT = new THREE.DataTexture(occ, COLS, ROWS, THREE.RGBAFormat);
  occT.flipY = false;
  occT.magFilter = occT.minFilter = THREE.NearestFilter;
  occT.wrapS = occT.wrapT = THREE.RepeatWrapping;
  occT.needsUpdate = true;
  return { tex, occT, size: new THREE.Vector2(W, ROWS * rowH) };
}

export function createScene(canvas: HTMLCanvasElement, opts: { isStatic: boolean; lowTier: boolean }): Scene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new THREE.Scene();
  const clears = Array.from({ length: MAX_CLEAR }, () => new THREE.Vector4());
  const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  blank.needsUpdate = true;
  const uniforms = {
    uTex: { value: blank as THREE.Texture },
    uOcc: { value: blank as THREE.Texture },
    uTexSize: { value: new THREE.Vector2(1, 1) },
    uGrid: { value: new THREE.Vector2(COLS, ROWS) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uPR: { value: 1 },
    uTime: { value: 0 },
    uSplit: { value: 0.5 },
    uAxis: { value: 0 },
    uField: { value: 1 },
    uLine: { value: 1 },
    uFlash: { value: 0 },
    uTint: { value: 1 },
    uScroll: { value: 0 },
    uReady: { value: 0 },
    uMouse: { value: new THREE.Vector2(-9999, -9999) },
    uClear: { value: clears },
    uClearN: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const state: SceneState = { split: 0.5, axis: 0, field: 1, line: 1, flash: 0, tint: 1 };
  const target: SceneState = { ...state };
  const mouse = new THREE.Vector2(-9999, -9999);
  const mouseT = new THREE.Vector2(-9999, -9999);
  let paused = false;
  let time = 7;
  let ready = 0;

  const resize = () => {
    const w = document.documentElement.clientWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, opts.lowTier ? 1.25 : 1.75);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    uniforms.uRes.value.set(w, h);
    uniforms.uPR.value = pr;
  };
  resize();
  window.addEventListener('resize', resize);

  const apply = () => {
    uniforms.uSplit.value = state.split;
    uniforms.uAxis.value = state.axis;
    uniforms.uField.value = state.field;
    uniforms.uLine.value = state.line;
    uniforms.uFlash.value = state.flash;
    uniforms.uTint.value = state.tint;
    uniforms.uMouse.value.copy(mouse);
    uniforms.uTime.value = time;
    uniforms.uReady.value = ready;
  };
  const render = () => {
    apply();
    renderer.render(scene, camera);
  };

  const readyP = buildTextures()
    .then(({ tex, occT, size }) => {
      uniforms.uTex.value = tex;
      uniforms.uOcc.value = occT;
      uniforms.uTexSize.value.copy(size);
      ready = opts.isStatic ? 1 : ready;
      if (opts.isStatic) render();
    })
    .catch(() => {
      /* the line still renders */
    });
  renderer.compile(scene, camera);

  return {
    state,
    target,
    ready: readyP,
    setPointer(x, y) {
      mouseT.set(x, y);
      if (mouse.x < -999) mouse.set(x, y);
    },
    setClears(rects) {
      const n = Math.min(MAX_CLEAR, rects.length);
      for (let i = 0; i < n; i++) clears[i].set(rects[i][0], rects[i][1], rects[i][2], rects[i][3]);
      uniforms.uClearN.value = n;
    },
    setScroll(y) {
      uniforms.uScroll.value = y;
    },
    tick(dt) {
      if (paused) return;
      const k = 1 - Math.exp(-dt * 5);
      // background moves slowly: time runs at a fraction of real time
      time += dt * 0.6;
      if (uniforms.uTexSize.value.x > 1) ready = Math.min(1, ready + dt * 1.2);
      state.axis = target.axis;
      // snapping the split when the axis changes avoids a sweep across the wrong dimension
      for (const key of ['split', 'field', 'line', 'flash', 'tint'] as const) state[key] += (target[key] - state[key]) * k;
      mouse.x += (mouseT.x - mouse.x) * Math.min(1, dt * 4);
      mouse.y += (mouseT.y - mouse.y) * Math.min(1, dt * 4);
      render();
    },
    render,
    snap() {
      Object.assign(state, target);
      ready = uniforms.uTexSize.value.x > 1 ? 1 : ready;
    },
    pause(p) {
      paused = p;
    },
    resize,
    dispose() {
      window.removeEventListener('resize', resize);
      mat.dispose();
      mesh.geometry.dispose();
      renderer.dispose();
    },
  };
}

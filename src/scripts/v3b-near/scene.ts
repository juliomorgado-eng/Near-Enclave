// v3B-NEAR — one WebGL layer behind the page, light mode.
//   A. ciphertext field: soft warm-grey glyph lanes flowing left → right. Before the monolith
//      they funnel into it; past it only a few packets survive, re-ordered into a clean beam
//      that is routed to the line of copy (or figure) the enclave is currently emitting.
//   B. glass monolith = the enclave. Translucent green/white glass (NEAR deck glass pieces),
//      refracting the stream it ingests. Its front face carries an icon tied to the active
//      Shift sentence; icons swap through a pixel scramble. The cursor lens reveals the N.
// One renderer, ≤ 3 draw calls, adaptive quality, paused when hidden.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import nSvg from '../../../public/v3b-near/near-icon.svg?raw';
import nBlackSvg from '../../../public/v3b-near/near-icon-black.svg?raw';
import { ICONS, STROKE } from './icons';

export type ChapterState = {
  field: number; // field opacity
  slab: number; // slab opacity (also enables funnel/beam)
  sx: number; // slab centre, NDC
  sy: number;
  ss: number; // slab height / viewport height
  frost: number;
  ox: number; // beam end, NDC x
  oy: number; // beam target, NDC y
  pass: number; // fraction of packets that leave the enclave
  speed: number;
  mark: number;
};
export const KEYS = ['field', 'slab', 'sx', 'sy', 'ss', 'frost', 'ox', 'oy', 'pass', 'speed', 'mark'] as const;

const PRECISION = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */
const FIELD_VERT = /* glsl */ `
attribute vec3 aStream;
attribute vec4 aInfo; // seed, glyph, lane speed, lane v (-1..1)
uniform float uTime;
uniform float uFlow;
uniform vec4 uBox;   // slab centre x,y + half extents (world, z = 0)
uniform vec3 uOut;   // beam end x, target y, pass fraction
uniform float uOn;   // enclave active (funnel + beam)
uniform float uPulse;
uniform vec2 uMouse;
uniform vec2 uRes;
uniform float uPR;
uniform float uScale;
uniform float uField;
uniform float uRepel;
uniform float uAIn;
varying float vGlyph;
varying float vA;
varying float vOut;
void main() {
  float seed = aInfo.x;
  float x = mod(aStream.x + uFlow * aInfo.z + 15.0, 30.0) - 15.0;
  vec3 p = vec3(x, aStream.y, aStream.z);
  float L = uBox.x - uBox.z;
  float R = uBox.x + uBox.z;

  // 1. ingest: lanes funnel into the slab's face and its plane
  float fin = smoothstep(L - 4.2, L + 0.15, x) * uOn;
  float fe = fin * fin * (3.0 - 2.0 * fin);
  p.y = mix(p.y, uBox.y + aInfo.w * uBox.w * 0.8, fe);
  p.z = mix(p.z, 0.0, fe);

  // 2. emit: past the slab only "passed" packets remain, routed as a 3-strand beam
  float isOut = step(R, x) * uOn;
  float span = max(uOut.x - R, 0.4);
  float ex = clamp((x - R) / span, 0.0, 1.0);
  float strand = floor(fract(seed * 13.7) * 3.0) - 1.0;
  float by = mix(uBox.y, uOut.y, smoothstep(0.0, 0.7, ex)) + strand * 0.06;
  p.y = mix(p.y, by, isOut);
  p.z = mix(p.z, 0.0, isOut);
  float passed = step(fract(seed * 7.31), uOut.z + uPulse * 0.12);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  vec2 sp = (ndc * 0.5 + 0.5) * uRes;
  vec2 d = sp - uMouse;
  float l = length(d);
  float f = 1.0 - smoothstep(0.0, 150.0 * uPR, l);
  sp += (d / max(l, 0.001)) * f * f * 26.0 * uPR * uRepel * (1.0 - isOut);
  clip.xy = (sp / uRes * 2.0 - 1.0) * clip.w;
  gl_Position = clip;

  float dist = -mv.z;
  gl_PointSize = clamp(0.115 * uScale / dist, 1.0, 64.0);
  float noisy = mod(aInfo.y + floor(uTime * 0.9 + seed * 10.0) * 7.0, 56.0);
  vGlyph = mix(noisy, 56.0 + mod(floor(seed * 4.0), 2.0), isOut);

  float depthFade = smoothstep(18.0, 8.0, dist) * smoothstep(0.6, 2.0, dist);
  float aIn = uAIn * depthFade * (0.7 + 0.3 * f);
  float aOut = (0.62 + uPulse * 0.3) * passed * (1.0 - smoothstep(0.78, 1.0, ex)) * smoothstep(0.0, 0.05, ex);
  vA = mix(aIn, aOut, isOut) * uField;
  vOut = isOut;
}
`;

const FIELD_FRAG = /* glsl */ `${PRECISION}
uniform sampler2D uAtlas;
uniform vec3 uInk;
uniform vec3 uInkOut;
varying float vGlyph;
varying float vA;
varying float vOut;
void main() {
  vec2 cell = vec2(mod(vGlyph, 8.0), floor(vGlyph / 8.0));
  vec2 uv = vec2((cell.x + gl_PointCoord.x) / 8.0, 1.0 - (cell.y + gl_PointCoord.y) / 8.0);
  float a = texture2D(uAtlas, uv).a * vA;
  if (a < 0.006) discard;
  gl_FragColor = vec4(mix(uInk, uInkOut, vOut), a);
}
`;

const SLAB_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vNo;
varying vec3 vV;
varying vec3 vL;
void main() {
  vL = position;
  vNo = normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SLAB_FRAG = /* glsl */ `${PRECISION}
uniform sampler2D uRT;
uniform sampler2D uMark;
uniform sampler2D uIcons;
uniform vec2 uRes;
uniform vec2 uMouse;
uniform float uLens;
uniform float uFrost;
uniform float uOpacity;
uniform float uFlash;
uniform float uTime;
uniform float uTaps;
uniform float uMarkOn;
uniform vec2 uSize;
uniform float uIA;   // icon shown before the swap (-1 = none)
uniform float uIB;   // icon being swapped in
uniform float uIMix; // 0 → 1 swap progress
uniform float uIAmt; // mosaic visibility (only during a swap; the settled icon is DOM SVG)
varying vec3 vN;
varying vec3 vNo;
varying vec3 vV;
varying vec3 vL;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// atlas: 5 × 2 cells, one icon per cell, 24-unit grid inside a 32-unit box
float icon(float idx, vec2 u) {
  // branch-free: texture2D inside non-uniform control flow breaks mip selection on real GPUs
  float ok = step(-0.5, idx) * step(0.0, u.x) * step(0.0, u.y) * step(u.x, 1.0) * step(u.y, 1.0);
  float k = max(idx, 0.0);
  float col = mod(k, 5.0);
  float row = floor(k / 5.0);
  vec2 cu = clamp(u, 0.0, 1.0);
  vec2 uv = vec2((col + cu.x) / 5.0, 1.0 - (row + 1.0 - cu.y) / 2.0);
  return texture2D(uIcons, uv).a * ok;
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float ndv = abs(dot(N, V));
  float fres = pow(1.0 - ndv, 3.0);
  vec2 frag = gl_FragCoord.xy;
  vec2 suv = frag / uRes;
  float lensD = distance(frag, uMouse);
  float lens = 1.0 - smoothstep(uLens * 0.5, uLens, lensD);
  float frost = clamp(uFrost - lens * 1.15, 0.0, 1.0);
  vec2 q = vL.xy / uSize;
  float front = smoothstep(0.6, 0.95, vNo.z);
  vec2 e = abs(q) * 2.0;
  float edge = max(e.x, e.y);
  float edgeF = smoothstep(0.72, 1.0, edge);
  vec2 refr = -q * 0.045 + N.xy * 0.09 + sign(q) * edgeF * edgeF * 0.035;
  float rad = frost * 0.008;
  float rot = ign(frag + fract(uTime) * 17.0) * 6.2831853;
  float bias = frost * 1.2;
  float gs = 0.0;
  float asp = uRes.y / uRes.x;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    if (fi >= uTaps) break;
    float r = sqrt((fi + 0.5) / uTaps) * rad;
    float a = fi * 2.39996 + rot;
    vec2 o = vec2(cos(a) * asp, sin(a)) * r;
    gs += texture2D(uRT, suv + refr + o, bias).r;
  }
  gs = clamp(gs / uTaps * 2.6, 0.0, 1.0);

  // glass body on dark: deep emerald at the centre, brand green pooling bottom-left and in
  // the thick edges, a cool mint sheen top-right (deck glass, seen against #1C1917)
  vec3 GREEN = vec3(0.0, 0.863, 0.553);
  vec3 DEEP = vec3(0.02, 0.2, 0.145);
  float diag = clamp(0.5 + (-q.x * 0.8 - q.y) * 1.05, 0.0, 1.0);
  vec3 col = mix(DEEP, GREEN * 0.78, smoothstep(0.55, 1.05, diag) * 0.85);
  col = mix(col, vec3(0.32, 0.62, 0.52), smoothstep(0.35, 0.0, diag) * 0.35);
  // thickness: side faces and the inner border read greener, like the tubes' ends
  col = mix(col, GREEN * 0.8, (1.0 - front) * 0.8);
  col = mix(col, GREEN, smoothstep(0.8, 0.97, edge) * 0.45 * front);
  // the ingested stream, refracted inside: soft mint glyphs
  col = mix(col, vec3(0.55, 0.95, 0.78), gs * (0.45 - frost * 0.15));

  // lens: the frost clears to dark, clear glass, the green N reads through it
  float clear = (1.0 - smoothstep(0.0, 0.08, frost)) * lens;
  col = mix(col, vec3(0.05, 0.085, 0.075), lens * 0.85 * front * uMarkOn);
  vec4 mk = texture2D(uMark, vec2(q.x + 0.5, q.y + 0.5), frost * 6.0);
  col = mix(col, mk.rgb, mk.a * clear * front * uMarkOn);

  // face icon with pixel-scramble swap (cells on the icon's own 32-unit grid)
  vec2 iu = q * uSize / (0.74 * uSize.x) + vec2(0.5, 0.5);
  vec2 cellId = floor(iu * 32.0);
  vec2 iq = (cellId + 0.5) / 32.0;
  float hc = h21(cellId + 7.0);
  float w = 0.3;
  float local = clamp((uIMix * (1.0 + w) - hc) / w, 0.0, 1.0);
  float qa = step(0.35, mix(icon(uIA, iq), icon(uIB, iq), step(0.5, local)));
  float fl = step(0.62, h21(cellId + floor(uTime * 22.0)));
  float inBox = step(0.0, iu.x) * step(0.0, iu.y) * step(iu.x, 1.0) * step(iu.y, 1.0);
  float noise = fl * (1.0 - abs(local * 2.0 - 1.0)) * inBox;
  float ia = qa * uIAmt;
  float glint = noise * uIAmt;
  float iconVis = front * (1.0 - clear * uMarkOn) * smoothstep(0.98, 0.9, edge);
  col = mix(col, vec3(0.961, 0.961, 0.961), ia * iconVis);
  col = mix(col, vec3(0.749, 0.976, 0.533), glint * 0.95 * iconVis);

  // processing scan: a slow band moving down the slab
  float scan = fract(uTime * 0.07);
  col += vec3(1.0) * exp(-pow((q.y + 0.5 - (1.0 - scan)) / 0.035, 2.0)) * 0.06 * front;
  // fresnel + crisp bevel: bright outer rim, thin inner line, top-edge specular
  float rim = smoothstep(0.972, 0.995, edge) * front;
  float inner = smoothstep(0.93, 0.965, edge) * (1.0 - smoothstep(0.965, 0.975, edge)) * front;
  float top = smoothstep(0.9, 0.99, q.y * 2.0) * front;
  col += vec3(0.85, 1.0, 0.94) * (fres * 0.55 + rim * 0.7 + inner * 0.35 + top * 0.3) * (1.0 + uFlash * 1.2);
  float dg = (q.x * 0.8 - q.y);
  col += vec3(1.0) * exp(-pow((dg - 0.12) / 0.16, 2.0)) * 0.08 * front;
  col += vec3(1.0) * smoothstep(0.2, -0.7, q.x - q.y) * 0.05 * front;
  // pulse: the enclave just released a result
  col = mix(col, vec3(0.749, 0.976, 0.533), uFlash * 0.18 * front * (1.0 - ia));
  float ring = smoothstep(uLens * 0.92, uLens * 0.985, lensD) * (1.0 - smoothstep(uLens * 0.985, uLens * 1.05, lensD));
  col = mix(col, vec3(0.961, 0.961, 0.961), ring * 0.4 * step(1.0, uLens) * uMarkOn * front);
  col += (ign(frag * 1.37 + uTime * 41.0) - 0.5) * 0.02 * frost;
  col = clamp(col, 0.0, 1.0);
  // translucent body, solid edges; the icon is opaque ink on the face
  float body = mix(0.78, 0.97, max(max(rim, edgeF * 0.6), max(1.0 - front, fres)));
  body = max(body, ia * iconVis);
  gl_FragColor = vec4(col, uOpacity * body);
}
`;

/* ------------------------------------------------------------------ */
/* Textures                                                            */
/* ------------------------------------------------------------------ */
const NOISY = '01$#/\\░▒◇+×N≡0123456789ABCDEF#$/+×≡◇░0x1F<>%=:;|*7E9C';

function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '500 40px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';
  for (let i = 0; i < 56; i++) {
    const ch = NOISY[i % NOISY.length];
    g.fillText(ch, (i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 34);
  }
  const cell = (i: number) => [(i % 8) * 64, Math.floor(i / 8) * 64];
  let [x, y] = cell(56);
  g.fillRect(x + 2, y + 30, 60, 5);
  [x, y] = cell(57);
  g.fillRect(x + 14, y + 30, 36, 5);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

const pathOf = (svg: string) => /d="([^"]+)"/.exec(svg)?.[1] ?? '';

/** 5 × 2 atlas of 512-px cells; each icon sits on a 24-unit grid centred in a 32-unit box */
function makeIcons() {
  const C = 512;
  const c = document.createElement('canvas');
  c.width = C * 5;
  c.height = C * 2;
  const g = c.getContext('2d')!;
  const u = C / 32;
  ICONS.forEach((ic, i) => {
    g.save();
    g.translate((i % 5) * C + 4 * u, Math.floor(i / 5) * C + 4 * u);
    g.scale(u, u);
    if ('fill' in ic && ic.fill) {
      // official NEAR mark (black variant is the deck's mark-on-green)
      const d = pathOf(nBlackSvg);
      const s = 24 / 73;
      g.scale(s, s);
      g.fillStyle = '#000';
      if (d) g.fill(new Path2D(d));
    } else {
      g.strokeStyle = '#000';
      g.lineWidth = STROKE;
      g.lineCap = 'square';
      g.lineJoin = 'miter';
      g.miterLimit = 4;
      for (const d of ic.paths) g.stroke(new Path2D(d));
      g.fillStyle = '#000';
      for (const d of ic.fills ?? []) g.fill(new Path2D(d));
    }
    g.restore();
  });
  // only ever sampled at mosaic-cell centres: no mipmaps needed
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

/** lens attestation: the official N (green) with thin corner brackets — no text */
function makeMark() {
  const W = 704;
  const H = 960;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const d = pathOf(nSvg);
  if (d) {
    const s = 3.6;
    g.save();
    g.translate(W / 2 - 36.5 * s, H / 2 - 36.5 * s - 10);
    g.scale(s, s);
    g.fillStyle = '#00DC8D';
    g.fill(new Path2D(d));
    g.restore();
  }
  g.strokeStyle = 'rgba(245,245,245,0.5)';
  g.lineWidth = 3;
  g.lineCap = 'square';
  const m = 46;
  const k = 30;
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => {
    g.beginPath();
    g.moveTo(x, y + k * sy);
    g.lineTo(x, y);
    g.lineTo(x + k * sx, y);
    g.stroke();
  });
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

function makeField(count: number) {
  const geo = new THREE.BufferGeometry();
  const stream = new Float32Array(count * 3);
  const info = new Float32Array(count * 4);
  const LANES = 200;
  const lanes = Array.from({ length: LANES }, () => {
    const v = Math.random() * 2 - 1;
    return { v, y: v * 5.2, z: -4.5 + Math.random() * 5, speed: 0.3 + Math.random() * 0.8 };
  });
  let lane = 0;
  let x = 0;
  let run = 0;
  for (let i = 0; i < count; i++) {
    if (run <= 0) {
      lane = (Math.random() * LANES) | 0;
      x = Math.random() * 30;
      run = 3 + ((Math.random() * 12) | 0);
    }
    const L = lanes[lane];
    stream[i * 3] = x;
    stream[i * 3 + 1] = L.y;
    stream[i * 3 + 2] = L.z;
    x += 0.13;
    run--;
    info[i * 4] = Math.random();
    info[i * 4 + 1] = (Math.random() * 56) | 0;
    info[i * 4 + 2] = L.speed;
    info[i * 4 + 3] = L.v;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aStream', new THREE.BufferAttribute(stream, 3));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return geo;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */
const smooth01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

// warm grey stream on #F5F5F5, emitted packets in dark warm grey
const INK = new THREE.Color('#8f8882');
const INK_OUT = new THREE.Color('#D6D3D1');
const WHITE = new THREE.Color(1, 1, 1);

export type SceneOptions = { lowTier: boolean; isStatic: boolean; face?: HTMLElement | null };

export function createScene(canvas: HTMLCanvasElement, opts: SceneOptions) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance', premultipliedAlpha: true });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  let low = opts.lowTier;
  let pr = Math.min(window.devicePixelRatio || 1, low ? 1.5 : 1.75);
  let W = window.innerWidth;
  let H = window.innerHeight;

  const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 60);
  camera.position.set(0, 0, 10);
  const fieldScene = new THREE.Scene();
  const slabScene = new THREE.Scene();

  const COUNT = low ? 8000 : 18000;
  const fieldGeo = makeField(COUNT);
  const atlas = makeAtlas();
  const fieldMat = new THREE.ShaderMaterial({
    vertexShader: FIELD_VERT,
    fragmentShader: FIELD_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uBox: { value: new THREE.Vector4(0, 0, 1, 1) },
      uOut: { value: new THREE.Vector3(6, 0, 0.2) },
      uOn: { value: 1 },
      uPulse: { value: 0 },
      uMouse: { value: new THREE.Vector2(-9999, -9999) },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPR: { value: pr },
      uScale: { value: 1 },
      uField: { value: 1 },
      uRepel: { value: 1 },
      uAIn: { value: 0.22 },
      uInk: { value: INK.clone() },
      uInkOut: { value: INK_OUT.clone() },
      uAtlas: { value: atlas },
    },
  });
  const points = new THREE.Points(fieldGeo, fieldMat);
  points.frustumCulled = false;
  fieldScene.add(points);

  let rtScale = low ? 0.25 : 0.5;
  const rt = new THREE.WebGLRenderTarget(4, 4, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  const mark = makeMark();
  const icons = makeIcons();
  const SW = 2.2;
  const SH = 3.0;
  const slabUniforms = {
    uRT: { value: rt.texture },
    uMark: { value: mark },
    uIcons: { value: icons },
    uRes: { value: new THREE.Vector2(1, 1) },
    uMouse: { value: new THREE.Vector2(-9999, -9999) },
    uLens: { value: 0 },
    uFrost: { value: 0.7 },
    uOpacity: { value: 1 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uTaps: { value: low ? 6 : 12 },
    uMarkOn: { value: 1 },
    uSize: { value: new THREE.Vector2(SW, SH) },
    uIA: { value: -1 },
    uIB: { value: -1 },
    uIMix: { value: 1 },
    uIAmt: { value: 0 },
  };
  const slabGeo = new RoundedBoxGeometry(SW, SH, 0.5, 5, 0.06);
  const slabMat = new THREE.ShaderMaterial({
    vertexShader: SLAB_VERT,
    fragmentShader: SLAB_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: slabUniforms,
  });
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slabScene.add(slab);

  const cur: ChapterState = { field: 1, slab: 1, sx: 0.45, sy: 0, ss: 0.5, frost: 0.7, ox: 1.2, oy: 0, pass: 0.2, speed: 1, mark: 1 };
  const target: ChapterState = { ...cur };
  const pointer = { x: -9999, y: -9999, sx: 0, sy: 0, active: false };
  let time = 0;
  let flow = 0;
  let flash = 0;
  let lensOn = !opts.isStatic;
  let lensAmt = 0;
  const touch = !matchMedia('(hover: hover) and (pointer: fine)').matches;
  let running = true;
  let lost = false;
  let frames = 0;
  let acc = 0;
  let tiered = low;
  // icon swap state
  // icon swap: time-based, always runs to the end (never tied to scroll)
  //   0 → 0.5 s  pixel mosaic scrambles from → to in the texture
  //   0.5 → 0.8 s mosaic fades out while the crisp DOM SVG of `to` fades in
  let iconFrom = -1;
  let iconTo = -1;
  let iconT = 99;
  let iconStart = -1e9; // wall-clock start: the swap finishes on time even if frames are slow
  const faceEl = opts.face ?? null;
  const faceIcons = faceEl ? [...faceEl.querySelectorAll<HTMLElement>('[data-face-i]')] : [];
  const faceOp = faceIcons.map(() => -1);
  let faceShown = -1;
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();

  function setSize() {
    W = window.innerWidth;
    H = window.innerHeight;
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const bw = Math.floor(W * pr);
    const bh = Math.floor(H * pr);
    rt.setSize(Math.max(2, Math.floor(bw * rtScale)), Math.max(2, Math.floor(bh * rtScale)));
    fieldMat.uniforms.uRes.value.set(bw, bh);
    fieldMat.uniforms.uPR.value = pr;
    slabUniforms.uRes.value.set(bw, bh);
    fieldMat.uniforms.uScale.value = bh / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }
  setSize();

  let resizeQueued = false;
  let lastW = W;
  const onResize = () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      if (window.innerWidth === lastW && Math.abs(window.innerHeight - H) < 80 && touch) return;
      lastW = window.innerWidth;
      setSize();
      if (opts.isStatic) render(0);
    });
  };
  window.addEventListener('resize', onResize);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    document.documentElement.classList.remove('gl-on');
    document.documentElement.classList.add('no-gl');
  });

  function lowerTier() {
    tiered = true;
    low = true;
    pr = 1;
    rtScale = 0.25;
    fieldGeo.setDrawRange(0, Math.floor(COUNT / 2));
    slabUniforms.uTaps.value = 6;
    setSize();
  }

  function halfExtents() {
    const h = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    return { hw: h * camera.aspect, hh: h };
  }

  function setIcon(i: number) {
    if (i === iconTo) return;
    iconFrom = iconTo;
    iconTo = i;
    iconT = opts.isStatic ? 99 : 0;
    iconStart = opts.isStatic ? -1e9 : performance.now();
    slabUniforms.uIA.value = iconFrom;
    slabUniforms.uIB.value = iconTo;
  }

  /** crisp icon: DOM SVG laid over the projected front face */
  function placeFace(opacity: number) {
    if (!faceEl) return;
    if (opacity < 0.01) {
      if (faceShown !== 0) faceEl.style.opacity = '0';
      faceShown = 0;
      return;
    }
    slab.updateMatrixWorld();
    const zf = 0.25;
    v0.set(0, 0, zf).applyMatrix4(slab.matrixWorld).project(camera);
    v1.set(-SW / 2, 0, zf).applyMatrix4(slab.matrixWorld).project(camera);
    v2.set(SW / 2, 0, zf).applyMatrix4(slab.matrixWorld).project(camera);
    const x = (v0.x * 0.5 + 0.5) * W;
    const y = (1 - (v0.y * 0.5 + 0.5)) * H;
    const fw = Math.abs(v2.x - v1.x) * 0.5 * W;
    const w = fw * 0.74;
    faceEl.style.width = `${w.toFixed(1)}px`;
    faceEl.style.transform = `translate3d(${(x - w / 2).toFixed(1)}px, ${(y - w / 2).toFixed(1)}px, 0)`;
    faceEl.style.opacity = opacity.toFixed(3);
    faceShown = 1;
  }

  const tmp = new THREE.Vector3();
  let cleared = false;
  function render(dt: number) {
    if (lost) return;
    const k = opts.isStatic ? 1 : 1 - Math.exp(-dt * 4);
    const kp = opts.isStatic ? 1 : 1 - Math.exp(-dt * 12);
    for (const key of KEYS) cur[key] += (target[key] - cur[key]) * (key === 'sx' || key === 'sy' || key === 'ss' ? kp : k);
    flash *= Math.exp(-dt * 2.4);
    iconT = (performance.now() - iconStart) / 1000;
    slabUniforms.uIMix.value = Math.min(1, iconT / 0.5);
    slabUniforms.uIAmt.value = iconT < 0.5 ? smooth01(iconT / 0.06) : 1 - smooth01((iconT - 0.5) / 0.3);
    faceIcons.forEach((el, k) => {
      const o = k === iconTo ? smooth01((iconT - 0.5) / 0.3) : k === iconFrom ? 1 - smooth01(iconT / 0.1) : 0;
      if (Math.abs(o - faceOp[k]) > 0.002) {
        faceOp[k] = o;
        el.style.opacity = o.toFixed(3);
      }
    });

    const away = Math.hypot(target.sx - cur.sx, target.sy - cur.sy);
    const present = cur.slab * (1 - smooth01((away - 0.25) / 0.35));
    const fieldOn = cur.field > 0.004;
    const slabOn = present > 0.05;
    if (!fieldOn && !slabOn) {
      placeFace(0);
      if (!cleared) {
        renderer.setRenderTarget(null);
        renderer.clear();
        cleared = true;
      }
      return;
    }
    cleared = false;
    time += dt;
    flow += dt * cur.speed * 0.2;

    pointer.sx += ((pointer.active ? (pointer.x / W) * 2 - 1 : 0) - pointer.sx) * 0.04;
    pointer.sy += ((pointer.active ? (pointer.y / H) * 2 - 1 : 0) - pointer.sy) * 0.04;
    camera.position.x = pointer.sx * 0.18;
    camera.position.y = -pointer.sy * 0.12;
    camera.lookAt(0, 0, 0);

    const { hw, hh } = halfExtents();
    slab.position.set(cur.sx * hw, cur.sy * hh, 0);
    const sc = Math.max(0.05, (cur.ss * 2 * hh) / SH);
    slab.scale.setScalar(sc);
    slab.rotation.y = Math.sin(time * 0.12) * 0.14 + pointer.sx * 0.08;
    slab.rotation.x = pointer.sy * 0.05 + Math.sin(time * 0.09) * 0.025;

    const fu = fieldMat.uniforms;
    fu.uTime.value = time % 1000;
    fu.uFlow.value = flow % 3000;
    const halfW = (SW / 2) * sc * Math.cos(slab.rotation.y);
    fu.uBox.value.set(slab.position.x, slab.position.y, halfW, (SH / 2) * sc);
    fu.uOut.value.set(Math.max(cur.ox * hw, slab.position.x + halfW + 0.4), cur.oy * hh, cur.pass);
    fu.uOn.value = Math.min(1, Math.max(0, present));
    fu.uPulse.value = flash;
    fu.uField.value = cur.field;

    tmp.copy(slab.position).project(camera);
    const cx = (tmp.x * 0.5 + 0.5) * W;
    const cy = (1 - (tmp.y * 0.5 + 0.5)) * H;
    const halfHpx = (H * cur.ss) / 2;
    const halfWpx = halfHpx * (SW / SH);
    const over = !touch && pointer.active && Math.abs(pointer.x - cx) < halfWpx && Math.abs(pointer.y - cy) < halfHpx;
    lensAmt += ((over ? 1 : 0) - lensAmt) * (1 - Math.exp(-dt * 8));
    fu.uMouse.value.set(touch ? -9999 : pointer.x * pr, touch ? -9999 : (H - pointer.y) * pr);
    fu.uRepel.value = touch ? 0 : 1;
    slabUniforms.uMouse.value.set(pointer.x * pr, (H - pointer.y) * pr);
    slabUniforms.uLens.value = lensOn && lensAmt > 0.01 ? pr * Math.min(110, H * cur.ss * 0.28) * lensAmt : 0;
    slabUniforms.uFrost.value = cur.frost;
    slabUniforms.uMarkOn.value = Math.max(0, Math.min(1, cur.mark));
    slabUniforms.uOpacity.value = Math.min(1, Math.max(0, (present - 0.05) / 0.95));
    slabUniforms.uFlash.value = flash;
    slabUniforms.uTime.value = time % 1000;
    slab.visible = slabOn;

    if (slabOn) {
      // the stream as seen *inside* the glass: white intensity on black, sampled by the slab
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      if (fieldOn) {
        fu.uScale.value *= rtScale;
        fu.uInk.value.copy(WHITE);
        fu.uInkOut.value.copy(WHITE);
        fu.uAIn.value = 0.5;
        renderer.render(fieldScene, camera);
        fu.uScale.value /= rtScale;
        fu.uInk.value.copy(INK);
        fu.uInkOut.value.copy(INK_OUT);
        fu.uAIn.value = 0.22;
      }
      renderer.setClearColor(0x000000, 0);
    }
    renderer.setRenderTarget(null);
    renderer.clear();
    if (fieldOn) renderer.render(fieldScene, camera);
    if (slabOn) renderer.render(slabScene, camera);
    // the lens reveals the N through clear glass, so the face icon steps aside under it
    placeFace(slabOn ? slabUniforms.uOpacity.value * (1 - lensAmt * 0.92) : 0);

    if (!tiered && !opts.isStatic) {
      frames++;
      if (frames > 10) acc += dt;
      if (frames === 100) {
        if ((acc / 90) * 1000 > 22) lowerTier();
        tiered = true;
      }
    }
  }

  return {
    target,
    cur,
    setPointer(x: number, y: number, active = true) {
      pointer.x = x;
      pointer.y = y;
      pointer.active = active;
    },
    pulse(v = 1) {
      flash = Math.max(flash, v);
    },
    setIcon,
    setLens(on: boolean) {
      lensOn = on;
    },
    snap() {
      Object.assign(cur, target);
    },
    pause(p: boolean) {
      running = !p;
    },
    tick(dt: number) {
      if (!running || document.hidden || lost) return;
      render(Math.min(dt, 1 / 20));
    },
    render,
    compile() {
      try {
        renderer.compile(fieldScene, camera);
        renderer.compile(slabScene, camera);
      } catch {
        /* noop */
      }
    },
    dispose() {
      running = false;
      window.removeEventListener('resize', onResize);
      fieldGeo.dispose();
      fieldMat.dispose();
      slabGeo.dispose();
      slabMat.dispose();
      atlas.dispose();
      mark.dispose();
      icons.dispose();
      rt.dispose();
      renderer.dispose();
    },
  };
}

export type Scene = NonNullable<ReturnType<typeof createScene>>;

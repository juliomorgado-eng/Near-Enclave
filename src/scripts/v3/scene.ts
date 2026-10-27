// SEALED — the single WebGL layer behind the page.
//   A. glyph field (THREE.Points, 4 morph targets blended in the vertex shader)
//   B. glass slab (two rounded-box halves) refracting a half-res render of A
//   C. DOM-synced photo planes with a mosaic "decrypt" shader
// One renderer, one canvas, ≤ 7 draw calls, adaptive quality, paused when hidden.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import markSvg from '../../../public/assets/logos/near-mark.svg?raw';

export type ChapterState = {
  stream: number;
  converge: number;
  grid: number;
  ring: number;
  field: number;
  frost: number;
  slab: number;
  sx: number;
  sy: number;
  ss: number;
  split: number;
  light: number;
  speed: number;
  tilt: number;
  flash: number;
  mark: number;
};
export const KEYS = [
  'stream', 'converge', 'grid', 'ring', 'field', 'frost', 'slab', 'sx', 'sy', 'ss', 'split', 'light', 'speed', 'tilt', 'flash', 'mark',
] as const;

const PRECISION = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const ACCENTS = /* glsl */ `
const vec3 cG = vec3(0.396, 0.835, 0.431);
const vec3 cS = vec3(0.349, 0.761, 0.910);
const vec3 cC = vec3(0.976, 0.514, 0.447);
const vec3 cA = vec3(0.945, 0.694, 0.224);
const vec3 cCream = vec3(0.922, 0.890, 0.827);
vec3 accent(float i) { return i < 0.5 ? cG : i < 1.5 ? cS : i < 2.5 ? cC : cA; }
`;

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */
const FIELD_VERT = /* glsl */ `
attribute vec3 aStream;
attribute vec3 aConverge;
attribute vec3 aGrid;
attribute vec3 aRing;
attribute vec4 aInfo; // seed, glyph, lane speed, colour index
uniform float uTime;
uniform float uFlow;
uniform vec4 uW;
uniform vec3 uSlab;
uniform vec2 uMouse;
uniform vec2 uRes;
uniform float uPR;
uniform float uScale;
uniform float uField;
uniform float uTheme;
uniform float uRepel;
varying float vGlyph;
varying vec3 vCol;
varying float vA;
${ACCENTS}
void main() {
  float seed = aInfo.x;
  // A. order-flow lanes, wrapping on x
  vec3 ps = aStream;
  ps.x = mod(aStream.x + uFlow * aInfo.z + 15.0, 30.0) - 15.0;
  // B. spiral into the slab, respawning outside
  float ph = fract(seed * 3.17 + uTime * 0.07);
  float rr = aConverge.x * (1.0 - ph) + 0.04;
  float ang = aConverge.y + ph * 5.5;
  vec3 pc = uSlab + vec3(cos(ang) * rr * 1.25, aConverge.z * (1.0 - ph * 0.85), sin(ang) * rr * 0.55);
  // C. Manhattan lattice (static, precomputed)
  vec3 pg = aGrid;
  // D. the room: tiers orbiting the slab
  float ra = aRing.x + uTime * (aRing.y > 3.0 ? -0.035 : 0.05);
  vec3 pr = uSlab + vec3(cos(ra) * aRing.y * 1.5, aRing.z + sin(ra) * 0.45, sin(ra) * aRing.y * 0.75);

  float st = seed * 0.35;
  vec4 w = smoothstep(vec4(st), vec4(st + 0.65), uW);
  float sum = w.x + w.y + w.z + w.w;
  vec3 p = (ps * w.x + pc * w.y + pg * w.z + pr * w.w) / max(sum, 0.0001);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;
  // cursor repel in screen space
  vec2 ndc = clip.xy / clip.w;
  vec2 sp = (ndc * 0.5 + 0.5) * uRes;
  vec2 d = sp - uMouse;
  float l = length(d);
  float f = (1.0 - smoothstep(0.0, 120.0 * uPR, l));
  sp += (d / max(l, 0.001)) * f * f * 52.0 * uPR * uRepel;
  clip.xy = (sp / uRes * 2.0 - 1.0) * clip.w;
  gl_Position = clip;

  float dist = -mv.z;
  gl_PointSize = clamp(0.115 * uScale / dist, 1.0, 64.0);
  vGlyph = mod(aInfo.y + floor(uTime * 2.5 + seed * 10.0) * 7.0, 64.0);

  bool isAccent = aInfo.w < 3.5;
  vec3 onInk = isAccent ? accent(aInfo.w) : cCream;
  float aInk = isAccent ? 0.72 : 0.27;
  vCol = mix(onInk, vec3(0.0), uTheme);
  float a = mix(aInk, isAccent ? 0.14 : 0.12, uTheme);
  float depthFade = smoothstep(24.0, 7.0, dist) * smoothstep(0.6, 2.0, dist);
  float cw = w.y / max(sum, 0.0001);
  float convergeFade = mix(1.0, smoothstep(0.0, 0.12, ph) * smoothstep(1.0, 0.82, ph), cw);
  vA = a * uField * depthFade * convergeFade * step(0.0001, sum) * (0.65 + 0.35 * f);
}
`;

const FIELD_FRAG = /* glsl */ `${PRECISION}
uniform sampler2D uAtlas;
varying float vGlyph;
varying vec3 vCol;
varying float vA;
void main() {
  vec2 cell = vec2(mod(vGlyph, 8.0), floor(vGlyph / 8.0));
  vec2 uv = vec2((cell.x + gl_PointCoord.x) / 8.0, 1.0 - (cell.y + gl_PointCoord.y) / 8.0);
  float a = texture2D(uAtlas, uv).a * vA;
  if (a < 0.008) discard;
  gl_FragColor = vec4(vCol, a);
}
`;

const SLAB_VERT = /* glsl */ `
uniform vec3 uOffset;
varying vec3 vN;
varying vec3 vNo;
varying vec3 vV;
varying vec3 vL;
void main() {
  vL = position + uOffset;
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
uniform vec2 uRes;
uniform vec2 uMouse;
uniform float uLens;
uniform float uFrost;
uniform float uOpacity;
uniform float uFlash;
uniform float uTheme;
uniform float uTime;
uniform float uLight;
uniform float uTaps;
uniform float uMarkOn;
uniform vec2 uSize;
varying vec3 vN;
varying vec3 vNo;
varying vec3 vV;
varying vec3 vL;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
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
  vec2 q = vL.xy / uSize;                 // -0.5..0.5 across the whole slab
  float front = smoothstep(0.6, 0.95, vNo.z);
  vec2 e = abs(q) * 2.0;
  float edge = max(e.x, e.y);
  float edgeF = smoothstep(0.72, 1.0, edge);
  // thick-glass refraction: gentle magnification in the body, strong bend at the bevel
  vec2 refr = -q * 0.045 + N.xy * 0.09 + sign(q) * edgeF * edgeF * 0.035;
  float disp = 0.003 + 0.022 * max(edgeF, 1.0 - front);
  float rad = frost * 0.011;
  float rot = ign(frag + fract(uTime) * 17.0) * 6.2831853;
  float bias = frost * 1.2;
  vec3 col = vec3(0.0);
  float asp = uRes.y / uRes.x;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    if (fi >= uTaps) break;
    float r = sqrt((fi + 0.5) / uTaps) * rad;
    float a = fi * 2.39996 + rot;
    vec2 o = vec2(cos(a) * asp, sin(a)) * r;
    vec2 b = suv + refr + o;
    vec2 dir = normalize(refr + 0.0001);
    col.r += texture2D(uRT, b - dir * disp, bias).r;
    col.g += texture2D(uRT, b, bias).g;
    col.b += texture2D(uRT, b + dir * disp, bias).b;
  }
  col /= uTaps;
  // faint body tint: mostly transparent glass
  vec3 tint = mix(vec3(0.85, 0.9, 1.0), vec3(0.0), uTheme);
  col = mix(col, tint, (0.03 + frost * 0.06) * front + (1.0 - front) * 0.12);
  // what sits behind the glass: only readable where the lens clears the frost
  vec4 mk = texture2D(uMark, vec2(q.x + 0.5, q.y + 0.5), frost * 6.0);
  float clear = 1.0 - smoothstep(0.06, 0.45, frost);
  vec3 mcol = mix(mk.rgb, vec3(0.0), uTheme * 0.85);
  col = mix(col, mcol, mk.a * (clear * 0.96 + 0.05 * frost) * front * uMarkOn);
  // fresnel edges + thin bright rim
  float rim = smoothstep(0.972, 0.995, edge) * front;
  float inner = smoothstep(0.93, 0.965, edge) * (1.0 - smoothstep(0.965, 0.975, edge)) * front;
  vec3 hl = mix(vec3(1.0), vec3(1.0, 0.99, 0.96), uTheme);
  col += hl * (fres * 0.65 + rim * 0.6 + inner * 0.12) * (1.0 + uFlash * 3.0);
  // edge dispersion fringe
  col += vec3(0.35, 0.0, 0.55) * rim * 0.12 * (0.5 + 0.5 * sin(q.y * 40.0 + q.x * 30.0));
  // specular sweep + soft top-left sheen
  float sw = (q.x + q.y) * 0.7;
  float pos = fract(uTime * 0.06) * 3.2 - 1.6;
  col += hl * exp(-pow((sw - pos) / 0.07, 2.0)) * 0.09 * front;
  col += hl * smoothstep(0.2, -0.7, q.x - q.y) * 0.05 * front;
  // lens edge hairline
  float ring = smoothstep(uLens * 0.92, uLens * 0.985, lensD) * (1.0 - smoothstep(uLens * 0.985, uLens * 1.05, lensD));
  col += hl * ring * 0.22 * step(1.0, uLens) * uMarkOn;
  // light leaking along the seam when the vault opens
  col += vec3(1.0, 0.97, 0.92) * uLight * 0.75 * exp(-abs(vL.x) * 7.0);
  // frost grain
  col += (ign(frag * 1.37 + uTime * 41.0) - 0.5) * 0.03 * frost;
  gl_FragColor = vec4(col, uOpacity);
}
`;

const LIGHT_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const LIGHT_FRAG = /* glsl */ `${PRECISION}
uniform float uLight;
uniform float uSplit;
varying vec2 vUv;
void main() {
  float x = vUv.x - 0.5;
  float y = vUv.y - 0.5;
  float w = 0.004 + uSplit * 0.06;
  float beam = exp(-pow(x / w, 2.0));
  float halo = exp(-pow(x / (w * 4.0 + 0.05), 2.0)) * 0.45;
  float glow = exp(-dot(vec2(x * 1.4, y), vec2(x * 1.4, y)) * 6.0) * 0.35;
  float vy = smoothstep(0.5, 0.18, abs(y));
  vec3 col = vec3(1.0, 0.975, 0.93) * ((beam + halo) * vy + glow) * uLight;
  gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
}
`;

const PLANE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const PLANE_FRAG = /* glsl */ `${PRECISION}
uniform sampler2D uTex;
uniform vec2 uSize;
uniform vec2 uImg;
uniform float uBlock;
uniform float uProg;
uniform float uVel;
uniform float uOpacity;
varying vec2 vUv;
${ACCENTS}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec2 cover(vec2 uv) {
  float ra = uSize.x / uSize.y;
  float ri = uImg.x / uImg.y;
  vec2 s = ra > ri ? vec2(1.0, ri / ra) : vec2(ra / ri, 1.0);
  return (uv - 0.5) * s + 0.5;
}
void main() {
  vec2 px = vUv * uSize;
  vec2 cell = floor(px / uBlock);
  vec2 q = uBlock > 1.5 ? ((cell + 0.5) * uBlock) / uSize : vUv;
  q.y = (q.y - 0.5) * (1.0 - abs(uVel) * 0.035) + 0.5;
  float split = uVel * 6.0 / uSize.x;
  vec3 c;
  c.r = texture2D(uTex, cover(q + vec2(split, 0.0))).r;
  c.g = texture2D(uTex, cover(q)).g;
  c.b = texture2D(uTex, cover(q - vec2(split, 0.0))).b;
  // accent tint on blocks while still encrypted
  float h = ign(cell + 3.0);
  float tintAmt = smoothstep(0.85, 0.2, uProg) * step(0.55, h) * 0.55;
  c = mix(c, accent(floor(fract(h * 7.0) * 4.0)) * (0.55 + 0.45 * dot(c, vec3(0.333))), tintAmt);
  // per-block reveal: some blocks are still sealed (dark) early on
  float sealed = step(uProg * 1.25, h * 0.9) * (1.0 - step(0.999, uProg));
  c *= 1.0 - sealed * 0.85;
  gl_FragColor = vec4(c, uOpacity);
}
`;

/* ------------------------------------------------------------------ */
/* Textures                                                            */
/* ------------------------------------------------------------------ */
const GLYPHS = '01$#/\\░▒▓◇+×N≡0123456789ABCDEF01#$/+×≡◇░▒▓0101NNEAR<>%=:;|*0x1F$#';

function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '500 40px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';
  for (let i = 0; i < 64; i++) {
    const ch = GLYPHS[i % GLYPHS.length];
    g.fillText(ch, (i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 34);
  }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function makeMark() {
  const W = 704;
  const H = 960;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  const d = /d="([^"]+)"/.exec(markSvg)?.[1];
  // NEAR mark
  if (d) {
    const s = 17;
    g.save();
    g.translate(W / 2 - 8 * s, H / 2 - 8 * s - 40);
    g.scale(s, s);
    g.fillStyle = '#fff';
    g.fill(new Path2D(d));
    g.restore();
  }
  const mono = (w: number, px: number) => `${w} ${px}px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#65D56E';
  g.font = mono(600, 25);
  g.fillText('SELECTIVE DISCLOSURE: ON', W / 2, H / 2 + 150);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = mono(400, 19);
  g.fillText('ENCLAVE/27 · ATTESTED', W / 2, H / 2 + 192);
  // corner registration marks
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 2;
  const m = 46;
  const k = 26;
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => {
    g.beginPath();
    g.moveTo(x, y + k * sy);
    g.lineTo(x, y);
    g.lineTo(x + k * sx, y);
    g.stroke();
  });
  g.textAlign = 'left';
  g.font = mono(400, 17);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.fillText('7F·A2·E9·0C·5B', m + 6, m + 52);
  g.textAlign = 'right';
  g.fillText('40.7128N 74.0060W', W - m - 6, H - m - 50);
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */
function makeField(count: number) {
  const geo = new THREE.BufferGeometry();
  const stream = new Float32Array(count * 3);
  const conv = new Float32Array(count * 3);
  const grid = new Float32Array(count * 3);
  const ring = new Float32Array(count * 3);
  const info = new Float32Array(count * 4);
  const pos = new Float32Array(count * 3);

  const LANES = 240;
  const lanes = Array.from({ length: LANES }, () => ({
    y: (Math.random() - 0.5) * 11,
    z: -10 + Math.random() * 11.5,
    speed: (0.25 + Math.random() * 0.9) * (Math.random() < 0.12 ? 2.2 : 1),
  }));
  let lane = 0;
  let x = Math.random() * 30;
  let run = 0;

  // Manhattan grid rotated 29° in-plane, plane tilted back.
  const rotY = (29 * Math.PI) / 180;
  const tilt = (24 * Math.PI) / 180;
  const cy = Math.cos(rotY), sy = Math.sin(rotY), ct = Math.cos(tilt), stt = Math.sin(tilt);

  for (let i = 0; i < count; i++) {
    // stream: packets of 3–14 glyphs, spaced like text
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

    // converge
    conv[i * 3] = 0.3 + Math.pow(Math.random(), 0.8) * 7.5;
    conv[i * 3 + 1] = Math.random() * Math.PI * 2;
    conv[i * 3 + 2] = (Math.random() - 0.5) * 3.2;

    // grid lattice in (u,v), then rotate + tilt into the world
    let u: number, v: number;
    if (Math.random() < 0.42) {
      u = Math.round((Math.random() - 0.5) * 22 / 1.15) * 1.15;
      v = (Math.random() - 0.5) * 34;
      v = Math.round(v / 0.13) * 0.13;
    } else {
      v = Math.round((Math.random() - 0.5) * 34 / 0.42) * 0.42;
      u = (Math.random() - 0.5) * 22;
      u = Math.round(u / 0.13) * 0.13;
    }
    const gx = u * cy - v * sy;
    const gz = u * sy + v * cy;
    // plane y = 0 tilted around x
    grid[i * 3] = gx;
    grid[i * 3 + 1] = -2.4 + gz * stt * -1;
    grid[i * 3 + 2] = -3 + gz * ct;

    // ring: 4 tiers of seats
    const tier = (Math.random() * 4) | 0;
    ring[i * 3] = Math.random() * Math.PI * 2;
    ring[i * 3 + 1] = 2.1 + tier * 0.55 + (Math.random() - 0.5) * 0.06;
    ring[i * 3 + 2] = -0.9 + tier * 0.42 + (Math.random() - 0.5) * 0.05;

    info[i * 4] = Math.random();
    info[i * 4 + 1] = (Math.random() * 64) | 0;
    info[i * 4 + 2] = L.speed;
    info[i * 4 + 3] = Math.random() < 0.28 ? (Math.random() * 4) | 0 : 4 + ((Math.random() * 5) | 0);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aStream', new THREE.BufferAttribute(stream, 3));
  geo.setAttribute('aConverge', new THREE.BufferAttribute(conv, 3));
  geo.setAttribute('aGrid', new THREE.BufferAttribute(grid, 3));
  geo.setAttribute('aRing', new THREE.BufferAttribute(ring, 3));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return geo;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */
type Plane = {
  img: HTMLImageElement;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  prog: () => number;
  ready: boolean;
};

export type SceneOptions = { lowTier: boolean; isStatic: boolean };

export function createScene(canvas: HTMLCanvasElement, opts: SceneOptions) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  let low = opts.lowTier;
  let pr = Math.min(window.devicePixelRatio || 1, low ? 1 : 1.75);
  let W = window.innerWidth;
  let H = window.innerHeight;

  const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 60);
  camera.position.set(0, 0, 10);
  const ortho = new THREE.OrthographicCamera(0, W, H, 0, -10, 10);

  const fieldScene = new THREE.Scene();
  const slabScene = new THREE.Scene();
  const planeScene = new THREE.Scene();

  // A. field
  const COUNT = low ? 9000 : 24000;
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
      uW: { value: new THREE.Vector4(1, 0, 0, 0) },
      uSlab: { value: new THREE.Vector3() },
      uMouse: { value: new THREE.Vector2(-9999, -9999) },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPR: { value: pr },
      uScale: { value: 1 },
      uField: { value: 1 },
      uTheme: { value: 0 },
      uRepel: { value: 1 },
      uAtlas: { value: atlas },
    },
  });
  const points = new THREE.Points(fieldGeo, fieldMat);
  points.frustumCulled = false;
  fieldScene.add(points);

  // B. slab
  let rtScale = low ? 0.25 : 0.5;
  const rt = new THREE.WebGLRenderTarget(4, 4, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  const mark = makeMark();
  const slabUniforms = {
    uRT: { value: rt.texture },
    uMark: { value: mark },
    uRes: { value: new THREE.Vector2(1, 1) },
    uMouse: { value: new THREE.Vector2(-9999, -9999) },
    uLens: { value: 0 },
    uFrost: { value: 0.65 },
    uOpacity: { value: 1 },
    uFlash: { value: 0 },
    uTheme: { value: 0 },
    uTime: { value: 0 },
    uLight: { value: 0 },
    uTaps: { value: low ? 6 : 12 },
    uMarkOn: { value: 1 },
    uSize: { value: new THREE.Vector2(2.2, 3.0) },
  };
  const halfGeo = new RoundedBoxGeometry(1.1, 3.0, 0.5, 5, 0.1);
  const mkHalf = (sign: number) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: SLAB_VERT,
      fragmentShader: SLAB_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { ...slabUniforms, uOffset: { value: new THREE.Vector3(0.55 * sign, 0, 0) } },
    });
    const mesh = new THREE.Mesh(halfGeo, m);
    mesh.renderOrder = 2;
    return mesh;
  };
  const left = mkHalf(-1);
  const right = mkHalf(1);
  const slab = new THREE.Group();
  slab.add(left, right);
  const lightMat = new THREE.ShaderMaterial({
    vertexShader: LIGHT_VERT,
    fragmentShader: LIGHT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uLight: { value: 0 }, uSplit: { value: 0 } },
  });
  const light = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), lightMat);
  light.position.z = -0.6;
  light.renderOrder = 1;
  slab.add(light);
  slabScene.add(slab);

  // C. planes
  const planes: Plane[] = [];
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const loader = new THREE.TextureLoader();

  // State
  const cur: ChapterState = {
    stream: 1, converge: 0, grid: 0, ring: 0, field: 1, frost: 0.65, slab: 1, sx: 0.42, sy: 0, ss: 1,
    split: 0, light: 0, speed: 1, tilt: 0, flash: 0, mark: 1,
  };
  const target: ChapterState = { ...cur };
  let theme = 0;
  let themeTarget = 0;
  const pointer = { x: -9999, y: -9999, sx: 0, sy: 0, active: false };
  let velocity = 0;
  let time = 0;
  let flow = 0;
  let lensOn = !opts.isStatic;
  const touch = !matchMedia('(hover: hover) and (pointer: fine)').matches;
  let running = true;
  let lost = false;

  // auto-tier
  let frames = 0;
  let acc = 0;
  let tiered = low;

  function setSize() {
    W = window.innerWidth;
    H = window.innerHeight;
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    ortho.right = W;
    ortho.top = H;
    ortho.updateProjectionMatrix();
    const bw = Math.floor(W * pr);
    const bh = Math.floor(H * pr);
    rt.setSize(Math.max(2, Math.floor(bw * rtScale)), Math.max(2, Math.floor(bh * rtScale)));
    fieldMat.uniforms.uRes.value.set(bw, bh);
    fieldMat.uniforms.uPR.value = pr;
    slabUniforms.uRes.value.set(bw, bh);
    const scale = bh / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    fieldMat.uniforms.uScale.value = scale;
  }
  setSize();

  let resizeQueued = false;
  let lastW = W;
  const onResize = () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      // ignore pure mobile URL-bar height jitter
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
    planes.forEach((p) => p.img.classList.remove('is-gl'));
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

  function halfExtents(z = 0) {
    const h = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - z);
    return { hw: h * camera.aspect, hh: h };
  }

  const tmp = new THREE.Vector3();
  function slabScreen() {
    tmp.copy(slab.position).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * W, y: (1 - (tmp.y * 0.5 + 0.5)) * H };
  }

  function addPlane(img: HTMLImageElement, prog: () => number) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: PLANE_VERT,
      fragmentShader: PLANE_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTex: { value: null },
        uSize: { value: new THREE.Vector2(1, 1) },
        uImg: { value: new THREE.Vector2(1, 1) },
        uBlock: { value: 96 },
        uProg: { value: 0 },
        uVel: { value: 0 },
        uOpacity: { value: 1 },
      },
    });
    const mesh = new THREE.Mesh(planeGeo, mat);
    mesh.visible = false;
    planeScene.add(mesh);
    const plane: Plane = { img, mesh, prog, ready: false };
    planes.push(plane);
    const src = img.currentSrc || img.src;
    loader.load(
      src,
      (tex) => {
        if (lost) return;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        mat.uniforms.uTex.value = tex;
        mat.uniforms.uImg.value.set(tex.image.width, tex.image.height);
        plane.ready = true;
        img.classList.add('is-gl');
      },
      undefined,
      () => {
        /* keep the DOM image */
      },
    );
  }

  function updatePlanes() {
    let any = false;
    for (const p of planes) {
      if (!p.ready) continue;
      const r = p.img.getBoundingClientRect();
      const vis = r.bottom > -50 && r.top < H + 50 && r.width > 0;
      p.mesh.visible = vis;
      if (!vis) continue;
      any = true;
      p.mesh.position.set(r.left + r.width / 2, H - (r.top + r.height / 2), 0);
      p.mesh.scale.set(r.width, r.height, 1);
      const u = p.mesh.material.uniforms;
      const g = Math.max(0, Math.min(1, p.prog()));
      const e = 1 - Math.pow(1 - g, 3);
      u.uProg.value = g;
      u.uBlock.value = Math.max(1, (1 - e) * 96 * pr);
      u.uSize.value.set(r.width * pr, r.height * pr);
      u.uVel.value = velocity;
    }
    return any;
  }

  let cleared = false;
  function render(dt: number) {
    if (lost) return;
    const k = opts.isStatic ? 1 : 1 - Math.exp(-dt * 5);
    for (const key of KEYS) cur[key] += (target[key] - cur[key]) * k;
    theme += (themeTarget - theme) * (opts.isStatic ? 1 : 1 - Math.exp(-dt * 4));

    const planesVisible = updatePlanes();
    const fieldOn = cur.field > 0.004;
    const slabOn = cur.slab > 0.05;
    if (!fieldOn && !slabOn && !planesVisible) {
      if (!cleared) {
        renderer.setRenderTarget(null);
        renderer.clear();
        cleared = true;
      }
      return;
    }
    cleared = false;

    time += dt;
    flow += dt * cur.speed * 0.55;

    // camera: parallax + chapter tilt
    pointer.sx += ((pointer.active ? (pointer.x / W) * 2 - 1 : 0) - pointer.sx) * 0.05;
    pointer.sy += ((pointer.active ? (pointer.y / H) * 2 - 1 : 0) - pointer.sy) * 0.05;
    camera.position.x = pointer.sx * 0.35;
    camera.position.y = -pointer.sy * 0.22 + cur.tilt * 2.2;
    camera.lookAt(0, cur.tilt * -1.2, 0);

    // slab placement
    const { hw, hh } = halfExtents(0);
    slab.position.set(cur.sx * hw, cur.sy * hh, 0);
    const sc = Math.max(0.12, (cur.ss * 2 * hh) / 3.0);
    slab.scale.setScalar(sc);
    const s = cur.split;
    left.position.x = -0.55 - s * (hw * 0.3);
    right.position.x = 0.55 + s * (hw * 0.3);
    slab.rotation.y = Math.sin(time * 0.22) * 0.21 * (1 - s) + pointer.sx * 0.1;
    slab.rotation.x = pointer.sy * 0.06 + Math.sin(time * 0.17) * 0.03;

    // uniforms
    const fu = fieldMat.uniforms;
    fu.uTime.value = time % 1000;
    fu.uFlow.value = flow % 3000;
    fu.uW.value.set(cur.stream, cur.converge, cur.grid, cur.ring);
    fu.uSlab.value.copy(slab.position);
    fu.uField.value = cur.field;
    fu.uTheme.value = theme;

    // lens / pointer in drawing-buffer pixels (origin bottom-left)
    let lx = pointer.x;
    let ly = pointer.y;
    if (touch || !pointer.active) {
      const c = slabScreen();
      const sw = (H * cur.ss) * 0.22;
      lx = c.x + Math.sin(time * 0.43) * sw * 0.9;
      ly = c.y + Math.sin(time * 0.31 + 1.3) * sw * 1.3;
    }
    const mx = lx * pr;
    const my = (H - ly) * pr;
    fu.uMouse.value.set(touch ? -9999 : pointer.x * pr, touch ? -9999 : (H - pointer.y) * pr);
    fu.uRepel.value = touch ? 0 : 1;
    slabUniforms.uMouse.value.set(mx, my);
    slabUniforms.uLens.value = lensOn ? pr * Math.min(110, H * cur.ss * 0.3) : 0;
    slabUniforms.uFrost.value = cur.frost;
    slabUniforms.uMarkOn.value = Math.max(0, Math.min(1, cur.mark));
    slabUniforms.uOpacity.value = Math.min(1, Math.max(0, (cur.slab - 0.05) / 0.95));
    slabUniforms.uFlash.value = cur.flash;
    slabUniforms.uTheme.value = theme;
    slabUniforms.uTime.value = time % 1000;
    slabUniforms.uLight.value = cur.light;
    lightMat.uniforms.uLight.value = cur.light;
    lightMat.uniforms.uSplit.value = s;
    light.visible = cur.light > 0.01;
    slab.visible = slabOn;

    // pass 1: field → RT (what the glass refracts), cleared to the page colour
    if (slabOn) {
      const bg = theme;
      renderer.setRenderTarget(rt);
      renderer.setClearColor(new THREE.Color(0.922 * bg, 0.89 * bg, 0.827 * bg), 1);
      renderer.clear();
      if (fieldOn) {
        fu.uScale.value *= rtScale;
        renderer.render(fieldScene, camera);
        fu.uScale.value /= rtScale;
      }
      renderer.setClearColor(0x000000, 0);
    }
    // pass 2: screen
    renderer.setRenderTarget(null);
    renderer.clear();
    if (fieldOn) renderer.render(fieldScene, camera);
    if (slabOn) renderer.render(slabScene, camera);
    if (planesVisible) renderer.render(planeScene, ortho);

    // auto-tier over the first 90 rendered frames
    if (!tiered && !opts.isStatic) {
      frames++;
      if (frames > 10) acc += dt;
      if (frames === 100) {
        if ((acc / 90) * 1000 > 22) lowerTier();
        tiered = true;
      }
    }
  }

  function tick(dt: number) {
    if (!running || document.hidden || lost) return;
    render(Math.min(dt, 1 / 20));
  }

  function compile() {
    try {
      renderer.compile(fieldScene, camera);
      renderer.compile(slabScene, camera);
    } catch {
      /* noop */
    }
  }

  function dispose() {
    running = false;
    window.removeEventListener('resize', onResize);
    fieldGeo.dispose();
    fieldMat.dispose();
    halfGeo.dispose();
    (left.material as THREE.Material).dispose();
    (right.material as THREE.Material).dispose();
    lightMat.dispose();
    planeGeo.dispose();
    planes.forEach((p) => {
      p.mesh.material.uniforms.uTex.value?.dispose();
      p.mesh.material.dispose();
    });
    atlas.dispose();
    mark.dispose();
    rt.dispose();
    renderer.dispose();
  }

  return {
    target,
    cur,
    setTheme(t: number) {
      themeTarget = t;
    },
    setPointer(x: number, y: number, active = true) {
      pointer.x = x;
      pointer.y = y;
      pointer.active = active;
    },
    setVelocity(v: number) {
      velocity += (v - velocity) * 0.2;
    },
    setLens(on: boolean) {
      lensOn = on;
    },
    snap() {
      Object.assign(cur, target);
      theme = themeTarget;
    },
    pause(p: boolean) {
      running = !p;
    },
    addPlane,
    tick,
    render,
    compile,
    dispose,
    get lowTier() {
      return low;
    },
  };
}

export type Scene = NonNullable<ReturnType<typeof createScene>>;

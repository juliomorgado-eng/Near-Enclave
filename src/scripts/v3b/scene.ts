// v3B "TEE" — one WebGL layer behind the page.
//   A. ciphertext field: noisy glyph lanes flowing left → right. Before the slab they
//      funnel into it; past it only a few packets survive, re-ordered into a clean beam
//      that is routed to the line of copy (or number) the enclave is currently emitting.
//   B. glass slab = the Trusted Execution Environment. Frosted (opaque to the outside),
//      refracting the stream it ingests. The cursor lens reveals its attestation.
// One renderer, ≤ 3 draw calls, adaptive quality, paused when hidden.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import markSvg from '../../../public/assets/logos/near-mark.svg?raw';

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
varying float vGlyph;
varying float vA;
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
  // soft cursor repel in screen space (input only)
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
  // noisy ciphertext glyphs cycle slowly; emitted packets are a clean, fixed dash
  float noisy = mod(aInfo.y + floor(uTime * 0.9 + seed * 10.0) * 7.0, 56.0);
  vGlyph = mix(noisy, 56.0 + mod(floor(seed * 4.0), 2.0), isOut);

  float depthFade = smoothstep(18.0, 8.0, dist) * smoothstep(0.6, 2.0, dist);
  float aIn = 0.12 * depthFade * (0.7 + 0.3 * f);
  float aOut = (0.42 + uPulse * 0.4) * passed * (1.0 - smoothstep(0.78, 1.0, ex)) * smoothstep(0.0, 0.05, ex);
  vA = mix(aIn, aOut, isOut) * uField;
}
`;

const FIELD_FRAG = /* glsl */ `${PRECISION}
uniform sampler2D uAtlas;
varying float vGlyph;
varying float vA;
void main() {
  vec2 cell = vec2(mod(vGlyph, 8.0), floor(vGlyph / 8.0));
  vec2 uv = vec2((cell.x + gl_PointCoord.x) / 8.0, 1.0 - (cell.y + gl_PointCoord.y) / 8.0);
  float a = texture2D(uAtlas, uv).a * vA;
  if (a < 0.006) discard;
  gl_FragColor = vec4(vec3(0.922, 0.890, 0.827), a);
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
  vec2 q = vL.xy / uSize;
  float front = smoothstep(0.6, 0.95, vNo.z);
  vec2 e = abs(q) * 2.0;
  float edge = max(e.x, e.y);
  float edgeF = smoothstep(0.72, 1.0, edge);
  vec2 refr = -q * 0.045 + N.xy * 0.09 + sign(q) * edgeF * edgeF * 0.035;
  float rad = frost * 0.008;
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
    col += texture2D(uRT, suv + refr + o, bias).rgb;
  }
  col /= uTaps;
  // the stream is visibly worked on inside: brighter, diffused
  col *= 2.8 + uFlash * 1.2;
  // barely-there body tint: clear glass, not a grey panel
  col = mix(col, vec3(0.86, 0.85, 0.82), (0.012 + frost * 0.02) * front + (1.0 - front) * 0.05);
  // attestation behind the frost: readable only through the lens
  vec4 mk = texture2D(uMark, vec2(q.x + 0.5, q.y + 0.5), frost * 6.0);
  // attestation is only legible where the lens has fully cleared the frost
  float clear = (1.0 - smoothstep(0.0, 0.08, frost)) * lens;
  col = mix(col, mk.rgb, mk.a * clear * 0.96 * front * uMarkOn);
  // processing scan: a slow horizontal band moving down the slab
  float scan = fract(uTime * 0.07);
  col += vec3(1.0) * exp(-pow((q.y + 0.5 - (1.0 - scan)) / 0.035, 2.0)) * 0.05 * front;
  // fresnel + thin rim
  float rim = smoothstep(0.972, 0.995, edge) * front;
  float inner = smoothstep(0.93, 0.965, edge) * (1.0 - smoothstep(0.965, 0.975, edge)) * front;
  // crisp bevel: bright outer rim, thin inner line, top-edge specular
  float top = smoothstep(0.9, 0.99, q.y * 2.0) * front;
  col += vec3(1.0, 0.99, 0.96) * (fres * 0.7 + rim * 1.1 + inner * 0.22 + top * 0.18) * (1.0 + uFlash * 2.2);
  col += vec3(1.0) * (1.0 - front) * 0.04;
  // thickness: light caught inside the edges, plus a faint diagonal reflection
  col += vec3(1.0, 0.99, 0.96) * smoothstep(0.7, 1.0, edge) * 0.09 * front;
  float dg = (q.x * 0.8 - q.y) ;
  col += vec3(1.0) * exp(-pow((dg - 0.12) / 0.16, 2.0)) * 0.045 * front;
  col += vec3(1.0) * smoothstep(0.2, -0.7, q.x - q.y) * 0.04 * front;
  float ring = smoothstep(uLens * 0.92, uLens * 0.985, lensD) * (1.0 - smoothstep(uLens * 0.985, uLens * 1.05, lensD));
  col += vec3(1.0) * ring * 0.2 * step(1.0, uLens) * uMarkOn;
  col += (ign(frag * 1.37 + uTime * 41.0) - 0.5) * 0.025 * frost;
  // the body is see-through: the live field behind shows through, edges are solid
  float body = mix(0.72, 1.0, max(max(rim, edgeF * 0.6), max(1.0 - front, fres)));
  gl_FragColor = vec4(col, uOpacity * body);
}
`;

/* ------------------------------------------------------------------ */
/* Textures                                                            */
/* ------------------------------------------------------------------ */
// 56 noisy ciphertext glyphs + clean output glyphs at 56, 57
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
  // clean packets: a solid dash and a short dash, drawn as rects (crisp at any size)
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

function makeMark() {
  const W = 704;
  const H = 960;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const d = /d="([^"]+)"/.exec(markSvg)?.[1];
  if (d) {
    const s = 15;
    g.save();
    g.translate(W / 2 - 8 * s, H / 2 - 8 * s - 60);
    g.scale(s, s);
    g.fillStyle = '#fff';
    g.fill(new Path2D(d));
    g.restore();
  }
  const mono = (w: number, px: number) => `${w} ${px}px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.font = mono(600, 24);
  g.fillText('ATTESTATION: VERIFIED', W / 2, H / 2 + 120);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.font = mono(400, 18);
  g.fillText('MRENCLAVE 7F·A2·E9·0C·5B', W / 2, H / 2 + 160);
  g.strokeStyle = 'rgba(255,255,255,0.6)';
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
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillText('TEE · ENCLAVE/27', m + 6, m + 52);
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

export type SceneOptions = { lowTier: boolean; isStatic: boolean };

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
  let pr = Math.min(window.devicePixelRatio || 1, low ? 1 : 1.75);
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
  const SW = 2.2;
  const SH = 3.0;
  const slabUniforms = {
    uRT: { value: rt.texture },
    uMark: { value: mark },
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
  };
  const slabGeo = new RoundedBoxGeometry(SW, SH, 0.5, 5, 0.1);
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

  const tmp = new THREE.Vector3();
  let cleared = false;
  function render(dt: number) {
    if (lost) return;
    const k = opts.isStatic ? 1 : 1 - Math.exp(-dt * 4);
    // placement tracks its DOM anchor tightly; everything else eases
    const kp = opts.isStatic ? 1 : 1 - Math.exp(-dt * 12);
    for (const key of KEYS) cur[key] += (target[key] - cur[key]) * (key === 'sx' || key === 'sy' || key === 'ss' ? kp : k);
    flash *= Math.exp(-dt * 2.4);

    // while the slab is still far from where it should be (anchor jump, fast scroll),
    // it stays dissolved, so it never sweeps across the copy in transit
    const away = Math.hypot(target.sx - cur.sx, target.sy - cur.sy);
    const present = cur.slab * (1 - smooth01((away - 0.25) / 0.35));
    const fieldOn = cur.field > 0.004;
    const slabOn = present > 0.05;
    if (!fieldOn && !slabOn) {
      if (!cleared) {
        renderer.setRenderTarget(null);
        renderer.clear();
        cleared = true;
      }
      return;
    }
    cleared = false;
    time += dt;
    // ≈ 35 % of v3's flow speed
    flow += dt * cur.speed * 0.2;

    pointer.sx += ((pointer.active ? (pointer.x / W) * 2 - 1 : 0) - pointer.sx) * 0.04;
    pointer.sy += ((pointer.active ? (pointer.y / H) * 2 - 1 : 0) - pointer.sy) * 0.04;
    camera.position.x = pointer.sx * 0.18;
    camera.position.y = -pointer.sy * 0.12;
    camera.lookAt(0, 0, 0);

    const { hw, hh } = halfExtents();
    slab.position.set(cur.sx * hw, cur.sy * hh, 0);
    const sc = Math.max(0.12, (cur.ss * 2 * hh) / SH);
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

    // attestation lens: only while the cursor is actually over the enclave
    tmp.copy(slab.position).project(camera);
    const cx = (tmp.x * 0.5 + 0.5) * W;
    const cy = (1 - (tmp.y * 0.5 + 0.5)) * H;
    const halfHpx = (H * cur.ss) / 2;
    const halfWpx = halfHpx * (SW / SH);
    const over = !touch && pointer.active && Math.abs(pointer.x - cx) < halfWpx && Math.abs(pointer.y - cy) < halfHpx;
    lensAmt += ((over ? 1 : 0) - lensAmt) * (1 - Math.exp(-dt * 8));
    const lx = pointer.x;
    const ly = pointer.y;
    fu.uMouse.value.set(touch ? -9999 : pointer.x * pr, touch ? -9999 : (H - pointer.y) * pr);
    fu.uRepel.value = touch ? 0 : 1;
    slabUniforms.uMouse.value.set(lx * pr, (H - ly) * pr);
    slabUniforms.uLens.value = lensOn && lensAmt > 0.01 ? pr * Math.min(110, H * cur.ss * 0.28) * lensAmt : 0;
    slabUniforms.uFrost.value = cur.frost;
    slabUniforms.uMarkOn.value = Math.max(0, Math.min(1, cur.mark));
    slabUniforms.uOpacity.value = Math.min(1, Math.max(0, (present - 0.05) / 0.95));
    slabUniforms.uFlash.value = flash;
    slabUniforms.uTime.value = time % 1000;
    slab.visible = slabOn;

    if (slabOn) {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      if (fieldOn) {
        fu.uScale.value *= rtScale;
        renderer.render(fieldScene, camera);
        fu.uScale.value /= rtScale;
      }
      renderer.setClearColor(0x000000, 0);
    }
    renderer.setRenderTarget(null);
    renderer.clear();
    if (fieldOn) renderer.render(fieldScene, camera);
    if (slabOn) renderer.render(slabScene, camera);

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
    /** attestation pulse: the enclave just released a verified result */
    pulse(v = 1) {
      flash = Math.max(flash, v);
    },
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
      rt.dispose();
      renderer.dispose();
    },
  };
}

export type Scene = NonNullable<ReturnType<typeof createScene>>;

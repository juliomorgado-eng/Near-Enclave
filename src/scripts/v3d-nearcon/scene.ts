// SEALED INVITATION — one WebGL card over an almost-still field of marks.
//   A. mark field (THREE.Points): dots, dashes and ticks drifting very slowly; no glyphs
//   B. frosted glass invitation refracting that field; a hidden letter blurred by frost,
//      an amber NEAR seal; uOpen clears the frost when the visitor goes to apply
//   C. soft contact shadow
import * as THREE from 'three';
import { paintBack, paintFront } from './textures';

const PRECISION = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

export const CW = 3.2;
export const CH = 2.02;
const CR = 0.12;
const BEV = 0.024;
const DEPTH = 0.04;

/* ------------------------------------------------------------------ */
const FIELD_VERT = /* glsl */ `
attribute vec4 aInfo; // seed, shape, speed, size
uniform float uTime;
uniform vec2 uMouse;
uniform vec2 uRes;
uniform float uPR;
uniform float uScale;
uniform float uTheme;
varying float vShape;
varying vec3 vCol;
varying float vA;
void main() {
  vec3 p = position;
  float seed = aInfo.x;
  p.y = mod(p.y + uTime * 0.022 * aInfo.z + 10.0, 20.0) - 10.0;
  p.x += sin(uTime * 0.045 + seed * 6.2831) * 0.18;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  vec2 sp = (ndc * 0.5 + 0.5) * uRes;
  vec2 d = sp - uMouse;
  float l = length(d);
  float f = 1.0 - smoothstep(0.0, 140.0 * uPR, l);
  sp += (d / max(l, 0.001)) * f * f * 18.0 * uPR;
  clip.xy = (sp / uRes * 2.0 - 1.0) * clip.w;
  gl_Position = clip;
  float dist = -mv.z;
  gl_PointSize = clamp(aInfo.w * uScale / dist, 1.0, 40.0);
  vShape = aInfo.y;
  vCol = mix(vec3(0.0), vec3(0.92, 0.89, 0.83), uTheme);
  float fade = smoothstep(26.0, 12.0, dist) * smoothstep(4.0, 7.0, dist);
  vA = mix(0.16, 0.2, uTheme) * fade * (0.5 + 0.5 * fract(seed * 7.13));
}
`;
const FIELD_FRAG = /* glsl */ `${PRECISION}
varying float vShape;
varying vec3 vCol;
varying float vA;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float a;
  if (vShape < 0.5) a = 1.0 - smoothstep(0.09, 0.13, length(p));                         // dot
  else if (vShape < 1.5) a = step(abs(p.y), 0.035) * step(abs(p.x), 0.32);                 // dash
  else if (vShape < 2.5) a = max(step(abs(p.y), 0.03) * step(abs(p.x), 0.2), step(abs(p.x), 0.03) * step(abs(p.y), 0.2)); // tick
  else a = step(abs(p.x), 0.11) * step(abs(p.y), 0.11);                                    // square
  a *= vA;
  if (a < 0.006) discard;
  gl_FragColor = vec4(vCol * a, a);
}
`;

const CARD_VERT = /* glsl */ `
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
const CARD_FRAG = /* glsl */ `${PRECISION}
uniform sampler2D uRT;
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform vec2 uRes;
uniform vec2 uSize;
uniform float uTheme;
uniform float uOpen;
uniform float uSweep;
uniform float uOpacity;
uniform float uTaps;
uniform float uStep;   // back: rows redacted (0..4)
uniform float uStamp;  // back: privacy seal pressed (0..1)
uniform float uBreak;  // front: seal broken, invitation accepted (0..1)
uniform vec4 uClip;    // reader slot: x0, x1, slot y, on
uniform float uClipB;
uniform float uSealRot; // the card's roll: the seal is counter-rotated so the N always stands upright  // reader bottom: the card passes through the machine and comes out below
varying vec3 vN;
varying vec3 vNo;
varying vec3 vV;
varying vec3 vL;
const vec3 AMBER = vec3(0.945, 0.694, 0.224);
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  float face = smoothstep(0.86, 0.985, abs(vNo.z));
  bool front = vNo.z > 0.0;
  vec2 q = vL.xy / uSize;
  vec2 frag = gl_FragCoord.xy;
  if (uClip.w > 0.5 && frag.x > uClip.x && frag.x < uClip.y && frag.y < uClip.z && frag.y > uClipB) discard;
  vec2 suv = frag / uRes;
  float frost = 1.0 - uOpen * 0.8;

  // frosted glass: wide blur while sealed, close to clear once opened
  vec2 refr = -q * 0.014 * face + N.xy * mix(0.06, 0.01, face);
  float rad = mix(0.003, 0.03, frost * face) + 0.006 * (1.0 - face);
  float rot = ign(frag) * 6.2831853;
  float asp = uRes.y / uRes.x;
  vec3 bg = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    if (fi >= uTaps) break;
    float r = sqrt((fi + 0.5) / uTaps) * rad;
    float a = fi * 2.39996 + rot;
    vec2 o = vec2(cos(a) * asp, sin(a)) * r;
    bg += texture2D(uRT, suv + refr + o).rgb;
  }
  bg /= uTaps;

  // milky body: warm on cream, a soft lit haze on ink
  vec3 milk = mix(vec3(0.975, 0.96, 0.93), vec3(0.9, 0.87, 0.81), uTheme);
  vec3 col = mix(bg, milk, (0.42 * frost + 0.1 + 0.4 * uTheme) * face);
  float d = sdRound(vL.xy, uSize * 0.5, 0.12);
  float rimBand = smoothstep(-0.07, -0.004, d) * face;
  col = mix(col, col * mix(vec3(0.82, 0.8, 0.76), vec3(0.75, 0.73, 0.7), uTheme), rimBand * 0.5);

  // studio environment
  vec3 R = reflect(-V, N);
  float sky = smoothstep(-0.25, 0.85, R.y);
  vec3 env = mix(mix(vec3(0.22, 0.2, 0.18), vec3(0.55, 0.53, 0.5), uTheme), mix(vec3(1.0, 0.99, 0.97), vec3(0.97, 0.95, 0.9), uTheme), sky);
  env += vec3(1.0) * pow(max(dot(R, normalize(vec3(-0.45, 0.65, 0.62))), 0.0), 28.0) * 0.8;
  col = mix(col, env, clamp(fres * 0.85 + (1.0 - face) * 0.45, 0.0, 1.0));

  vec2 uv = front ? q + 0.5 : vec2(0.5 - q.x, q.y + 0.5);
  vec3 ink = vec3(0.0);
  const float TA = 1024.0 / 646.0;
  if (front) {
    // broken seal: a jagged crack, the two halves pushed apart
    vec2 p0 = (uv - 0.5) * vec2(TA, 1.0);
    float cs = cos(uSealRot), sn = sin(uSealRot);
    vec2 p = length(p0) < 0.22 ? vec2(cs * p0.x - sn * p0.y, sn * p0.x + cs * p0.y) : p0;
    vec2 uvR = 0.5 + p / vec2(TA, 1.0);
    float lp = p.y - (0.42 * p.x + 0.014 * sin(p.x * 150.0));
    float side = sign(lp);
    vec2 uvW = uvR - side * vec2(0.006, -0.012) * uBreak;
    vec4 t = texture2D(uFront, uv);
    vec4 tw = texture2D(uFront, uvW);
    float bias = mix(1.6, 5.2, frost);
    float letter = texture2D(uFront, uv, bias).g;
    col = mix(col, ink, letter * mix(0.16, 0.3, uOpen) * face);
    col = mix(col, ink, t.r * (1.0 - t.b) * (1.0 - tw.b) * 0.5 * face);
    float crack = (1.0 - smoothstep(0.0015, 0.0025 + 0.008 * uBreak, abs(lp))) * step(0.02, uBreak);
    float sh = 0.9 + 0.18 * (q.y + 0.2) - 0.08 * length(q);
    vec3 wax = AMBER * (sh + uOpen * 0.08);
    float seal = tw.b * face * (1.0 - crack) * (1.0 - uOpen * 0.12);
    col = mix(col, wax, seal);
    col = mix(col, ink, tw.r * tw.b * 0.86 * face * (1.0 - crack));
  } else {
    vec4 t = texture2D(uBack, uv);
    // public record: segmented values, readable as shapes only
    col = mix(col, ink, t.r * 0.5 * face);
    col = mix(col, ink, t.g * 0.55 * face);
    // redaction: each row is wiped by a solid slab, left to right
    float id = floor(t.b * 255.0 / 40.0 + 0.5) - 1.0;
    float local = clamp(uStep - id, 0.0, 1.0);
    float wipe = 0.33 + local * 0.64;
    float slab = smoothstep(0.03, 0.1, texture2D(uBack, uv, 3.0).g);
    float shown = step(0.0, id) * step(0.001, local) * (1.0 - smoothstep(wipe - 0.01, wipe, uv.x));
    col = mix(col, ink, slab * shown * 0.94 * face);
    // privacy seal pressed onto the record
    vec2 sc = vec2(0.78, 0.24);
    float k = mix(1.5, 1.0, smoothstep(0.0, 1.0, uStamp));
    vec2 pd0 = vec2((uv.x - sc.x) * TA, uv.y - sc.y);
    float cb = cos(-uSealRot), sb = sin(-uSealRot);
    vec2 pd = vec2(cb * pd0.x - sb * pd0.y, sb * pd0.x + cb * pd0.y);
    vec2 uvS = vec2(0.5) + vec2(pd.x / TA, pd.y) * (0.1827 / 0.13) * k;
    vec4 st = texture2D(uFront, uvS);
    float a = st.b * smoothstep(0.0, 0.6, uStamp) * face;
    col = mix(col, AMBER * (0.95 + 0.1 * q.y), a);
    col = mix(col, ink, st.r * a * 0.86);
  }

  // slow sheen, pushed by the apply hover
  float sw = (q.x * 0.8 + q.y * 0.6);
  float pos = uSweep * 2.6 - 1.3;
  col += vec3(1.0) * exp(-pow((sw - pos) / 0.08, 2.0)) * 0.12 * face * step(-0.5, uSweep);
  col += vec3(1.0) * smoothstep(-0.014, -0.002, d) * face * (0.3 + 0.5 * uTheme);
  col += (ign(frag * 1.37) - 0.5) * 0.012;
  gl_FragColor = vec4(col * uOpacity, uOpacity);
}
`;

const SHADOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const SHADOW_FRAG = /* glsl */ `${PRECISION}
uniform float uA;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float a = exp(-dot(p, p) * 3.2) * uA;
  gl_FragColor = vec4(vec3(0.0), a);
}
`;

/* ------------------------------------------------------------------ */
function makeField(count: number) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const info = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const col = Math.round((Math.random() - 0.5) * 40) * 0.9;
    pos[i * 3] = col + (Math.random() - 0.5) * 0.05;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 2] = -14 + Math.random() * 12;
    info[i * 4] = Math.random();
    const r = Math.random();
    info[i * 4 + 1] = r < 0.55 ? 0 : r < 0.8 ? 1 : r < 0.92 ? 2 : 3;
    info[i * 4 + 2] = 0.5 + Math.random();
    info[i * 4 + 3] = 0.1 + Math.random() * 0.05;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return geo;
}

function makeCardGeo() {
  const w = CW - BEV * 2;
  const h = CH - BEV * 2;
  const r = CR - BEV;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: BEV,
    bevelSize: BEV,
    bevelSegments: 6,
    curveSegments: 12,
  });
  g.center();
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ */
export type CardPose = {
  x: number; // NDC
  y: number;
  s: number; // card height as a fraction of viewport height
  rx: number;
  ry: number;
  rz: number;
  opacity: number;
  shadow: number;
};

export type SceneOptions = { lowTier: boolean };

export function createScene(canvas: HTMLCanvasElement, fgCanvas: HTMLCanvasElement, opts: SceneOptions) {
  try {
    const t = document.createElement('canvas');
    if (!t.getContext('webgl2')) return null;
  } catch {
    return null;
  }
  let renderer: THREE.WebGLRenderer;
  let bgR: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: fgCanvas, alpha: true, antialias: true, powerPreference: 'high-performance', premultipliedAlpha: true });
    bgR = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true });
  } catch {
    return null;
  }
  if (!renderer.getContext() || !bgR.getContext()) return null;
  for (const r of [renderer, bgR]) {
    r.setClearColor(0x000000, 0);
    r.autoClear = false;
  }

  let low = opts.lowTier;
  let pr = Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2);
  let W = window.innerWidth;
  let H = window.innerHeight;
  const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 80);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);

  const fieldScene = new THREE.Scene();
  const cardScene = new THREE.Scene();

  const COUNT = low ? 1800 : 3400;
  const fieldGeo = makeField(COUNT);
  const fieldMat = new THREE.ShaderMaterial({
    vertexShader: FIELD_VERT,
    fragmentShader: FIELD_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(-9999, -9999) },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPR: { value: pr },
      uScale: { value: 1 },
      uTheme: { value: 0 },
    },
  });
  const points = new THREE.Points(fieldGeo, fieldMat);
  points.frustumCulled = false;
  fieldScene.add(points);

  const rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
  const rtScale = low ? 0.35 : 0.5;
  const front = new THREE.CanvasTexture(paintFront());
  const back = new THREE.CanvasTexture(paintBack());
  for (const t of [front, back]) {
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
  }
  const cardU = {
    uRT: { value: rt.texture },
    uFront: { value: front },
    uBack: { value: back },
    uRes: { value: new THREE.Vector2(1, 1) },
    uSize: { value: new THREE.Vector2(CW, CH) },
    uTheme: { value: 0 },
    uOpen: { value: 0 },
    uSweep: { value: -1 },
    uOpacity: { value: 1 },
    uTaps: { value: low ? 6 : 12 },
    uStep: { value: 0 },
    uStamp: { value: 0 },
    uBreak: { value: 0 },
    uClip: { value: new THREE.Vector4(0, 0, 0, 0) },
    uClipB: { value: 0 },
    uSealRot: { value: 0 },
  };
  const cardGeo = makeCardGeo();
  const cardMat = new THREE.ShaderMaterial({
    vertexShader: CARD_VERT,
    fragmentShader: CARD_FRAG,
    uniforms: cardU,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const card = new THREE.Mesh(cardGeo, cardMat);
  card.renderOrder = 2;
  const pivot = new THREE.Group();
  pivot.add(card);
  cardScene.add(pivot);

  const shadowMat = new THREE.ShaderMaterial({
    vertexShader: SHADOW_VERT,
    fragmentShader: SHADOW_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: { uA: { value: 0 } },
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
  shadow.renderOrder = 1;
  cardScene.add(shadow);

  const pose: CardPose = { x: 0, y: 0, s: 0.2, rx: 0, ry: 0, rz: 0, opacity: 0, shadow: 1 };
  const pointer = { x: -9999, y: -9999 };
  let theme = 0;
  let time = 0;
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
    bgR.setPixelRatio(Math.min(pr, 1.5));
    bgR.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const bw = Math.floor(W * pr);
    const bh = Math.floor(H * pr);
    rt.setSize(Math.max(2, Math.floor(bw * rtScale)), Math.max(2, Math.floor(bh * rtScale)));
    fieldMat.uniforms.uRes.value.set(bw, bh);
    fieldMat.uniforms.uPR.value = pr;
    cardU.uRes.value.set(bw, bh);
    fieldMat.uniforms.uScale.value = bh / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }
  setSize();
  const onResize = () => requestAnimationFrame(setSize);
  window.addEventListener('resize', onResize);

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    document.documentElement.classList.remove('gl-on');
    document.documentElement.classList.add('no-gl');
  };
  canvas.addEventListener('webglcontextlost', onLost);
  fgCanvas.addEventListener('webglcontextlost', onLost);

  const hh = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const bgCream = new THREE.Color(0xebe3d3);
  const bgInk = new THREE.Color(0x0b0b0b);
  const bg = new THREE.Color();

  function render(dt: number) {
    if (lost) return;
    time += dt;
    const h = hh();
    const w = h * camera.aspect;
    pivot.position.set(pose.x * w, pose.y * h, 0);
    const sc = Math.max(0.02, (pose.s * 2 * h) / CH);
    pivot.scale.setScalar(sc);
    card.rotation.set(pose.rx, pose.ry, 0, 'XYZ');
    pivot.rotation.set(0, 0, pose.rz);
    cardU.uOpacity.value = pose.opacity;
    cardU.uSealRot.value = pose.rz;
    const turn = Math.abs(Math.cos(pose.ry));
    shadow.position.set(pivot.position.x, pivot.position.y - CH * sc * 0.62, -1.2);
    shadow.scale.set(CW * sc * (0.55 + 0.45 * turn), CH * sc * 0.24, 1);
    shadowMat.uniforms.uA.value = 0.12 * pose.shadow * pose.opacity * (1 - theme);

    // the field is drawn behind the page in the cream chapters only; ink sections are solid
    const fu = fieldMat.uniforms;
    fu.uTime.value = time % 4000;
    fu.uMouse.value.set(pointer.x * pr, (H - pointer.y) * pr);
    cardU.uTheme.value = theme;

    bg.copy(bgCream).lerp(bgInk, theme);
    const cardOn = pose.opacity > 0.01;
    card.visible = cardOn;
    if (cardOn) {
      fu.uTheme.value = theme;
      renderer.setRenderTarget(rt);
      renderer.setClearColor(bg, 1);
      renderer.clear();
      fu.uScale.value *= rtScale;
      renderer.render(fieldScene, camera);
      fu.uScale.value /= rtScale;
      renderer.setClearColor(0x000000, 0);
    }
    renderer.setRenderTarget(null);
    renderer.clear();
    if (cardOn) renderer.render(cardScene, camera);
    fu.uTheme.value = 0;
    bgR.clear();
    bgR.render(fieldScene, camera);

    if (!tiered) {
      frames++;
      if (frames > 10) acc += dt;
      if (frames === 100) {
        tiered = true;
        if ((acc / 90) * 1000 > 24) {
          low = true;
          pr = 1;
          cardU.uTaps.value = 6;
          fieldGeo.setDrawRange(0, Math.floor(COUNT / 2));
          setSize();
        }
      }
    }
  }

  return {
    pose,
    setTheme(t: number) {
      theme = t;
    },
    setPointer(x: number, y: number) {
      pointer.x = x;
      pointer.y = y;
    },
    setRecord(step: number, stamp: number, brk: number) {
      cardU.uStep.value = step;
      cardU.uStamp.value = stamp;
      cardU.uBreak.value = brk;
    },
    setClip(x0: number, x1: number, y: number, yb: number, on: boolean) {
      // CSS px (top-left origin) → drawing-buffer px (bottom-left origin)
      cardU.uClip.value.set(x0 * pr, x1 * pr, (H - y) * pr, on ? 1 : 0);
      cardU.uClipB.value = (H - yb) * pr;
    },
    setOpen(o: number, sweep: number) {
      cardU.uOpen.value = o;
      cardU.uSweep.value = sweep;
    },
    pause(p: boolean) {
      running = !p;
    },
    tick(dt: number) {
      if (!running || document.hidden || lost) return;
      render(Math.min(dt, 1 / 20));
    },
    compile() {
      try {
        renderer.compile(fieldScene, camera);
        renderer.compile(cardScene, camera);
        bgR.compile(fieldScene, camera);
      } catch {
        /* noop */
      }
    },
    dispose() {
      running = false;
      window.removeEventListener('resize', onResize);
      fieldGeo.dispose();
      fieldMat.dispose();
      cardGeo.dispose();
      cardMat.dispose();
      shadowMat.dispose();
      front.dispose();
      back.dispose();
      rt.dispose();
      renderer.dispose();
      bgR.dispose();
    },
  };
}

export type Scene = NonNullable<ReturnType<typeof createScene>>;

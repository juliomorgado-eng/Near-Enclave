// SEALED INVITATION — a small frosted-glass sleeve (NEAR glass language) holding a green glass card.
//   1. inner card (green glass, diagonal hatching, nothing printed) → half-res target
//   2. inner card again, on screen, only the part that has slid out of the sleeve
//   3. frosted sleeve: samples the target through a noisy blur (the frost), official N mark as the seal
import * as THREE from 'three';

const PRECISION = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

// sleeve (portrait) and the card inside it, in world units
export const SW = 2.0;
export const SH = 2.8;
const SD = 0.16;
const SR = 0.035;
const IW = 1.7;
const IH = 2.48;
const ID = 0.035;
export const AR = SW / SH;

const VERT = /* glsl */ `
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

const INNER_FRAG = /* glsl */ `${PRECISION}
uniform vec2 uSize;
uniform float uCut;
uniform float uUseCut;
uniform float uOpacity;
uniform vec2 uClip;
varying vec3 vN;
varying vec3 vNo;
varying vec3 vV;
varying vec3 vL;
void main() {
  if (uUseCut > 0.5 && vL.y < uCut) discard;
  // the reader slot: whatever is pushed below it is inside the machine
  if (uClip.y > 0.5 && gl_FragCoord.y < uClip.x) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  float face = smoothstep(0.86, 0.985, abs(vNo.z));
  vec2 q = vL.xy / uSize;
  float t = q.y + 0.5;
  // green glass, deepest at the top, melting to mint / white at the bottom (deck glass)
  vec3 green = vec3(0.0, 0.862, 0.553);
  vec3 mint = vec3(0.80, 0.96, 0.89);
  vec3 body = mix(mint, green, smoothstep(0.05, 0.95, t));
  // brand hatching, fine diagonal lines
  float s = fract((vL.x + vL.y) * 6.5);
  float line = smoothstep(0.0, 0.05, s) * smoothstep(0.24, 0.18, s);
  body = mix(body, body * vec3(0.55, 0.78, 0.7), line * 0.55 * face);
  // light from above, rim on the thin edges
  vec3 R = reflect(-V, N);
  float sky = smoothstep(-0.2, 0.9, R.y);
  body = mix(body, vec3(0.97), clamp(fres * 0.8 + (1.0 - face) * 0.35, 0.0, 1.0) * sky);
  body += vec3(1.0) * pow(max(dot(R, normalize(vec3(-0.4, 0.7, 0.6))), 0.0), 24.0) * 0.35;
  float a = mix(0.9, 0.97, fres) * uOpacity;
  gl_FragColor = vec4(body * a, a);
}
`;

const SLEEVE_FRAG = /* glsl */ `${PRECISION}
uniform sampler2D uRT;
uniform sampler2D uMark;
uniform vec2 uRes;
uniform vec2 uSize;
uniform float uFrost;
uniform float uOpacity;
uniform float uTaps;
uniform float uSweep;
uniform float uTime;
uniform vec2 uClip;
uniform float uRedact;
uniform float uSeal;
uniform float uGlow;
varying vec3 vN;
varying vec3 vNo;
varying vec3 vV;
varying vec3 vL;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  float face = smoothstep(0.86, 0.985, abs(vNo.z));
  bool front = vNo.z > 0.0;
  vec2 frag = gl_FragCoord.xy;
  if (uClip.y > 0.5 && frag.y < uClip.x) discard;
  vec2 suv = frag / uRes;
  float asp = uRes.y / uRes.x;

  // frosted transmission: a wide, noise-rotated disc of taps reads as etched glass
  vec2 refr = N.xy * mix(0.045, 0.006, face);
  float rad = mix(0.0025, 0.03, uFrost);
  float rot = ign(frag) * 6.2831853;
  vec4 c = vec4(0.0);
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    if (fi >= uTaps) break;
    float r = sqrt((fi + 0.5) / uTaps) * rad;
    float an = fi * 2.39996 + rot;
    c += texture2D(uRT, suv + refr + vec2(cos(an) * asp, sin(an)) * r);
  }
  c /= uTaps;

  // what is inside loses contrast behind the frost
  float keep = mix(0.97, 0.7, uFrost);
  vec3 rgb = c.rgb * keep;
  float a = c.a * keep;
  // the milky veil of the etched surface
  float milkA = mix(0.06, 0.2, uFrost) * face + (1.0 - face) * 0.3;
  vec3 milk = vec3(0.93, 0.95, 0.94);
  rgb += milk * milkA * (1.0 - a);
  a += milkA * (1.0 - a);

  // warm-dark studio reflection: a soft box above, the edges catch it
  vec3 R = reflect(-V, N);
  float sky = smoothstep(-0.15, 0.95, R.y);
  vec3 env = mix(vec3(0.11, 0.1, 0.095), vec3(0.96, 0.97, 0.96), sky);
  float k = clamp(fres * 0.75 + (1.0 - face) * 0.55, 0.0, 1.0);
  rgb = rgb * (1.0 - k) + env * k;
  a = a * (1.0 - k) + k;

  vec2 q = vL.xy / uSize;
  vec3 GREEN = vec3(0.0, 0.862, 0.553);
  float aspM = uSize.x / uSize.y;
  if (front) {
    // official N mark as the seal, lower right; it lights up once the invitation is accepted
    vec2 mc = vec2(0.29, -0.385);
    float ms = 0.2;
    vec2 muv = (q - mc) / vec2(ms, ms * aspM) + 0.5;
    float inside = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
    float m = texture2D(uMark, muv).a * inside * face;
    float halo = exp(-dot((q - mc) * vec2(1.0, 1.0 / aspM), (q - mc) * vec2(1.0, 1.0 / aspM)) / 0.012) * uGlow * 0.35 * face;
    rgb += GREEN * halo;
    a = max(a, halo);
    rgb = mix(rgb, GREEN * (1.0 + 0.35 * uGlow), m);
    a = mix(a, 1.0, m);
  } else {
    // the back: plain records as light bars, sealed one by one into solid blocks
    vec2 qb = vec2(-q.x, q.y);
    float x0 = -0.36;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float yc = 0.33 - fi * 0.095;
      float len = 0.72 - 0.16 * fract(fi * 0.618 + 0.21) - 0.1 * step(3.5, fi);
      float u = (qb.x - x0) / len;
      float inY = step(abs(qb.y - yc), 0.018);
      float inX = step(0.0, u) * step(u, 1.0);
      float r = clamp(uRedact * 1.25 - fi, 0.0, 1.0);
      float sealed = step(u, r * 1.04);
      float bar = inY * inX * face;
      float blk = step(abs(qb.y - yc), 0.03) * step(-0.02, u) * step(u, 1.02) * sealed * face;
      rgb = mix(rgb, vec3(0.86, 0.85, 0.83), bar * 0.8);
      a = mix(a, 1.0, bar * 0.8);
      rgb = mix(rgb, vec3(0.11, 0.098, 0.09), blk);
      a = mix(a, 1.0, blk);
    }
    // the N seal: a dim impression until privacy is named, then it lights
    vec2 mc = vec2(0.0, -0.27);
    float ms = 0.3;
    vec2 muv = (qb - mc) / vec2(ms, ms * aspM) + 0.5;
    float inside = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
    float m = texture2D(uMark, muv).a * inside * face;
    vec3 dim = vec3(0.55, 0.56, 0.55);
    float halo = exp(-dot((qb - mc) * vec2(1.0, 1.0 / aspM), (qb - mc) * vec2(1.0, 1.0 / aspM)) / 0.03) * uSeal * 0.3 * face;
    rgb += GREEN * halo;
    a = max(a, halo);
    rgb = mix(rgb, mix(dim, GREEN * 1.15, uSeal), m * mix(0.45, 1.0, uSeal));
    a = mix(a, 1.0, m * mix(0.45, 1.0, uSeal));
  }

  // a slow light sweep across the face, and the bright hairline rim
  float sw = q.x * 0.7 + q.y * 0.7;
  float sweep = exp(-pow((sw - (uSweep * 2.4 - 1.2)) / 0.09, 2.0)) * 0.1 * face;
  rgb += vec3(sweep);
  a = max(a, sweep);
  // a broad, slow reflection drifting across the face (reads as glass, not a flat panel)
  float drift = sin(uTime * 0.13) * 0.55;
  float band = exp(-pow((q.x * 0.9 - q.y * 0.45 - drift) / 0.22, 2.0)) * 0.09 * face;
  rgb += vec3(band);
  a = max(a, band);
  // thickness: bright outer hairline, a darker step, then a faint inner bevel line
  float d = sdBox(vL.xy, uSize * 0.5, 0.035);
  float rim = smoothstep(-0.016, -0.003, d) * face;
  float step2 = smoothstep(-0.05, -0.03, d) * (1.0 - smoothstep(-0.03, -0.018, d)) * face;
  float inner = smoothstep(-0.075, -0.064, d) * (1.0 - smoothstep(-0.064, -0.054, d)) * face;
  float lit = 0.75 + 0.25 * smoothstep(-0.5, 0.5, q.y - q.x * 0.4);
  rgb += vec3(rim * 0.85 * lit + inner * 0.22);
  rgb *= 1.0 - step2 * 0.18;
  a = max(a, rim * 0.85);
  // etched grain
  rgb += (ign(frag * 1.37) - 0.5) * 0.035 * uFrost * a;
  gl_FragColor = vec4(rgb, a) * uOpacity;
}
`;

// near-icon.svg, path copied verbatim (official mark, drawn at its own colour)
const N_PATH =
  'M61.0741 15.4268L60.1503 15.6046L45.2764 28.5974C43.6305 29.4554 42.1009 27.9171 42.9636 26.2807L59.3426 2.19499C64.1334 -2.1196 71.7447 0.589276 72.4544 7.03665V65.6943C71.7753 72.6075 63.2278 74.6299 58.2046 70.8547L12.298 16.0152C11.9799 15.7271 11.3374 15.6781 11.1784 16.1623L11.1355 56.201L11.368 57.3103L12.2919 57.1325L27.1658 44.1397C28.4813 43.4288 29.9191 44.3358 29.7172 45.8496C29.6193 46.5728 26.1196 51.4819 25.4343 52.5176C21.4328 58.536 17.3335 64.4992 13.2219 70.444C8.44954 74.8628 0.728093 72.2336 0 65.6943V7.03665C0.679146 0.123497 9.22657 -1.89897 14.2498 1.8763L60.4134 56.8813L61.1108 56.8261L61.3128 16.5361L61.0803 15.4268H61.0741Z';
function makeMark() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const s = 256 / 73;
  g.setTransform(s, 0, 0, s, 0, 0);
  g.fillStyle = '#00DC8D';
  g.fill(new Path2D(N_PATH));
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// rounded-rect slab with a soft bevel (smooth normals, no seams on the long edges)
function slab(w: number, h: number, d: number, r: number, bev: number) {
  const iw = w - bev * 2;
  const ih = h - bev * 2;
  const ir = Math.max(0.004, r - bev);
  const s = new THREE.Shape();
  s.moveTo(-iw / 2 + ir, -ih / 2);
  s.lineTo(iw / 2 - ir, -ih / 2);
  s.quadraticCurveTo(iw / 2, -ih / 2, iw / 2, -ih / 2 + ir);
  s.lineTo(iw / 2, ih / 2 - ir);
  s.quadraticCurveTo(iw / 2, ih / 2, iw / 2 - ir, ih / 2);
  s.lineTo(-iw / 2 + ir, ih / 2);
  s.quadraticCurveTo(-iw / 2, ih / 2, -iw / 2, ih / 2 - ir);
  s.lineTo(-iw / 2, -ih / 2 + ir);
  s.quadraticCurveTo(-iw / 2, -ih / 2, -iw / 2 + ir, -ih / 2);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, d - bev * 2),
    bevelEnabled: true,
    bevelThickness: bev,
    bevelSize: bev,
    bevelSegments: 5,
    curveSegments: 6,
  });
  g.center();
  g.computeVertexNormals();
  return g;
}

export type Pose = {
  x: number; // NDC
  y: number;
  h: number; // sleeve height as a fraction of viewport height
  rx: number;
  ry: number;
  rz: number;
  open: number; // 0 sealed … 1 card slid out
  frost: number; // 1 fully etched … 0 clear
  opacity: number;
  sweep: number;
  time: number;
  redact: number; // 0…4 back rows sealed
  seal: number; // back N lit
  glow: number; // front N lit
  clipY: number; // CSS px from top; <0 = off
};

export function createScene(canvas: HTMLCanvasElement, opts: { lowTier: boolean }) {
  try {
    const t = document.createElement('canvas');
    if (!(t.getContext('webgl2') || t.getContext('webgl'))) return null;
  } catch {
    return null;
  }
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  let low = opts.lowTier;
  let pr = Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2);
  let W = window.innerWidth;
  let H = window.innerHeight;
  const camera = new THREE.PerspectiveCamera(24, W / H, 0.1, 60);
  camera.position.set(0, 0, 12);

  const rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
  const rtScale = 0.5;

  const blend = {
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  } as const;

  const innerU = {
    uSize: { value: new THREE.Vector2(IW, IH) },
    uCut: { value: 0 },
    uUseCut: { value: 0 },
    uOpacity: { value: 1 },
    uClip: { value: new THREE.Vector2(0, 0) },
  };
  const innerMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: INNER_FRAG, uniforms: innerU, ...blend });
  const mark = makeMark();
  const sleeveU = {
    uRT: { value: rt.texture },
    uMark: { value: mark },
    uRes: { value: new THREE.Vector2(1, 1) },
    uSize: { value: new THREE.Vector2(SW, SH) },
    uFrost: { value: 1 },
    uOpacity: { value: 1 },
    uTaps: { value: low ? 8 : 14 },
    uSweep: { value: -1 },
    uTime: { value: 0 },
    uClip: { value: new THREE.Vector2(0, 0) },
    uRedact: { value: 0 },
    uSeal: { value: 0 },
    uGlow: { value: 0 },
  };
  const sleeveMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: SLEEVE_FRAG, uniforms: sleeveU, ...blend });

  const innerGeo = slab(IW, IH, ID, 0.02, 0.01);
  const sleeveGeo = slab(SW, SH, SD, SR, 0.028);
  const inner = new THREE.Mesh(innerGeo, innerMat);
  const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
  inner.renderOrder = 1;
  sleeve.renderOrder = 2;
  const pivot = new THREE.Group();
  pivot.add(inner, sleeve);
  const scene = new THREE.Scene();
  scene.add(pivot);

  const pose: Pose = { x: 0.5, y: 0, h: 0.4, rx: 0, ry: 0, rz: 0, open: 0, frost: 1, opacity: 1, sweep: -1, time: 0, redact: 0, seal: 0, glow: 0, clipY: -1 };
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
    sleeveU.uRes.value.set(bw, bh);
  }
  setSize();
  const onResize = () => requestAnimationFrame(setSize);
  window.addEventListener('resize', onResize);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    document.documentElement.classList.add('no-gl');
  });

  const halfH = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;

  function render(dt: number) {
    const h = halfH();
    const w = h * camera.aspect;
    pivot.position.set(pose.x * w, pose.y * h, 0);
    pivot.scale.setScalar(Math.max(0.02, (pose.h * 2 * h) / SH));
    pivot.rotation.set(pose.rx, pose.ry, pose.rz, 'YXZ');
    // the card rises out of the open top edge of the sleeve
    const rise = pose.open * IH * 0.46;
    inner.position.set(0, rise - (SH - IH) * 0.12, -0.004);
    innerU.uCut.value = SH / 2 - inner.position.y;
    innerU.uOpacity.value = 1;
    sleeveU.uFrost.value = pose.frost;
    sleeveU.uOpacity.value = pose.opacity;
    sleeveU.uSweep.value = pose.sweep;
    sleeveU.uTime.value = pose.time % 1000;
    sleeveU.uRedact.value = pose.redact;
    sleeveU.uSeal.value = pose.seal;
    sleeveU.uGlow.value = pose.glow;
    const on = pose.clipY >= 0 ? 1 : 0;
    const cy = (H - pose.clipY) * pr;
    sleeveU.uClip.value.set(cy, on);
    innerU.uClip.value.set(cy, on);

    renderer.setRenderTarget(null);
    renderer.clear();
    if (pose.opacity < 0.005) return;
    // 1. inner card, whole, into the target the sleeve looks through
    sleeve.visible = false;
    inner.visible = true;
    innerU.uUseCut.value = 0;
    innerU.uClip.value.y = 0; // target pass is half-res: no slot clip there
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    // 2. the slid-out part, crisp
    innerU.uUseCut.value = 1;
    innerU.uClip.value.y = on;
    innerU.uOpacity.value = pose.opacity;
    if (pose.open > 0.002) renderer.render(scene, camera);
    // 3. the sleeve
    inner.visible = false;
    sleeve.visible = true;
    renderer.render(scene, camera);
    inner.visible = true;

    if (!tiered) {
      frames++;
      if (frames > 10) acc += dt;
      if (frames === 90) {
        tiered = true;
        if ((acc / 80) * 1000 > 26) {
          low = true;
          pr = 1;
          sleeveU.uTaps.value = 8;
          setSize();
        }
      }
    }
  }

  return {
    pose,
    pause(p: boolean) {
      running = !p;
    },
    tick(dt: number) {
      if (!running || document.hidden || lost) return;
      render(dt);
    },
    compile() {
      try {
        renderer.compile(scene, camera);
      } catch {
        /* noop */
      }
    },
    dispose() {
      running = false;
      window.removeEventListener('resize', onResize);
      innerGeo.dispose();
      sleeveGeo.dispose();
      innerMat.dispose();
      sleeveMat.dispose();
      mark.dispose();
      rt.dispose();
      renderer.dispose();
    },
  };
}

export type Scene = NonNullable<ReturnType<typeof createScene>>;

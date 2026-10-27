// INVITATION — one WebGL layer: a glass keycard over an almost-still glyph field.
//   A. glyph field (THREE.Points), rendered to screen and to a half-res target
//   B. glass keycard (extruded rounded rect) refracting that target, two printed faces
//   C. soft contact shadow under the card
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
const CR = 0.15;
const BEV = 0.026;
const DEPTH = 0.04;

/* ------------------------------------------------------------------ */
const FIELD_VERT = /* glsl */ `
attribute vec4 aInfo; // seed, glyph, speed, size
uniform float uTime;
uniform vec2 uMouse;
uniform vec2 uRes;
uniform float uPR;
uniform float uScale;
uniform float uField;
uniform float uTheme;
varying float vGlyph;
varying vec3 vCol;
varying float vA;
void main() {
  vec3 p = position;
  float seed = aInfo.x;
  // slow upward drift with a lazy sway, wrapped in a 20-unit band
  p.y = mod(p.y + uTime * 0.05 * aInfo.z + 10.0, 20.0) - 10.0;
  p.x += sin(uTime * 0.07 + seed * 6.2831) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  vec2 sp = (ndc * 0.5 + 0.5) * uRes;
  vec2 d = sp - uMouse;
  float l = length(d);
  float f = 1.0 - smoothstep(0.0, 150.0 * uPR, l);
  sp += (d / max(l, 0.001)) * f * f * 26.0 * uPR;
  clip.xy = (sp / uRes * 2.0 - 1.0) * clip.w;
  gl_Position = clip;
  float dist = -mv.z;
  gl_PointSize = clamp(aInfo.w * uScale / dist, 1.0, 48.0);
  vGlyph = mod(aInfo.y + floor(uTime * 0.25 + seed * 13.0) * 7.0, 32.0);
  vCol = mix(vec3(0.07, 0.07, 0.07), vec3(0.92, 0.89, 0.83), uTheme);
  float fade = smoothstep(26.0, 12.0, dist) * smoothstep(4.0, 7.0, dist);
  vA = mix(0.11, 0.15, uTheme) * uField * fade * (0.55 + 0.45 * fract(seed * 7.13));
}
`;
const FIELD_FRAG = /* glsl */ `${PRECISION}
uniform sampler2D uAtlas;
varying float vGlyph;
varying vec3 vCol;
varying float vA;
void main() {
  vec2 cell = vec2(mod(vGlyph, 8.0), floor(vGlyph / 8.0));
  vec2 uv = vec2((cell.x + gl_PointCoord.x) / 8.0, 1.0 - (cell.y + gl_PointCoord.y) / 4.0);
  float a = texture2D(uAtlas, uv).a * vA;
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
uniform float uTime;
uniform float uStep;
uniform float uHover;
uniform float uSweep;
uniform float uOpacity;
uniform float uTaps;
uniform vec4 uClip;
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
  // reader slot: whatever is pushed below it is inside the machine
  if (uClip.w > 0.5 && frag.x > uClip.x && frag.x < uClip.y && frag.y < uClip.z) discard;
  vec2 suv = frag / uRes;

  // thick glass: gentle magnification in the body, strong bend on the bevel
  vec2 refr = -q * 0.018 * face + N.xy * mix(0.07, 0.01, face);
  float rad = 0.0035 + 0.006 * (1.0 - face);
  float rot = ign(frag) * 6.2831853;
  float asp = uRes.y / uRes.x;
  vec3 bg = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    if (fi >= uTaps) break;
    float r = sqrt((fi + 0.5) / uTaps) * rad;
    float a = fi * 2.39996 + rot;
    vec2 o = vec2(cos(a) * asp, sin(a)) * r;
    vec2 b = suv + refr + o;
    bg.r += texture2D(uRT, b + refr * 0.05).r;
    bg.g += texture2D(uRT, b).g;
    bg.b += texture2D(uRT, b - refr * 0.05).b;
  }
  bg /= uTaps;

  // clear glass with a faint green body, darker through the thick rim
  vec3 tint = mix(vec3(0.95, 0.972, 0.964), vec3(0.86, 0.93, 0.9), uTheme);
  vec3 col = bg * tint + mix(vec3(0.025, 0.03, 0.03), vec3(0.085, 0.095, 0.092), uTheme) * face;
  float d = sdRound(vL.xy, uSize * 0.5, 0.15);
  float rimBand = smoothstep(-0.085, -0.005, d) * face;
  col = mix(col, col * mix(vec3(0.62, 0.74, 0.71), vec3(0.5, 0.62, 0.6), uTheme) + vec3(0.0, 0.015, 0.012), rimBand * 0.6);

  // studio environment: bright soft-box above, floor below
  vec3 R = reflect(-V, N);
  float sky = smoothstep(-0.25, 0.85, R.y);
  vec3 env = mix(mix(vec3(0.16, 0.16, 0.15), vec3(0.01), uTheme), mix(vec3(1.0, 0.995, 0.98), vec3(0.85, 0.84, 0.8), uTheme), sky);
  env += vec3(1.0) * pow(max(dot(R, normalize(vec3(-0.45, 0.65, 0.62))), 0.0), 28.0) * 0.9;
  col = mix(col, env, clamp(fres * 0.9 + (1.0 - face) * 0.45, 0.0, 1.0));

  // printed + engraved faces
  vec2 uvF = q + 0.5;
  vec2 uvB = vec2(0.5 - q.x, q.y + 0.5);
  vec4 tf = texture2D(uFront, uvF);
  vec4 tb = texture2D(uBack, uvB);
  vec3 ink = mix(vec3(0.06, 0.065, 0.065), vec3(0.93, 0.9, 0.84), uTheme);
  if (front) {
    // amber contact chip — the one coloured thing, shared with every clickable
    float shade = 0.86 + 0.22 * (q.y + 0.2) + 0.1 * sin((q.x + q.y) * 18.0);
    vec3 chip = AMBER * (shade + uHover * 0.14);
    col = mix(col, chip, tf.b * face);
    col = mix(col, ink, tf.r * 0.9 * face);
    // engraved number: dark cut with a lit lower lip
    float lip = texture2D(uFront, uvF + vec2(0.0, 0.0018)).g;
    col = mix(col, ink, tf.g * 0.62 * face);
    col += vec3(1.0) * max(lip - tf.g, 0.0) * 0.35 * face;
  } else {
    float id = floor(tb.b * 255.0 / 40.0 + 0.5) - 1.0;
    float wipe = clamp((uStep - id) * 1.15 - uvB.x, 0.0, 1.0);
    float shown = smoothstep(0.0, 0.03, wipe);
    col = mix(col, ink, tb.r * 0.9 * face);
    col = mix(col, ink, tb.g * shown * 0.95 * face);
  }

  // slow specular sweep, pushed by the CTA hover
  float sw = (q.x * 0.8 + q.y * 0.6);
  float pos = uSweep * 2.6 - 1.3;
  col += vec3(1.0) * exp(-pow((sw - pos) / 0.07, 2.0)) * 0.13 * face;
  col += vec3(1.0) * smoothstep(0.3, -0.6, q.x - q.y) * 0.04 * face;
  // thin bright outer rim
  col += vec3(1.0) * smoothstep(-0.012, -0.002, d) * face * (0.35 + 0.3 * uTheme);
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
const GLYPHS = '0123456789ABCDEF0427NYC27·×+/#=';
function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '400 38px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';
  for (let i = 0; i < 32; i++) g.fillText(GLYPHS[i % GLYPHS.length], (i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 34);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function makeField(count: number) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const info = new Float32Array(count * 4);
  // loose columns, like rows of serial numbers seen out of focus
  for (let i = 0; i < count; i++) {
    const col = Math.round((Math.random() - 0.5) * 40) * 0.9;
    pos[i * 3] = col + (Math.random() - 0.5) * 0.05;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 2] = -14 + Math.random() * 12;
    info[i * 4] = Math.random();
    info[i * 4 + 1] = (Math.random() * 32) | 0;
    info[i * 4 + 2] = 0.5 + Math.random();
    info[i * 4 + 3] = 0.11 + Math.random() * 0.05;
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
    curveSegments: 14,
  });
  g.center();
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ */
export type CardPose = {
  x: number; // NDC
  y: number;
  s: number; // card height (landscape) as a fraction of viewport height
  rx: number;
  ry: number;
  rz: number;
  opacity: number;
  shadow: number;
};

export type SceneOptions = { lowTier: boolean };

// Two canvases: the field lives behind the page; the card is drawn above the copy so it can
// pass in front of it while travelling between chapters (it never rests over text).
export function createScene(canvas: HTMLCanvasElement, fgCanvas: HTMLCanvasElement, opts: SceneOptions) {
  // probe first so a missing WebGL never reaches three (which logs console errors)
  try {
    const t = document.createElement('canvas');
    if (!(t.getContext('webgl2') || t.getContext('webgl'))) return null;
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
  let pr = Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.75);
  let W = window.innerWidth;
  let H = window.innerHeight;
  const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 80);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);

  const fieldScene = new THREE.Scene();
  const cardScene = new THREE.Scene();

  // A. field
  const COUNT = low ? 2200 : 4200;
  const fieldGeo = makeField(COUNT);
  const atlas = makeAtlas();
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
      uField: { value: 1 },
      uTheme: { value: 0 },
      uAtlas: { value: atlas },
    },
  });
  const points = new THREE.Points(fieldGeo, fieldMat);
  points.frustumCulled = false;
  fieldScene.add(points);

  // B. card
  const rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
  const rtScale = low ? 0.35 : 0.5;
  const front = new THREE.CanvasTexture(paintFront());
  const back = new THREE.CanvasTexture(paintBack());
  for (const t of [front, back]) {
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.minFilter = THREE.LinearMipmapLinearFilter;
  }
  const cardU = {
    uRT: { value: rt.texture },
    uFront: { value: front },
    uBack: { value: back },
    uRes: { value: new THREE.Vector2(1, 1) },
    uSize: { value: new THREE.Vector2(CW, CH) },
    uTheme: { value: 0 },
    uTime: { value: 0 },
    uStep: { value: 0 },
    uHover: { value: 0 },
    uSweep: { value: -1 },
    uOpacity: { value: 1 },
    uTaps: { value: low ? 5 : 10 },
    uClip: { value: new THREE.Vector4(0, 0, 0, 0) },
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

  // C. shadow
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

  const pose: CardPose = { x: 0, y: 0.3, s: 0.4, rx: 0, ry: 0, rz: 0, opacity: 1, shadow: 1 };
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
    bgR.setPixelRatio(pr);
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
  const bgPaper = new THREE.Color(0xf3eee4);
  const bgInk = new THREE.Color(0x0b0b0b);
  const bg = new THREE.Color();

  function render(dt: number) {
    if (lost) return;
    time += dt;
    const h = hh();
    const w = h * camera.aspect;
    pivot.position.set(pose.x * w, pose.y * h, 0);
    const sc = Math.max(0.05, (pose.s * 2 * h) / CH);
    pivot.scale.setScalar(sc);
    card.rotation.set(pose.rx, pose.ry, 0, 'XYZ');
    pivot.rotation.set(0, 0, pose.rz);
    cardU.uOpacity.value = pose.opacity;
    // shadow: an ellipse below the card that narrows as the card turns edge-on
    const turn = Math.abs(Math.cos(pose.ry));
    shadow.position.set(pivot.position.x, pivot.position.y - CH * sc * 0.6, -1.2);
    shadow.scale.set(CW * sc * (0.55 + 0.45 * turn) * 1.0, CH * sc * 0.26, 1);
    shadowMat.uniforms.uA.value = 0.11 * pose.shadow * pose.opacity * (1 - theme);

    const fu = fieldMat.uniforms;
    fu.uTime.value = time % 2000;
    fu.uTheme.value = theme;
    fu.uMouse.value.set(pointer.x * pr, (H - pointer.y) * pr);
    cardU.uTheme.value = theme;
    cardU.uTime.value = time % 1000;

    bg.copy(bgPaper).lerp(bgInk, theme);
    const cardOn = pose.opacity > 0.01;
    card.visible = cardOn;
    if (cardOn) {
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
          cardU.uTaps.value = 5;
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
    setClip(x0: number, x1: number, y: number, on: boolean) {
      // CSS px (top-left origin) → drawing-buffer px (bottom-left origin)
      cardU.uClip.value.set(x0 * pr, x1 * pr, (H - y) * pr, on ? 1 : 0);
    },
    setStep(s: number) {
      cardU.uStep.value = s;
    },
    setHover(hv: number, sweep: number) {
      cardU.uHover.value = hv;
      cardU.uSweep.value = sweep;
    },
    pause(p: boolean) {
      running = !p;
    },
    tick(dt: number) {
      if (!running || document.hidden || lost) return;
      render(Math.min(dt, 1 / 20));
    },
    refreshTextures() {
      front.image = paintFront();
      back.image = paintBack();
      front.needsUpdate = true;
      back.needsUpdate = true;
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
      atlas.dispose();
      front.dispose();
      back.dispose();
      rt.dispose();
      renderer.dispose();
      bgR.dispose();
    },
  };
}

export type Scene = NonNullable<ReturnType<typeof createScene>>;

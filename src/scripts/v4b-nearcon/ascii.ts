// v4B-NEARCON ASCII fields.
//  - Hero: a rounded enclave slab + orbiting modules rendered offscreen with Three.js,
//    luminance sampled (2×2 supersampled) into a density ramp, written into a <pre>.
//    The pointer scrambles a local patch of glyphs. ~30 fps, paused off-screen.
//  - Sky: a procedural NYC skyline silhouette in density characters that rises with scroll.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const RAMP = ' .:-+=<>/*;01()[]{}';
const SCR = '01{}[]<>/*;()=+';
const FRAME = 1000 / 30;

let charRatio = 0.6;
export function measureCharRatio(family = 'Roboto Mono') {
  try {
    const c = document.createElement('canvas').getContext('2d');
    if (!c) return charRatio;
    c.font = `400 100px "${family}", ui-monospace, monospace`;
    const w = c.measureText('0000000000').width / 1000;
    if (w > 0.4 && w < 0.8) charRatio = w;
  } catch {
    /* keep default */
  }
  return charRatio;
}

const hash = (x: number, y: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

export type Field = {
  pause: (p: boolean) => void;
  resize: () => void;
  render: () => void;
  setReveal: (v: number) => void;
  setGrow?: (v: number) => void;
  dispose: () => void;
};

/* ------------------------------------------------------------------ */
/* Visibility-gated, throttled loop shared by both fields              */
/* ------------------------------------------------------------------ */
function makeLoop(host: Element, step: (t: number) => void, fps = 30) {
  let visible = false;
  let paused = false;
  let raf = 0;
  let last = 0;
  const interval = 1000 / fps;
  const run = (now: number) => {
    raf = requestAnimationFrame(run);
    if (now - last < interval) return;
    last = now - ((now - last) % interval);
    step(now / 1000);
  };
  const sync = () => {
    const on = visible && !paused && !document.hidden;
    host.classList.toggle('is-off', !on);
    if (on && !raf) raf = requestAnimationFrame(run);
    else if (!on && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  const io = new IntersectionObserver((e) => {
    visible = e[0].isIntersecting;
    sync();
  });
  io.observe(host);
  document.addEventListener('visibilitychange', sync);
  return {
    pause(p: boolean) {
      paused = p;
      sync();
    },
    stop() {
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Hero: Three.js enclave → density glyphs                             */
/* ------------------------------------------------------------------ */
export function createHeroField(pre: HTMLElement, host: HTMLElement, opts: { isStatic: boolean }): Field {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 0, 10);

  // a close point light gives each face a falloff, so faces read as density gradients
  const key = new THREE.PointLight(0xffffff, 90, 0, 2);
  key.position.set(2.5, 3.2, 4.2);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(-5, -2, 1);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.12));

  const group = new THREE.Group();
  scene.add(group);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 });
  const slab = new THREE.Mesh(new RoundedBoxGeometry(3.0, 1.9, 0.72, 5, 0.18), mat);
  group.add(slab);
  // inner core: the sealed module inside the enclave, seen through a darker shell edge
  const core = new THREE.Mesh(new RoundedBoxGeometry(1.05, 1.05, 1.05, 3, 0.12), new THREE.MeshLambertMaterial({ color: 0xbfbfbf }));
  core.position.z = 0.7;
  group.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.06, 6, 140), new THREE.MeshBasicMaterial({ color: 0x8a8a8a }));
  ring.rotation.x = Math.PI / 2.3;
  group.add(ring);
  const mods: THREE.Mesh[] = [];
  const modGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(modGeo, mat);
    mods.push(m);
    group.add(m);
  }

  let cols = 0;
  let rows = 0;
  let rt: THREE.WebGLRenderTarget | null = null;
  let buf = new Uint8Array(4);
  let heat = new Float32Array(0);
  let glyph: string[] = [];
  let reveal = opts.isStatic ? 1 : 0;
  let t0 = 0;
  const ptr = { x: -999, y: -999, on: false };

  const resize = () => {
    const W = host.clientWidth || window.innerWidth;
    const H = host.clientHeight || window.innerHeight;
    const ratio = charRatio;
    cols = W < 768 ? 60 : Math.max(96, Math.min(132, Math.round(W / 11)));
    const fs = W / (cols * ratio);
    rows = Math.min(90, Math.ceil(H / fs) + 1);
    pre.style.setProperty('--fs', `${fs}px`);
    const w = cols * 2;
    const h = rows * 2;
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
    buf = new Uint8Array(w * h * 4);
    heat = new Float32Array(cols * rows);
    glyph = new Array(cols * rows).fill(' ');
    // camera covers exactly the pre: aspect in pixels
    const aspect = (cols * ratio * fs) / (rows * fs);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const halfW = halfH * aspect;
    if (aspect > 1.15) {
      const s = Math.min(1.45, halfW / 2.75);
      group.scale.setScalar(s);
      group.position.set(halfW * 0.36, halfH * 0.02, 0);
    } else {
      const s = Math.min(1.1, (halfW * 0.95) / 2.1);
      group.scale.setScalar(s);
      group.position.set(0, halfH * 0.36, 0);
    }
  };

  const pose = (t: number) => {
    group.rotation.y = t * 0.28 + 0.6;
    group.rotation.x = 0.32 + Math.sin(t * 0.31) * 0.16;
    group.rotation.z = Math.sin(t * 0.17) * 0.06;
    core.rotation.set(t * 0.5, t * 0.7, 0);
    mods.forEach((m, i) => {
      const a = t * 0.5 + (i / mods.length) * Math.PI * 2;
      m.position.set(Math.cos(a) * 2.1, 0, Math.sin(a) * 2.1).applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2.3 - Math.PI / 2);
      m.rotation.set(a, a * 1.3, 0);
    });
  };

  const draw = (t: number) => {
    if (!rt) return;
    pose(t);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, cols * 2, rows * 2, buf);
    renderer.setRenderTarget(null);
    const W2 = cols * 2;
    const n = RAMP.length - 1;
    const pr = charRatio;
    const R = cols < 80 ? 5 : 7;
    let out = '';
    for (let r = 0; r < rows; r++) {
      const y = (rows - 1 - r) * 2;
      for (let c = 0; c < cols; c++) {
        const x = c * 2;
        const i0 = (y * W2 + x) * 4;
        const i1 = i0 + W2 * 4;
        const l = (buf[i0] + buf[i0 + 4] + buf[i1] + buf[i1 + 4]) / 1020;
        const k = r * cols + c;
        let ch: string;
        if (l < 0.035) {
          // background texture: low-density wave/noise field so the black has grain everywhere
          const w = Math.sin(c * 0.16 + t * 0.55 + Math.sin(r * 0.21 - t * 0.35) * 2.2) * Math.cos(r * 0.13 - t * 0.28 + c * 0.04);
          const v = 0.5 + 0.38 * w + (hash(c, r) - 0.5) * 0.42;
          ch = v > 0.86 ? '-' : v > 0.66 ? ':' : v > 0.42 ? '.' : ' ';
        } else ch = RAMP[Math.min(n, 4 + Math.floor(Math.pow(l, 0.7) * (n - 3)))];
        // intro: glyphs decrypt in by a per-cell threshold
        if (reveal < 1) {
          const h = hash(c, r);
          if (h > reveal) ch = ' ';
          else if (h > reveal - 0.08 && ch !== ' ') ch = SCR[(Math.random() * SCR.length) | 0];
        }
        // pointer: local scramble ("decrypting" patch)
        if (ptr.on) {
          const dx = (c - ptr.x) * pr;
          const dy = r - ptr.y;
          const d = Math.sqrt(dx * dx + dy * dy) / (R * pr * 1.4);
          if (d < 1) heat[k] = Math.max(heat[k], 1 - d);
        }
        const hv = heat[k];
        if (hv > 0.04) {
          heat[k] = hv * 0.9;
          if (Math.random() < hv) ch = ch === ' ' && hv < 0.45 ? '.' : SCR[(Math.random() * SCR.length) | 0];
        }
        glyph[k] = ch;
        out += ch;
      }
      if (r < rows - 1) out += '\n';
    }
    pre.textContent = out;
  };

  const loop = opts.isStatic
    ? null
    : makeLoop(host, (now) => {
        if (!t0) t0 = now;
        draw(now - t0);
      }, 1000 / FRAME);

  const onMove = (e: PointerEvent) => {
    const r = pre.getBoundingClientRect();
    const fs = r.height / rows;
    ptr.x = (e.clientX - r.left) / (fs * charRatio);
    ptr.y = (e.clientY - r.top) / fs;
    ptr.on = true;
  };
  const onLeave = () => (ptr.on = false);
  if (!opts.isStatic) {
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave);
  }

  resize();
  return {
    pause: (p) => loop?.pause(p),
    resize: () => {
      resize();
      draw(opts.isStatic ? 1.2 : performance.now() / 1000 - t0);
    },
    render: () => draw(1.2),
    setReveal: (v) => (reveal = v),
    dispose: () => {
      loop?.stop();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      rt?.dispose();
      renderer.dispose();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Format: NYC skyline silhouette in density characters                */
/* ------------------------------------------------------------------ */
type Bldg = { x0: number; x1: number; h: number; layer: 0 | 1; steps: number; spire: number };

export function createSkyField(pre: HTMLElement, host: HTMLElement, opts: { isStatic: boolean }): Field {
  let cols = 0;
  let rows = 0;
  let heights: Float32Array = new Float32Array(0);
  let bl: Bldg[] = [];
  let grow = opts.isStatic ? 1 : 0;
  let lit = new Uint8Array(0);

  const build = () => {
    let seed = 4242;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    bl = [];
    // back layer: taller, lighter; front layer: shorter, denser
    for (const layer of [0, 1] as const) {
      let x = -2;
      while (x < cols) {
        const w = Math.max(3, Math.round((layer ? 4 : 5) + rnd() * (layer ? 7 : 9)) * (cols < 90 ? 0.7 : 1));
        const base = layer ? 0.12 + rnd() * 0.3 : 0.28 + rnd() * 0.36;
        bl.push({ x0: Math.round(x), x1: Math.round(x + w), h: base, layer, steps: rnd() < 0.3 ? 2 : 0, spire: 0 });
        x += w + (rnd() < 0.25 ? 1 : 0);
      }
    }
    // landmarks: a stepped spire tower (midtown) and a tapered tower (downtown)
    const lm = (fx: number, w: number, h: number, steps: number, spire: number) => {
      const x0 = Math.round(cols * fx - w / 2);
      bl.push({ x0, x1: x0 + w, h, layer: 0, steps, spire });
    };
    lm(0.6, cols < 90 ? 7 : 11, 0.74, 3, 0.12);
    lm(0.84, cols < 90 ? 6 : 9, 0.82, 4, 0.1);
    lm(0.33, cols < 90 ? 5 : 8, 0.62, 2, 0.05);
    lit = new Uint8Array(cols * rows);
    for (let i = 0; i < lit.length; i++) lit[i] = rnd() < 0.42 ? 1 : 0;
  };

  const resize = () => {
    const W = host.clientWidth || window.innerWidth;
    const H = host.clientHeight || 400;
    cols = W < 768 ? 60 : Math.max(96, Math.min(150, Math.round(W / 10)));
    const fs = W / (cols * charRatio);
    rows = Math.min(110, Math.ceil(H / fs));
    pre.style.setProperty('--fs', `${fs}px`);
    heights = new Float32Array(cols);
    build();
  };

  const draw = () => {
    // flicker a few windows
    if (!opts.isStatic) for (let i = 0; i < 18; i++) lit[(Math.random() * lit.length) | 0] ^= 1;
    const g = grow;
    const ease = (v: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, v)), 3);
    const cell: string[] = new Array(cols * rows).fill(' ');
    // back layer (0: taller, lighter glyphs) first, then the front layer (1) over it
    for (const L of [bl.filter((b) => b.layer === 0), bl.filter((b) => b.layer === 1)]) {
      for (const b of L) {
        const delay = (b.x0 / cols) * 0.35;
        const hh = Math.round(b.h * rows * ease((g - delay) / 0.65));
        if (hh <= 0) continue;
        const w = b.x1 - b.x0;
        for (let c = Math.max(0, b.x0); c < Math.min(cols, b.x1); c++) {
          const lc = c - b.x0;
          // setbacks: inner columns rise higher in steps
          let top = hh;
          if (b.steps) {
            const edge = Math.min(lc, w - 1 - lc);
            const stepW = Math.max(1, Math.floor(w / (2 * b.steps + 1)));
            top = Math.round(hh * (1 - 0.12 * (b.steps - Math.min(b.steps, Math.floor(edge / stepW)))));
          }
          for (let rb = 0; rb < top && rb < rows; rb++) {
            const r = rows - 1 - rb;
            const k = r * cols + c;
            let ch: string;
            const back = b.layer === 0;
            if (rb === top - 1) ch = back ? '-' : '=';
            else if (lc === 0) ch = back ? ':' : '[';
            else if (lc === w - 1) ch = back ? ':' : ']';
            else if (lc % 2 === 1 && rb % 2 === 1 && rb < top - 2) ch = lit[k] ? (back ? '+' : ((c + rb) % 3 ? '0' : '1')) : back ? '.' : ' ';
            else ch = back ? (rb % 3 === 0 ? '-' : ':') : (rb % 4 === 0 ? '{' : lc % 3 === 0 ? '(' : ';');
            cell[k] = ch;
          }
          // spire
          if (b.spire && lc === Math.floor(w / 2)) {
            const sp = Math.round(b.spire * rows * ease((g - delay - 0.2) / 0.5));
            for (let s = 0; s < sp; s++) {
              const rb = top + s;
              if (rb >= rows) break;
              cell[(rows - 1 - rb) * cols + c] = s === sp - 1 ? '*' : '/';
            }
          }
        }
      }
    }
    // street line
    for (let c = 0; c < cols; c++) if (cell[(rows - 1) * cols + c] === ' ') cell[(rows - 1) * cols + c] = '_';
    let out = '';
    for (let r = 0; r < rows; r++) {
      out += cell.slice(r * cols, (r + 1) * cols).join('');
      if (r < rows - 1) out += '\n';
    }
    pre.textContent = out;
  };

  const loop = opts.isStatic ? null : makeLoop(host, () => draw(), 12);
  resize();
  draw();
  return {
    pause: (p) => loop?.pause(p),
    resize: () => {
      resize();
      draw();
    },
    render: draw,
    setReveal: () => {},
    setGrow: (v) => {
      grow = v;
      if (opts.isStatic) draw();
    },
    dispose: () => loop?.stop(),
  };
}

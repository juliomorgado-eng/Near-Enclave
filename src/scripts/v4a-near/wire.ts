// v4A-near · hero wireframe enclave. A nested cube drawn as LineSegments (1px warm-black),
// orthographic camera so it reads as an isometric line drawing, not a rendered solid.
import * as THREE from 'three';

export type Wire = { pause: (p: boolean) => void; setPointer: (x: number, y: number) => void; dispose: () => void };

export function createWire(canvas: HTMLCanvasElement, opts: { isStatic: boolean }): Wire {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 20);
  cam.position.set(0, 0, 8);

  const mat = new THREE.LineBasicMaterial({ color: 0x1c1917 });
  const soft = new THREE.LineBasicMaterial({ color: 0xaba29d });
  const group = new THREE.Group();

  // outer enclave: a slab-ish cube
  const outer = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5, 1.5, 1.5)), mat);
  // inner core
  const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.62, 0.62, 0.62)), mat);
  // struts from inner to outer corners
  const s = 0.75;
  const t = 0.31;
  const pts: number[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push(x * t, y * t, z * t, x * s, y * s, z * s);
  const strutGeo = new THREE.BufferGeometry();
  strutGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const struts = new THREE.LineSegments(strutGeo, soft);
  // face hatch on the outer top face: a few parallel lines (135° feel)
  const hp: number[] = [];
  for (let i = -3; i <= 3; i++) {
    const o = i * 0.2;
    const a = Math.max(-s, -s + o);
    const b = Math.min(s, s + o);
    hp.push(a, s, a - o, b, s, b - o);
  }
  const hatchGeo = new THREE.BufferGeometry();
  hatchGeo.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
  const hatch = new THREE.LineSegments(hatchGeo, soft);
  group.add(outer, inner, struts, hatch);
  group.rotation.set(0.6, 0.78, 0);
  scene.add(group);

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    renderer.setSize(r.width, r.height, false);
  };
  resize();
  const ro = new ResizeObserver(() => {
    resize();
    if (opts.isStatic || paused) renderer.render(scene, cam);
  });
  ro.observe(canvas);

  let paused = false;
  let visible = true;
  let raf = 0;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  let spin = 0.78;
  let last = performance.now();

  const frame = (now: number) => {
    raf = 0;
    if (paused || !visible) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    spin += dt * 0.22;
    ptr.x += (ptr.tx - ptr.x) * 0.06;
    ptr.y += (ptr.ty - ptr.y) * 0.06;
    group.rotation.y = spin + ptr.x * 0.6;
    group.rotation.x = 0.6 + ptr.y * 0.45;
    inner.rotation.y = -spin * 1.6;
    inner.rotation.x = spin * 0.8;
    renderer.render(scene, cam);
    raf = requestAnimationFrame(frame);
  };
  const run = () => {
    if (opts.isStatic || paused || !visible || raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  renderer.render(scene, cam);

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    run();
  });
  io.observe(canvas);
  const onVis = () => {
    paused = document.hidden;
    run();
  };
  document.addEventListener('visibilitychange', onVis);
  run();

  return {
    pause(p) {
      paused = p;
      run();
    },
    setPointer(x, y) {
      ptr.tx = (x / window.innerWidth) * 2 - 1;
      ptr.ty = (y / window.innerHeight) * 2 - 1;
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      renderer.dispose();
    },
  };
}

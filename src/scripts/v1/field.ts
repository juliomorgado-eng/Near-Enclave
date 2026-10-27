// Flowing 4-colour domain-warped noise field (WebGL1). Rendered inside the
// hero aperture. Pauses offscreen, DPR capped at 2, static frame for reduced motion.

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_time;
uniform float u_open;
const vec3 G = vec3(0.396, 0.835, 0.431);
const vec3 S = vec3(0.349, 0.761, 0.910);
const vec3 C = vec3(0.976, 0.514, 0.447);
const vec3 A = vec3(0.945, 0.694, 0.224);
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02; a *= 0.5; }
  return v;
}
vec3 pal(float h){
  h = fract(h) * 4.0;
  float k = smoothstep(0.0, 1.0, fract(h));
  if (h < 1.0) return mix(G, S, k);
  if (h < 2.0) return mix(S, C, k);
  if (h < 3.0) return mix(C, A, k);
  return mix(A, G, k);
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) * 1.35;
  float t = u_time * 0.055;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.2 * q + vec2(1.7, 9.2) + t * 1.4), fbm(p + 3.2 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p + 2.6 * r);
  vec3 col = pal(f * 1.5 + uv.x * 0.45 - t * 0.6 + length(q) * 0.4);
  col *= 0.78 + 0.42 * f;
  float vein = smoothstep(0.62, 1.05, length(r - q));
  col = mix(col, vec3(0.0), vein * (0.55 - 0.3 * u_open));
  // vertical light leak at the slit centre
  float c = 1.0 - abs(uv.x - 0.5) * 2.0;
  col += pow(c, 8.0) * 0.12;
  gl_FragColor = vec4(col, 1.0);
}`;

export function initField(canvas: HTMLCanvasElement | null, reduce: boolean) {
  if (!canvas) return { setOpen: (_: number) => {} };
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return { setOpen: (_: number) => {} }; // CSS gradient fallback shows through

  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { setOpen: (_: number) => {} };
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uOpen = gl.getUniformLocation(prog, 'u_open');

  let open = 0;
  let visible = true;
  let raf = 0;
  const t0 = performance.now();
  // The field is soft, so render below native resolution; DPR capped at 2.
  const scale = () => Math.min(window.devicePixelRatio || 1, 2) * 0.6;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const s = scale();
    const w = Math.max(1, Math.round(r.width * s));
    const h = Math.max(1, Math.round(r.height * s));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform2f(uRes, w, h);
    if (reduce || !visible) draw(reduce ? 24000 : performance.now() - t0);
  };

  const draw = (ms: number) => {
    gl.uniform1f(uTime, ms / 1000 + 12.0);
    gl.uniform1f(uOpen, open);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const loop = (now: number) => {
    draw(now - t0);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (reduce || raf) return;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  new ResizeObserver(resize).observe(canvas);
  resize();

  if (reduce) {
    draw(24000);
  } else {
    new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        visible ? start() : stop();
      },
      { rootMargin: '100px' },
    ).observe(canvas);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : visible && start()));
  }

  return {
    setOpen(v: number) {
      open = v;
    },
  };
}

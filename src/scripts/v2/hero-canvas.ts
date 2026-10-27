// Hero background: slow domain-warped noise "mesh" in near.org accents (green / teal / purple).
// WebGL1, rendered at half resolution (DPR capped at 2), paused when offscreen or tab hidden.
// Falls back silently to the CSS radial gradients on .hero__bg.

const VERT = `
attribute vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_t;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv; p.x *= u_res.x / u_res.y;
  float t = u_t * 0.035;

  vec2 q = vec2(fbm(p * 1.1 + vec2(t, -t * 0.6)), fbm(p * 1.1 + vec2(-t * 0.8, t) + 5.2));
  vec2 r = vec2(fbm(p * 1.3 + q * 1.8 + vec2(1.7, 9.2) + t * 0.5), fbm(p * 1.3 + q * 1.8 + vec2(8.3, 2.8) - t * 0.4));
  float n = fbm(p * 1.2 + r * 1.6);

  vec3 green  = vec3(0.0, 0.925, 0.592);
  vec3 teal   = vec3(0.090, 0.851, 0.831);
  vec3 purple = vec3(0.592, 0.592, 1.0);

  vec3 col = mix(purple, teal, smoothstep(0.25, 0.75, q.x));
  col = mix(col, green, smoothstep(0.45, 0.8, r.y));

  // Glow weighted to the right / lower area so the headline stays on deep black.
  float weight = smoothstep(0.05, 1.0, uv.x * 0.9 + (1.0 - uv.y) * 0.35);
  float m = smoothstep(0.38, 0.82, n) * weight;
  vec3 c = col * m * 0.78;

  // Fine dithering to avoid banding.
  c += (hash(gl_FragCoord.xy + u_t) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

export function initHeroCanvas(reduce: boolean) {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-hero-canvas]');
  if (!canvas) return;
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    }) as WebGLRenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) {
    canvas.remove();
    return;
  }

  const compile = (type: number, src: string) => {
    const s = gl!.createShader(type)!;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
      gl!.deleteShader(s);
      return null;
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    canvas.remove();
    return;
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    canvas.remove();
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uT = gl.getUniformLocation(prog, 'u_t');

  const SCALE = 0.5; // soft field; half-res is indistinguishable and far cheaper
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr * SCALE));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr * SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl!.viewport(0, 0, w, h);
    }
    gl!.uniform2f(uRes, w, h);
  };

  const t0 = performance.now();
  const startOffset = 40; // seconds; skip the uniform-looking first frames
  const draw = (now: number) => {
    gl!.uniform1f(uT, startOffset + (now - t0) / 1000);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  };

  resize();
  draw(t0);
  requestAnimationFrame(() => canvas.classList.add('is-ready'));

  let running = false;
  const ro = new ResizeObserver(() => {
    resize();
    if (reduce || !running) draw(performance.now());
  });
  ro.observe(canvas);

  if (reduce) return; // single static frame

  let inView = true;
  let raf = 0;
  const loop = (now: number) => {
    draw(now);
    raf = requestAnimationFrame(loop);
  };
  const update = () => {
    const should = inView && !document.hidden;
    if (should && !running) {
      running = true;
      raf = requestAnimationFrame(loop);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  };
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    update();
  }).observe(canvas);
  document.addEventListener('visibilitychange', update);
  update();
}

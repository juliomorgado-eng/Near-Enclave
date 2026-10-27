// APERTURE — one fixed WebGL canvas that only ever paints inside a moving rectangle.
// The ciphertext field lives "under the paper" in screen space; the aperture is the
// window cut into the page through which you see it. Outside the rect: transparent.
// Raw WebGL1, 2 draw calls, scissor-clipped, DPR capped, paused when hidden.

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const BG_VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
const BG_FRAG = `${PRECISION}
uniform vec4 uRect;   // device px, GL origin (x, y, w, h)
uniform float uFlash;
void main(){
  vec2 q = (gl_FragCoord.xy - uRect.xy) / max(uRect.zw, vec2(1.0));
  vec2 c = (q - 0.5) * vec2(uRect.z / max(uRect.w, 1.0), 1.0);
  float glow = exp(-dot(c, c) * 1.6);
  vec3 col = vec3(0.0) + vec3(0.075, 0.072, 0.066) * glow;
  // faint scan lines, v1 signature
  col *= 0.94 + 0.06 * step(1.5, mod(gl_FragCoord.y, 3.0));
  col += vec3(0.04) * uFlash;
  gl_FragColor = vec4(col, 1.0);
}`;

const PT_VERT = `
attribute vec2 aP;
attribute vec4 aI; // seed, glyph, speed (depth), bright
uniform vec2 uView;   // css px
uniform float uDpr;
uniform vec2 uFlow;   // accumulated drift, css px
uniform float uScroll;
uniform vec2 uMouse;  // css px, y down
uniform float uTime;
uniform float uLane;  // 0 field → 1 reading tape
uniform vec2 uBand;   // tape centre y, tape height (css px)
uniform float uFlash;
uniform float uDim;
varying float vGlyph;
varying float vA;
varying float vB;
void main(){
  float seed = aI.x;
  float sp = aI.z;
  vec2 tile = uView + 80.0;
  vec2 p = aP * tile;
  p.x += uFlow.x * sp;
  p.y -= uFlow.y * sp + uScroll * 0.28 * sp;
  p = mod(p, tile) - 40.0;
  // reading tape: a subset of glyphs collapses into the slit band
  float inBand = step(seed, 0.16) * uLane;
  p.y = mix(p.y, uBand.x + (fract(seed * 91.7) - 0.5) * uBand.y * 0.7, inBand);
  // soft cursor repel
  vec2 d = p - uMouse;
  float l = length(d);
  float f = 1.0 - smoothstep(0.0, 150.0, l);
  p += (d / max(l, 0.001)) * f * f * 22.0;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  gl_PointSize = mix(9.0 + sp * 7.0, 12.0, inBand) * uDpr;
  vGlyph = mod(aI.y + floor(uTime * 0.55 + seed * 13.0) * 7.0, 64.0);
  float a = mix(0.16, 0.5, sp);
  a = mix(a, 0.9, aI.w);
  a = mix(a, 0.75, inBand);
  vA = clamp(a * uDim + f * 0.45 + uFlash * 0.35, 0.0, 1.0);
  vB = max(aI.w, f);
}`;

const PT_FRAG = `${PRECISION}
uniform sampler2D uAtlas;
varying float vGlyph;
varying float vA;
varying float vB;
void main(){
  vec2 cell = vec2(mod(vGlyph, 8.0), floor(vGlyph / 8.0));
  vec2 uv = vec2((cell.x + gl_PointCoord.x) / 8.0, (cell.y + gl_PointCoord.y) / 8.0);
  float a = texture2D(uAtlas, uv).a * vA;
  if (a < 0.01) discard;
  vec3 cream = vec3(0.922, 0.890, 0.827);
  gl_FragColor = vec4(mix(cream, vec3(1.0), vB), a);
}`;

const GLYPHS = '0123456789ABCDEF$#/\\+×≡<>%◇·:=*NEAR§¥€£∑∆{}[]01#$/+×≡<>%·:=*0110ABCDEF7%$#';

export type Rect = { x: number; y: number; w: number; h: number };

export type Aperture = {
  setRect(r: Rect | null): void;
  setPointer(x: number, y: number): void;
  setLane(v: number): void;
  flash(): void;
  frame(dt: number, scrollY: number): void;
  ready(): void;
  dispose(): void;
};

export function createAperture(canvas: HTMLCanvasElement, opts: { lowTier: boolean; isStatic: boolean }): Aperture {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' });
  if (!gl) throw new Error('no webgl');

  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const prog = (v: string, f: string) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, v));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
    return p;
  };
  const bgP = prog(BG_VERT, BG_FRAG);
  const ptP = prog(PT_VERT, PT_FRAG);

  // background triangle
  const tri = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const bgLoc = gl.getAttribLocation(bgP, 'p');

  // glyph points
  const N = opts.lowTier ? 1300 : 3000;
  const P = new Float32Array(N * 2);
  const I = new Float32Array(N * 4);
  let s = 1234567;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    P[i * 2] = r();
    P[i * 2 + 1] = r();
    const seed = r();
    I[i * 4] = seed;
    I[i * 4 + 1] = Math.floor(r() * 64);
    I[i * 4 + 2] = 0.35 + Math.pow(r(), 1.6) * 0.65;
    I[i * 4 + 3] = r() < 0.05 ? 1 : 0;
  }
  const bP = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bP);
  gl.bufferData(gl.ARRAY_BUFFER, P, gl.STATIC_DRAW);
  const bI = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bI);
  gl.bufferData(gl.ARRAY_BUFFER, I, gl.STATIC_DRAW);
  const aP = gl.getAttribLocation(ptP, 'aP');
  const aI = gl.getAttribLocation(ptP, 'aI');

  const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const u = {
    rect: U(bgP, 'uRect'),
    bgFlash: U(bgP, 'uFlash'),
    view: U(ptP, 'uView'),
    dpr: U(ptP, 'uDpr'),
    flow: U(ptP, 'uFlow'),
    scroll: U(ptP, 'uScroll'),
    mouse: U(ptP, 'uMouse'),
    time: U(ptP, 'uTime'),
    lane: U(ptP, 'uLane'),
    band: U(ptP, 'uBand'),
    flash: U(ptP, 'uFlash'),
    dim: U(ptP, 'uDim'),
    atlas: U(ptP, 'uAtlas'),
  };

  // glyph atlas (8×8 cells); drawn once fonts are ready
  const tex = gl.createTexture();
  let atlasOk = false;
  const buildAtlas = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d')!;
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = '500 38px "Roboto Mono", ui-monospace, monospace';
    for (let i = 0; i < 64; i++) {
      x.fillText(GLYPHS[i % GLYPHS.length], (i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 34);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    atlasOk = true;
  };

  let W = 1;
  let H = 1;
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, opts.lowTier ? 1.25 : 1.75);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener('resize', resize);

  let rect: Rect | null = null;
  let mx = -9999;
  let my = -9999;
  let tmx = -9999;
  let tmy = -9999;
  let lane = 0;
  let flash = 0;
  let time = 7;
  let fx = 0;
  let fy = 0;
  let paused = false;

  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const draw = (scrollY: number) => {
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!rect || rect.w < 1 || rect.h < 0.5) return;
    if (rect.y > H || rect.y + rect.h < 0 || rect.x > W || rect.x + rect.w < 0) return;
    const x = Math.round(rect.x * dpr);
    const y = Math.round((H - rect.y - rect.h) * dpr);
    const w = Math.max(1, Math.round(rect.w * dpr));
    const h = Math.max(1, Math.round(rect.h * dpr));
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x, y, w, h);

    gl.useProgram(bgP);
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.enableVertexAttribArray(bgLoc);
    gl.vertexAttribPointer(bgLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f(u.rect, x, y, w, h);
    gl.uniform1f(u.bgFlash, flash);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(bgLoc);

    if (!atlasOk) return;
    gl.useProgram(ptP);
    gl.bindBuffer(gl.ARRAY_BUFFER, bP);
    gl.enableVertexAttribArray(aP);
    gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bI);
    gl.enableVertexAttribArray(aI);
    gl.vertexAttribPointer(aI, 4, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u.atlas, 0);
    gl.uniform2f(u.view, W, H);
    gl.uniform1f(u.dpr, dpr);
    gl.uniform2f(u.flow, fx, fy);
    gl.uniform1f(u.scroll, scrollY);
    gl.uniform2f(u.mouse, mx, my);
    gl.uniform1f(u.time, time);
    gl.uniform1f(u.lane, lane);
    gl.uniform2f(u.band, rect.y + rect.h / 2, rect.h);
    // when the window fills the screen (copy on top), the field steps back
    const area = (rect.w * rect.h) / (W * H);
    gl.uniform1f(u.dim, 1 - 0.45 * Math.min(1, Math.max(0, (area - 0.3) / 0.5)));
    gl.uniform1f(u.flash, flash);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.disableVertexAttribArray(aP);
    gl.disableVertexAttribArray(aI);
  };

  const onVis = () => (paused = document.hidden);
  document.addEventListener('visibilitychange', onVis);

  return {
    setRect(r) {
      rect = r;
    },
    setPointer(x, y) {
      tmx = x;
      tmy = y;
      if (mx < -999) {
        mx = x;
        my = y;
      }
    },
    setLane(v) {
      lane = v;
    },
    flash() {
      flash = 1;
    },
    ready() {
      buildAtlas();
    },
    frame(dt, scrollY) {
      if (paused) return;
      if (!opts.isStatic) {
        const d = Math.min(dt, 0.05);
        time += d;
        // slow drift (~1/3 of v3); the reading tape runs faster
        fx += d * (5 + 70 * lane);
        fy += d * 4 * (1 - lane);
        const k = 1 - Math.exp(-d * 4);
        mx += (tmx - mx) * k;
        my += (tmy - my) * k;
        flash *= Math.exp(-d * 3);
      }
      draw(scrollY);
    },
    dispose() {
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

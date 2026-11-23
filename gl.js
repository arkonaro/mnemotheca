// WebGL renderer for the field.
// Pass 1 draws every visible plate as a textured quad; the plate under the
// cursor is "liquified" (a flowing distortion that follows the pointer).
// Pass 2 draws that scene to the screen through a band of liquid glass along
// the four edges of the window.

const VS = `
attribute vec2 aPos;
uniform vec4 uRect;      // x, y, w, h in px
uniform vec2 uView;      // viewport px
varying vec2 vUv;
void main() {
  vUv = aPos;
  vec2 p = uRect.xy + aPos * uRect.zw;
  vec2 clip = (p / uView) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}
vec3 permute(vec3 x){return mod289(((x*34.)+1.)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.); m=m*m; m=m*m;
  vec3 x=2.*fract(p*C.www)-1.; vec3 h=abs(x)-.5; vec3 ox=floor(x+.5); vec3 a0=x-ox;
  m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.*dot(m,g);
}`;

const FS_PLATE = `
precision mediump float;
uniform sampler2D uTex;
uniform float uHover;    // 0..1, eased
uniform vec2 uMouse;     // pointer in plate uv
uniform vec2 uVel;       // pointer velocity (uv per frame, smoothed)
uniform float uTime;
uniform float uAspect;   // w / h
uniform float uAlpha;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 uv = vUv;
  vec2 d = (uv - uMouse) * vec2(uAspect, 1.0);
  float r = length(d);
  float fall = smoothstep(0.55, 0.0, r) * uHover;
  // liquid flow: two octaves of moving noise, stronger near the pointer
  float t = uTime * 0.6;
  vec2 flow = vec2(snoise(uv * 3.0 + vec2(t, -t * 0.7)), snoise(uv * 3.0 + vec2(-t * 0.8, t) + 7.3));
  flow += 0.5 * vec2(snoise(uv * 7.0 - t), snoise(uv * 7.0 + t + 3.1));
  vec2 off = flow * 0.035 * fall;
  // the pointer drags the surface with it, like a finger in paint
  off -= uVel * 6.0 * fall;
  // a soft swelling lens right under the pointer
  off -= d / vec2(uAspect, 1.0) * 0.12 * fall * smoothstep(0.3, 0.0, r);
  vec2 p = clamp(uv + off, 0.001, 0.999);
  float ca = 0.006 * fall;
  vec3 col;
  col.r = texture2D(uTex, clamp(p + vec2(ca, 0.0), 0.001, 0.999)).r;
  col.g = texture2D(uTex, p).g;
  col.b = texture2D(uTex, clamp(p - vec2(ca, 0.0), 0.001, 0.999)).b;
  gl_FragColor = vec4(col * uAlpha + vec3(0.09, 0.086, 0.082) * (1.0 - uAlpha), 1.0);
}`;

const FS_POST = `
precision mediump float;
uniform sampler2D uScene;
uniform vec2 uView;      // px
uniform float uBand;     // glass band width, px
uniform float uTime;
uniform vec2 uCamVel;    // camera velocity px/frame
varying vec2 vUv;
${NOISE}
// vUv and offsets are top-down; the scene texture is stored bottom-up
vec4 scene(vec2 uv) { return texture2D(uScene, vec2(uv.x, 1.0 - uv.y)); }
void main() {
  vec2 px = vUv * uView;
  float dl = px.x, dr = uView.x - px.x, dt = px.y, db = uView.y - px.y;
  float e = min(min(dl, dr), min(dt, db));
  float k = smoothstep(uBand, 0.0, e);            // 0 inside, 1 at the edge
  // inward normal of the nearest edge
  vec2 n = (e == dl) ? vec2(1., 0.) : (e == dr) ? vec2(-1., 0.) : (e == dt) ? vec2(0., 1.) : vec2(0., -1.);
  float t = uTime * 0.25;
  float wob = snoise(px / 140.0 + vec2(t, -t)) + 0.5 * snoise(px / 55.0 - vec2(t * 1.7, t));
  float drag = clamp(length(uCamVel) / 25.0, 0.0, 1.0);
  // refraction: the glass bends what is underneath toward the inside, and ripples
  vec2 off = n * (k * k) * uBand * 0.55;
  off += vec2(wob, snoise(px / 140.0 + 9.1 + t)) * k * (6.0 + 14.0 * drag);
  off -= uCamVel * k * 0.8;
  vec2 uv = (px + off) / uView;
  float ca = k * 2.5 / uView.x;
  vec3 col;
  col.r = scene(uv + n * ca).r;
  col.g = scene(uv).g;
  col.b = scene(uv - n * ca).b;
  // a little frost inside the glass
  vec3 blur = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.5708 + wob;
    blur += scene(uv + vec2(cos(a), sin(a)) * k * 4.0 / uView).rgb;
  }
  col = mix(col, blur * 0.25, k * 0.5);
  // the lit rim of the glass where it meets the open field
  float rim = smoothstep(0.08, 0.0, abs(k - 0.12)) * 0.05 + k * k * 0.04;
  col += vec3(rim);
  gl_FragColor = vec4(col, 1.0);
}`;

const VS_FULL = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = vec2(aPos.x, 1.0 - aPos.y); gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const loc = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); loc[u.name] = gl.getUniformLocation(p, u.name); }
  loc.aPos = gl.getAttribLocation(p, 'aPos');
  return { p, loc };
}

export class FieldGL {
  constructor(canvas, { reduced = false } = {}) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('no webgl');
    this.gl = gl; this.canvas = canvas; this.reduced = reduced;
    this.plate = program(gl, VS, FS_PLATE);
    this.post = program(gl, VS_FULL, FS_POST);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    this.fbo = gl.createFramebuffer();
    this.sceneTex = gl.createTexture();
    this.resize();
  }

  resize() {
    const gl = this.gl, dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = innerWidth; this.h = innerHeight;
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`; this.canvas.style.height = `${this.h}px`;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.texParams();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  texParams() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  texture(img) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.texParams();
    return t;
  }

  bindQuad(loc) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);
  }

  // plates: [{x, y, w, h, tex, hover, mouse:[u,v], vel:[u,v], alpha}]
  render(plates, time, camVel) {
    const gl = this.gl, { w, h, dpr } = this;
    // pass 1: the field
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.09, 0.086, 0.082, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const P = this.plate;
    gl.useProgram(P.p); this.bindQuad(P.loc);
    gl.uniform2f(P.loc.uView, w, h);
    gl.uniform1f(P.loc.uTime, time);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(P.loc.uTex, 0);
    for (const q of plates) {
      if (!q.tex) continue;
      gl.bindTexture(gl.TEXTURE_2D, q.tex);
      gl.uniform4f(P.loc.uRect, q.x, q.y, q.w, q.h);
      gl.uniform1f(P.loc.uHover, this.reduced ? q.hover * 0.3 : q.hover);
      gl.uniform2f(P.loc.uMouse, q.mouse[0], q.mouse[1]);
      gl.uniform2f(P.loc.uVel, q.vel[0], q.vel[1]);
      gl.uniform1f(P.loc.uAspect, q.w / q.h);
      gl.uniform1f(P.loc.uAlpha, q.alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    // pass 2: through the glass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const Q = this.post;
    gl.useProgram(Q.p); this.bindQuad(Q.loc);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(Q.loc.uScene, 0);
    gl.uniform2f(Q.loc.uView, w, h);
    gl.uniform1f(Q.loc.uBand, w < 700 ? 34 : 64);
    gl.uniform1f(Q.loc.uTime, this.reduced ? 0 : time);
    gl.uniform2f(Q.loc.uCamVel, camVel[0], camVel[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

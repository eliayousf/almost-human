/**
 * Datamosh burst for the character portrait panel only.
 *
 * One shared WebGL2 context on one canvas, moved into whichever portrait frame
 * bursts. Both portraits live in one texture atlas uploaded once. The render
 * loop runs only for the 300-600ms burst; uniforms are set with scalar calls
 * and the loop is a pre-bound method, so frames allocate nothing.
 *
 * Callers fall back to the CSS slice burst when burst() resolves false (no
 * WebGL2, software rendering, low-memory device, context loss, tainted atlas).
 * Under prefers-reduced-motion nothing runs at all.
 */
import { ATLAS_ORDER, PORTRAITS, type PortraitAsset } from "../assets/portraits";
import { prefersReducedMotion } from "./motion";

const CELL_W = 512;
const CELL_H = 640; // 4:5 plate
const PLATE_ASPECT = CELL_W / CELL_H;

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec4 uCell;   // atlas cell origin.xy, size.zw
uniform vec4 uMap;    // frame uv -> plate uv: scale.xy, offset.zw
uniform float uI;     // intensity 0..1
uniform float uSeed;
uniform vec2 uDir;    // dominant motion direction for this burst

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 13.17) * 43758.5453); }
vec3 tap(vec2 uv) { return texture(uTex, uCell.xy + clamp(uv, 0.002, 0.998) * uCell.zw).rgb; }

void main() {
  vec2 uv = vUv * uMap.xy + uMap.zw;
  vec2 grid = vec2(16.0, 20.0);
  vec2 block = floor(uv * grid);
  float r = hash(block);
  float r2 = hash(block + 7.31);
  float row = hash(vec2(3.7, block.y));
  // Motion vectors: rows drift together, individual macroblocks jitter.
  float moved = step(r, 0.2 + 0.65 * uI);
  vec2 mv = (uDir * (0.4 + row) + vec2(r2 - 0.5, r - 0.5) * 0.5) * uI * 0.16 * moved;
  vec2 src = uv - mv;
  // Smear along the vector, like a P-frame bleeding without its keyframe.
  vec3 c = vec3(0.0);
  for (int i = 0; i < 6; i++) c += tap(src - mv * (float(i) * 0.3));
  c /= 6.0;
  // Stale macroblocks hold a block from further back along the vector.
  float stale = step(1.0 - 0.3 * uI, r2);
  c = mix(c, tap((block + 0.5) / grid - mv * 2.5), stale);
  float s = uI * 0.014;
  c.r = mix(c.r, tap(src + vec2(s, 0.0)).r, 0.65);
  c.b = mix(c.b, tap(src - vec2(s, 0.0)).b, 0.65);
  outColor = vec4(c, 1.0);
}`;

type Uniforms = Record<"cell" | "map" | "i" | "seed" | "dir", WebGLUniformLocation | null>;

class DatamoshEngine {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private u: Uniforms | null = null;
  private failed = false;
  private atlas: Promise<boolean> | null = null;
  private raf = 0;
  private start = 0;
  private duration = 0;
  private lastSeedStep = -1;
  private host: HTMLElement | null = null;

  constructor() {
    this.frame = this.frame.bind(this);
  }

  /** True when the WebGL path can run; creates the shared context lazily. */
  available(): boolean {
    if (this.failed) return false;
    if (this.gl) return true;
    try {
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      if (memory !== undefined && memory < 2) throw new Error("low-power device");
      const canvas = document.createElement("canvas");
      canvas.className = "mosh-canvas";
      canvas.setAttribute("aria-hidden", "true");
      const gl = canvas.getContext("webgl2", {
        alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, preserveDrawingBuffer: false,
        powerPreference: "low-power", failIfMajorPerformanceCaveat: true,
      });
      if (!gl) throw new Error("no webgl2");
      const program = link(gl);
      gl.useProgram(program);
      this.u = {
        cell: gl.getUniformLocation(program, "uCell"),
        map: gl.getUniformLocation(program, "uMap"),
        i: gl.getUniformLocation(program, "uI"),
        seed: gl.getUniformLocation(program, "uSeed"),
        dir: gl.getUniformLocation(program, "uDir"),
      };
      gl.bindVertexArray(gl.createVertexArray());
      canvas.addEventListener("webglcontextlost", event => {
        event.preventDefault();
        this.cancel();
        this.failed = true;
      });
      this.canvas = canvas;
      this.gl = gl;
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  /** Load both portraits into one atlas texture, once. */
  prepare(): Promise<boolean> {
    if (!this.available()) return Promise.resolve(false);
    return this.atlas ??= (async () => {
      try {
        const images = await Promise.all(ATLAS_ORDER.map(key => load(PORTRAITS[key])));
        const scratch = document.createElement("canvas");
        scratch.width = CELL_W * images.length;
        scratch.height = CELL_H;
        const context = scratch.getContext("2d");
        if (!context) return false;
        images.forEach((image, index) => context.drawImage(image, index * CELL_W, 0, CELL_W, CELL_H));
        const gl = this.gl!;
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // Throws SecurityError if the atlas is tainted; caller then falls back.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, scratch);
        scratch.width = scratch.height = 0;
        return true;
      } catch {
        this.failed = true;
        return false;
      }
    })();
  }

  /**
   * Burst over `host` (a portrait frame). Resolves false when the caller should
   * run the CSS fallback instead.
   */
  async burst(host: HTMLElement, key: PortraitAsset["key"], durationMs: number): Promise<boolean> {
    if (prefersReducedMotion()) return true; // nothing runs, nothing to fall back to
    if (!(await this.prepare()) || !this.gl || !this.canvas || !this.u) return false;
    const gl = this.gl;
    const rect = host.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return true;
    this.cancel();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * scale);
    this.canvas.height = Math.round(rect.height * scale);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // Same "cover" math as the CSS plate: width max(frame, 0.8 x frame height), centred.
    const plateW = Math.max(rect.width, rect.height * PLATE_ASPECT);
    const plateH = plateW / PLATE_ASPECT;
    const sx = rect.width / plateW;
    const sy = rect.height / plateH;
    const cellW = 1 / ATLAS_ORDER.length;
    gl.uniform4f(this.u.cell, ATLAS_ORDER.indexOf(key) * cellW, 0, cellW, 1);
    gl.uniform4f(this.u.map, sx, sy, (1 - sx) / 2, (1 - sy) / 2);
    const angle = (Math.random() - 0.5) * 0.9 + (Math.random() < 0.5 ? 0 : Math.PI);
    gl.uniform2f(this.u.dir, Math.cos(angle), Math.sin(angle) * 0.4);
    this.host = host;
    host.appendChild(this.canvas);
    this.start = performance.now();
    this.duration = durationMs;
    this.lastSeedStep = -1;
    this.raf = requestAnimationFrame(this.frame);
    return true;
  }

  cancel(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas?.remove();
    this.host = null;
  }

  private frame(now: number): void {
    const gl = this.gl;
    const u = this.u;
    const t = (now - this.start) / this.duration;
    if (!gl || !u || t >= 1 || !this.host?.isConnected || prefersReducedMotion()) {
      this.cancel();
      return;
    }
    // Fast attack, eased release.
    const intensity = t < 0.2 ? t / 0.2 : Math.pow(1 - (t - 0.2) / 0.8, 1.6);
    const seedStep = Math.floor((now - this.start) / 50); // hold glitch frames ~3 vsyncs
    if (seedStep !== this.lastSeedStep) {
      this.lastSeedStep = seedStep;
      gl.uniform1f(u.seed, seedStep * 1.618 + (this.start % 97));
    }
    gl.uniform1f(u.i, intensity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.raf = requestAnimationFrame(this.frame);
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("shader compile failed");
  return shader;
}

function link(gl: WebGL2RenderingContext): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("program link failed");
  return program;
}

function load(asset: PortraitAsset): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => {
      if (asset.fallbackSrc && image.src !== asset.fallbackSrc) image.src = asset.fallbackSrc;
      else reject(new Error("portrait failed to load"));
    };
    image.src = asset.src;
  });
}

export const datamosh = new DatamoshEngine();
// END datamosh.ts

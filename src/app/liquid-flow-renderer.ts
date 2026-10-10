import { glyphInteriorDistance } from './liquid-distance-field';
import { TIME_COLON_GAP_EM, TIME_COLON_OFFSET_EM } from './time-typography';

// Render the liquid once to a texture, then refract that exact texture through
// the rounded distance-field surface of the numerals, clipped to each time card.
const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }
`;

const fragmentSource = `
precision highp float;
varying vec2 uv;
uniform vec2 resolution;
uniform float time;
uniform float variant;
uniform float dark;
uniform vec3 cool;
uniform vec3 glint;
uniform vec3 ink;
uniform vec3 paper;
uniform float bevelWidth;
uniform float pixelRatio;
uniform float renderPass;
uniform vec2 drift;
uniform sampler2D glyph;
uniform sampler2D bevel;
uniform sampler2D liquid;

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec4 h = fract(sin(vec4(dot(i, vec2(127.1, 311.7)),
    dot(i + vec2(1., 0.), vec2(127.1, 311.7)),
    dot(i + vec2(0., 1.), vec2(127.1, 311.7)),
    dot(i + vec2(1., 1.), vec2(127.1, 311.7)))) * 43758.5453);
  return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}

vec3 ribbon(vec3 behind, vec2 p, float center, float width, float phase, float strength) {
  float d = (p.y - center) / width;
  float body = 1. - smoothstep(.91, 1.015, abs(d));
  float fold = exp(-pow((d - .69) / .19, 2.));
  float silk = exp(-pow((d - .13) / .68, 2.));
  float edge = exp(-pow((d - .97) / .032, 2.));
  float underside = exp(-pow((d + .96) / .045, 2.));
  float light = .48 + .52 * pow(.5 + .5 * sin(p.x * 8.2 + phase), 3.);
  vec3 pearl = mix(vec3(1.), glint, .45 + dark * .25);
  vec3 tint = mix(mix(paper, cool, .33), mix(ink, cool, .18), dark);
  vec3 color = mix(behind, tint, body * mix(.62, .46, dark) * strength);
  // A translucent sheet, its broad folded surface and two separate polished
  // edges. Coloured light belongs to the sheet instead of grey Gaussian lines.
  color += cool * silk * light * strength * mix(.09, .14, dark);
  // Dark ribbons carry the accent in their folds; pearl stays on the glass.
  vec3 foldedLight = mix(pearl, mix(cool, glint, .10), dark);
  color += foldedLight * fold * light * strength * mix(.27, .44, dark);
  color += mix(mix(glint, cool, .38), mix(cool, glint, .12), dark)
    * edge * strength * mix(.28 + .36 * light, .16 + .20 * light, dark);
  color += cool * underside * strength * mix(.10, .12, dark);
  return color;
}

vec3 environment(vec2 p) {
  // Incommensurate velocities and continuous domain warping: no reset or CSS loop.
  float t = time * .78 + variant * 3.73;
  p += drift;
  vec2 warp = vec2(noise(p * vec2(2.8, 1.7) + vec2(t * .21, -t * .17)),
    noise(p * vec2(3.1, 2.2) + vec2(-t * .19, t * .23) + 8.4)) - .5;
  p += warp * vec2(.10, .24);
  float x = p.x;
  vec3 base = mix(paper, ink, dark);
  base += cool * (.018 + .032 * (.5 + .5 * sin(p.y * 3. + x * 4. - t * .17)));
  float upper = .86 + .17 * sin(x * 6.1 + 1. + t * .43)
    + .065 * sin(x * 9.2 - t * .57);
  float middle = .47 + .24 * sin(x * 5.7 + .7 - t * .37)
    + .07 * cos(x * 8.4 + t * .63);
  float lower = .16 + .20 * sin(x * 6.2 - 1. + t * .51)
    + .055 * sin(x * 9.5 - t * .41);
  float crossing = .24 + .26 * cos(x * 4.9 + 2.6 - t * .29);
  vec3 color = ribbon(base, p, upper, .15 + .045 * sin(x * 4. + t * .71), .8 + t * .49, .95);
  color = ribbon(color, p, middle, .175 + .055 * sin(x * 5. - t * .53), 2.3 - t * .67, 1.);
  color = ribbon(color, p, lower, .135 + .040 * cos(x * 4.7 + t * .61), 4.7 + t * .41, .95);
  color = ribbon(color, p, crossing, .10 + .025 * sin(t * .47 + x * 3.), 1.4 - t * .57, .62);
  return color;
}

void main() {
  if (renderPass < .5) {
    gl_FragColor = vec4(clamp(environment(uv), 0., 1.), 1.);
    return;
  }
  vec2 pixel = 1. / resolution;
  vec3 bg = texture2D(liquid, uv).rgb;
  float a = texture2D(glyph, uv).a;
  vec4 surface = texture2D(bevel, uv);
  // A tiny contact shadow separates the glass from the liquid without a glow.
  bg = mix(bg, ink, clamp(surface.g - a, 0., 1.) * mix(.24, .35, dark));
  if (a < .001) {
    gl_FragColor = vec4(clamp(bg, 0., 1.), 1.);
    return;
  }
  float distance = (surface.r * 256. + surface.b) * (32. * 255. / 65535.);
  vec2 gradient = vec2(
    dot(texture2D(bevel, uv + vec2(pixel.x * 2., 0.)).rb - texture2D(bevel, uv - vec2(pixel.x * 2., 0.)).rb, vec2(256., 1.)),
    dot(texture2D(bevel, uv + vec2(0., pixel.y * 2.)).rb - texture2D(bevel, uv - vec2(0., pixel.y * 2.)).rb, vec2(256., 1.))
  ) * (8. * pixelRatio * 255. / 65535.);
  float slope = 1. - smoothstep(0., bevelWidth, distance);
  vec2 direction = -gradient / max(length(gradient), .001);
  vec3 n = normalize(vec3(direction * slope, sqrt(max(.002, 1. - slope * slope))));
  // The bevel bends the background by up to ~12 CSS pixels; the face magnifies
  // it locally. All colour comes from the same liquid texture used outside.
  vec2 lens = uv - n.xy * pixel * pixelRatio * 16.;
  lens += gradient * pixel * pixelRatio * (1. - slope) * 5.;
  vec3 refracted = texture2D(liquid, clamp(lens, pixel, 1. - pixel)).rgb;
  // Coloured optical absorption keeps light-mode digits dark enough to read
  // while preserving changes in the actual liquid inside their glass face.
  vec3 transmitted = mix(refracted * refracted * mix(ink, cool, .38) * 1.2,
    refracted * .86 + cool * .14, dark);
  vec3 bodyTint = mix(ink * .85, cool * .32 + glint * .58, dark);
  vec3 glass = mix(transmitted, bodyTint, mix(.27, .40, dark));
  vec3 pearl = mix(glint, vec3(1.), .30);
  float key = pow(max(0., dot(n, normalize(vec3(-.48, .58, .64)))), 9.);
  float fill = pow(max(0., dot(n, normalize(vec3(.58, -.64, .54)))), 12.);
  float fresnel = pow(1. - n.z, 3.);
  float lip = exp(-distance / .72);
  float innerShade = exp(-pow((distance - 2.1) / 1.2, 2.)) * max(0., -n.y + n.x * .35);
  glass *= 1. - innerShade * .22;
  glass += pearl * (key * .74 + fill * .30 + fresnel * .20 + lip * .38);
  // The polished face reflects light; its centre transmits the moving field.
  float reflection = exp(-pow((uv.y + uv.x * .18 + n.y * .055 - .61) / .14, 2.));
  glass += mix(glint, cool, .25) * reflection * mix(.12, .15, dark);
  vec3 color = mix(bg, glass, a);
  gl_FragColor = vec4(clamp(color, 0., 1.), 1.);
}
`;

export class LiquidFlowRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly glyphTexture: WebGLTexture;
  private readonly bevelTexture: WebGLTexture;
  private readonly liquidTexture: WebGLTexture;
  private readonly liquidFramebuffer: WebGLFramebuffer;
  private readonly mask = document.createElement('canvas');
  private readonly softMask = document.createElement('canvas');
  private readonly colorSample = document.createElement('canvas');
  private readonly uniforms = new Map<string, WebGLUniformLocation>();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly resizeObserver: ResizeObserver;
  private readonly themeObserver: MutationObserver;
  private readonly intersectionObserver: IntersectionObserver;
  private frame: number | null = null;
  private value: string;
  private lastFrame = 0;
  private elapsed = 0;
  private visible = true;
  private targetDrift = [0, 0];
  private drift = [0, 0];
  private disposed = false;
  private texturesReady = false;
  private framebufferReady = false;
  private maskDirty = true;
  private ratio = 1;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly card: HTMLElement, variant: number,
    initialValue = '', private active = true) {
    this.value = initialValue;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
    if (!gl) throw new Error('Liquid flow renderer unavailable');
    this.gl = gl;
    this.colorSample.width = this.colorSample.height = 1;
    const program = gl.createProgram();
    if (!program) throw new Error('Unable to create liquid flow program');
    this.program = program;
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        gl.deleteProgram(program);
        throw new Error(error || 'Liquid flow shader failed');
      }
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(error || 'Liquid flow link failed');
    }
    gl.useProgram(program);
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.glyphTexture = this.createTexture(0);
    this.bevelTexture = this.createTexture(1);
    this.liquidTexture = this.createTexture(2);
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      gl.deleteTexture(this.glyphTexture);
      gl.deleteTexture(this.bevelTexture);
      gl.deleteTexture(this.liquidTexture);
      gl.deleteBuffer(this.buffer);
      gl.deleteProgram(program);
      throw new Error('Unable to create liquid framebuffer');
    }
    this.liquidFramebuffer = framebuffer;
    gl.uniform1i(this.location('glyph'), 0);
    gl.uniform1i(this.location('bevel'), 1);
    gl.uniform1i(this.location('liquid'), 2);
    gl.uniform1f(this.location('variant'), variant);
    this.updateTheme();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(card);
    this.themeObserver = new MutationObserver(this.updateTheme);
    const root = card.closest('app-root');
    if (root) this.themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
    this.intersectionObserver = new IntersectionObserver(entries => {
      this.visible = entries.some(entry => entry.isIntersecting);
      this.syncMotion();
    });
    this.intersectionObserver.observe(card);
    this.reducedMotion.addEventListener('change', this.syncMotion);
    document.addEventListener('visibilitychange', this.syncMotion);
    document.addEventListener('load', this.stylesheetLoaded, true);
    window.addEventListener('load', this.refreshStyles);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    // Listening never requests sensor permission. Browsers that require consent
    // deliver events only after the user has granted it; animation needs no sensor.
    window.addEventListener('deviceorientation', this.orientation, { passive: true });
    this.resize();
    if (this.disposed) return;
    // The cached surface gets one prepared frame, never a background RAF loop.
    if (!this.active) this.draw(performance.now(), true);
    card.classList.add('has-liquid-canvas');
    this.syncMotion();
    // Angular finishes host bindings after child view initialization.
    queueMicrotask(this.refreshStyles);
    const digits = card.querySelector<HTMLElement>('.result-time-value');
    if (digits) {
      const font = getComputedStyle(digits);
      const refreshNumerals = (): void => {
        if (!this.disposed) {
          this.maskDirty = true;
          this.draw(performance.now(), !this.active);
        }
      };
      const descriptor = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
      if (!document.fonts.check(descriptor, '0123456789:')) {
        void document.fonts.load(descriptor, '0123456789:').then(refreshNumerals, refreshNumerals);
      }
    }
  }

  setValue(value: string): void {
    if (this.disposed || this.value === value) return;
    this.value = value;
    this.maskDirty = true;
    this.draw(performance.now());
  }

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (active) {
      const box = this.card.getBoundingClientRect();
      this.visible = box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight
        && box.right > 0 && box.left < innerWidth;
    }
    this.syncMotion();
  }

  copyFrame(target: HTMLCanvasElement): void {
    if (this.disposed) return;
    // Draw and copy in the same task, before WebGL discards its drawing buffer.
    this.draw(performance.now());
    target.width = this.canvas.width;
    target.height = this.canvas.height;
    target.getContext('2d')?.drawImage(this.canvas, 0, 0);
  }

  private location(name: string): WebGLUniformLocation {
    const existing = this.uniforms.get(name);
    if (existing) return existing;
    const location = this.gl.getUniformLocation(this.program, name)!;
    this.uniforms.set(name, location);
    return location;
  }

  private createTexture(unit: number): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private readonly resize = (): void => {
    if (this.disposed) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(this.card.clientWidth * ratio));
    const h = Math.max(1, Math.round(this.card.clientHeight * ratio));
    // ResizeObserver's initial notification must not rebuild the same mask twice.
    if (this.framebufferReady && this.canvas.width === w && this.canvas.height === h && this.ratio === ratio) return;
    this.ratio = ratio;
    this.canvas.width = this.mask.width = this.softMask.width = w;
    this.canvas.height = this.mask.height = this.softMask.height = h;
    this.gl.viewport(0, 0, w, h);
    this.gl.uniform2f(this.location('resolution'), w, h);
    this.gl.uniform1f(this.location('pixelRatio'), this.ratio);
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.liquidTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.liquidFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.liquidTexture, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) {
      this.dispose();
      return;
    }
    this.framebufferReady = true;
    this.maskDirty = true;
    this.draw(performance.now());
  };

  private paintMask(): void {
    const ctx = this.mask.getContext('2d', { willReadFrequently: true })!;
    const soft = this.softMask.getContext('2d', { willReadFrequently: true })!;
    const digits = this.card.querySelector<HTMLElement>('.result-time-value');
    if (!digits) return;
    const style = getComputedStyle(digits);
    this.gl.uniform1f(this.location('bevelWidth'), Math.max(3, Number.parseFloat(style.fontSize) * .075));
    ctx.clearRect(0, 0, this.mask.width, this.mask.height);
    ctx.save();
    ctx.scale(this.ratio, this.ratio);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    const metrics = ctx.measureText(this.value);
    const y = this.card.clientHeight / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    const characters = Array.from(this.value);
    const glyphMetrics = characters.map(character => ctx.measureText(character));
    const advances = glyphMetrics.map(metric => metric.width);
    const tracking = Number.parseFloat(style.letterSpacing) || 0;
    const fontSize = Number.parseFloat(style.fontSize);
    const colonGap = fontSize * TIME_COLON_GAP_EM;
    const colonOffset = fontSize * TIME_COLON_OFFSET_EM;
    const textWidth = advances.reduce((total, advance) => total + advance, 0)
      + tracking * Math.max(0, characters.length - 1)
      + characters.filter(character => character === ':').length * colonGap * 2;
    let x = (this.card.clientWidth - textWidth) / 2;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (let i = 0; i < characters.length; i++) {
      const separator = characters[i] === ':';
      if (separator) x += colonGap;
      const baseline = y + (separator ? colonOffset : 0);
      const metric = glyphMetrics[i];
      ctx.fillText(characters[i], x, baseline);
      left = Math.min(left, x - metric.actualBoundingBoxLeft);
      right = Math.max(right, x + metric.actualBoundingBoxRight);
      top = Math.min(top, baseline - metric.actualBoundingBoxAscent);
      bottom = Math.max(bottom, baseline + metric.actualBoundingBoxDescent);
      x += advances[i] + tracking + (separator ? colonGap : 0);
    }
    ctx.restore();
    soft.clearRect(0, 0, this.softMask.width, this.softMask.height);
    soft.filter = `blur(${2.6 * this.ratio}px)`;
    soft.drawImage(this.mask, 0, 0);
    // Empty card pixels have no glass surface. Limit the CPU distance transform
    // and readback to the ink plus four blur radii and the smoothing neighbour.
    const margin = Math.ceil(2.6 * this.ratio * 4) + 2;
    const sx = Number.isFinite(left) ? Math.max(0, Math.floor(left * this.ratio) - margin) : 0;
    const sy = Number.isFinite(top) ? Math.max(0, Math.floor(top * this.ratio) - margin) : 0;
    const width = Math.max(1, Math.min(this.mask.width, Number.isFinite(right) ? Math.ceil(right * this.ratio) + margin : 1) - sx);
    const height = Math.max(1, Math.min(this.mask.height, Number.isFinite(bottom) ? Math.ceil(bottom * this.ratio) + margin : 1) - sy);
    const distance = glyphInteriorDistance(ctx.getImageData(sx, sy, width, height).data, width, height);
    const surface = soft.getImageData(sx, sy, width, height);
    for (let i = 0; i < distance.length; i++) {
      const pixel = i * 4;
      surface.data[pixel + 1] = surface.data[pixel + 3];
      if (distance[i] === 0 && surface.data[pixel + 1] < 2) {
        surface.data[pixel] = surface.data[pixel + 2] = 0;
        surface.data[pixel + 3] = 255;
        continue;
      }
      const x = i % width;
      const y = Math.floor(i / width);
      // Smooth the distance surface, retaining the original crisp glyph coverage.
      let smoothed = 0;
      let weights = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
        const weight = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
        smoothed += Math.max(0, distance[(y + dy) * width + x + dx] - .5) * weight;
        weights += weight;
      }
      const encoded = Math.round(Math.min(32, smoothed / weights / this.ratio) * 65535 / 32);
      surface.data[pixel] = encoded >>> 8;
      surface.data[pixel + 2] = encoded & 255;
      surface.data[pixel + 3] = 255;
    }
    soft.putImageData(surface, sx, sy);
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    for (const [unit, texture, source] of [[0, this.glyphTexture, this.mask], [1, this.bevelTexture, this.softMask]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
    this.texturesReady = true;
    this.maskDirty = false;
  }

  private readonly updateTheme = (): void => {
    const root = this.card.closest('app-root');
    if (!root || this.disposed) return;
    const style = getComputedStyle(this.card);
    const sample = this.colorSample.getContext('2d', { willReadFrequently: true })!;
    for (const [uniform, variable, fallback] of [
      ['cool', '--flow-cool', '#6366f1'], ['glint', '--flow-glint', '#e5e8ff'],
      ['ink', '--flow-ink', '#10152c'], ['paper', '--flow-surface', '#e4e8fa'],
    ]) {
      // Let the browser resolve CSS colours (including color-mix), so the GPU
      // and CSS fallback always use the currently selected accent and theme.
      sample.fillStyle = fallback;
      sample.fillStyle = style.getPropertyValue(variable).trim() || fallback;
      sample.fillRect(0, 0, 1, 1);
      const rgb = sample.getImageData(0, 0, 1, 1).data;
      this.gl.uniform3f(this.location(uniform), rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    }
    this.gl.uniform1f(this.location('dark'), root.classList.contains('dark-mode') ? 1 : 0);
    this.draw(performance.now());
  };

  private readonly refreshStyles = (): void => {
    if (this.disposed) return;
    this.maskDirty = true;
    this.updateTheme();
  };

  private readonly stylesheetLoaded = (event: Event): void => {
    if (event.target instanceof HTMLLinkElement && event.target.rel === 'stylesheet') {
      // Production's nonblocking stylesheet changes media from print to all in
      // its load handler. Read its colors and font after that handler has run.
      queueMicrotask(this.refreshStyles);
    }
  };

  private draw(now: number, prepare = false): void {
    if (this.disposed || (!prepare && (!this.active || !this.visible)) || document.hidden || !this.framebufferReady || this.gl.isContextLost()) return;
    // Countdown changes in a paused card collapse into one upload on return.
    if (this.maskDirty) this.paintMask();
    if (!this.texturesReady) return;
    const gl = this.gl;
    gl.uniform1f(this.location('time'), this.reducedMotion.matches ? 0 : this.elapsed);
    gl.uniform2f(this.location('drift'), this.reducedMotion.matches ? 0 : this.drift[0], this.reducedMotion.matches ? 0 : this.drift[1]);
    gl.activeTexture(gl.TEXTURE2);
    // Unbind the render target from its sampler to avoid a framebuffer feedback loop.
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.liquidFramebuffer);
    gl.uniform1f(this.location('renderPass'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, this.liquidTexture);
    gl.uniform1f(this.location('renderPass'), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private readonly tick = (now: number): void => {
    this.frame = null;
    if (this.disposed || !this.active || !this.visible || document.hidden || this.reducedMotion.matches) return;
    const delta = Math.min(64, Math.max(0, now - this.lastFrame)) / 1000;
    this.elapsed += delta;
    this.lastFrame = now;
    const ease = 1. - Math.exp(-delta * 3.);
    for (let i = 0; i < 2; i++) this.drift[i] += (this.targetDrift[i] - this.drift[i]) * ease;
    this.draw(now);
    this.frame = requestAnimationFrame(this.tick);
  };

  private readonly syncMotion = (): void => {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.lastFrame = performance.now();
    this.draw(performance.now());
    if (!this.disposed && this.active && this.visible && !document.hidden && !this.reducedMotion.matches) this.frame = requestAnimationFrame(this.tick);
  };

  private readonly orientation = (event: DeviceOrientationEvent): void => {
    if (this.reducedMotion.matches || !this.active || !this.visible || document.hidden || event.gamma === null || event.beta === null
      || !Number.isFinite(event.gamma) || !Number.isFinite(event.beta)) return;
    if (this.card.clientWidth <= 0 || this.card.clientHeight <= 0) return;
    const clamp = (value: number): number => Math.max(-1, Math.min(1, value));
    this.targetDrift = [clamp(event.gamma / 35) * 8 / this.card.clientWidth,
      clamp((event.beta - 45) / 35) * 8 / this.card.clientHeight];
  };

  private readonly contextLost = (event: Event): void => {
    event.preventDefault();
    this.card.classList.remove('has-liquid-canvas');
    this.dispose();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.themeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener('change', this.syncMotion);
    document.removeEventListener('visibilitychange', this.syncMotion);
    document.removeEventListener('load', this.stylesheetLoaded, true);
    window.removeEventListener('load', this.refreshStyles);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    window.removeEventListener('deviceorientation', this.orientation);
    this.card.classList.remove('has-liquid-canvas');
    this.gl.deleteTexture(this.glyphTexture);
    this.gl.deleteTexture(this.bevelTexture);
    this.gl.deleteTexture(this.liquidTexture);
    this.gl.deleteFramebuffer(this.liquidFramebuffer);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}

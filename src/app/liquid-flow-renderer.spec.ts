import { LiquidFlowRenderer } from './liquid-flow-renderer';
import { TIME_COLON_GAP_EM, TIME_COLON_OFFSET_EM } from './time-typography';

describe('LiquidFlowRenderer lifecycle', () => {
  let renderer: LiquidFlowRenderer | undefined;
  let root: HTMLElement;
  let card: HTMLElement;
  let canvas: HTMLCanvasElement;
  let gl: jasmine.SpyObj<WebGLRenderingContext>;
  let media: EventTarget & { matches: boolean };
  let hidden: boolean;
  let now: number;
  let nextFrame: number;
  let frames: Map<number, FrameRequestCallback>;
  let intersect: IntersectionObserverCallback;
  let intersectionObserver: jasmine.SpyObj<IntersectionObserver>;
  let resizeObserver: jasmine.SpyObj<ResizeObserver>;
  let resize: ResizeObserverCallback;
  let themeObserver: jasmine.SpyObj<MutationObserver>;
  let themeChanged: MutationCallback;

  beforeEach(() => {
    hidden = false;
    now = 1000;
    nextFrame = 0;
    frames = new Map();
    media = Object.assign(new EventTarget(), { matches: false });
    spyOn(window, 'matchMedia').and.returnValue(media as unknown as MediaQueryList);
    spyOnProperty(document, 'hidden', 'get').and.callFake(() => hidden);
    spyOn(performance, 'now').and.callFake(() => now);
    spyOn(window, 'requestAnimationFrame').and.callFake(callback => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    spyOn(window, 'cancelAnimationFrame').and.callFake(id => { frames.delete(id); });
    // Keep the asynchronous font refresh out of lifecycle tests.
    spyOn(document.fonts, 'load').and.returnValue(new Promise<FontFace[]>(() => {}));

    resizeObserver = jasmine.createSpyObj<ResizeObserver>('ResizeObserver', ['observe', 'unobserve', 'disconnect']);
    themeObserver = jasmine.createSpyObj<MutationObserver>('MutationObserver', ['observe', 'disconnect', 'takeRecords']);
    intersectionObserver = jasmine.createSpyObj<IntersectionObserver>('IntersectionObserver', ['observe', 'unobserve', 'disconnect', 'takeRecords']);
    spyOn(window, 'ResizeObserver').and.callFake(function (callback: ResizeObserverCallback) {
      resize = callback;
      return resizeObserver;
    });
    spyOn(window, 'MutationObserver').and.callFake(function (callback: MutationCallback) {
      themeChanged = callback;
      return themeObserver;
    });
    spyOn(window, 'IntersectionObserver').and.callFake(function (callback: IntersectionObserverCallback) {
      intersect = callback;
      return intersectionObserver;
    });

    gl = jasmine.createSpyObj<WebGLRenderingContext>('WebGL', [
      'createProgram', 'createShader', 'shaderSource', 'compileShader', 'getShaderParameter',
      'getShaderInfoLog', 'attachShader', 'deleteShader', 'linkProgram', 'getProgramParameter',
      'getProgramInfoLog', 'useProgram', 'createBuffer', 'bindBuffer', 'bufferData', 'getAttribLocation',
      'enableVertexAttribArray', 'vertexAttribPointer', 'createTexture', 'activeTexture', 'bindTexture',
      'texParameteri', 'getUniformLocation', 'uniform1i', 'uniform1f', 'uniform2f', 'uniform3f',
      'viewport', 'pixelStorei', 'texImage2D', 'isContextLost', 'drawArrays', 'deleteTexture',
      'deleteBuffer', 'deleteProgram', 'createFramebuffer', 'bindFramebuffer', 'framebufferTexture2D',
      'checkFramebufferStatus', 'deleteFramebuffer',
    ]);
    Object.assign(gl, {
      VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
      ARRAY_BUFFER: 34962, STATIC_DRAW: 35044, FLOAT: 5126, TEXTURE0: 33984, TEXTURE2: 33986,
      TEXTURE_2D: 3553, TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240,
      TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243, LINEAR: 9729, CLAMP_TO_EDGE: 33071,
      UNPACK_FLIP_Y_WEBGL: 37440, RGBA: 6408, UNSIGNED_BYTE: 5121, TRIANGLES: 4,
      FRAMEBUFFER: 36160, COLOR_ATTACHMENT0: 36064, FRAMEBUFFER_COMPLETE: 36053,
    });
    gl.createProgram.and.returnValue({} as WebGLProgram);
    gl.createShader.and.returnValue({} as WebGLShader);
    gl.getShaderParameter.and.returnValue(true);
    gl.getProgramParameter.and.returnValue(true);
    gl.createBuffer.and.returnValue({} as WebGLBuffer);
    gl.createTexture.and.callFake(() => ({} as WebGLTexture));
    gl.createFramebuffer.and.returnValue({} as WebGLFramebuffer);
    gl.checkFramebufferStatus.and.returnValue(gl.FRAMEBUFFER_COMPLETE);
    gl.getUniformLocation.and.callFake((_program, name) => ({ name } as unknown as WebGLUniformLocation));
    gl.isContextLost.and.returnValue(false);
    const getContext = HTMLCanvasElement.prototype.getContext;
    spyOn(HTMLCanvasElement.prototype, 'getContext').and.callFake((function (
      this: HTMLCanvasElement, contextId: string, options?: unknown,
    ): RenderingContext | null {
      if (contextId === 'webgl') return gl;
      return getContext.call(this, contextId as '2d', options as CanvasRenderingContext2DSettings);
    }) as HTMLCanvasElement['getContext']);

    root = document.createElement('app-root');
    root.style.setProperty('--flow-cool', '#bfe5d8');
    root.style.setProperty('--flow-glint', '#ffffff');
    root.style.setProperty('--flow-ink', '#06392e');
    card = document.createElement('div');
    card.style.cssText = 'width:128px;height:60px;position:relative';
    const digits = document.createElement('strong');
    digits.className = 'result-time-value';
    digits.style.cssText = 'font:700 28px Arial;letter-spacing:-1px';
    digits.textContent = '15:27';
    canvas = document.createElement('canvas');
    card.append(canvas, digits);
    root.append(card);
    document.body.append(root);
  });

  afterEach(() => {
    renderer?.dispose();
    renderer = undefined;
    root.remove();
  });

  function create(): LiquidFlowRenderer {
    renderer = new LiquidFlowRenderer(canvas, card, 0);
    renderer.setValue('15:27');
    setIntersection(true);
    return renderer;
  }

  function advanceFrame(milliseconds = 17): void {
    now += milliseconds;
    const pending = Array.from(frames.values());
    frames.clear();
    for (const callback of pending) callback(now);
  }

  function setIntersection(visible: boolean): void {
    intersect([{ target: card, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 } as unknown as IntersectionObserverEntry], intersectionObserver);
  }

  function lastTime(): number {
    const calls = gl.uniform1f.calls.allArgs().filter(([location]) =>
      (location as unknown as { name: string }).name === 'time');
    return calls[calls.length - 1][1];
  }

  it('renders consecutive 60 Hz frames without rebuilding the numeral textures', () => {
    create();
    const uploads = gl.texImage2D.calls.count();
    const draws = gl.drawArrays.calls.count();
    advanceFrame();
    const firstFrameDraws = gl.drawArrays.calls.count() - draws;
    expect(firstFrameDraws).toBeGreaterThan(0);
    advanceFrame();
    expect(gl.drawArrays.calls.count() - draws).toBe(firstFrameDraws * 2);
    expect(gl.texImage2D.calls.count()).toBe(uploads);
    expect(frames.size).toBe(1);
  });

  it('limits rendering on fast displays and pauses frames during the view transition', () => {
    const flow = create();
    const draws = gl.drawArrays.calls.count();
    advanceFrame(1000 / 120);
    expect(gl.drawArrays.calls.count()).toBe(draws);
    advanceFrame(1000 / 120);
    expect(gl.drawArrays.calls.count()).toBe(draws + 2);

    flow.setPaused(true);
    expect(frames.size).toBe(0);
    expect(card.classList.contains('has-liquid-canvas')).toBeFalse();
    const uploads = gl.texImage2D.calls.count();
    flow.setValue('15:28');
    card.style.width = '140px';
    resize([], resizeObserver);
    expect(frames.size).toBe(0);
    expect(gl.drawArrays.calls.count()).toBe(draws + 2);
    expect(gl.texImage2D.calls.count()).toBe(uploads);
    flow.setPaused(false);
    expect(frames.size).toBe(1);
    expect(canvas.width).toBe(Math.round(140 * Math.min(devicePixelRatio, 1.25)));
    expect(card.classList.contains('has-liquid-canvas')).toBeTrue();
  });

  it('uploads a new numeral mask only when the clock value changes', () => {
    const flow = create();
    const uploads = gl.texImage2D.calls.count();
    flow.setValue('15:27');
    expect(gl.texImage2D.calls.count()).toBe(uploads);
    flow.setValue('15:28');
    expect(gl.texImage2D.calls.count()).toBe(uploads + 2);
    expect(card.querySelector('strong')?.textContent).toBe('15:27');
  });

  it('prepares one initial frame while inactive, keeps the GPU program and defers hidden clock updates until activation', () => {
    renderer = new LiquidFlowRenderer(canvas, card, 0, '15:27', false);
    expect(gl.texImage2D.calls.count()).toBe(3);
    expect(frames.size).toBe(0);
    const draws = gl.drawArrays.calls.count();
    const uploads = gl.texImage2D.calls.count();
    renderer.setValue('15:28');
    setIntersection(true);
    advanceFrame();
    expect(gl.drawArrays.calls.count()).toBe(draws);
    expect(gl.texImage2D.calls.count()).toBe(uploads);
    expect(frames.size).toBe(0);
    renderer.setActive(true);
    expect(gl.texImage2D.calls.count()).toBe(uploads + 2);
    expect(frames.size).toBe(1);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    renderer.setActive(false);
    setIntersection(true);
    expect(frames.size).toBe(0);
  });

  it('does not reallocate textures or repaint numerals for an unchanged ResizeObserver notification', () => {
    create();
    const uploads = gl.texImage2D.calls.count();
    resize([], resizeObserver);
    expect(gl.texImage2D.calls.count()).toBe(uploads);
    card.style.width = '130px';
    resize([], resizeObserver);
    expect(gl.texImage2D.calls.count()).toBe(uploads + 3);
  });

  it('limits clock readbacks to the glass ink while retaining every glyph and clearing a shorter or empty value', () => {
    card.style.cssText = 'width:600px;height:180px;position:relative';
    const digits = card.querySelector<HTMLElement>('.result-time-value')!;
    digits.style.font = '900 64px Arial';
    const read = spyOn(CanvasRenderingContext2D.prototype, 'getImageData').and.callThrough();
    const flow = create();
    for (const value of ['00:04:47', '15:27', '']) {
      read.calls.reset();
      flow.setValue(value);
      const regions = read.calls.allArgs().filter(([, , width, height]) => width > 1 && height > 1);
      if (value) {
        expect(regions.length).toBe(2);
        for (const [x, y, width, height] of regions) {
          expect(x).toBeGreaterThan(0);
          expect(y).toBeGreaterThan(0);
          expect(x + width).toBeLessThanOrEqual(canvas.width);
          expect(y + height).toBeLessThanOrEqual(canvas.height);
          expect(width * height).toBeLessThan(canvas.width * canvas.height * .8);
        }
      }
      const mask = gl.texImage2D.calls.allArgs().at(-2)!.at(-1) as HTMLCanvasElement;
      const pixels = mask.getContext('2d')!.getImageData(0, 0, mask.width, mask.height).data;
      let ink = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 127) ink++;
      if (value) expect(ink).toBeGreaterThan(1000);
      else expect(ink).toBe(0);
    }
  });

  it('optically centres and spaces both colons in the glass countdown mask', () => {
    const paint = spyOn(CanvasRenderingContext2D.prototype, 'fillText').and.callThrough();
    const flow = create();
    paint.calls.reset();
    flow.setValue('00:04:47');
    const calls = paint.calls.allArgs();
    expect(calls.map(([glyph]) => glyph).join('')).toBe('00:04:47');
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = '700 28px Arial';
    for (const index of [2, 5]) {
      const [_, x, y] = calls[index];
      const before = calls[index - 1];
      const after = calls[index + 1];
      expect(y - before[2]).toBeCloseTo(28 * TIME_COLON_OFFSET_EM, 4);
      expect(x - before[1] - ctx.measureText(before[0]).width + 1).toBeCloseTo(28 * TIME_COLON_GAP_EM, 4);
      expect(after[1] - x - ctx.measureText(':').width + 1).toBeCloseTo(28 * TIME_COLON_GAP_EM, 4);
    }
    const left = calls[0][1];
    const right = calls[7][1] + ctx.measureText('7').width;
    expect(left).toBeCloseTo(card.clientWidth - right, 4);
  });

  it('uses every selected accent in both themes and updates the GPU palette without rebuilding the clock', () => {
    create();
    card.classList.add('result-time-card', 'summary-item');
    const uploads = gl.texImage2D.calls.count();
    const palette = (): number[] => gl.uniform3f.calls.allArgs()
      .filter(([location]) => (location as unknown as { name: string }).name === 'cool').at(-1)!.slice(1) as number[];
    for (const dark of [false, true]) {
      for (const accent of ['violet', 'green', 'red', 'pink', 'yellow']) {
        root.className = `${dark ? 'dark-mode ' : ''}accent-${accent}`;
        themeChanged([], themeObserver);
        const hex = getComputedStyle(root).getPropertyValue('--accent-solid').trim().slice(1);
        const value = Number.parseInt(hex, 16);
        expect(palette()).withContext(`${dark ? 'dark' : 'light'} ${accent}`).toEqual([
          ((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255,
        ]);
      }
    }
    expect(gl.texImage2D.calls.count()).toBe(uploads);
  });

  it('updates every optical layer to neutral grayscale for black and white without replacing the clock', () => {
    create();
    card.classList.add('result-time-card', 'summary-item');
    const uploads = gl.texImage2D.calls.count();
    for (const theme of ['accent-black', 'dark-mode accent-white']) {
      root.className = theme;
      themeChanged([], themeObserver);
      for (const uniform of ['cool', 'glint', 'ink', 'paper']) {
        const rgb = gl.uniform3f.calls.allArgs().filter(([location]) =>
          (location as unknown as { name: string }).name === uniform).at(-1)!.slice(1);
        expect(rgb[0]).withContext(`${theme} ${uniform}`).toBe(rgb[1]);
        expect(rgb[1]).withContext(`${theme} ${uniform}`).toBe(rgb[2]);
      }
    }
    expect(gl.texImage2D.calls.count()).toBe(uploads);
  });

  it('does not change the flow position when the pointer enters or moves across a card', () => {
    create();
    card.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 4, pointerType: 'mouse' }));
    advanceFrame();
    card.dispatchEvent(new PointerEvent('pointerleave'));
    advanceFrame();
    const driftCalls = gl.uniform2f.calls.allArgs().filter(([location]) =>
      (location as unknown as { name: string }).name === 'drift');
    expect(driftCalls.every(([, x, y]) => x === 0 && y === 0)).toBeTrue();
  });

  it('refreshes saved colors after the production stylesheet becomes active without a host class change', async () => {
    const flow = create();
    await Promise.resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.media = 'print';
    document.head.append(link);
    try {
      const palette = (): number[] => gl.uniform3f.calls.allArgs()
        .filter(([location]) => (location as unknown as { name: string }).name === 'cool').at(-1)!.slice(1) as number[];
      const initial = palette();
      const uploads = gl.texImage2D.calls.count();
      link.addEventListener('load', () => {
        link.media = 'all';
        root.style.setProperty('--flow-cool', '#10b981');
      });
      link.dispatchEvent(new Event('load'));
      await Promise.resolve();
      expect(palette()).not.toEqual(initial);
      expect(palette()).toEqual([16 / 255, 185 / 255, 129 / 255]);
      expect(gl.texImage2D.calls.count()).toBe(uploads + 2);
      flow.dispose();
      const uniforms = gl.uniform3f.calls.count();
      link.dispatchEvent(new Event('load'));
      window.dispatchEvent(new Event('load'));
      await Promise.resolve();
      expect(gl.uniform3f.calls.count()).toBe(uniforms);
    } finally { link.remove(); }
  });

  it('stops motion for reduced-motion while still rendering updated clock values', () => {
    const flow = create();
    advanceFrame();
    media.matches = true;
    media.dispatchEvent(new Event('change'));
    expect(frames.size).toBe(0);
    const frozenTime = lastTime();
    const draws = gl.drawArrays.calls.count();
    now += 3000;
    flow.setValue('15:28');
    expect(gl.drawArrays.calls.count()).toBeGreaterThan(draws);
    expect(lastTime()).toBe(frozenTime);
    expect(frames.size).toBe(0);

    media.matches = false;
    media.dispatchEvent(new Event('change'));
    expect(frames.size).toBe(1);
  });

  it('pauses in a hidden browser tab and resumes without advancing through the pause', () => {
    const flow = create();
    advanceFrame();
    const beforePause = lastTime();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    const draws = gl.drawArrays.calls.count();
    const uploads = gl.texImage2D.calls.count();
    now += 60000;
    flow.setValue('15:28');
    flow.setValue('15:29');
    expect(gl.drawArrays.calls.count()).toBe(draws);
    expect(gl.texImage2D.calls.count()).toBe(uploads);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(gl.texImage2D.calls.count()).toBe(uploads + 2);
    advanceFrame();
    expect(gl.texImage2D.calls.count()).toBe(uploads + 2);
    expect(lastTime() - beforePause).toBeLessThan(.1);
    expect(frames.size).toBe(1);
  });

  it('pauses cards outside the viewport and resumes their continuous flow on return', () => {
    const flow = create();
    advanceFrame();
    const beforePause = lastTime();
    setIntersection(false);
    expect(frames.size).toBe(0);
    const draws = gl.drawArrays.calls.count();
    const uploads = gl.texImage2D.calls.count();
    now += 30000;
    flow.setValue('15:28');
    expect(gl.drawArrays.calls.count()).toBe(draws);
    expect(gl.texImage2D.calls.count()).toBe(uploads);
    setIntersection(true);
    expect(gl.texImage2D.calls.count()).toBe(uploads + 2);
    advanceFrame();
    expect(lastTime() - beforePause).toBeLessThan(.1);
    expect(frames.size).toBe(1);
    expect(intersectionObserver.observe).toHaveBeenCalledWith(card);
  });

  it('disposes observers and GPU resources once and ignores subsequent clock updates', () => {
    const flow = create();
    const removeVisibility = spyOn(document, 'removeEventListener').and.callThrough();
    const removeMotion = spyOn(media, 'removeEventListener').and.callThrough();
    const removeCardListener = spyOn(card, 'removeEventListener').and.callThrough();
    const removeWindowListener = spyOn(window, 'removeEventListener').and.callThrough();
    flow.dispose();
    const uploads = gl.texImage2D.calls.count();
    const draws = gl.drawArrays.calls.count();
    flow.dispose();
    flow.setValue('15:28');
    expect(gl.texImage2D.calls.count()).toBe(uploads);
    expect(gl.drawArrays.calls.count()).toBe(draws);
    expect(frames.size).toBe(0);
    expect(card.classList.contains('has-liquid-canvas')).toBeFalse();
    expect(resizeObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(themeObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(intersectionObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(removeVisibility).toHaveBeenCalledWith('visibilitychange', jasmine.any(Function));
    expect(removeMotion).toHaveBeenCalledWith('change', jasmine.any(Function));
    expect(removeCardListener).not.toHaveBeenCalledWith('pointermove', jasmine.any(Function));
    expect(removeCardListener).not.toHaveBeenCalledWith('pointerleave', jasmine.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('deviceorientation', jasmine.any(Function));
    expect(gl.deleteTexture.calls.count()).toBe(gl.createTexture.calls.count());
    expect(gl.deleteBuffer.calls.count()).toBe(gl.createBuffer.calls.count());
    expect(gl.deleteProgram.calls.count()).toBe(gl.createProgram.calls.count());
    expect(gl.deleteFramebuffer.calls.count()).toBe(gl.createFramebuffer.calls.count());
  });

  it('reveals the semantic clock and stops rendering when the WebGL context is lost', () => {
    create();
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBeTrue();
    expect(card.classList.contains('has-liquid-canvas')).toBeFalse();
    expect(card.querySelector('strong')?.textContent).toBe('15:27');
    expect(frames.size).toBe(0);
    expect(gl.deleteProgram.calls.count()).toBe(gl.createProgram.calls.count());
  });

  it('keeps the readable fallback when the liquid framebuffer cannot be allocated', () => {
    gl.checkFramebufferStatus.and.returnValue(36054); // FRAMEBUFFER_INCOMPLETE_ATTACHMENT
    renderer = new LiquidFlowRenderer(canvas, card, 0);
    renderer.setValue('15:27');
    expect(card.classList.contains('has-liquid-canvas')).toBeFalse();
    expect(card.querySelector('strong')?.textContent).toBe('15:27');
    expect(frames.size).toBe(0);
    expect(gl.drawArrays).not.toHaveBeenCalled();
    expect(gl.deleteTexture.calls.count()).toBe(gl.createTexture.calls.count());
    expect(gl.deleteFramebuffer.calls.count()).toBe(gl.createFramebuffer.calls.count());
    expect(gl.deleteProgram.calls.count()).toBe(gl.createProgram.calls.count());
  });
});

describe('LiquidFlowRenderer WebGL integration', () => {
  it('keeps dark ribbons below the light material while the glass numerals retain contrast', () => {
    spyOn(window, 'requestAnimationFrame').and.returnValue(1);
    spyOn(window, 'cancelAnimationFrame').and.stub();
    spyOn(window, 'matchMedia').and.returnValue(Object.assign(new EventTarget(), { matches: true }) as MediaQueryList);
    const root = document.createElement('app-root');
    const card = document.createElement('div');
    card.className = 'result-time-card summary-item';
    card.style.cssText = 'width:160px;height:80px;min-height:0;position:relative;display:block';
    const digits = document.createElement('strong');
    digits.className = 'result-time-value';
    digits.style.cssText = 'font:900 36px Arial;letter-spacing:-1px;position:absolute;left:15px;top:20px';
    digits.textContent = '15:27';
    root.append(card);
    document.body.append(root);
    let renderer: LiquidFlowRenderer | undefined;
    const luminance = (pixels: Uint8Array, i: number): number =>
      pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
    const measure = (dark: boolean): { background: number; brightNumerals: number } => {
      root.className = `${dark ? 'dark-mode ' : ''}accent-violet`;
      const canvas = document.createElement('canvas');
      card.replaceChildren(canvas, digits);
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error('WebGL is required for the optical contrast regression');
      renderer = new LiquidFlowRenderer(canvas, card, 0);
      renderer.setValue('');
      const background = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, background);
      renderer.setValue('15:27');
      const numerals = new Uint8Array(background.length);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, numerals);
      let total = 0, brightNumerals = 0;
      for (let i = 0; i < background.length; i += 4) {
        total += luminance(background, i);
        if (luminance(numerals, i) > luminance(background, i) + 55) brightNumerals++;
      }
      expect(gl.getError()).toBe(gl.NO_ERROR);
      renderer.dispose();
      renderer = undefined;
      return { background: total / (background.length / 4), brightNumerals };
    };
    try {
      const dark = measure(true);
      const light = measure(false);
      expect(dark.background).withContext('The dark fluid must leave a deep backdrop behind the glass').toBeLessThan(light.background * .4);
      expect(dark.brightNumerals).withContext('Dimming the fluid must not dim the readable glass digits').toBeGreaterThan(160 * 80 * .06);
    } finally {
      renderer?.dispose();
      root.remove();
    }
  });

  it('compiles the real shaders and renders the two passes without graphics errors', () => {
    let nextFrame: FrameRequestCallback | undefined;
    let now = 1000;
    spyOn(performance, 'now').and.callFake(() => now);
    spyOn(window, 'requestAnimationFrame').and.callFake(callback => { nextFrame = callback; return 1; });
    spyOn(window, 'cancelAnimationFrame').and.stub();
    spyOn(window, 'matchMedia').and.returnValue(Object.assign(new EventTarget(), { matches: false }) as MediaQueryList);
    const root = document.createElement('app-root');
    root.className = 'dark-mode';
    root.style.setProperty('--flow-cool', '#9ec6d5');
    root.style.setProperty('--flow-glint', '#effaff');
    root.style.setProperty('--flow-ink', '#06131f');
    const card = document.createElement('div');
    card.style.cssText = 'width:128px;height:60px;position:relative';
    const digits = document.createElement('strong');
    digits.className = 'result-time-value';
    digits.style.cssText = 'font:700 28px Arial;letter-spacing:-1px';
    digits.textContent = '15:27';
    const canvas = document.createElement('canvas');
    card.append(canvas, digits);
    root.append(card);
    document.body.append(root);
    let renderer: LiquidFlowRenderer | undefined;
    try {
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true });
      if (!gl) {
        pending('This browser does not expose WebGL; fallback behavior is covered separately.');
        return;
      }
      renderer = new LiquidFlowRenderer(canvas, card, 1);
      renderer.setValue('15:27');
      expect(card.classList.contains('has-liquid-canvas')).toBeTrue();
      expect(gl.getError()).toBe(gl.NO_ERROR);
      const pixel = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      expect(pixel[3]).toBe(255);
      expect(pixel[0] + pixel[1] + pixel[2]).toBeGreaterThan(0);
      expect(gl.getError()).toBe(gl.NO_ERROR);
      const before = new Uint8Array(canvas.width * canvas.height * 4);
      const after = new Uint8Array(before.length);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, before);
      for (let frame = 0; frame < 120; frame++) {
        now += 1000 / 60;
        nextFrame?.(now);
      }
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, after);
      let changed = 0;
      for (let i = 0; i < before.length; i += 4) {
        if (Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1])
          + Math.abs(before[i + 2] - after[i + 2]) > 20) changed++;
      }
      expect(changed).withContext('The fluid must visibly deform within two seconds').toBeGreaterThan(canvas.width * canvas.height * .15);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      renderer?.dispose();
      root.remove();
    }
  });
});

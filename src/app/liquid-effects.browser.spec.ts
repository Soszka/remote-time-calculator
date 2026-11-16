import { LiquidFlowRenderer } from './liquid-flow-renderer';

describe('Glass effects in WebGL', () => {
  it('renders distinct, moving effects in light, dark and monochrome palettes with the real WebGL shader', async () => {
    let now = 1000;
    let frame: FrameRequestCallback | undefined;
    spyOn(performance, 'now').and.callFake(() => now);
    spyOn(window, 'requestAnimationFrame').and.callFake(callback => { frame = callback; return 1; });
    spyOn(window, 'cancelAnimationFrame').and.callFake(() => { frame = undefined; });
    spyOn(window, 'matchMedia').and.returnValue(Object.assign(new EventTarget(), { matches: false }) as MediaQueryList);
    spyOnProperty(document, 'hidden', 'get').and.returnValue(false);
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (!gl) { pending('WebGL is unavailable in this browser'); return; }
    const root = document.createElement('app-root');
    root.className = 'dark-mode accent-violet';
    const card = document.createElement('article');
    card.className = 'summary-item result-time-card timeline-card exit-time-card';
    card.style.cssText = 'width:400px;height:260px;min-height:0;position:relative;border:0';
    const main = document.createElement('strong');
    main.className = 'result-time-value';
    main.textContent = '16:15';
    card.append(canvas, main);
    for (const [side, value] of [['early', '16:00'], ['late', '16:30']]) {
      const wrapper = document.createElement('div');
      wrapper.className = `timeline-side timeline-${side}`;
      const clock = document.createElement('strong');
      clock.textContent = value;
      wrapper.append(clock);
      card.append(wrapper);
    }
    root.append(card);
    document.body.append(root);
    let renderer: LiquidFlowRenderer | undefined;
    try {
      renderer = new LiquidFlowRenderer(canvas, card, 0, '16:15', true);
      await renderer.ready;
      expect(card.classList.contains('has-liquid-canvas')).toBeTrue();
      const capture = (): string => {
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const samples: string[] = [];
        for (let y = 1; y < 10; y++) {
          for (let x = 1; x < 16; x++) {
            const i = (Math.floor(y * canvas.height / 10) * canvas.width + Math.floor(x * canvas.width / 16)) * 4;
            expect(pixels[i + 3]).withContext('Every sampled fragment should be painted').toBe(255);
            samples.push(Array.from(pixels.slice(i, i + 3)).join(','));
          }
        }
        expect(new Set(samples).size).withContext('The optical field should not collapse to a flat or empty surface').toBeGreaterThan(8);
        return samples.join(';');
      };
      for (const dark of [false, true]) {
        for (const accent of ['violet', 'red', dark ? 'white' : 'black']) {
          root.className = `${dark ? 'dark-mode ' : ''}accent-${accent}`;
          await Promise.resolve();
          const fingerprints: string[] = [];
          for (const effect of ['liquid', 'reflections', 'sheen'] as const) {
            renderer.setEffect(effect);
            const first = capture();
            for (let step = 0; step < 20; step++) {
              const next = frame;
              expect(next).withContext(`${accent}/${effect}: animation should remain scheduled`).toBeDefined();
              now += 64;
              next?.(now);
            }
            const second = capture();
            expect(second).withContext(`${dark}/${accent}/${effect}: the light must move`).not.toBe(first);
            expect(gl.getError()).withContext(`${dark}/${accent}/${effect}`).toBe(gl.NO_ERROR);
            fingerprints.push(first);
          }
          expect(new Set(fingerprints).size).withContext(`${dark}/${accent}: effects must remain visually distinct`).toBe(3);
        }
      }
    } finally { renderer?.dispose(); root.remove(); }
  }, 20000);
});

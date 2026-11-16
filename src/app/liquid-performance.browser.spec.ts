import { LiquidFlowRenderer } from './liquid-flow-renderer';

describe('Clock rendering performance', () => {
  it('measures cold initialization and a new clock value at high pixel density', async () => {
    spyOnProperty(window, 'devicePixelRatio', 'get').and.returnValue(2);
    await document.fonts.load('900 100px "Nunito Glass"', '0123456789:');
    const root = document.createElement('app-root');
    root.className = 'dark-mode accent-violet';
    root.style.display = 'block';
    document.body.append(root);
    const renderers: LiquidFlowRenderer[] = [];
    const measurements: { initial: number; update: number; refresh: number; ready: number }[] = [];
    try {
      for (const value of ['16:58', '02:15:00']) {
        const card = document.createElement('article');
        card.className = 'summary-item result-time-card';
        card.style.cssText = 'position:relative;width:552px;height:220px;padding:28px 10px';
        const canvas = document.createElement('canvas');
        const clock = document.createElement('strong');
        clock.className = 'result-time-value';
        clock.style.font = '900 105px "Nunito Glass"';
        clock.textContent = value;
        card.append(canvas, clock);
        root.append(card);
        let start = performance.now();
        const renderer = new LiquidFlowRenderer(canvas, card, 0, value);
        renderers.push(renderer);
        const initial = performance.now() - start;
        await renderer.ready;
        const ready = performance.now() - start;
        start = performance.now();
        renderer.setValue(value === '16:58' ? '16:59' : '02:14:59');
        const update = performance.now() - start;
        await renderer.ready;
        start = performance.now();
        renderer.refreshTypography();
        await Promise.resolve();
        const refresh = performance.now() - start;
        await renderer.ready;
        measurements.push({ initial, update, refresh, ready });
        expect(card.classList.contains('has-liquid-canvas')).toBeTrue();
      }
      console.info('CLOCK_PERFORMANCE_MS', JSON.stringify(measurements));
    } finally { renderers.forEach(renderer => renderer.dispose()); root.remove(); }
  }, 20000);
});

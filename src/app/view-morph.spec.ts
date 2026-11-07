import { ACCORDION_PHASES, ViewMorph } from './view-morph';

describe('ViewMorph', () => {
  let host: HTMLElement;
  let panel: HTMLElement;
  let motion: ViewMorph;
  let media: EventTarget & { matches: boolean };
  let hidden: boolean;

  beforeEach(() => {
    hidden = false;
    media = Object.assign(new EventTarget(), { matches: false });
    spyOn(window, 'matchMedia').and.returnValue(media as unknown as MediaQueryList);
    spyOnProperty(document, 'hidden', 'get').and.callFake(() => hidden);
    host = document.createElement('app-root');
    panel = document.createElement('section');
    panel.className = 'panel';
    panel.style.cssText = 'position:relative;width:600px;height:620px;padding:0;margin:0;border:0;gap:0;';
    panel.innerHTML = `
      <div class="highlight-card" style="position:absolute;inset:0;display:block;margin:0;padding:0;border:0">
      <div class="compact-toolbar" style="height:40px">Start: 08:00 <button>Edytuj</button></div>
      <div class="summary-line result-summary">
      <article class="exit-time-card" style="position:absolute;left:24px;top:90px;width:552px;height:140px"><canvas></canvas><span style="font-size:17cqi">16:15</span></article>
      <div class="exit-slider" style="position:absolute;left:24px;top:250px;width:552px;height:60px"><button class="offset-button">-</button><div class="offset-control">Suwak</div><button class="offset-button">+</button></div>
      <article class="remaining-time-card" style="position:absolute;left:24px;top:330px;width:552px;height:140px"><canvas></canvas></article>
      </div></div>`;
    host.append(panel);
    document.body.append(host);
    motion = new ViewMorph(host);
  });

  afterEach(() => {
    motion.dispose();
    host.remove();
  });

  function changeToForm(): void {
    panel.style.width = '640px';
    panel.style.height = '440px';
    panel.querySelector('.exit-slider')!.remove();
    panel.querySelector('.compact-toolbar')!.remove();
    panel.querySelector<HTMLElement>('.exit-time-card')!.style.display = 'none';
    panel.querySelector<HTMLElement>('.remaining-time-card')!.style.display = 'none';
    const form = document.createElement('form');
    form.className = 'form';
    form.innerHTML = '<div class="form-row"><input id="start-time" value="08:00"></div><button class="primary-button">Przelicz</button>';
    panel.prepend(form);
  }

  const coordinates = (element: Element): number[] => {
    const box = element.getBoundingClientRect();
    return [box.x, box.y, box.width, box.height];
  };
  const closeTo = (actual: number[], expected: number[]) => actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 1));

  it('folds the result vertically around its centre before unfolding the form, then settles without a jump', () => {
    const cards = Array.from(panel.querySelectorAll<HTMLElement>('article'));
    const canvases = Array.from(panel.querySelectorAll('canvas'));
    const source = cards.map(coordinates);
    const fontSize = getComputedStyle(cards[0].querySelector('span')!).fontSize;
    const snapshot = motion.capture('result');
    changeToForm();
    const target = coordinates(panel);
    motion.play(snapshot);
    const copies = Array.from(host.querySelectorAll<HTMLElement>('.view-morph-overlay article'));
    expect(copies.length).toBe(2);
    expect(copies[0].closest('.result-summary')).not.toBeNull();
    expect(getComputedStyle(copies[0].querySelector('span')!).fontSize).toBe(fontSize);
    const animations = host.getAnimations({ subtree: true });
    animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
    copies.forEach((card, index) => closeTo(coordinates(card), source[index]));
    const surface = host.querySelector<HTMLElement>('.view-morph-surface')!;
    const centre = snapshot!.panel.y + snapshot!.panel.height / 2;
    const advance = (time: number) => animations.forEach(animation => animation.currentTime = time);
    expect(new DOMMatrix(getComputedStyle(panel).transform).d).toBe(0);
    expect(coordinates(surface)[3]).toBeCloseTo(snapshot!.panel.height, 1);
    expect(new DOMMatrix(getComputedStyle(panel).transform).d).toBe(0);
    advance(ACCORDION_PHASES.collapse / 2);
    const folded = coordinates(surface);
    expect(folded[3]).toBeGreaterThan(0);
    expect(folded[3]).toBeLessThan(snapshot!.panel.height);
    expect(folded[1] + folded[3] / 2).toBeCloseTo(centre, 1);
    const openStart = ACCORDION_PHASES.collapse;
    advance(openStart);
    expect(coordinates(surface)[3]).toBe(0);
    expect(new DOMMatrix(getComputedStyle(panel).transform).d).toBe(0);
    advance(openStart + ACCORDION_PHASES.expand / 2);
    expect(coordinates(panel)[3]).toBeGreaterThan(0);
    expect(coordinates(panel)[3]).toBeLessThan(target[3]);
    advance(openStart + ACCORDION_PHASES.expand);
    closeTo(coordinates(panel), target);
    expect(Number(getComputedStyle(panel).opacity)).toBe(1);
    const settled = coordinates(panel);
    motion.cancel();
    closeTo(coordinates(panel), settled);
    cards.forEach(card => expect(getComputedStyle(card).display).toBe('none'));
    expect(Array.from(panel.querySelectorAll('canvas'))).toEqual(canvases);
    expect(host.querySelector('.view-morph-overlay')).toBeNull();
    expect(host.getAnimations({ subtree: true }).length).toBe(0);
  });

  it('folds the slider with the entire result immediately, without a separate slider animation, using only compositor properties', () => {
    const snapshot = motion.capture('result');
    changeToForm();
    motion.play(snapshot);
    const overlay = host.querySelector('.view-morph-overlay')!;
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    expect(overlay.hasAttribute('inert')).toBeTrue();
    expect(overlay.querySelectorAll('canvas').length).toBe(2);
    expect(overlay.querySelector('[id]')).toBeNull();
    const scale = overlay.querySelector('.offset-control')!;
    expect(scale.getAnimations().length).toBe(0);
    overlay.querySelectorAll('.offset-button').forEach(button => expect(button.getAnimations().length).toBe(0));
    const surface = overlay.querySelector('.view-morph-surface')!;
    const fold = surface.getAnimations()[0];
    expect(fold.effect!.getTiming().delay).toBe(0);
    fold.pause();
    fold.currentTime = 0;
    expect(new DOMMatrix(getComputedStyle(surface).transform).d).toBe(1);
    fold.currentTime = ACCORDION_PHASES.collapse / 2;
    expect(coordinates(scale)[3]).toBeLessThan((scale as HTMLElement).offsetHeight);
    fold.currentTime = ACCORDION_PHASES.collapse;
    expect(new DOMMatrix(getComputedStyle(surface).transform).d).toBe(0);
    for (const running of host.getAnimations({ subtree: true })) {
      const frames = (running.effect as KeyframeEffect).getKeyframes();
      for (const frame of frames) {
        expect(frame['height']).toBeUndefined();
        expect(frame['width']).toBeUndefined();
        expect(frame['filter']).toBeUndefined();
      }
    }
  });

  it('folds the form and background, then unfolds cards, slider and buttons together without a final slider phase', () => {
    changeToForm();
    const input = panel.querySelector<HTMLInputElement>('input')!;
    input.value = '09:42';
    const snapshot = motion.capture('form');
    panel.querySelector('form')!.remove();
    panel.querySelectorAll<HTMLElement>('article').forEach(card => card.style.display = 'block');
    const slider = document.createElement('div');
    slider.className = 'exit-slider';
    slider.innerHTML = '<button class="offset-button">-</button><div class="offset-control" style="height:20px">Suwak</div><button class="offset-button">+</button>';
    panel.append(slider);
    motion.play(snapshot);
    expect(host.querySelector<HTMLInputElement>('.view-morph-overlay input')!.value).toBe('09:42');
    const scale = slider.querySelector('.offset-control')!;
    const card = panel.querySelector<HTMLElement>('.exit-time-card')!;
    expect(scale.getAnimations().length).toBe(0);
    slider.querySelectorAll('.offset-button').forEach(button => expect(button.getAnimations().length).toBe(0));
    const animations = host.getAnimations({ subtree: true });
    animations.forEach(animation => animation.pause());
    const advance = (time: number) => animations.forEach(animation => animation.currentTime = time);
    const surface = host.querySelector('.view-morph-surface')!;
    expect(surface.querySelector('.panel')).not.toBeNull();
    advance(0);
    expect(new DOMMatrix(getComputedStyle(panel).transform).d).toBe(0);
    advance(ACCORDION_PHASES.collapse / 2);
    expect(new DOMMatrix(getComputedStyle(surface).transform).d).toBeGreaterThan(0);
    expect(new DOMMatrix(getComputedStyle(surface).transform).d).toBeLessThan(1);
    expect(new DOMMatrix(getComputedStyle(panel).transform).d).toBe(0);
    advance(ACCORDION_PHASES.collapse);
    expect(new DOMMatrix(getComputedStyle(surface).transform).d).toBe(0);
    expect(coordinates(scale)[3]).toBe(0);
    advance(ACCORDION_PHASES.collapse + ACCORDION_PHASES.expand / 2);
    const scaleHeight = coordinates(scale)[3];
    expect(scaleHeight).toBeGreaterThan(0);
    expect(scaleHeight).toBeLessThan((scale as HTMLElement).offsetHeight);
    expect(scaleHeight / (scale as HTMLElement).offsetHeight).toBeCloseTo(coordinates(card)[3] / card.offsetHeight, 3);
    expect(getComputedStyle(scale).transform).toBe('none');
    advance(ACCORDION_PHASES.collapse + ACCORDION_PHASES.expand);
    expect(new DOMMatrix(getComputedStyle(panel).transform).d).toBeCloseTo(1, 3);
    expect(coordinates(scale)[3]).toBeCloseTo((scale as HTMLElement).offsetHeight, 1);
    expect(getComputedStyle(scale).transform).toBe('none');
  });

  it('does not wait for a nonexistent slider when returning from the result with the slider disabled', () => {
    panel.querySelector('.exit-slider')!.remove();
    const snapshot = motion.capture('result');
    // The helper expects a slider while building the form, so supply an empty placeholder.
    const placeholder = document.createElement('div');
    placeholder.className = 'exit-slider';
    panel.append(placeholder);
    changeToForm();
    motion.play(snapshot);
    const fold = host.querySelector('.view-morph-surface')!.getAnimations()[0];
    const expand = panel.getAnimations()[0];
    expect(fold.effect!.getTiming().delay).toBe(0);
    expect(expand.effect!.getTiming().delay).toBe(ACCORDION_PHASES.collapse);
  });

  it('skips reduced-motion starts and cancels all animations when motion is reduced or the tab is hidden', () => {
    const snapshot = motion.capture('result');
    changeToForm();
    media.matches = true;
    motion.play(snapshot);
    expect(host.getAnimations({ subtree: true }).length).toBe(0);
    expect(host.querySelector('.view-morph-overlay')).toBeNull();
    media.matches = false;
    motion.play(snapshot);
    expect(host.getAnimations({ subtree: true }).length).toBeGreaterThan(0);
    media.matches = true;
    media.dispatchEvent(new Event('change'));
    expect(host.getAnimations({ subtree: true }).length).toBe(0);
    media.matches = false;
    motion.play(snapshot);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(host.getAnimations({ subtree: true }).length).toBe(0);
    expect(host.querySelector('.view-morph-overlay')).toBeNull();
  });

  it('keeps the departing layer transparent in all palettes and cancels obsolete geometry on a viewport resize', () => {
    const snapshot = motion.capture('result');
    changeToForm();
    for (const dark of [false, true]) {
      for (const accent of ['violet', 'green', 'red', 'pink', 'yellow', dark ? 'white' : 'black']) {
        host.className = `${dark ? 'dark-mode ' : ''}accent-${accent}`;
        motion.play(snapshot);
        const surface = getComputedStyle(host.querySelector('.view-morph-surface')!);
        expect(surface.backgroundColor).withContext(`${dark}/${accent}`).toBe('rgba(0, 0, 0, 0)');
        expect(surface.boxShadow).toBe('none');
        motion.cancel();
      }
    }
    motion.play(snapshot);
    const owned = host.getAnimations({ subtree: true }).filter(animation => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition));
    window.dispatchEvent(new Event('resize'));
    expect(owned.length).toBeGreaterThan(0);
    owned.forEach(animation => expect(animation.playState).toBe('idle'));
    expect(host.querySelector('.view-morph-overlay')).toBeNull();
  });
});

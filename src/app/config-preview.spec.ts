import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AppComponent } from './app.component';

@Component({ standalone: true, imports: [AppComponent], template: '<app-root></app-root>' })
class PreviewHostComponent {}

describe('Configuration preview', () => {
  let fixture: ComponentFixture<PreviewHostComponent>;
  let app: AppComponent;
  let page: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue(null);
    TestBed.configureTestingModule({ imports: [PreviewHostComponent] });
    fixture = TestBed.createComponent(PreviewHostComponent);
    fixture.detectChanges();
    app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance;
    page = fixture.nativeElement;
  });

  afterEach(() => {
    fixture.destroy();
    page.remove();
    localStorage.clear();
  });

  function changeSize(selector: string, value: number): void {
    const input = page.querySelector<HTMLInputElement>(selector)!;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function finishFinite(animations: Animation[]): void {
    animations.filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).forEach(animation => animation.finish());
  }

  it('opens a nonmodal side panel with a readonly result and never persists the sample as a daily plan', () => {
    app.form.controls.startTime.setValue('07:30');
    page.querySelector<HTMLButtonElement>('.settings-button')!.click();
    fixture.detectChanges();
    expect(app.isConfigOpen()).toBeTrue();
    expect(page.querySelector('.dialog-backdrop, [role="dialog"], [aria-modal="true"]')).toBeNull();
    expect(page.querySelector('aside')!.getAttribute('aria-hidden')).toBeNull();
    expect(page.querySelector('aside .user-icon')).toBeNull();
    expect(page.querySelector('#config-title')!.textContent).toBe('Ustawienia');
    expect(page.querySelector('.preview-heading, .config-intro, .config-footer, .config-title-group')).toBeNull();
    expect(page.querySelector('aside')!.textContent).not.toContain('%');
    expect(page.querySelectorAll('.size-range').length).toBe(1);
    expect(page.querySelector('#start-time')).toBeNull();
    expect(page.querySelector('.exit-time-card > strong')!.textContent).toBe('00:00');
    expect(page.querySelector('.remaining-time-card > strong')!.textContent).toBe('08:15:00');
    expect(page.querySelector('.compact-feedback')!.textContent!.trim()).toBe('Tak będzie wyglądać Twój widok.');
    expect(getComputedStyle(page.querySelector('.compact-feedback')!).textAlign).toBe('center');
    expect(page.querySelector<HTMLInputElement>('#exit-offset')!.disabled).toBeTrue();
    expect(Array.from(page.querySelectorAll<HTMLButtonElement>('.offset-button')).every(button => button.disabled)).toBeTrue();
    expect(app.result()).toBeNull();
    expect(localStorage.getItem('workEndCalculator.dailyPlan')).toBeNull();
  });

  it('keeps the sample frozen, preserves a real plan and returns to its editable inputs on outside click', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 10, 13, 12));
      app.form.controls.startTime.setValue('08:00');
      app.calculate(false);
      app.setExitOffset(6);
      const savedPlan = localStorage.getItem('workEndCalculator.dailyPlan');
      app.openConfig();
      app.setExitOffset(-15);
      jasmine.clock().tick(65000);
      fixture.detectChanges();
      expect(app.resultSurface()?.remainingClockLabel).toBe('08:15:00');
      expect(app.result()?.endTime).toBe('16:21');
      expect(app.exitOffsetMinutes()).toBe(6);
      expect(localStorage.getItem('workEndCalculator.dailyPlan')).toBe(savedPlan);
      page.querySelector<HTMLElement>('.remaining-time-card')!.click();
      fixture.detectChanges();
      expect(app.isConfigOpen()).toBeFalse();
      expect(app.isCompactMode()).toBeFalse();
      expect(page.querySelector<HTMLInputElement>('#start-time')!.value).toBe('08:00');
      app.calculate(false);
      fixture.detectChanges();
      expect(app.result()?.endTime).toBe('16:15');
      expect(app.result()?.remainingClockLabel).toBe('04:13:55');
    } finally { jasmine.clock().uninstall(); }
  });

  it('applies every visual setting immediately and keeps configuration clicks inside the panel', () => {
    app.openConfig();
    const layouts = page.querySelectorAll<HTMLButtonElement>('[aria-labelledby="slider-display-label"] button');
    layouts[1].click();
    fixture.detectChanges();
    expect(app.isConfigOpen()).toBeTrue();
    expect(page.querySelector('#exit-offset')).toBeNull();
    expect(page.querySelectorAll('.milestone-track').length).toBe(2);
    expect(page.querySelector('.exit-time-card .timeline-early strong')!.textContent).toBe('23:45');
    expect(page.querySelector('.exit-time-card .timeline-late strong')!.textContent).toBe('00:15');
    expect(page.querySelector('.remaining-time-card .timeline-early strong')!.textContent).toBe('08:00');
    expect(page.querySelector('.remaining-time-card .timeline-late strong')!.textContent).toBe('08:30');
    app.setDarkMode(false);
    app.setAccentColor('green');
    app.setAnimationsEnabled(false);
    changeSize('#time-size', 120);
    changeSize('#timeline-side-size', 75);
    expect(page.querySelector('app-root')!.classList.contains('accent-green')).toBeTrue();
    expect(page.querySelector('app-root')!.classList.contains('dark-mode')).toBeFalse();
    expect(page.querySelector('canvas')).toBeNull();
    const saved = JSON.parse(localStorage.getItem('workEndCalculator.settings')!);
    expect(saved.timelineEnabled).toBeTrue();
    expect(saved.timeScale).toBe(120);
    expect(saved.timelineSideScale).toBe(75);
    app.closeConfig();
    app.openConfig();
    expect(app.settings().timeScale).toBe(120);
    expect(app.resultSurface()?.endTime).toBe('00:00');
    layouts[2].click();
    fixture.detectChanges();
    expect(page.querySelector('.milestone-track, #exit-offset')).toBeNull();
    expect(page.querySelectorAll('.size-range').length).toBe(1);
    layouts[3].click();
    fixture.detectChanges();
    expect(page.querySelector('.cards-side-by-side')).not.toBeNull();
    layouts[0].click();
    fixture.detectChanges();
    expect(page.querySelector('#exit-offset')).not.toBeNull();
  });

  it('closes with Escape, restores keyboard focus and hides inactive settings from navigation', () => {
    document.body.append(page);
    app.openConfig();
    expect(document.activeElement).toBe(page.querySelector('aside'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(app.isConfigOpen()).toBeFalse();
    expect(document.activeElement).toBe(page.querySelector('.settings-button'));
    expect(page.querySelector('aside')!.hasAttribute('inert')).toBeTrue();
    expect(page.querySelector('aside')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('scales both main clocks together and only the timeline side clocks with the second slider', () => {
    document.body.append(page);
    app.setAnimationsEnabled(false);
    app.openConfig();
    app.setTimeDisplayMode('timeline');
    fixture.detectChanges();
    finishFinite(page.getAnimations({ subtree: true }));
    const mainFonts = () => Array.from(page.querySelectorAll<HTMLElement>('.result-time-value'), clock => parseFloat(getComputedStyle(clock).fontSize));
    const sideFonts = () => Array.from(page.querySelectorAll<HTMLElement>('.timeline-side strong'), clock => parseFloat(getComputedStyle(clock).fontSize));
    changeSize('#time-size', 70);
    const small = mainFonts();
    const originalSides = sideFonts();
    changeSize('#time-size', 125);
    const large = mainFonts();
    large.forEach((size, index) => expect(size).toBeGreaterThan(small[index]));
    expect(sideFonts()).toEqual(originalSides);
    changeSize('#timeline-side-size', 70);
    sideFonts().forEach((size, index) => expect(size).toBeLessThan(originalSides[index]));
    expect(mainFonts()).toEqual(large);
    expect(page.querySelector('.timeline-side > span')).toBeNull();
    const buttons = Array.from(page.querySelectorAll('[aria-labelledby="slider-display-label"] button'), button => button.getBoundingClientRect());
    expect(buttons.length).toBe(4);
    expect(buttons[0].top).toBe(buttons[1].top);
    expect(buttons[2].top).toBe(buttons[3].top);
    expect(buttons[3].left).toBe(buttons[1].left);
    expect(buttons[3].top).toBeGreaterThan(buttons[1].bottom);
    for (const range of Array.from(page.querySelectorAll('.size-range'))) {
      expect(page.querySelector('.config-form')!.getBoundingClientRect().right - range.getBoundingClientRect().right).toBeGreaterThanOrEqual(16);
    }
  });

  it('counts down all three timeline milestones through the standard exit and clamps at zero', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 10, 13, 16, 14, 59));
      app.form.controls.startTime.setValue('08:00');
      app.calculate(false);
      app.setTimeDisplayMode('timeline');
      expect(app.timelineValues()?.earlyEndTime).toBe('16:00');
      expect(app.timelineValues()?.lateEndTime).toBe('16:30');
      expect(app.timelineValues()?.earlyRemaining).toBe('00:00');
      expect(app.timelineValues()?.lateRemaining).toBe('00:15');
      jasmine.clock().tick(2000);
      expect(app.result()?.state).toBe('complete');
      expect(app.result()?.remainingClockLabel).toBe('00:00:00');
      expect(app.timelineValues()?.lateRemaining).toBe('00:14');
      jasmine.clock().tick(15 * 60 * 1000);
      expect(app.timelineValues()?.lateRemaining).toBe('00:00');
    } finally { jasmine.clock().uninstall(); }
  });

  it('keeps every slider step effective through the maximum size without stretching the axis gaps', () => {
    document.body.append(page);
    app.setAnimationsEnabled(false);
    app.openConfig();
    finishFinite(page.getAnimations({ subtree: true }));
    for (const mode of ['slider', 'standard', 'sideBySide', 'timeline'] as const) {
      app.setTimeDisplayMode(mode);
      fixture.detectChanges();
      expect(page.querySelector<HTMLInputElement>('#time-size')!.max).toBe('125');
      let previous = [0, 0];
      for (const size of [70, 71, 72, 118, 119, 120, 121, 122, 123, 124, 125]) {
        changeSize('#time-size', size);
        const fonts = Array.from(page.querySelectorAll<HTMLElement>('.result-time-value'), clock => parseFloat(getComputedStyle(clock).fontSize));
        fonts.forEach((font, index) => expect(font).withContext(`${mode}/${size}: main slider dead zone`).toBeGreaterThan(previous[index]));
        previous = fonts;
      }
      if (mode === 'timeline') {
        let sideFont = 0;
        for (const size of [70, 71, 118, 119, 120, 121, 122, 123, 124, 125]) {
          changeSize('#timeline-side-size', size);
          const side = page.querySelector<HTMLElement>('.timeline-early strong')!;
          const font = parseFloat(getComputedStyle(side).fontSize);
          expect(font).withContext(`${size}: side slider dead zone`).toBeGreaterThan(sideFont);
          sideFont = font;
          const axis = page.querySelector('.milestone-track')!.getBoundingClientRect();
          expect(side.getBoundingClientRect().top - axis.bottom).toBeCloseTo(10, 0);
        }
      }
    }
  });

  it('keeps the preview, drawer and maximum-size clocks within desktop, tablet and mobile widths', () => {
    app.setAnimationsEnabled(false);
    app.openConfig();
    for (const width of [390, 800, 1280]) {
      const frame = document.createElement('iframe');
      frame.style.cssText = `width:${width}px;height:1000px;border:0`;
      document.body.append(frame);
      const doc = frame.contentDocument!;
      const view = frame.contentWindow!;
      const styles = doc.createElement('style');
      styles.textContent = Array.from(document.styleSheets)
        .flatMap(sheet => Array.from(sheet.cssRules, rule => rule.cssText)).join('\n');
      doc.head.append(styles);
      doc.body.append(page);
      try {
        for (const mode of ['slider', 'timeline', 'standard', 'sideBySide'] as const) {
          app.setTimeDisplayMode(mode);
          let previousDrawer: DOMRect | undefined;
          for (const size of [70, 100, 110, 125]) {
            changeSize('#time-size', size);
            if (mode === 'timeline') changeSize('#timeline-side-size', size);
            finishFinite(doc.getAnimations());
            const preview = page.querySelector<HTMLElement>('.config-preview')!.getBoundingClientRect();
            const drawer = page.querySelector<HTMLElement>('aside')!.getBoundingClientRect();
            if (previousDrawer) {
              expect(drawer.width).withContext('Sizing clocks must not resize settings').toBe(previousDrawer.width);
              expect(drawer.x).withContext('The slider must not move horizontally while dragging').toBe(previousDrawer.x);
            }
            previousDrawer = drawer;
            expect(doc.documentElement.scrollWidth).withContext(`${width}/${mode}/${size} horizontal overflow`).toBeLessThanOrEqual(width);
            if (width > 900) expect(drawer.left).toBeGreaterThanOrEqual(preview.right);
            else expect(drawer.top).toBeGreaterThanOrEqual(preview.bottom);
            const form = page.querySelector<HTMLElement>('.config-form')!;
            expect(form.scrollWidth).withContext(`${width} settings clipped`).toBeLessThanOrEqual(form.clientWidth);
            for (const picker of Array.from(form.querySelectorAll<HTMLElement>('.accent-picker, .favorite-hour-picker'))) {
              const box = picker.getBoundingClientRect();
              for (const swatch of Array.from(picker.children)) {
                const circle = swatch.getBoundingClientRect();
                expect(circle.left - box.left).withContext(`${width} clipped selection ring`).toBeGreaterThanOrEqual(6);
                expect(box.right - circle.right).withContext(`${width} clipped selection ring`).toBeGreaterThanOrEqual(6);
              }
            }
            for (const card of Array.from(page.querySelectorAll<HTMLElement>('.result-time-card'))) {
              const bounds = card.getBoundingClientRect();
              const clock = card.querySelector<HTMLElement>('.result-time-value')!.getBoundingClientRect();
              expect(clock.left).withContext(`${width}/${mode}/${size} left clip`).toBeGreaterThan(bounds.left);
              expect(clock.right).withContext(`${width}/${mode}/${size} right clip`).toBeLessThan(bounds.right);
              if (mode === 'sideBySide' && size === 125) {
                const css = view.getComputedStyle(card);
                const availableWidth = card.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
                expect(clock.width / availableWidth).withContext(`${width}: maximum-size side-by-side clocks should fill their cards`).toBeGreaterThan(.8);
              }
              if (mode !== 'timeline') {
                const cardCenter = bounds.top + bounds.height / 2;
                const clockCenter = clock.top + clock.height / 2;
                expect(clockCenter).withContext(`${width}/${mode}/${size}: clock vertically centred in the whole card`).toBeCloseTo(cardCenter, 0);
              }
              if (mode === 'timeline') {
                const axis = card.querySelector('.milestone-track')!.getBoundingClientRect();
                expect(clock.top).withContext(`${width}/${size} main clock below axis`).toBeGreaterThanOrEqual(axis.bottom);
                for (const side of Array.from(card.querySelectorAll('.timeline-side strong'))) {
                  const box = side.getBoundingClientRect();
                  expect(box.top).withContext(`${width}/${size} side clocks below axis`).toBeGreaterThanOrEqual(axis.bottom);
                  expect(box.bottom).toBeLessThan(bounds.bottom);
                  expect(box.left).toBeGreaterThan(bounds.left);
                  expect(box.right).toBeLessThan(bounds.right);
                  expect(box.top - axis.bottom).withContext('Stable gap below the axis').toBeCloseTo(10, 0);
                }
                expect(card.querySelector('.timeline-early strong')!.getBoundingClientRect().right).toBeLessThan(clock.left);
                expect(card.querySelector('.timeline-late strong')!.getBoundingClientRect().left).toBeGreaterThan(clock.right);
              }
              expect(parseFloat(view.getComputedStyle(card.querySelector('strong')!).fontSize)).toBeGreaterThan(10);
            }
            for (const input of Array.from(page.querySelectorAll<HTMLElement>('.size-range'))) {
              expect(view.getComputedStyle(input).boxShadow).toBe('none');
              expect(view.getComputedStyle(input).borderTopWidth).toBe('0px');
              expect(view.getComputedStyle(input).paddingRight).toBe('0px');
            }
          }
        }
      } finally { document.body.append(page); frame.remove(); }
    }
  });

  it('keeps the profile in the top right header and expands settings from its moving visual copy', async () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1280px;height:1000px;border:0';
    document.body.append(frame);
    const doc = frame.contentDocument!;
    const styles = doc.createElement('style');
    styles.textContent = Array.from(document.styleSheets)
      .flatMap(sheet => Array.from(sheet.cssRules, rule => rule.cssText)).join('\n');
    doc.head.append(styles);
    doc.body.append(page);
    try {
      const button = page.querySelector<HTMLElement>('.settings-button')!;
      const origin = button.getBoundingClientRect();
      const panel = page.querySelector('.panel')!.getBoundingClientRect();
      expect(origin.right).toBeLessThan(panel.right);
      expect(origin.bottom).toBeLessThan(panel.bottom);
      expect(origin.left).toBeGreaterThan(panel.x + panel.width / 2);
      expect(origin.top).toBeLessThan(panel.y + panel.height / 2);
      expect(button.closest('.panel-header')).not.toBeNull();
      expect(page.querySelector('.form-actions')).toBeNull();
      const calculate = page.querySelector('.primary-button')!.getBoundingClientRect();
      const form = page.querySelector('.form')!.getBoundingClientRect();
      expect(calculate.width).toBeCloseTo(form.width, 0);
      button.click();
      const orb = page.querySelector<HTMLElement>('.settings-orb');
      expect(orb).not.toBeNull();
      const movement = orb!.getAnimations()[0];
      const keyframes = (movement.effect as KeyframeEffect).getKeyframes();
      const match = String(keyframes[1]['transform']).match(/translate\(([-\d.]+)px/)!;
      expect(Number(match[1])).toBeGreaterThan(0);
      expect(page.querySelectorAll('aside button[aria-label="Zamknij konfigurację"]').length).toBe(1);
      expect(page.querySelector('aside .user-icon')).toBeNull();
      expect(page.querySelector('aside')!.getAnimations().some(animation =>
        (animation.effect as KeyframeEffect).getKeyframes().some(frame => frame['clipPath']))).toBeTrue();
      finishFinite(doc.getAnimations());
      await movement.finished;
      await Promise.resolve();
      expect(page.querySelector('.settings-orb')).toBeNull();
      page.querySelector<HTMLButtonElement>('.config-close')!.click();
      const returning = page.querySelector('.settings-orb')?.getAnimations()[0];
      finishFinite(doc.getAnimations());
      if (returning) await returning.finished;
      expect(page.querySelector('.settings-button')!.getBoundingClientRect().x).toBeCloseTo(origin.x, 0);
      expect(app.isConfigOpen()).toBeFalse();
      expect(page.querySelector('#start-time')).not.toBeNull();
    } finally { document.body.append(page); frame.remove(); }
  });

  it('keeps both the settings panel and every preview rectangle unchanged when toggling light and dark themes', async () => {
    app.openConfig();
    await document.fonts.ready;
    for (const width of [390, 1280]) {
      const frame = document.createElement('iframe');
      frame.style.cssText = `width:${width}px;height:1100px;border:0`;
      document.body.append(frame);
      const doc = frame.contentDocument!;
      const styles = doc.createElement('style');
      styles.textContent = Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules, rule => rule.cssText)).join('\n');
      doc.head.append(styles);
      doc.body.append(page);
      const geometry = () => Array.from(page.querySelectorAll<HTMLElement>('.config-preview, .highlight-card, .result-time-card, .result-time-value, .timeline-side, .compact-feedback-box, aside, .config-form, .title-segment, .accent-picker, .favorite-hour-picker'), node => {
        const rect = node.getBoundingClientRect();
        const css = frame.contentWindow!.getComputedStyle(node);
        return [rect.x, rect.y, rect.width, rect.height, css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft, css.marginTop, css.marginBottom];
      });
      try {
        for (const layout of ['slider', 'timeline', 'standard', 'sideBySide'] as const) {
          app.setTimeDisplayMode(layout);
          for (const animation of ['liquid', 'none', 'reflections', 'sheen'] as const) {
            app.setCardAnimation(animation);
            for (const size of [100, 125]) {
              changeSize('#time-size', size);
              for (const mono of [false, true]) {
                app.setDarkMode(false);
                app.setAccentColor(mono ? 'black' : 'violet');
                fixture.detectChanges();
                finishFinite(doc.getAnimations());
                const light = geometry();
                app.setDarkMode(true);
                fixture.detectChanges();
                const dark = geometry();
                expect(dark).withContext(`${width}/${layout}/${animation}/${size}/${mono}: theme must not change geometry`).toEqual(light);
              }
            }
          }
        }
      } finally { document.body.append(page); frame.remove(); }
    }
  });

  it('offers four persisted effects and keeps seconds only on the main countdown, with the progress orbit always moving', () => {
    document.body.append(page);
    app.openConfig();
    app.setTimeDisplayMode('timeline');
    fixture.detectChanges();
    const options = page.querySelectorAll<HTMLButtonElement>('[aria-labelledby="animations-display-label"] button');
    expect(Array.from(options, option => option.textContent!.trim())).toEqual(['Fale', 'Brak', 'Refleksy', 'Połysk']);
    for (const [index, mode] of ['liquid', 'none', 'reflections', 'sheen'].entries()) {
      options[index].click();
      fixture.detectChanges();
      expect(app.settings().cardAnimation).toBe(mode);
      expect(JSON.parse(localStorage.getItem('workEndCalculator.settings')!).cardAnimation).toBe(mode);
      expect(page.querySelectorAll('canvas').length).toBe(mode === 'none' ? 0 : 2);
      expect(getComputedStyle(page.querySelector('.work-progress')!, '::before').animationName).toBe('progressOrbit');
      expect(page.querySelector('.remaining-time-card > strong')!.textContent).toBe('08:15:00');
      for (const clock of Array.from(page.querySelectorAll('.timeline-side strong, .exit-time-card > strong'))) {
        expect(clock.textContent).toMatch(/^\d{2}:\d{2}$/);
      }
    }
  });

  it('offers neutral cards only with Brak, preserves the application accent and keeps geometry identical in every layout and palette', () => {
    document.body.append(page);
    app.openConfig();
    expect(page.querySelector('[aria-labelledby="card-accent-label"]')).toBeNull();
    app.setCardAnimation('none');
    fixture.detectChanges();
    const options = page.querySelectorAll<HTMLButtonElement>('[aria-labelledby="card-accent-label"] button');
    expect(Array.from(options, option => option.textContent!.trim())).toEqual(['Tak', 'Nie']);
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    const rectangles = () => Array.from(page.querySelectorAll('.highlight-card, .result-time-card, .result-time-value, .timeline-side, .compact-feedback-box'), element => {
      const rect = element.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height];
    });
    for (const dark of [false, true]) {
      app.setDarkMode(dark);
      for (const accent of app.accentOptions) {
        app.setAccentColor(accent.value);
        for (const layout of ['slider', 'timeline', 'standard', 'sideBySide'] as const) {
          app.setTimeDisplayMode(layout);
          options[0].click();
          fixture.detectChanges();
          finishFinite(page.getAnimations({ subtree: true }));
          const before = rectangles();
          const root = page.querySelector('app-root')!;
          const selectedAccent = root.querySelector('.accent-swatch.active')!;
          const accentStyle = getComputedStyle(selectedAccent).backgroundImage;
          options[1].click();
          fixture.detectChanges();
          expect(rectangles()).withContext(`${dark}/${accent.value}/${layout}: colour must not change layout`).toEqual(before);
          expect(root.classList.contains('neutral-time-cards')).toBeTrue();
          expect(app.isAccentSelected(accent.value)).toBeTrue();
          expect(getComputedStyle(selectedAccent).backgroundImage).toBe(accentStyle);
          expect(root.querySelector('canvas')).toBeNull();
          for (const card of Array.from(root.querySelectorAll('.result-time-card'))) {
            expect(getComputedStyle(card).backgroundImage).toBe('none');
            expect(getComputedStyle(card).backgroundColor).toBe(dark ? 'rgb(38, 38, 38)' : 'rgb(255, 255, 255)');
            for (const clock of Array.from(card.querySelectorAll('strong'))) {
              expect(getComputedStyle(clock).color).withContext(`${dark}/${accent.value}/${layout}: pure clock colour`).toBe(dark ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)');
            }
          }
          expect(getComputedStyle(root.querySelector('.highlight-card')!).backgroundImage).toBe('none');
          expect(getComputedStyle(root.querySelector('.work-progress')!, '::before').animationName).toBe('progressOrbit');
        }
      }
    }
    for (const animation of ['liquid', 'reflections', 'sheen'] as const) {
      app.setCardAnimation(animation);
      fixture.detectChanges();
      expect(page.querySelector('[aria-labelledby="card-accent-label"]')).toBeNull();
      expect(app.neutralTimeCardsClass).toBeFalse();
      expect(app.settings().cardAccentEnabled).toBeFalse();
    }
    app.setCardAnimation('none');
    fixture.detectChanges();
    expect(page.querySelector('[aria-labelledby="card-accent-label"] button:last-child')!.getAttribute('aria-checked')).toBe('true');
    expect(JSON.parse(localStorage.getItem('workEndCalculator.settings')!).cardAccentEnabled).toBeFalse();
    expect(localStorage.getItem('workEndCalculator.dailyPlan')).toBeNull();
  });

  it('shrinks the outgoing settings surface into a profile icon and flies it back without moving the final form', async () => {
    document.body.append(page);
    app.openConfig();
    const opening = page.querySelector('.settings-orb')?.getAnimations()[0];
    finishFinite(page.getAnimations({ subtree: true }));
    if (opening) await opening.finished;
    app.closeConfig();
    const departing = page.querySelector<HTMLElement>('.settings-departing')!;
    const orb = page.querySelector<HTMLElement>('.settings-orb')!;
    expect(departing).not.toBeNull();
    expect(departing.hasAttribute('inert')).toBeTrue();
    expect(departing.querySelector('[id]')).toBeNull();
    expect(page.querySelector('#start-time')).not.toBeNull();
    const motion = orb.getAnimations()[0];
    const fold = departing.getAnimations()[0];
    const frames = (fold.effect as KeyframeEffect).getKeyframes();
    expect(String(frames.at(-1)!['clipPath'])).toContain('24px');
    finishFinite(page.getAnimations({ subtree: true }));
    await motion.finished;
    await fold.finished;
    expect(page.querySelector('.settings-departing, .settings-orb')).toBeNull();
    expect(page.querySelector('.panel-header .settings-button')).not.toBeNull();
  });
});

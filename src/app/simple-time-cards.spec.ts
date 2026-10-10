import { Component } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { TIME_COLON_GAP_EM, TIME_COLON_OFFSET_EM } from './time-typography';
import { PANEL_MOTION } from './panel-motion.directive';

// Render the real app-root tag so the production theme selectors apply.
@Component({ standalone: true, imports: [AppComponent], template: '<app-root></app-root>' })
class AppHostComponent {}

describe('Simple time cards', () => {
  function channels(css: string): { rgb: number[]; alpha: number } {
    const values = css.match(/[\d.]+/g)!.map(Number);
    return {
      rgb: css.startsWith('color') ? values.slice(0, 3) : values.slice(0, 3).map(value => value / 255),
      alpha: values[3] ?? 1,
    };
  }

  function luminance(css: string, background?: string): number {
    const foreground = channels(css);
    const paper = background ? channels(background).rgb : [1, 1, 1];
    const normalized = foreground.rgb.map((value, index) => value * foreground.alpha + paper[index] * (1 - foreground.alpha));
    const linear = normalized.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  }

  it('makes selected light settings clearly distinct and readable in every palette after changing options', () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
    const fixture = TestBed.createComponent(AppHostComponent);
    fixture.detectChanges();
    const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
    app.setDarkMode(false);
    app.openConfig();
    try {
      for (const option of app.accentOptions) {
        app.setAccentColor(option.value);
        fixture.detectChanges();
        const dialog = fixture.nativeElement.querySelector('.config-dialog') as HTMLElement;
        const groups = Array.from(dialog.querySelectorAll<HTMLElement>('.theme-segment, .title-segment'));
        const checkSelection = (group: HTMLElement) => {
          dialog.getAnimations({ subtree: true }).forEach(animation => animation.finish());
          const selected = group.querySelector<HTMLButtonElement>('button.active')!;
          const unselected = group.querySelector<HTMLButtonElement>('button:not(.active)')!;
          const activeStyle = getComputedStyle(selected);
          const inactiveStyle = getComputedStyle(unselected);
          // The last three stops are the main glass surface; the first is its top reflection.
          const surfaces = activeStyle.backgroundImage.match(/(?:rgba?|color)\([^)]*\)/g)!.slice(-3);
          expect(surfaces.length).toBe(3);
          const marker = getComputedStyle(selected, '::after');
          expect(marker.content).toBe('none');
          for (const [index, surface] of surfaces.entries()) {
            const paper = luminance(surface);
            const ink = luminance(activeStyle.color, surface);
            const idle = luminance(inactiveStyle.backgroundColor);
            expect((Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05))
              .withContext(`${option.value}: selected text`).toBeGreaterThan(4.5);
            if (index === 1) {
              expect((Math.max(paper, idle) + 0.05) / (Math.min(paper, idle) + 0.05))
                .withContext(`${option.value}: softly tinted selected surface`).toBeGreaterThan(1.2);
            }
          }
        };
        expect(groups.length).toBe(4);
        groups.forEach(group => checkSelection(group));
        for (const group of groups.filter(group => group.classList.contains('title-segment'))) {
          const next = group.querySelector<HTMLButtonElement>('button:not(.active)')!;
          const before = next.getBoundingClientRect();
          next.click();
          fixture.detectChanges();
          expect(next.classList.contains('active')).toBeTrue();
          expect(next.getAttribute('aria-checked')).toBe('true');
          checkSelection(group);
          expect(next.getBoundingClientRect().height).toBe(before.height);
        }
      }
    } finally {
      fixture.destroy();
      localStorage.clear();
    }
  });

  it('leaves every selected setting unchanged on hover while alternatives retain sheen and shadow in both themes', () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
    const fixture = TestBed.createComponent(AppHostComponent);
    fixture.detectChanges();
    const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
    app.openConfig();
    // Exercise the production hover declarations through a deterministic test state.
    // This avoids depending on the headless browser's mouse or pointer media query.
    const hoverRules: string[] = [];
    const visit = (rules: CSSRuleList) => Array.from(rules).forEach(rule => {
      if (rule instanceof CSSStyleRule) {
        const selectors = rule.selectorText.split(',').filter(selector => selector.includes(':hover'));
        if (selectors.length) hoverRules.push(`${selectors.join(',').replace(/:hover/g, '[data-test-hover]')} { ${rule.style.cssText} }`);
      } else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
    });
    Array.from(document.styleSheets).forEach(sheet => visit(sheet.cssRules));
    const stateStyles = document.createElement('style');
    stateStyles.textContent = hoverRules.join('\n');
    document.head.append(stateStyles);
    try {
      for (const dark of [false, true]) {
        app.setDarkMode(dark);
        fixture.detectChanges();
        const dialog = fixture.nativeElement.querySelector('.config-dialog') as HTMLElement;
        dialog.getAnimations({ subtree: true }).forEach(animation => animation.finish());
        const selected = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button.active'));
        expect(selected.length).toBe(6);
        for (const button of selected) {
          const initial = getComputedStyle(button);
          const before = [initial.backgroundImage, initial.color, initial.boxShadow];
          button.setAttribute('data-test-hover', '');
          dialog.getAnimations({ subtree: true }).forEach(animation => animation.finish());
          const after = getComputedStyle(button);
          expect([after.backgroundImage, after.color, after.boxShadow]).withContext(`${dark}: ${button.textContent}`).toEqual(before);
          const sheen = button.querySelector('.button-sheen')!;
          expect(getComputedStyle(sheen, '::before').animationName).toBe('none');
          expect(getComputedStyle(sheen, '::after').opacity).toBe('0');
          button.removeAttribute('data-test-hover');
        }
        for (const button of Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(.active):not(.icon-button)'))) {
          const before = getComputedStyle(button).boxShadow;
          button.setAttribute('data-test-hover', '');
          const animations = dialog.getAnimations({ subtree: true });
          const flash = animations.find(animation => (animation as CSSAnimation).animationName === 'buttonSheen')!;
          expect(flash).toBeDefined();
          const sheen = button.querySelector<HTMLElement>('.button-sheen')!;
          dialog.getAnimations({ subtree: true }).forEach(animation => animation.finish());
          // Tint covers the whole surface independently of the moving reflection.
          flash.pause(); flash.currentTime = 0;
          expect(getComputedStyle(sheen, '::after').transform).toBe('none');
          expect(getComputedStyle(sheen, '::after').animationName).toBe('none');
          expect(getComputedStyle(button).boxShadow).not.toBe(before);
          expect(getComputedStyle(sheen, '::before').animationName).toBe('buttonSheen');
          expect(getComputedStyle(sheen, '::after').opacity).toBe('1');
          button.removeAttribute('data-test-hover');
          dialog.getAnimations({ subtree: true }).forEach(animation => animation.finish());
        }
      }
    } finally {
      stateStyles.remove();
      fixture.destroy();
      localStorage.clear();
    }
  });

  it('uses a single soft calculated-control rim only in light mode, keeping dark rims as calm as the form', () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
    const fixture = TestBed.createComponent(AppHostComponent);
    fixture.detectChanges();
    const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
    app.setAnimationsEnabled(false);
    app.form.controls.startTime.setValue('08:00');
    app.calculate(false);
    const root = fixture.nativeElement as HTMLElement;
    try {
      for (const dark of [false, true]) {
        app.setDarkMode(dark);
        for (const option of app.accentOptions) {
          app.setAccentColor(option.value);
          app.isCompactMode.set(false);
          fixture.detectChanges();
          const calmRim = getComputedStyle(root.querySelector('.primary-button')!).borderColor;
          app.isCompactMode.set(true);
          fixture.detectChanges();
          const controls = Array.from(root.querySelectorAll<HTMLElement>(
            '.compact-highlight .edit-button, .compact-highlight .compact-detail, .compact-highlight .offset-button, .compact-highlight .offset-orb',
          ));
          expect(controls.length).toBe(5);
          const rim = getComputedStyle(controls[0]).borderColor;
          if (dark) {
            expect(rim).withContext(option.value).toBe(calmRim);
          } else {
            expect(rim).withContext(option.value).not.toBe(calmRim);
            expect(getComputedStyle(controls[0]).boxShadow).not.toContain('0px 0px 0px 1px');
          }
          controls.forEach(control => expect(getComputedStyle(control).borderColor).withContext(`${dark}/${option.value}`).toBe(rim));
        }
      }
    } finally {
      fixture.destroy();
      localStorage.clear();
    }
  });

  it('clips the real calculate-button ripple without moving its label or changing its dimensions', () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    const fixture = TestBed.createComponent(AppHostComponent);
    fixture.detectChanges();
    const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
    app.form.controls.startTime.setValue('08:00');
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.primary-button') as HTMLButtonElement;
    const label = button.querySelector('span:not(.button-sheen)')!;
    const beforeButton = button.getBoundingClientRect();
    const beforeLabel = label.getBoundingClientRect();
    try {
      button.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: beforeButton.left + 15, clientY: beforeButton.top + 15 }));
      const layer = button.querySelector('.button-ripple-layer')!;
      const ink = button.querySelector('.button-ripple')!;
      expect(getComputedStyle(layer).position).toBe('absolute');
      expect(getComputedStyle(layer).overflow).toBe('hidden');
      expect(getComputedStyle(ink).position).toBe('absolute');
      expect(button.getBoundingClientRect().height).toBe(beforeButton.height);
      expect(label.getBoundingClientRect().x).toBe(beforeLabel.x);
      expect(label.getBoundingClientRect().y).toBe(beforeLabel.y);
      expect(app.result()).toBeNull();
    } finally {
      fixture.destroy();
      localStorage.clear();
    }
  });

  it('distinguishes the start placeholder from typed text while keeping it readable in every palette', () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
    const fixture = TestBed.createComponent(AppHostComponent);
    fixture.detectChanges();
    const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
    try {
      for (const dark of [false, true]) {
        app.setDarkMode(dark);
        for (const option of app.accentOptions) {
          app.setAccentColor(option.value);
          fixture.detectChanges();
          const input = fixture.nativeElement.querySelector('#start-time') as HTMLInputElement;
          const ink = getComputedStyle(input);
          const hint = getComputedStyle(input, '::placeholder');
          expect(hint.fontStyle).toBe('italic');
          expect(Number(hint.fontWeight)).toBeLessThan(Number(ink.fontWeight));
          expect(parseFloat(hint.fontSize)).toBeLessThan(parseFloat(ink.fontSize));
          expect(hint.color).not.toBe(ink.color);
          const surfaces = ink.backgroundImage.match(/(?:rgba?|color)\([^)]*\)/g)!;
          for (const surface of surfaces) {
            const paper = luminance(surface);
            const label = luminance(hint.color, surface);
            expect((Math.max(label, paper) + .05) / (Math.min(label, paper) + .05))
              .withContext(`${dark}/${option.value}: placeholder contrast`).toBeGreaterThan(4.5);
          }
        }
      }
    } finally {
      fixture.destroy();
      localStorage.clear();
    }
  });

  it('renders softly tinted, readable clocks in all twelve palettes without creating a graphics context', () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
    const context = spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue(null);
    const fixture = TestBed.createComponent(AppHostComponent);
    fixture.detectChanges();
    const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
    app.setAnimationsEnabled(false);
    app.form.controls.startTime.setValue('08:00');
    app.calculate(false);
    try {
      for (const dark of [false, true]) {
        app.setDarkMode(dark);
        const paletteColors = new Set<string>();
        for (const option of app.accentOptions) {
          app.setAccentColor(option.value);
          fixture.detectChanges();
          const root = fixture.nativeElement.querySelector('app-root') as HTMLElement;
          expect(root.querySelector('canvas')).withContext(`${dark}/${option.value}`).toBeNull();
          const cards = Array.from(root.querySelectorAll<HTMLElement>('.result-time-card'));
          expect(cards.length).toBe(2);
          for (const card of cards) {
            const text = card.querySelector('strong')!;
            const style = getComputedStyle(text);
            paletteColors.add(style.color);
            expect(style.color).not.toBe('rgb(255, 255, 255)');
            expect(style.color).not.toBe('rgb(0, 0, 0)');
            expect(style.webkitTextStrokeWidth).toBe('0px');
            expect(style.textShadow).toBe('none');
            const surfaceColors = getComputedStyle(card).backgroundImage.match(/(?:rgba?|color)\([^)]*\)/g)!;
            expect(surfaceColors.length).toBeGreaterThan(0);
            for (const surface of surfaceColors) {
              const paper = luminance(surface);
              const ink = luminance(style.color, surface);
              const contrast = (Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05);
              expect(contrast).withContext(`${dark}/${option.value}: ${style.color} on ${surface}`).toBeGreaterThan(4.5);
            }
          }
        }
        expect(paletteColors.size).toBe(app.accentOptions.length);
      }
      expect(context).not.toHaveBeenCalled();
    } finally {
      fixture.destroy();
      localStorage.clear();
    }
  });

  it('centres the colon optically in the actual numeral font and preserves readable, responsive text when Flow is off', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
    const fixture = TestBed.createComponent(AppHostComponent);
    fixture.detectChanges();
    const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
    app.setAnimationsEnabled(false);
    app.form.controls.startTime.setValue('08:00');
    app.calculate(false);
    fixture.detectChanges();
    try {
      await document.fonts.load('900 100px "Nunito Glass"');
      const measure = document.createElement('canvas').getContext('2d')!;
      measure.font = '900 100px "Nunito Glass"';
      const centre = (glyph: string) => {
        const metrics = measure.measureText(glyph);
        return (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2;
      };
      expect(Math.abs(centre(':') + 100 * TIME_COLON_OFFSET_EM - centre('0'))).toBeLessThan(2);
      for (const dark of [false, true]) {
        app.setDarkMode(dark);
        fixture.detectChanges();
        for (const card of Array.from(fixture.nativeElement.querySelectorAll('.result-time-card')) as HTMLElement[]) {
          const clock = card.querySelector<HTMLElement>('strong')!;
          const glyphs = Array.from(clock.querySelectorAll<HTMLElement>('.time-glyph'));
          expect(glyphs.map(glyph => glyph.textContent).join('')).toBe(clock.textContent!);
          expect(clock.getBoundingClientRect().width).toBeLessThan(card.clientWidth);
          for (const separator of glyphs.filter(glyph => glyph.classList.contains('time-separator'))) {
            const style = getComputedStyle(separator);
            const fontSize = parseFloat(style.fontSize);
            expect(parseFloat(style.top)).toBeCloseTo(fontSize * TIME_COLON_OFFSET_EM, 2);
            expect(parseFloat(style.paddingLeft)).toBeCloseTo(fontSize * TIME_COLON_GAP_EM, 2);
            expect(style.paddingRight).toBe(style.paddingLeft);
          }
        }
      }
    } finally {
      fixture.destroy();
      localStorage.clear();
    }
  });

  it('disables unfold, collapse and view-transition CSS when reduced motion is requested', () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
    const fixture = TestBed.createComponent(AppHostComponent);
    fixture.detectChanges();
    const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
    app.setAnimationsEnabled(false);
    app.form.controls.startTime.setValue('08:00');
    app.calculate(false);
    app.isCompactMode.set(false);
    app.addBreak();
    app.showAdjustment('overtimePickup');
    app.isResultRevealing.set(true);
    fixture.detectChanges();
    // Apply the real reduced-motion declarations independently of the test machine's OS preference.
    const declarations: string[] = [];
    const visit = (rules: CSSRuleList) => Array.from(rules).forEach(rule => {
      if (rule instanceof CSSMediaRule && rule.conditionText.includes('prefers-reduced-motion: reduce')) {
        declarations.push(Array.from(rule.cssRules, inner => inner.cssText).join('\n'));
      } else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
    });
    Array.from(document.styleSheets).forEach(sheet => visit(sheet.cssRules));
    const reducedStyles = document.createElement('style');
    reducedStyles.textContent = declarations.join('\n');
    document.head.append(reducedStyles);
    try {
      const root = fixture.nativeElement as HTMLElement;
      const rows = Array.from(root.querySelectorAll<HTMLElement>('.break-row, .adjustment-row'));
      for (const row of rows) {
        expect(getComputedStyle(row).animationName).toBe('none');
        Array.from(row.children).forEach(child => expect(getComputedStyle(child).animationName).toBe('none'));
        row.classList.add('dynamic-card-leaving');
        expect(getComputedStyle(row).animationName).toBe('none');
      }
      app.isSwitchingToResult.set(true);
      fixture.detectChanges();
      for (const target of Array.from(root.querySelectorAll('.panel-header, .form, .highlight-card, .result-time-card, .message-card'))) {
        expect(getComputedStyle(target).animationName).toBe('none');
      }
      app.isCompactMode.set(true);
      app.isSwitchingToForm.set(true);
      fixture.detectChanges();
      for (const target of Array.from(root.querySelectorAll('.result-block, .compact-toolbar, .exit-slider, .compact-feedback-box'))) {
        expect(getComputedStyle(target).animationName).toBe('none');
      }
    } finally {
      reducedStyles.remove();
      fixture.destroy();
      localStorage.clear();
    }
  });

  it('hands the moving card rim back to the settled card without changing its color, geometry or input size', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
    const fixture = TestBed.createComponent(AppHostComponent);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
    try {
      for (const dark of [false, true]) {
        app.setDarkMode(dark);
        app.addBreak();
        fixture.detectChanges();
        const row = fixture.nativeElement.querySelector('.break-row') as HTMLElement;
        const host = row.closest('.motion-border-active') as HTMLElement;
        const shadow = getComputedStyle(host, '::before').boxShadow;
        const animation = host.getAnimations()[0];
        animation.pause();
        for (const elapsed of [40, 100, 200, 400]) {
          animation.currentTime = elapsed;
          const rim = getComputedStyle(host, '::before');
          expect(rim.boxShadow).toBe(shadow);
          expect(parseFloat(rim.top) + parseFloat(rim.height)).toBeCloseTo(host.getBoundingClientRect().height, 0);
        }
        const next = fixture.nativeElement.querySelector('.primary-button') as HTMLElement;
        const y = next.getBoundingClientRect().y;
        animation.finish();
        await animation.finished;
        expect(host.classList.contains('motion-border-active')).toBeFalse();
        expect(getComputedStyle(row).boxShadow).toBe(shadow);
        expect(next.getBoundingClientRect().y).toBeCloseTo(y, 1);
        app.breaks.clear();
        fixture.detectChanges();
      }
    } finally { fixture.destroy(); fixture.nativeElement.remove(); localStorage.clear(); }
  });

  it('keeps a group of breaks stable when adding during expansion and closing several rows in quick succession', fakeAsync(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
    const fixture = TestBed.createComponent(AppHostComponent);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLElement>('.primary-button')!;
    const baseline = button.getBoundingClientRect().y;
    const gridMotion = (node: Element) => node.getAnimations().find(animation => (animation.effect as KeyframeEffect).getKeyframes().some(frame => frame['gridTemplateRows'] !== undefined))!;
    try {
      app.addBreak();
      fixture.detectChanges();
      const group = root.querySelector<HTMLElement>('.form > .dynamic-panel-frame')!;
      const enter = gridMotion(group);
      enter.pause();
      enter.currentTime = 100;
      app.addBreak();
      fixture.detectChanges();
      const rows = Array.from(root.querySelectorAll('.breaks > .dynamic-panel-frame'));
      const secondEnter = gridMotion(rows[1]);
      enter.finish();
      secondEnter.finish();
      tick(0);
      const expanded = button.getBoundingClientRect().y;
      expect(root.querySelectorAll('.break-row').length).toBe(2);
      expect(enter.playState).toBe('finished');
      expect(group.getBoundingClientRect().height).toBeCloseTo(group.firstElementChild!.getBoundingClientRect().height, 1);
      expect(button.getBoundingClientRect().y).toBeCloseTo(expanded, 1);
      app.removeBreak(0);
      fixture.detectChanges();
      const firstLeave = gridMotion(rows[0]);
      firstLeave.pause();
      firstLeave.currentTime = 100;
      tick(100);
      app.removeBreak(1);
      fixture.detectChanges();
      const groupLeave = gridMotion(group);
      const secondLeave = gridMotion(rows[1]);
      firstLeave.currentTime = PANEL_MOTION.leave;
      groupLeave.pause();
      groupLeave.currentTime = 220;
      secondLeave.pause();
      secondLeave.currentTime = 220;
      const beforeFirstRemoval = button.getBoundingClientRect().y;
      tick(PANEL_MOTION.remove - 100);
      fixture.detectChanges();
      expect(root.querySelectorAll('.break-row').length).toBe(1);
      expect(button.getBoundingClientRect().y).toBeCloseTo(beforeFirstRemoval, 1);
      groupLeave.currentTime = PANEL_MOTION.leave;
      secondLeave.currentTime = PANEL_MOTION.leave;
      const beforeLastRemoval = button.getBoundingClientRect().y;
      tick(100);
      fixture.detectChanges();
      expect(root.querySelectorAll('.break-row').length).toBe(0);
      expect(button.getBoundingClientRect().y).toBeCloseTo(beforeLastRemoval, 1);
      expect(button.getBoundingClientRect().y).toBeCloseTo(baseline, 1);
    } finally {
      fixture.destroy();
      fixture.nativeElement.remove();
      localStorage.clear();
    }
  }));

  it('opens and closes all three field panels smoothly, preserving input geometry and settling without a jump at desktop and mobile widths', fakeAsync(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
    for (const width of [390, 600, 1024]) {
      for (const dark of [false, true]) {
        const fixture = TestBed.createComponent(AppHostComponent);
        fixture.detectChanges();
        const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
        app.setDarkMode(dark);
        fixture.detectChanges();
        // A same-origin test frame exercises the real responsive styles at each width.
        const frame = document.createElement('iframe');
        frame.style.cssText = `width:${width}px;height:1200px;border:0;`;
        document.body.append(frame);
        const page = frame.contentDocument!;
        const styles = page.createElement('style');
        styles.textContent = Array.from(document.styleSheets)
          .flatMap(sheet => Array.from(sheet.cssRules, rule => rule.cssText)).join('\n');
        page.head.append(styles);
        page.body.append(fixture.nativeElement);
        const view = frame.contentWindow!;
        try {
          expect(view.innerWidth).toBe(width);
          const actions = [
            { open: () => app.addBreak(), close: () => app.removeBreak(0), selector: '.break-row' },
            { open: () => app.showAdjustment('overtimePickup'), close: () => app.removeAdjustment('overtimePickup'), selector: '[formgroupname="overtimePickup"]' },
            { open: () => app.showAdjustment('undertimeMakeup'), close: () => app.removeAdjustment('undertimeMakeup'), selector: '[formgroupname="undertimeMakeup"]' },
          ];
          page.getAnimations().forEach(animation => animation.finish());
          for (const action of actions) {
            const next = page.querySelector<HTMLElement>('.primary-button')!;
            const baseline = next.getBoundingClientRect().y;
            action.open();
            fixture.detectChanges();
            const row = page.querySelector<HTMLElement>(action.selector)!;
            const snapshot = () => {
              const bounds = row.getBoundingClientRect();
              const style = view.getComputedStyle(row);
              return [bounds.width, bounds.height, style.paddingTop, style.paddingBottom];
            };
            expect(row.classList.contains('dynamic-card-enter')).toBeTrue();
            expect(view.getComputedStyle(row.closest('.motion-border-active')!, '::before').boxShadow).not.toBe('none');
            expect(row.getBoundingClientRect().height).toBeGreaterThan(80);
            const initial = snapshot();
            const findMotion = () => page.getAnimations().find(animation => (animation.effect as KeyframeEffect).getKeyframes().some(key => key['gridTemplateRows'] !== undefined))!;
            const unfold = findMotion();
            expect(unfold).withContext('The actual layout slot should unfold with the surrounding form').toBeDefined();
            const borderHost = (unfold.effect as KeyframeEffect).target as HTMLElement;
            const rim = () => view.getComputedStyle(borderHost, '::before');
            expect(borderHost.classList.contains('motion-border-active')).toBeTrue();
            expect(rim().boxShadow).not.toBe('none');
            expect(view.getComputedStyle(row).boxShadow).toBe('none');
            unfold.pause();
            let previous = baseline;
            for (const elapsed of [0, 80, 160, 260, PANEL_MOTION.enter]) {
              unfold.currentTime = elapsed;
              expect(snapshot()).withContext(`${width}/${dark}/${action.selector} inputs at ${elapsed}ms`).toEqual(initial);
              const position = next.getBoundingClientRect().y;
              if (elapsed === 0) expect(position).toBeCloseTo(baseline, 1);
              else expect(position).withContext(`${width}/${dark}/${action.selector} should move smoothly downward`).toBeGreaterThan(previous);
              if (elapsed > 0) {
                const edge = parseFloat(rim().top) + parseFloat(rim().height);
                expect(edge).withContext('The bottom rim follows the visible card throughout expansion').toBeCloseTo(borderHost.getBoundingClientRect().height, 0);
              }
              previous = position;
            }
            expect(view.getComputedStyle(row, '::after').animationName).toBe('dynamicCardSweep');
            unfold.finish();
            tick(0);
            const expanded = next.getBoundingClientRect().y;
            tick(860);
            fixture.detectChanges();
            expect(row.classList.contains('dynamic-card-enter')).toBeFalse();
            expect(snapshot()).toEqual(initial);
            expect(next.getBoundingClientRect().y).toBeCloseTo(expanded, 1);
            action.close();
            fixture.detectChanges();
            const fold = findMotion();
            fold.pause();
            previous = expanded;
            for (const elapsed of [0, 80, 160, PANEL_MOTION.leave]) {
              fold.currentTime = elapsed;
              const position = next.getBoundingClientRect().y;
              if (elapsed === 0) expect(position).toBeCloseTo(expanded, 1);
              else expect(position).toBeLessThan(previous);
              previous = position;
              expect(view.getComputedStyle(row).filter).toBe('none');
            }
            const collapsed = next.getBoundingClientRect().y;
            tick(PANEL_MOTION.remove);
            fixture.detectChanges();
            expect(page.querySelector(action.selector)).toBeNull();
            expect(next.getBoundingClientRect().y).withContext('Removing a collapsed panel must not shift the button').toBeCloseTo(collapsed, 1);
            expect(next.getBoundingClientRect().y).toBeCloseTo(baseline, 1);
          }
        } finally {
          fixture.destroy();
          frame.remove();
          localStorage.clear();
        }
      }
    }
  }));
});

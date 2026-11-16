import { Component } from '@angular/core';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { LiquidBackdropComponent } from './liquid-backdrop.component';
import { LiquidFlowRenderer } from './liquid-flow-renderer';

@Component({ standalone: true, imports: [AppComponent], template: '<app-root></app-root>' })
class AppHostComponent {}

describe('Clock loading after refresh', () => {
  interface PendingFrame {
    card: HTMLElement;
    renderer: jasmine.SpyObj<LiquidFlowRenderer>;
    complete: () => void;
    next: () => void;
  }
  let frames: PendingFrame[];

  beforeEach(() => {
    localStorage.clear();
    frames = [];
    spyOn<any>(LiquidBackdropComponent.prototype, 'createRenderer').and.callFake((card: HTMLElement) => {
      let complete!: () => void;
      let ready = new Promise<void>(resolve => complete = resolve);
      const renderer = jasmine.createSpyObj<LiquidFlowRenderer>('renderer', ['updateFrame', 'dispose', 'copyFrame']);
      // A getter is needed because a reactivated prewarmed card requests a new frame.
      Object.defineProperty(renderer, 'ready', { get: () => ready });
      const frame: PendingFrame = {
        card, renderer,
        complete: () => { card.classList.add('has-liquid-canvas'); complete(); },
        next: () => { ready = new Promise<void>(resolve => complete = resolve); },
      };
      frames.push(frame);
      return renderer;
    });
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
  });

  afterEach(() => localStorage.clear());

  function savePlan(dark: boolean, layout: 'slider' | 'standard' | 'timeline' | 'sideBySide', animated = true): void {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    app.setDarkMode(dark);
    app.setTimeDisplayMode(layout);
    app.setCardAnimation(animated ? 'liquid' : 'none');
    app.form.controls.startTime.setValue('08:43');
    app.calculate(false);
    fixture.destroy();
  }

  function finishTransitions(root: HTMLElement): void {
    root.getAnimations({ subtree: true }).filter(animation =>
      Number.isFinite(animation.effect?.getComputedTiming().endTime)).forEach(animation => animation.finish());
  }

  it('keeps both restored cards as skeletons until both frames are ready, with no layout jump in either theme or layout', fakeAsync(() => {
    for (const dark of [false, true]) {
      for (const layout of ['slider', 'standard', 'timeline', 'sideBySide'] as const) {
        localStorage.clear(); frames = [];
        savePlan(dark, layout);
        const fixture = TestBed.createComponent(AppHostComponent);
        try {
          fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
          const root = fixture.nativeElement as HTMLElement;
          const cards = Array.from(root.querySelectorAll<HTMLElement>('.result-time-card'));
          expect(frames.length).toBe(2);
          finishTransitions(root);
          const boxes = cards.map(card => card.getBoundingClientRect().toJSON());
          for (const card of cards) {
            expect(card.getAttribute('aria-busy')).toBe('true');
            expect(getComputedStyle(card.querySelector('.time-glyph')!).opacity).toBe('0');
            expect(getComputedStyle(card.querySelector('.liquid-flow-fallback')!).opacity).toBe('0');
            expect(getComputedStyle(card.querySelector('canvas')!).opacity).toBe('0');
            expect(getComputedStyle(card.querySelector('.result-time-value')!, '::after').opacity).toBe('1');
          }
          frames[0].complete(); flushMicrotasks(); fixture.detectChanges();
          expect(cards.every(card => card.classList.contains('graphics-loading'))).toBeTrue();
          frames[1].complete(); flushMicrotasks(); fixture.detectChanges(); finishTransitions(root);
          for (const [index, card] of cards.entries()) {
            expect(card.hasAttribute('aria-busy')).toBeFalse();
            expect(getComputedStyle(card.querySelector('canvas')!).opacity).toBe('1');
            expect(getComputedStyle(card.querySelector('.liquid-flow-fallback')!).display).toBe('none');
            expect(getComputedStyle(card.querySelector('.result-time-value')!, '::after').opacity).toBe('0');
            expect(card.getBoundingClientRect().toJSON()).toEqual(boxes[index]);
          }
          tick(1000); fixture.detectChanges(); flushMicrotasks();
          expect(cards.some(card => card.classList.contains('graphics-loading'))).toBeFalse();
        } finally { fixture.destroy(); flushMicrotasks(); }
      }
    }
  }));

  it('immediately displays the saved plain clock without a loader or GPU work', fakeAsync(() => {
    savePlan(true, 'timeline', false);
    const fixture = TestBed.createComponent(AppHostComponent);
    try {
      fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
      expect(frames.length).toBe(0);
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.graphics-loading')).toBeNull();
      expect(getComputedStyle(root.querySelector('.result-time-value .time-glyph')!).opacity).toBe('1');
      expect(root.querySelector('.remaining-time-card .result-time-value')!.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    } finally { fixture.destroy(); }
  }));

  it('holds the exact plain preview until Refleksy is ready, then crossfades the whole card without moving the clocks', async () => {
    const cases = [false, true].flatMap(dark =>
      (['slider', 'standard', 'timeline', 'sideBySide'] as const).flatMap(layout =>
        [70, 125].map(scale => ({ dark, layout, scale }))));
    for (const { dark, layout, scale } of cases) {
      localStorage.clear(); frames = [];
      savePlan(dark, layout, false);
      const fixture = TestBed.createComponent(AppHostComponent);
      try {
        fixture.detectChanges(); await Promise.resolve(); fixture.detectChanges();
        const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
        app.openConfig(); app.setCardAccentEnabled(false);
        app.setTimeScale('timeScale', { target: { value: String(scale) } } as unknown as Event);
        app.setTimeScale('timelineSideScale', { target: { value: String(scale === 70 ? 125 : 70) } } as unknown as Event);
        fixture.detectChanges(); await Promise.resolve(); fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        finishTransitions(root); await Promise.resolve();
        const before = root.querySelector<HTMLElement>('.compact-highlight')!;
        const oldBackground = getComputedStyle(before).background;
        const clockSelector = '.result-time-value, .timeline-side > strong';
        const oldClocks = Array.from(before.querySelectorAll<HTMLElement>(clockSelector));
        const oldGeometry = oldClocks.map(clock => clock.getBoundingClientRect().toJSON());
        const oldColors = oldClocks.map(clock => getComputedStyle(clock).color);
        app.setCardAnimation('reflections'); fixture.detectChanges(); await Promise.resolve(); fixture.detectChanges();
        const snapshot = root.querySelector<HTMLElement>('.clock-style-snapshot')!;
        expect(snapshot).not.toBeNull();
        expect(snapshot.hasAttribute('inert')).toBeTrue();
        expect(snapshot.getAttribute('aria-hidden')).toBe('true');
        expect(snapshot.querySelector('[id]')).toBeNull();
        expect(getComputedStyle(snapshot.querySelector('.compact-highlight')!).background).toBe(oldBackground);
        const clocks = Array.from(snapshot.querySelectorAll<HTMLElement>(clockSelector));
        expect(clocks.map(clock => clock.getBoundingClientRect().toJSON())).toEqual(oldGeometry);
        expect(clocks.map(clock => getComputedStyle(clock).color)).toEqual(oldColors);
        expect(app.clockGraphicsLoading()).toBeTrue();
        frames[0].complete(); await Promise.resolve(); fixture.detectChanges();
        expect(snapshot.getAnimations().length).toBe(0);
        frames[1].complete(); await Promise.resolve(); fixture.detectChanges();
        const fade = snapshot.getAnimations()[0];
        expect(fade).toBeDefined();
        fade.pause(); fade.currentTime = 0;
        expect(getComputedStyle(snapshot).opacity).toBe('1');
        fade.currentTime = 140;
        expect(Number(getComputedStyle(snapshot).opacity)).toBeGreaterThan(0);
        expect(Number(getComputedStyle(snapshot).opacity)).toBeLessThan(1);
        fade.finish(); await fade.finished;
        expect(root.querySelector('.clock-style-snapshot')).toBeNull();
        expect(app.clockGraphicsLoading()).toBeFalse();
      } finally { fixture.destroy(); }
    }
  });

  it('does not time out graphics while the tab is hidden, and resumes the deadline on return', fakeAsync(() => {
    let hidden = true;
    spyOnProperty(document, 'hidden', 'get').and.callFake(() => hidden);
    savePlan(true, 'standard');
    const fixture = TestBed.createComponent(AppHostComponent);
    try {
      fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
      const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
      tick(10000);
      expect(frames.every(frame => !frame.renderer.dispose.calls.any())).toBeTrue();
      expect(app.clockGraphicsLoading()).toBeTrue();
      hidden = false; document.dispatchEvent(new Event('visibilitychange'));
      tick(3999);
      expect(app.clockGraphicsLoading()).toBeTrue();
      frames.forEach(frame => frame.complete()); flushMicrotasks(); fixture.detectChanges();
      expect(app.clockGraphicsLoading()).toBeFalse();
      tick(1);
      expect(frames.every(frame => !frame.renderer.dispose.calls.any())).toBeTrue();
    } finally { fixture.destroy(); }
  }));

  it('waits for the new result when reusing prewarmed cards after Edit, and cancels loading when animations are disabled', fakeAsync(() => {
    savePlan(true, 'timeline');
    const fixture = TestBed.createComponent(AppHostComponent);
    try {
      fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
      const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
      frames.forEach(frame => frame.complete()); flushMicrotasks(); fixture.detectChanges();
      expect(app.clockGraphicsLoading()).toBeFalse();
      app.editPlan(false); fixture.detectChanges(); flushMicrotasks();
      frames.forEach(frame => frame.next());
      app.form.controls.startTime.setValue('09:00');
      app.calculate(false); fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
      expect(frames.length).toBe(2);
      expect(app.clockGraphicsLoading()).toBeTrue();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.exit-time-card .result-time-value')!.textContent).toBe('17:15');
      expect(getComputedStyle(root.querySelector('canvas')!).opacity).toBe('0');
      frames.forEach(frame => frame.complete()); flushMicrotasks(); fixture.detectChanges();
      expect(app.clockGraphicsLoading()).toBeFalse();
      app.setCardAnimation('none'); fixture.detectChanges(); flushMicrotasks();
      app.setCardAnimation('reflections'); fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
      expect(app.clockGraphicsLoading()).toBeTrue();
      app.setCardAnimation('none'); fixture.detectChanges(); flushMicrotasks();
      expect(app.clockGraphicsLoading()).toBeFalse();
      tick(4000);
      expect(frames.every(frame => frame.renderer.dispose.calls.count() === 1)).toBeTrue();
    } finally { fixture.destroy(); }
  }));

  it('falls back to readable clocks when graphics never finish and ignores late completions after teardown', fakeAsync(() => {
    savePlan(true, 'standard');
    const fixture = TestBed.createComponent(AppHostComponent);
    fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const app = fixture.debugElement.query(By.directive(AppComponent)).componentInstance as AppComponent;
    tick(3999); fixture.detectChanges();
    expect(app.clockGraphicsLoading()).toBeTrue();
    tick(1); fixture.detectChanges(); finishTransitions(root);
    expect(app.clockGraphicsLoading()).toBeFalse();
    expect(frames.every(frame => frame.renderer.dispose.calls.count() === 1)).toBeTrue();
    expect(getComputedStyle(root.querySelector('.time-glyph')!).opacity).toBe('1');
    fixture.destroy();
    frames.forEach(frame => frame.complete()); flushMicrotasks();
    expect(app.clockGraphicsLoading()).toBeFalse();
  }));

  it('releases the loader immediately when WebGL is unavailable', fakeAsync(() => {
    (LiquidBackdropComponent.prototype as any).createRenderer.and.throwError('WebGL unavailable');
    savePlan(false, 'standard');
    const fixture = TestBed.createComponent(AppHostComponent);
    try {
      fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.graphics-loading')).toBeNull();
      expect(root.querySelector('.has-liquid-canvas')).toBeNull();
      expect(getComputedStyle(root.querySelector('.time-glyph')!).opacity).toBe('1');
    } finally { fixture.destroy(); }
  }));
});

describe('Restored clock with real WebGL', () => {
  it('replaces the initial skeleton with both fully rendered clocks', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppHostComponent] });
    const seed = TestBed.createComponent(AppComponent);
    seed.componentInstance.form.controls.startTime.setValue('08:43');
    seed.componentInstance.calculate(false);
    seed.destroy();
    const fixture = TestBed.createComponent(AppHostComponent);
    try {
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelectorAll('.graphics-loading').length).toBe(2);
      await Promise.resolve();
      const backdrops = fixture.debugElement.queryAll(By.directive(LiquidBackdropComponent));
      await Promise.all(backdrops.map(backdrop => (backdrop.componentInstance as any).renderer.ready));
      await Promise.resolve(); fixture.detectChanges();
      expect(root.querySelectorAll('.has-liquid-canvas').length).toBe(2);
      expect(root.querySelector('.graphics-loading')).toBeNull();
      expect(document.fonts.check('900 16px "Nunito Glass"', '0123456789:')).toBeTrue();
    } finally { fixture.destroy(); localStorage.clear(); }
  }, 20000);
});

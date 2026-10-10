import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { LiquidBackdropComponent } from './liquid-backdrop.component';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent> | null = null;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = null;
    localStorage.clear();
  });

  function createApp(): AppComponent {
    fixture = TestBed.createComponent(AppComponent);
    return fixture.componentInstance;
  }

  function calculate(app: AppComponent): void {
    app.calculate(false);
  }

  it('starts new users in the dark blue theme with slider and animation enabled, and lists dark before light', () => {
    const app = createApp();
    expect(app.darkModeClass).toBeTrue();
    expect(app.accentVioletClass).toBeTrue();
    expect(app.settings().sliderEnabled).toBeTrue();
    expect(app.settings().animationsEnabled).toBeTrue();
    app.openConfig();
    fixture!.detectChanges();
    const buttons = Array.from(fixture!.nativeElement.querySelectorAll('.theme-segment button')) as HTMLButtonElement[];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Ciemny', 'Jasny']);
    expect(buttons[0].classList.contains('active')).toBeTrue();
    buttons[1].click();
    fixture!.detectChanges();
    expect(app.darkModeClass).toBeFalse();
    expect(buttons[1].classList.contains('active')).toBeTrue();
  });

  it('keeps an existing user’s saved light theme, accent and disabled preferences instead of replacing them with defaults', () => {
    localStorage.setItem('workEndCalculator.settings', JSON.stringify({
      theme: 'light', accentByTheme: { light: 'pink', dark: 'green' },
      sliderEnabled: false, animationsEnabled: false,
    }));
    const app = createApp();
    expect(app.darkModeClass).toBeFalse();
    expect(app.accentPinkClass).toBeTrue();
    expect(app.settings().sliderEnabled).toBeFalse();
    expect(app.settings().animationsEnabled).toBeFalse();
    app.setDarkMode(true);
    expect(app.accentPinkClass).toBeTrue();
  });

  function addBreak(app: AppComponent, start: string, end: string): void {
    app.addBreak();
    const breakGroup = app.breaks.at(app.breaks.length - 1);
    breakGroup.controls.start.setValue(start);
    breakGroup.controls.end.setValue(end);
  }

  it('removes field panels immediately when reduced motion is requested', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    const app = createApp();
    app.addBreak();
    app.showAdjustment('overtimePickup');
    app.overtimePickup.setValue({ hours: 1, minutes: 15 });
    app.removeBreak(0);
    app.removeAdjustment('overtimePickup');
    expect(app.breaks.length).toBe(0);
    expect(app.isAdjustmentVisible('overtimePickup')).toBeFalse();
    expect(app.overtimePickup.value).toEqual({ hours: null, minutes: null });
  });

  function setOvertimePickup(
    app: AppComponent,
    hours: number,
    minutes: number
  ): void {
    app.showAdjustment('overtimePickup');
    app.overtimePickup.setValue({ hours, minutes });
  }

  function setUndertimeMakeup(
    app: AppComponent,
    hours: number,
    minutes: number
  ): void {
    app.showAdjustment('undertimeMakeup');
    app.undertimeMakeup.setValue({ hours, minutes });
  }

  it('should create the app', () => {
    const app = createApp();
    expect(app).toBeTruthy();
  });

  it('keeps the two views separate, ignores duplicate clicks and preserves the prepared clocks and form values on reversal', fakeAsync(() => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    const app = createApp();
    app.setAnimationsEnabled(false);
    app.form.controls.startTime.setValue('08:00');
    fixture!.detectChanges();
    app.calculate();
    expect(app.isSwitchingToResult()).toBeTrue();
    expect(app.isCompactMode()).toBeTrue();
    const clock = fixture!.nativeElement.querySelector('.exit-time-card');
    const departing = fixture!.nativeElement.querySelector('.view-morph-overlay');
    expect(departing.getAttribute('aria-hidden')).toBe('true');
    expect(departing.hasAttribute('inert')).toBeTrue();
    expect(departing.querySelector('[id]')).toBeNull();
    tick(120);
    app.calculate();
    tick(100);
    fixture!.detectChanges();
    expect(app.isCompactMode()).toBeTrue();
    expect(app.result()?.endTime).toBe('16:15');
    expect(fixture!.nativeElement.querySelector('.result-reveal')).not.toBeNull();
    tick(900);
    expect(app.isResultRevealing()).toBeFalse();
    app.editPlan();
    fixture!.detectChanges();
    expect(app.isSwitchingToForm()).toBeTrue();
    expect(app.isCompactMode()).toBeFalse();
    expect(fixture!.nativeElement.querySelector('.exit-time-card')).toBe(clock);
    const cache = fixture!.nativeElement.querySelector('.result-cache');
    expect(cache.getAttribute('aria-hidden')).toBe('true');
    expect(cache.hasAttribute('inert')).toBeTrue();
    expect(getComputedStyle(clock).visibility).toBe('hidden');
    expect(fixture!.nativeElement.querySelector('.message-card')).toBeNull();
    expect(fixture!.nativeElement.querySelector('.view-morph-overlay .exit-time-card')).not.toBeNull();
    expect(fixture!.nativeElement.querySelector('#start-time')).not.toBeNull();
    tick(120);
    app.editPlan();
    tick(100);
    fixture!.detectChanges();
    expect(app.isCompactMode()).toBeFalse();
    expect(app.form.controls.startTime.value).toBe('08:00');
    expect(fixture!.nativeElement.querySelector('#start-time')).not.toBeNull();
    tick(900);
    expect(fixture!.nativeElement.querySelector('.view-morph-overlay')).toBeNull();
    expect(getComputedStyle(clock).visibility).toBe('hidden');
    app.calculate();
    tick(220);
    fixture!.detectChanges();
    expect(fixture!.nativeElement.querySelector('.result-reveal')).not.toBeNull();
    expect(fixture!.nativeElement.querySelector('.result-cache')).toBeNull();
    expect(fixture!.nativeElement.querySelector('#start-time')).toBeNull();
    tick(900);
    fixture!.destroy();
    fixture = null;
  }));

  it('switches immediately with reduced motion and cancels pending transitions on teardown', fakeAsync(() => {
    const media = { matches: true } as MediaQueryList;
    spyOn(window, 'matchMedia').and.returnValue(media);
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    app.calculate();
    expect(app.isCompactMode()).toBeTrue();
    expect(app.isSwitchingToResult()).toBeFalse();
    expect(app.isResultRevealing()).toBeFalse();
    app.editPlan();
    expect(app.isCompactMode()).toBeFalse();
    Object.assign(media, { matches: false });
    app.calculate();
    expect(app.isSwitchingToResult()).toBeTrue();
    fixture!.destroy();
    fixture = null;
    tick(1200);
    expect(app.isSwitchingToResult()).toBeFalse();
    expect(app.isCompactMode()).toBeTrue();
  }));

  it('prepares the invisible result in idle time without creating a plan, then reuses its canvases', () => {
    let prepare!: IdleRequestCallback;
    spyOn(window, 'requestIdleCallback').and.callFake(callback => { prepare = callback; return 42; });
    spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue(null);
    const app = createApp();
    fixture!.detectChanges();
    expect(app.resultSurface()).toBeNull();
    expect(fixture!.nativeElement.querySelector('canvas')).toBeNull();
    prepare({ didTimeout: false, timeRemaining: () => 50 });
    const cache = fixture!.nativeElement.querySelector('.result-cache');
    const canvases = Array.from(cache.querySelectorAll('canvas'));
    expect(canvases.length).toBe(2);
    expect(cache.hasAttribute('inert')).toBeTrue();
    expect(cache.getAttribute('aria-hidden')).toBe('true');
    expect(getComputedStyle(cache).visibility).toBe('hidden');
    expect(cache.getBoundingClientRect().right).toBeLessThan(0);
    expect(app.result()).toBeNull();
    expect(app.isCompactMode()).toBeFalse();
    expect(localStorage.getItem('workEndCalculator.dailyPlan')).toBeNull();
    app.form.controls.startTime.setValue('08:00');
    app.calculate(false);
    fixture!.detectChanges();
    expect(Array.from(fixture!.nativeElement.querySelectorAll('canvas'))).toEqual(canvases);
    expect(fixture!.nativeElement.querySelector('.result-cache')).toBeNull();
    app.editPlan(false);
    fixture!.detectChanges();
    expect(Array.from(fixture!.nativeElement.querySelectorAll('canvas'))).toEqual(canvases);
    expect(fixture!.nativeElement.querySelector('.result-cache')).not.toBeNull();
    expect(fixture!.nativeElement.querySelector('.message-card')).toBeNull();
  });

  it('skips preparation when animations are disabled and cancels an idle request on teardown', () => {
    let prepare!: IdleRequestCallback;
    spyOn(window, 'requestIdleCallback').and.callFake(callback => { prepare = callback; return 42; });
    const cancel = spyOn(window, 'cancelIdleCallback');
    const app = createApp();
    fixture!.detectChanges();
    app.setAnimationsEnabled(false);
    prepare({ didTimeout: false, timeRemaining: () => 50 });
    expect(app.resultSurface()).toBeNull();
    fixture!.destroy();
    fixture = null;
    const next = createApp();
    fixture!.detectChanges();
    fixture!.destroy();
    fixture = null;
    expect(cancel).toHaveBeenCalledWith(42);
    expect(next.result()).toBeNull();
  });

  it('still calculates and changes settings when the browser denies storage access', () => {
    const access = spyOnProperty(window, 'localStorage', 'get').and.throwError('SecurityError');
    try {
      const app = createApp();
      app.form.controls.startTime.setValue('08:00');
      app.setDarkMode(true);
      calculate(app);
      expect(app.result()?.endTime).toBe('16:15');
      expect(app.darkModeClass).toBeTrue();
      app.form.controls.startTime.setValue('');
    } finally {
      access.and.callThrough();
    }
  });

  it('continues working when storage reads, writes and removals throw', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');
    spyOn(Storage.prototype, 'removeItem').and.throwError('SecurityError');
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    app.setAccentColor('red');
    calculate(app);
    expect(app.result()?.endTime).toBe('16:15');
    expect(app.accentRedClass).toBeTrue();
    app.form.controls.startTime.setValue('');
    calculate(app);
    expect(app.form.controls.startTime.hasError('required')).toBeTrue();
    expect(app.result()?.endTime).toBe('16:15');
  });

  it('recovers from corrupt saved settings and a corrupt daily plan', () => {
    localStorage.setItem('workEndCalculator.settings', '{invalid');
    localStorage.setItem('workEndCalculator.dailyPlan', '{invalid');
    localStorage.setItem('workEndCalculator.startTime', '{invalid');
    const app = createApp();
    expect(app.darkModeClass).toBeTrue();
    expect(app.accentVioletClass).toBeTrue();
    app.form.controls.startTime.setValue('08:00');
    calculate(app);
    expect(app.result()?.endTime).toBe('16:15');
  });

  it('should render heading', () => {
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Kalkulator końca pracy'
    );
  });

  it('stores one shared accent and preserves it when switching themes in either direction', () => {
    const app = createApp();
    app.setDarkMode(false);

    app.setAccentColor('green');
    expect(app.accentGreenClass).toBeTrue();

    app.setDarkMode(true);
    expect(app.darkModeClass).toBeTrue();
    expect(app.accentGreenClass).toBeTrue();
    expect(app.configForm.controls.accentColor.value).toBe('green');

    app.setAccentColor('violet');
    expect(app.accentVioletClass).toBeTrue();

    app.setDarkMode(false);
    expect(app.darkModeClass).toBeFalse();
    expect(app.accentVioletClass).toBeTrue();
    expect(app.configForm.controls.accentColor.value).toBe('violet');

    const savedSettings = JSON.parse(
      localStorage.getItem('workEndCalculator.settings') ?? '{}'
    );
    expect(savedSettings.accentColor).toBe('violet');
    expect(savedSettings.accentByTheme).toBeUndefined();
  });

  it('migrates the current theme’s legacy accent into the shared setting', () => {
    localStorage.setItem(
      'workEndCalculator.settings',
      JSON.stringify({
        theme: 'dark',
        favoriteHour: null,
        accentByTheme: {
          light: 'yellow',
          dark: 'red',
        },
      })
    );

    const app = createApp();

    expect(app.darkModeClass).toBeTrue();
    expect(app.accentRedClass).toBeTrue();

    app.setDarkMode(false);

    expect(app.darkModeClass).toBeFalse();
    expect(app.accentRedClass).toBeTrue();
    expect(JSON.parse(localStorage.getItem('workEndCalculator.settings')!).accentColor).toBe('red');
  });

  it('retains every colored accent across both themes and keeps the configuration selection in sync', () => {
    const app = createApp();
    for (const accent of ['violet', 'green', 'red', 'pink', 'yellow'] as const) {
      app.setDarkMode(false);
      app.setAccentColor(accent);
      for (const dark of [true, false]) {
        app.setDarkMode(dark);
        expect(app.isAccentSelected(accent)).withContext(`${accent}, dark=${dark}`).toBeTrue();
        expect(app.configForm.controls.accentColor.value).toBe(accent);
        expect(JSON.parse(localStorage.getItem('workEndCalculator.settings')!).accentColor).toBe(accent);
      }
    }
  });

  it('restores the shared accent after reload and prioritizes it over legacy palettes', () => {
    localStorage.setItem('workEndCalculator.settings', JSON.stringify({
      theme: 'light', accentColor: 'green', accentByTheme: { light: 'pink', dark: 'red' },
      favoriteHour: 7, tabDisplayMode: 'remainingTime', sliderEnabled: false, animationsEnabled: false,
    }));
    let app = createApp();
    expect(app.accentGreenClass).toBeTrue();
    app.setDarkMode(true);
    app.setAccentColor('violet');
    fixture!.destroy();
    app = createApp();
    expect(app.darkModeClass).toBeTrue();
    expect(app.accentVioletClass).toBeTrue();
    app.setDarkMode(false);
    expect(app.accentVioletClass).toBeTrue();
    expect(app.settings().favoriteHour).toBe(7);
    expect(app.settings().tabDisplayMode).toBe('remainingTime');
    expect(app.settings().sliderEnabled).toBeFalse();
    expect(app.settings().animationsEnabled).toBeFalse();
  });

  it('falls back safely for an invalid shared accent while preserving a valid active legacy palette', () => {
    localStorage.setItem('workEndCalculator.settings', JSON.stringify({
      theme: 'dark', accentColor: 'invalid', accentByTheme: { light: 'green', dark: 'yellow' },
    }));
    const app = createApp();
    expect(app.accentYellowClass).toBeTrue();
    app.setDarkMode(false);
    expect(app.accentYellowClass).toBeTrue();
  });

  it('offers black in light mode and white in dark mode as one shared monochrome selection', () => {
    const app = createApp();
    app.setDarkMode(false);
    expect(app.accentOptions.map(option => option.value)).toEqual(['violet', 'green', 'red', 'pink', 'yellow', 'black']);
    app.setAccentColor('black');
    expect(app.accentBlackClass).toBeTrue();
    app.setDarkMode(true);
    expect(app.accentOptions.map(option => option.value)).toEqual(['violet', 'green', 'red', 'pink', 'yellow', 'white']);
    expect(app.accentWhiteClass).toBeTrue();
    expect(app.configForm.controls.accentColor.value).toBe('white');
    app.setAccentColor('white');
    expect(app.accentWhiteClass).toBeTrue();
    app.setDarkMode(false);
    expect(app.accentBlackClass).toBeTrue();
    app.setDarkMode(true);
    expect(app.accentWhiteClass).toBeTrue();
    expect(JSON.parse(localStorage.getItem('workEndCalculator.settings')!).accentColor).toBe('monochrome');
    fixture!.destroy();
    const reloaded = createApp();
    expect(reloaded.accentWhiteClass).toBeTrue();
    reloaded.setDarkMode(false);
    expect(reloaded.accentBlackClass).toBeTrue();
  });

  it('restores the monochrome choices after reloading saved settings', () => {
    localStorage.setItem('workEndCalculator.settings', JSON.stringify({
      theme: 'dark', accentByTheme: { light: 'black', dark: 'white' },
    }));
    const app = createApp();
    expect(app.accentWhiteClass).toBeTrue();
    expect(app.configForm.controls.accentColor.value).toBe('white');
    app.setDarkMode(false);
    expect(app.accentBlackClass).toBeTrue();
    expect(app.configForm.controls.accentColor.value).toBe('black');
  });

  it('rejects monochrome choices belonging to the other theme, including invalid saved settings', () => {
    localStorage.setItem('workEndCalculator.settings', JSON.stringify({
      theme: 'light', accentByTheme: { light: 'white', dark: 'black' },
    }));
    const app = createApp();
    expect(app.accentVioletClass).toBeTrue();
    app.setAccentColor('white');
    expect(app.accentVioletClass).toBeTrue();
    expect(app.configForm.controls.accentColor.value).toBe('violet');
    app.setDarkMode(true);
    expect(app.accentVioletClass).toBeTrue();
    app.setAccentColor('black');
    expect(app.accentVioletClass).toBeTrue();
    expect(app.configForm.controls.accentColor.value).toBe('violet');
  });

  it('saves favorite start hour immediately when an option is selected', () => {
    const app = createApp();

    app.setFavoriteHour(7);

    expect(app.settings().favoriteHour).toBe(7);
    expect(app.configForm.controls.favoriteHour.value).toBe(7);

    let savedSettings = JSON.parse(
      localStorage.getItem('workEndCalculator.settings') ?? '{}'
    );
    expect(savedSettings.favoriteHour).toBe(7);

    app.setFavoriteHour(null);

    expect(app.settings().favoriteHour).toBeNull();
    savedSettings = JSON.parse(
      localStorage.getItem('workEndCalculator.settings') ?? '{}'
    );
    expect(savedSettings.favoriteHour).toBeNull();
  });

  it('shows tooltip only for the no favorite hour option', () => {
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled
      .querySelector<HTMLButtonElement>('.settings-button')
      ?.click();
    fixture.detectChanges();

    const favoriteOptions = Array.from(
      compiled.querySelectorAll<HTMLButtonElement>('.favorite-hour-option')
    );

    expect(favoriteOptions.length).toBe(4);
    expect(favoriteOptions[0].getAttribute('title')).toBe('Brak');
    expect(favoriteOptions[0].getAttribute('data-tooltip')).toBe('Brak');
    expect(
      favoriteOptions[0].querySelector('.favorite-hour-empty-icon')
    ).not.toBeNull();
    expect(favoriteOptions[0].textContent?.trim()).toBe('');

    for (const hourOption of favoriteOptions.slice(1)) {
      expect(hourOption.hasAttribute('title')).toBeFalse();
      expect(hourOption.hasAttribute('data-tooltip')).toBeFalse();
    }
  });

  it('calculates 8h 15min of work with no breaks or adjustments', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');

    calculate(app);

    expect(app.scheduleError()).toBeNull();
    expect(app.result()?.endTime).toBe('16:15');
    expect(app.exitOffsetMinutes()).toBe(0);
    expect(app.result()?.breaksLabel).toBeNull();
    expect(app.result()?.adjustmentLabel).toBeNull();
  });

  it('saves independent slider and animation preferences and restores them', () => {
    const app = createApp();
    expect(app.settings().sliderEnabled).toBeTrue();
    expect(app.settings().animationsEnabled).toBeTrue();
    app.setSliderEnabled(false);
    expect(app.settings().animationsEnabled).toBeTrue();
    app.setAnimationsEnabled(false);
    app.setSliderEnabled(true);
    const savedSettings = JSON.parse(localStorage.getItem('workEndCalculator.settings') ?? '{}');
    expect(savedSettings.sliderEnabled).toBeTrue();
    expect(savedSettings.animationsEnabled).toBeFalse();
    fixture!.destroy();
    const restored = createApp();
    expect(restored.settings().sliderEnabled).toBeTrue();
    expect(restored.settings().animationsEnabled).toBeFalse();
    expect(restored.configForm.controls.animationsEnabled.value).toBeFalse();
  });

  it('shows halfway progress and counts down to the selected exit time', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 8, 24, 12, 7, 30));
      const app = createApp();
      app.form.controls.startTime.setValue('08:00');
      calculate(app);

      expect(app.result()?.progressPercent).toBe(50);
      expect(app.result()?.remainingClockLabel).toBe('04:07:30');
      expect(app.result()?.state).toBe('inProgress');

      jasmine.clock().mockDate(new Date(2026, 8, 24, 15, 59, 59));
      jasmine.clock().tick(1000);
      expect(app.result()?.remainingClockLabel).toBe('00:15:00');
      expect(app.result()?.state).toBe('inProgress');

      jasmine.clock().mockDate(new Date(2026, 8, 24, 16, 14, 59));
      jasmine.clock().tick(1000);
      expect(app.result()?.state).toBe('complete');
      expect(app.result()?.remainingClockLabel).toBe('00:00:00');
      expect(app.result()?.progressPercent).toBe(100);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('does not restart yesterday\'s countdown after the browser resumes on a new day', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 8, 24, 7, 0, 0));
      const app = createApp();
      app.form.controls.startTime.setValue('08:00');
      calculate(app);

      jasmine.clock().mockDate(new Date(2026, 8, 25, 7, 0, 0));
      jasmine.clock().tick(1000);

      expect(app.result()?.state).toBe('complete');
      expect(app.result()?.remainingClockLabel).toBe('00:00:00');
      expect(app.result()?.progressPercent).toBe(100);
      app.setExitOffset(15);
      jasmine.clock().tick(1000);
      expect(app.result()?.state).toBe('complete');
      expect(app.result()?.remainingClockLabel).toBe('00:00:00');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('accepts the earliest allowed start time and keeps the 8h 15min base', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('05:30');

    calculate(app);

    expect(app.scheduleError()).toBeNull();
    expect(app.result()?.endTime).toBe('13:45');
  });

  it('updates both times, progress and browser titles immediately from the baseline', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 9, 6, 12, 0, 0));
      const app = createApp();
      app.form.controls.startTime.setValue('08:00');
      calculate(app);
      fixture!.detectChanges();

      app.setExitOffset(-6);
      fixture!.detectChanges();
      expect(app.result()?.endTime).toBe('16:09');
      expect(app.result()?.remainingClockLabel).toBe('04:09:00');
      expect(app.result()?.progressPercent).toBe(49);
      expect(document.title).toBe('Wyjście o 16:09');

      app.setTabDisplayMode('remainingTime');
      fixture!.detectChanges();
      expect(document.title).toBe('Do końca 4h 9min');

      app.setExitOffset(15);
      fixture!.detectChanges();
      expect(app.result()?.endTime).toBe('16:30');
      expect(app.result()?.remainingClockLabel).toBe('04:30:00');
      expect(document.title).toBe('Do końca 4h 30min');
      expect(app.exitOffsetLabel()).toBe('+15 min');

      app.setExitOffset(0);
      expect(app.result()?.endTime).toBe('16:15');
      expect(app.result()?.remainingClockLabel).toBe('04:15:00');
      expect(app.exitOffsetLabel()).toBe('');
      expect(app.exitOffsetPercent()).toBe(50);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('handles range input and buttons in one-minute steps with fixed limits', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    calculate(app);
    fixture!.detectChanges();
    const page = fixture!.nativeElement as HTMLElement;
    const range = page.querySelector<HTMLInputElement>('#exit-offset')!;
    range.value = '-6';
    range.dispatchEvent(new Event('input'));
    fixture!.detectChanges();
    expect(app.result()?.endTime).toBe('16:09');
    expect(page.querySelector('.offset-label')?.textContent).toBe('-6 min');

    const buttons = page.querySelectorAll<HTMLButtonElement>('.offset-button');
    buttons[1].click();
    expect(app.exitOffsetMinutes()).toBe(-5);
    buttons[0].click();
    expect(app.exitOffsetMinutes()).toBe(-6);

    app.setExitOffset(-100);
    fixture!.detectChanges();
    expect(app.exitOffsetMinutes()).toBe(-15);
    expect(app.result()?.endTime).toBe('16:00');
    expect(buttons[0].disabled).toBeTrue();
    app.adjustExitOffset(-1);
    expect(app.exitOffsetMinutes()).toBe(-15);

    app.setExitOffset(100);
    fixture!.detectChanges();
    expect(app.exitOffsetMinutes()).toBe(15);
    expect(app.result()?.endTime).toBe('16:30');
    expect(buttons[1].disabled).toBeTrue();
    app.adjustExitOffset(1);
    expect(app.exitOffsetMinutes()).toBe(15);

    app.setExitOffset(Number.NaN);
    expect(app.exitOffsetMinutes()).toBe(0);
  });

  it('shows one shared slider only after calculation and hides it during editing', () => {
    const app = createApp();
    fixture!.detectChanges();
    const page = fixture!.nativeElement as HTMLElement;
    expect(page.querySelector('#exit-offset')).toBeNull();
    app.form.controls.startTime.setValue('08:00');
    calculate(app);
    fixture!.detectChanges();
    expect(page.querySelectorAll('#exit-offset').length).toBe(1);
    expect(page.querySelectorAll('.result-time-card').length).toBe(2);
    expect(page.querySelector('.milestone-timeline')).toBeNull();
    app.setExitOffset(6);
    app.editPlan(false);
    fixture!.detectChanges();
    expect(page.querySelector('#exit-offset')).toBeNull();
    app.adjustExitOffset(1);
    expect(app.exitOffsetMinutes()).toBe(6);
    calculate(app);
    fixture!.detectChanges();
    expect(app.exitOffsetMinutes()).toBe(0);
    expect(app.result()?.endTime).toBe('16:15');
    expect(page.querySelector('.offset-label')?.textContent).toBe('');
  });

  it('keeps both clocks readable and synchronized when graphics acceleration is unavailable', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 9, 6, 12, 0, 0));
      spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue(null);
      const app = createApp();
      app.form.controls.startTime.setValue('08:00');
      calculate(app);
      fixture!.detectChanges();
      const page = fixture!.nativeElement as HTMLElement;
      expect(page.querySelector('.has-liquid-canvas')).toBeNull();
      expect(page.querySelector('.exit-time-card strong')?.textContent).toBe('16:15');
      expect(page.querySelector('.remaining-time-card strong')?.textContent).toBe('04:15:00');

      app.setExitOffset(-6);
      fixture!.detectChanges();
      expect(page.querySelector('.exit-time-card strong')?.textContent).toBe('16:09');
      expect(page.querySelector('.remaining-time-card strong')?.textContent).toBe('04:09:00');
      app.editPlan(false);
      fixture!.detectChanges();
      expect(page.querySelector('#exit-offset')).toBeNull();
      expect(page.querySelector('.has-liquid-canvas')).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('migrates legacy timeline preferences to the shared slider', () => {
    localStorage.setItem('workEndCalculator.settings', JSON.stringify({
      endTimeDisplayMode: 'timeline', remainingTimeDisplayMode: 'standard',
    }));
    const app = createApp();
    expect(app.settings().sliderEnabled).toBeTrue();
    expect(app.settings().animationsEnabled).toBeTrue();
    app.form.controls.startTime.setValue('08:00');
    calculate(app);
    expect(app.showExitSlider()).toBeTrue();
    app.setSliderEnabled(false);
    expect(app.showExitSlider()).toBeFalse();
    app.setSliderEnabled(true);
    expect(app.showExitSlider()).toBeTrue();
  });

  it('migrates two legacy standard cards to no slider', () => {
    localStorage.setItem('workEndCalculator.settings', JSON.stringify({
      endTimeDisplayMode: 'standard', remainingTimeDisplayMode: 'standard',
    }));
    expect(createApp().settings().sliderEnabled).toBeFalse();
  });

  it('uses new boolean preferences over legacy values and rejects malformed animation settings', () => {
    localStorage.setItem('workEndCalculator.settings', JSON.stringify({
      sliderEnabled: false, animationsEnabled: 'false',
      endTimeDisplayMode: 'slider', remainingTimeDisplayMode: 'slider',
    }));
    const app = createApp();
    expect(app.settings().sliderEnabled).toBeFalse();
    expect(app.settings().animationsEnabled).toBeTrue();
  });

  it('keeps both clocks and the offset ticking through every visual preference combination', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 9, 10, 12, 0, 0));
      const context = spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue(null);
      const dispose = spyOn(LiquidBackdropComponent.prototype, 'ngOnDestroy').and.callThrough();
      const app = createApp();
      app.setAnimationsEnabled(false);
      app.form.controls.startTime.setValue('08:00');
      calculate(app);
      fixture!.detectChanges();
      const page = fixture!.nativeElement as HTMLElement;
      expect(context).not.toHaveBeenCalled();
      app.setExitOffset(6);
      for (const animation of [true, false]) {
        app.setAnimationsEnabled(animation);
        for (const slider of [false, true]) {
          app.setSliderEnabled(slider);
          fixture!.detectChanges();
          expect(page.classList.contains('simple-time-cards')).toBe(!animation);
          expect(page.querySelectorAll('app-liquid-backdrop').length).toBe(animation ? 2 : 0);
          expect(page.querySelectorAll('#exit-offset').length).toBe(slider ? 1 : 0);
          expect(page.querySelectorAll('.result-time-card').length).toBe(2);
          expect(page.querySelector('.exit-time-card strong')?.textContent).toBe('16:21');
          expect(page.querySelector('.remaining-time-card strong')?.textContent).toBe('04:21:00');
          expect(app.exitOffsetMinutes()).toBe(6);
        }
      }
      expect(dispose).toHaveBeenCalledTimes(2);
      jasmine.clock().tick(1000);
      fixture!.detectChanges();
      expect(page.querySelector('.remaining-time-card strong')?.textContent).toBe('04:20:59');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('replaces the old card selectors with independent accessible yes/no settings', () => {
    const app = createApp();
    app.openConfig();
    fixture!.detectChanges();
    const page = fixture!.nativeElement as HTMLElement;
    expect(page.querySelector('#end-time-display-label')).toBeNull();
    expect(page.querySelector('#remaining-time-display-label')).toBeNull();
    const animationOptions = page.querySelectorAll<HTMLButtonElement>('[aria-labelledby="animations-display-label"] button');
    const sliderOptions = page.querySelectorAll<HTMLButtonElement>('[aria-labelledby="slider-display-label"] button');
    animationOptions[1].click();
    fixture!.detectChanges();
    expect(animationOptions[1].getAttribute('aria-checked')).toBe('true');
    expect(sliderOptions[0].getAttribute('aria-checked')).toBe('true');
    sliderOptions[1].click();
    fixture!.detectChanges();
    expect(app.settings().sliderEnabled).toBeFalse();
    expect(app.settings().animationsEnabled).toBeFalse();
  });

  it('adds the offset on top of breaks and either work-time adjustment', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('07:45');
    addBreak(app, '11:30', '11:45');
    setOvertimePickup(app, 0, 30);
    calculate(app);
    app.setExitOffset(-15);
    expect(app.result()?.endTime).toBe('15:30');
    expect(app.result()?.breaksLabel).toBe('Przerwy: 15min');
    expect(app.result()?.adjustmentLabel).toBe('Odbiór nadgodzin: 30min');

    app.editPlan(false);
    setUndertimeMakeup(app, 0, 30);
    calculate(app);
    app.setExitOffset(15);
    expect(app.result()?.endTime).toBe('17:00');
    expect(app.result()?.adjustmentLabel).toBe('Odrobienie niedoczasu: 30min');
  });

  it('finishes early and resumes ticking when the selected exit moves into the future', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 9, 6, 16, 5, 0));
      const app = createApp();
      app.form.controls.startTime.setValue('08:00');
      calculate(app);
      app.setExitOffset(-15);
      expect(app.result()?.state).toBe('complete');
      expect(app.result()?.remainingClockLabel).toBe('00:00:00');
      expect(app.result()?.progressPercent).toBe(100);
      expect(app.result()?.message).toContain('0h 0min');

      app.setExitOffset(15);
      expect(app.result()?.state).toBe('inProgress');
      expect(app.result()?.remainingClockLabel).toBe('00:25:00');
      expect(app.result()?.progressPercent).toBe(95);
      expect(app.result()?.message).toContain('0h 25min');
      jasmine.clock().tick(1000);
      expect(app.result()?.remainingClockLabel).toBe('00:24:59');

      jasmine.clock().tick(25 * 60 * 1000);
      expect(app.result()?.state).toBe('complete');
      expect(app.result()?.remainingClockLabel).toBe('00:00:00');
      expect(app.result()?.message).toContain('16:30');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('can extend an already completed unadjusted plan', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 9, 6, 16, 20, 0));
      const app = createApp();
      app.form.controls.startTime.setValue('08:00');
      calculate(app);
      expect(app.result()?.state).toBe('complete');
      app.setExitOffset(15);
      expect(app.result()?.remainingClockLabel).toBe('00:10:00');
      jasmine.clock().tick(1000);
      expect(app.result()?.remainingClockLabel).toBe('00:09:59');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('keeps the generated sentence while dragging across every offset and during minute ticks', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 9, 6, 12, 1, 0));
      const random = spyOn(Math, 'random').and.returnValue(0);
      const app = createApp();
      app.form.controls.startTime.setValue('08:00');
      calculate(app);
      const sentence = app.result()!.message.replace('4h 14min', '{time}');

      for (let offset = -15; offset <= 15; offset++) {
        app.setExitOffset(offset);
        const result = app.result()!;
        expect(result.message).toBe(sentence.replace('{time}', result.remainingTitleLabel));
      }
      jasmine.clock().tick(2 * 60 * 1000);
      const result = app.result()!;
      expect(result.message).toBe(sentence.replace('{time}', '4h 27min'));
      expect(random).toHaveBeenCalledTimes(1);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('preserves the sentence when the slider crosses completion in either direction', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 9, 6, 16, 5, 0));
      const random = spyOn(Math, 'random').and.returnValue(0);
      const app = createApp();
      app.form.controls.startTime.setValue('08:00');
      calculate(app);
      const sentence = app.result()!.message.replace('0h 10min', '{time}');
      app.setExitOffset(-15);
      expect(app.result()!.message).toBe(sentence.replace('{time}', '0h 0min'));
      app.setExitOffset(15);
      expect(app.result()!.message).toBe(sentence.replace('{time}', '0h 25min'));
      jasmine.clock().tick(1000);
      expect(random).toHaveBeenCalledTimes(1);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('updates the exit time inside an existing message without choosing another sentence', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 9, 6, 16, 40, 0));
      const random = spyOn(Math, 'random').and.returnValue(0);
      const app = createApp();
      app.form.controls.startTime.setValue('08:00');
      calculate(app);
      const sentence = app.result()!.message.replace('16:15', '{end}');
      app.setExitOffset(-15);
      expect(app.result()!.message).toBe(sentence.replace('{end}', '16:00'));
      app.setExitOffset(15);
      expect(app.result()!.message).toBe(sentence.replace('{end}', '16:30'));
      expect(random).toHaveBeenCalledTimes(1);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('keeps the adjusted countdown in the before-start state until work begins', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 9, 6, 7, 59, 59));
      const app = createApp();
      app.form.controls.startTime.setValue('08:00');
      calculate(app);
      app.setExitOffset(-15);
      expect(app.result()?.state).toBe('beforeStart');
      expect(app.result()?.progressPercent).toBe(0);
      jasmine.clock().tick(1000);
      expect(app.result()?.state).toBe('inProgress');
      expect(app.result()?.remainingClockLabel).toBe('08:00:00');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('restores the offset and adjusted times after reloading the daily plan', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 9, 6, 12, 0, 0));
      let app = createApp();
      app.form.controls.startTime.setValue('08:00');
      addBreak(app, '10:00', '10:15');
      calculate(app);
      app.setExitOffset(-6);
      const saved = JSON.parse(localStorage.getItem('workEndCalculator.dailyPlan')!);
      expect(saved.exitOffsetMinutes).toBe(-6);
      fixture!.destroy();

      app = createApp();
      expect(app.isCompactMode()).toBeTrue();
      expect(app.exitOffsetMinutes()).toBe(-6);
      expect(app.result()?.endTime).toBe('16:24');
      expect(app.result()?.remainingClockLabel).toBe('04:24:00');

      fixture!.destroy();
      delete saved.exitOffsetMinutes;
      localStorage.setItem('workEndCalculator.dailyPlan', JSON.stringify(saved));
      app = createApp();
      expect(app.exitOffsetMinutes()).toBe(0);
      expect(app.result()?.endTime).toBe('16:30');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('accepts one-digit hours and a dot separator for time input', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('8.00');

    calculate(app);

    expect(app.scheduleError()).toBeNull();
    expect(app.result()?.endTime).toBe('16:15');
  });

  it('adds break duration to the required 8h 15min day', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    addBreak(app, '10:15', '10:30');

    calculate(app);

    expect(app.scheduleError()).toBeNull();
    expect(app.result()?.endTime).toBe('16:30');
    expect(app.result()?.breaksLabel).toBe('Przerwy: 15min');
  });

  it('sums multiple breaks even when they are entered out of order', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    addBreak(app, '12:00', '12:30');
    addBreak(app, '10:00', '10:15');

    calculate(app);

    expect(app.scheduleError()).toBeNull();
    expect(app.result()?.endTime).toBe('17:00');
    expect(app.result()?.breaksLabel).toBe('Przerwy: 45min');
  });

  it('subtracts overtime pickup from the 8h 15min day', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    setOvertimePickup(app, 1, 30);

    calculate(app);

    expect(app.scheduleError()).toBeNull();
    expect(app.result()?.endTime).toBe('14:45');
  });

  it('adds undertime makeup to the 8h 15min day', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    setUndertimeMakeup(app, 0, 45);

    calculate(app);

    expect(app.scheduleError()).toBeNull();
    expect(app.result()?.endTime).toBe('17:00');
  });

  it('combines breaks and overtime pickup correctly', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('07:45');
    addBreak(app, '11:30', '11:45');
    setOvertimePickup(app, 0, 30);

    calculate(app);

    expect(app.scheduleError()).toBeNull();
    expect(app.result()?.endTime).toBe('15:45');
    expect(app.result()?.breaksLabel).toBe('Przerwy: 15min');
  });

  it('combines breaks and undertime makeup correctly', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('06:00');
    addBreak(app, '10:00', '10:20');
    setUndertimeMakeup(app, 0, 40);

    calculate(app);

    expect(app.scheduleError()).toBeNull();
    expect(app.result()?.endTime).toBe('15:15');
    expect(app.result()?.breaksLabel).toBe('Przerwy: 20min');
    expect(app.result()?.adjustmentLabel).toBe('Odrobienie niedoczasu: 40min');
  });

  it('blocks calculation when a break has only one time filled', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    app.addBreak();
    app.breaks.at(0).controls.start.setValue('10:00');

    calculate(app);

    expect(app.canCalculate).toBeFalse();
    expect(app.result()).toBeNull();
  });

  it('rejects a break before the start time', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    addBreak(app, '07:45', '08:05');

    calculate(app);

    expect(app.result()).toBeNull();
    expect(app.scheduleError()).toContain('przed rozpocz');
  });

  it('rejects overlapping breaks', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    addBreak(app, '10:00', '10:30');
    addBreak(app, '10:15', '10:45');

    calculate(app);

    expect(app.result()).toBeNull();
    expect(app.scheduleError()).toContain('nachodzi');
  });

  it('rejects a break with an end time earlier than its start time', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    addBreak(app, '10:30', '10:15');

    calculate(app);

    expect(app.result()).toBeNull();
    expect(app.scheduleError()).toContain('Koniec przerwy');
  });

  it('rejects overtime pickup that is larger than planned work time', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    setOvertimePickup(app, 9, 0);

    calculate(app);

    expect(app.result()).toBeNull();
    expect(app.scheduleError()).toContain('większy');
  });

  it('rejects breaks that would land after the calculated end time', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    addBreak(app, '15:30', '15:45');
    setOvertimePickup(app, 2, 0);

    calculate(app);

    expect(app.result()).toBeNull();
    expect(app.scheduleError()).toContain('po wyliczonym');
  });

  it('rejects schedules ending after 21:00', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('13:00');

    calculate(app);

    expect(app.result()).toBeNull();
    expect(app.scheduleError()).toContain('21:00');
  });

  it('rejects start times before 05:30', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('05:29');

    calculate(app);

    expect(app.canCalculate).toBeFalse();
    expect(app.form.controls.startTime.hasError('tooEarly')).toBeTrue();
    expect(app.result()).toBeNull();
  });

  it('rejects invalid adjustment values', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    setUndertimeMakeup(app, 0, 60);

    calculate(app);

    expect(app.canCalculate).toBeFalse();
    expect(app.undertimeMakeup.controls.minutes.hasError('invalidDuration')).toBeTrue();
    expect(app.result()).toBeNull();
  });

  it('never calculates or saves a break that the user has just removed while its card is still closing', fakeAsync(() => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    addBreak(app, '10:00', '10:30');
    app.removeBreak(0);
    expect(app.canCalculate).toBeFalse();
    calculate(app);
    expect(app.result()).toBeNull();
    expect(localStorage.getItem('workEndCalculator.dailyPlan')).toBeNull();
    tick(320);
    expect(app.canCalculate).toBeTrue();
    calculate(app);
    expect(app.result()?.endTime).toBe('16:15');
    expect(JSON.parse(localStorage.getItem('workEndCalculator.dailyPlan')!).breaks).toEqual([]);
  }));

  for (const kind of ['overtimePickup', 'undertimeMakeup'] as const) {
    it(`waits for removal of ${kind} before calculating and persisting the unadjusted plan`, fakeAsync(() => {
      const app = createApp();
      app.form.controls.startTime.setValue('08:00');
      app.showAdjustment(kind);
      app[kind].setValue({ hours: 1, minutes: 15 });
      app.removeAdjustment(kind);
      expect(app.canCalculate).toBeFalse();
      calculate(app);
      expect(app.result()).toBeNull();
      tick(320);
      expect(app.canCalculate).toBeTrue();
      calculate(app);
      expect(app.result()?.endTime).toBe('16:15');
      expect(app.result()?.adjustmentLabel).toBeNull();
      expect(JSON.parse(localStorage.getItem('workEndCalculator.dailyPlan')!).adjustmentPanels[kind]).toBeFalse();
    }));
  }

  it('keeps calculation disabled until every concurrently closing row has been removed', fakeAsync(() => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');
    addBreak(app, '10:00', '10:10');
    addBreak(app, '11:00', '11:20');
    app.removeBreak(0);
    tick(100);
    app.removeBreak(1);
    tick(220);
    expect(app.breaks.length).toBe(1);
    expect(app.canCalculate).toBeFalse();
    calculate(app);
    expect(app.result()).toBeNull();
    tick(100);
    expect(app.canCalculate).toBeTrue();
    calculate(app);
    expect(app.result()?.endTime).toBe('16:15');
  }));

  it('preserves the 8h 15min rule for every permitted unadjusted start minute and rejects the first minute beyond 21:00', () => {
    const app = createApp();
    const time = (minutes: number): string => `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
    for (let start = 330; start <= 765; start++) {
      app.form.controls.startTime.setValue(time(start));
      calculate(app);
      expect(app.result()?.endTime).withContext(`Start ${time(start)}`).toBe(time(start + 495));
      expect(app.scheduleError()).withContext(`Start ${time(start)}`).toBeNull();
    }
    app.form.controls.startTime.setValue('12:46');
    calculate(app);
    expect(app.result()).toBeNull();
    expect(app.scheduleError()).toContain('21:00');
    expect(localStorage.getItem('workEndCalculator.dailyPlan')).toBeNull();
  });

  it('accepts adjacent breaks, an empty optional row and a plan ending exactly at 21:00', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('12:00');
    addBreak(app, '15:00', '15:15');
    addBreak(app, '15:15', '15:45');
    app.addBreak();
    calculate(app);
    expect(app.scheduleError()).toBeNull();
    expect(app.result()?.endTime).toBe('21:00');
    expect(app.result()?.breaksLabel).toBe('Przerwy: 45min');
    expect(JSON.parse(localStorage.getItem('workEndCalculator.dailyPlan')!).breaks.length).toBe(2);
  });

  it('rejects malformed times and negative, fractional or non-finite adjustment values', () => {
    const app = createApp();
    for (const value of ['', '5:29', '24:00', '08:60', '8:3', '08:00:00', 'text']) {
      app.form.controls.startTime.setValue(value);
      expect(app.canCalculate).withContext(value).toBeFalse();
      calculate(app);
      expect(app.result()).toBeNull();
    }
    app.form.controls.startTime.setValue('08:00');
    app.showAdjustment('undertimeMakeup');
    for (const value of [-1, .5, Number.NaN, Number.POSITIVE_INFINITY, 60]) {
      app.undertimeMakeup.setValue({ hours: 0, minutes: value });
      expect(app.canCalculate).withContext(String(value)).toBeFalse();
    }
    app.undertimeMakeup.setValue({ hours: 0, minutes: 0 });
    expect(app.canCalculate).toBeTrue();
    calculate(app);
    expect(app.result()?.endTime).toBe('16:15');
  });
});

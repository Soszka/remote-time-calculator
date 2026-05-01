import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

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

  function addBreak(app: AppComponent, start: string, end: string): void {
    app.addBreak();
    const breakGroup = app.breaks.at(app.breaks.length - 1);
    breakGroup.controls.start.setValue(start);
    breakGroup.controls.end.setValue(end);
  }

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

  it('should render heading', () => {
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Kalkulator końca pracy'
    );
  });

  it('calculates 8h 15min of work with no breaks or adjustments', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('08:00');

    calculate(app);

    expect(app.scheduleError()).toBeNull();
    expect(app.result()?.endTime).toBe('16:15');
    expect(app.result()?.breaksLabel).toBeNull();
    expect(app.result()?.adjustmentLabel).toBeNull();
  });

  it('accepts the earliest allowed start time and keeps the 8h 15min base', () => {
    const app = createApp();
    app.form.controls.startTime.setValue('05:30');

    calculate(app);

    expect(app.scheduleError()).toBeNull();
    expect(app.result()?.endTime).toBe('13:45');
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
});

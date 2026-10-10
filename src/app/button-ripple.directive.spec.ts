import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ButtonRippleDirective } from './button-ripple.directive';

@Component({
  standalone: true,
  imports: [ButtonRippleDirective],
  template: '<button [disabled]="disabled" style="width:160px;height:40px;box-sizing:border-box">Test</button>',
})
class RippleTestComponent { disabled = false; }

describe('ButtonRippleDirective', () => {
  let fixture: ComponentFixture<RippleTestComponent>;
  let button: HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RippleTestComponent] });
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    fixture = TestBed.createComponent(RippleTestComponent);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button');
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  function press(): void {
    const rect = button.getBoundingClientRect();
    button.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: rect.left + 12, clientY: rect.top + 8 }));
  }

  it('creates a clipped pointer ripple without changing the button size and cleans it after completion', async () => {
    const initial = button.getBoundingClientRect();
    press();
    const ink = button.querySelector<HTMLElement>('.button-ripple')!;
    expect(button.querySelector('.button-ripple-layer')?.getAttribute('aria-hidden')).toBe('true');
    expect(ink.getAnimations().length).toBe(1);
    expect(parseFloat(ink.style.width)).toBeGreaterThan(initial.width);
    expect(button.getBoundingClientRect().width).toBe(initial.width);
    expect(button.getBoundingClientRect().height).toBe(initial.height);
    const animation = ink.getAnimations()[0];
    animation.finish();
    await animation.finished;
    expect(button.querySelector('.button-ripple')).toBeNull();
  });

  it('gives keyboard activation a centered ripple but ignores repeated keys', () => {
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true }));
    const inks = button.querySelectorAll<HTMLElement>('.button-ripple');
    expect(inks.length).toBe(1);
    const ink = inks[0];
    expect(parseFloat(ink.style.left) + parseFloat(ink.style.width) / 2).toBeCloseTo(80);
    expect(parseFloat(ink.style.top) + parseFloat(ink.style.height) / 2).toBeCloseTo(20);
  });

  it('respects disabled buttons and reduced motion', () => {
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();
    press();
    expect(button.querySelector('.button-ripple')).toBeNull();
    fixture.componentInstance.disabled = false;
    fixture.detectChanges();
    (window.matchMedia as jasmine.Spy).and.returnValue({ matches: true } as MediaQueryList);
    press();
    expect(button.querySelector('.button-ripple')).toBeNull();
  });

  it('bounds repeated presses and releases animations and listeners when removed', () => {
    for (let i = 0; i < 12; i++) press();
    expect(button.querySelectorAll('.button-ripple').length).toBe(4);
    const animations = Array.from(button.querySelectorAll('.button-ripple')).flatMap(ink => ink.getAnimations());
    fixture.destroy();
    expect(animations.every(animation => animation.playState === 'idle')).toBeTrue();
    press();
    expect(button.querySelector('.button-ripple-layer')).toBeNull();
  });
});

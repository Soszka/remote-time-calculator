import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PANEL_MOTION, PanelMotionDirective } from './panel-motion.directive';

@Component({
  standalone: true,
  imports: [CommonModule, PanelMotionDirective],
  template: `
    <div style="display:flex;flex-direction:column;gap:24px;width:320px">
      <div style="height:50px">Start</div>
      <div *ngIf="visible" appPanelMotion [panelClosing]="closing" [panelOpening]="opening"
        class="slot" style="display:grid;grid-template-rows:1fr">
        <div style="min-height:0;overflow:hidden">
          <div class="card" style="padding:16px;background:#eee">
            <input value="10:15" style="display:block;height:40px;box-sizing:border-box">
            <div *ngIf="extra" style="height:60px">Druga przerwa</div>
          </div>
        </div>
      </div>
      <button style="height:40px">Przelicz</button>
    </div>`,
})
class PanelTestComponent { visible = false; closing = false; opening = true; extra = false; }

describe('PanelMotionDirective', () => {
  let fixture: ComponentFixture<PanelTestComponent>;
  let media: EventTarget & { matches: boolean };
  let hidden: boolean;
  const y = (node: Element) => node.getBoundingClientRect().y;

  beforeEach(() => {
    media = Object.assign(new EventTarget(), { matches: false });
    hidden = false;
    spyOn(window, 'matchMedia').and.returnValue(media as unknown as MediaQueryList);
    spyOnProperty(document, 'hidden', 'get').and.callFake(() => hidden);
    TestBed.configureTestingModule({ imports: [PanelTestComponent] });
    fixture = TestBed.createComponent(PanelTestComponent);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => { fixture.destroy(); fixture.nativeElement.remove(); });

  function open(): HTMLElement {
    fixture.componentInstance.visible = true;
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.slot');
  }

  it('opens the actual slot and gap smoothly, without scaling inputs, and settles without a jump', async () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    const baseline = y(button);
    const slot = open();
    const input = slot.querySelector('input')!;
    const animation = slot.getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
    expect(slot.getBoundingClientRect().height).toBe(0);
    expect(y(button)).toBeCloseTo(baseline, 1);
    let previous = baseline;
    for (const time of [80, 160, 260, PANEL_MOTION.enter]) {
      animation.currentTime = time;
      expect(y(button)).toBeGreaterThan(previous);
      previous = y(button);
      expect(input.getBoundingClientRect().height).toBe(40);
      expect(getComputedStyle(input).transform).toBe('none');
      expect(getComputedStyle(slot).filter).toBe('none');
    }
    const settled = y(button);
    animation.finish();
    await animation.finished;
    expect(slot.getAnimations().length).toBe(0);
    expect(y(button)).toBeCloseTo(settled, 1);
    expect(input.value).toBe('10:15');
  });

  it('collapses its measured content and spacing continuously and leaves no jump when removed', async () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    const baseline = y(button);
    const slot = open();
    const enter = slot.getAnimations()[0];
    enter.finish();
    await enter.finished;
    fixture.componentInstance.closing = true;
    fixture.detectChanges();
    const leave = slot.getAnimations()[0];
    leave.pause();
    leave.currentTime = 0;
    let previous = y(button);
    for (const time of [60, 150, 240, PANEL_MOTION.leave]) {
      leave.currentTime = time;
      expect(y(button)).toBeLessThan(previous);
      previous = y(button);
    }
    expect(slot.getBoundingClientRect().height).toBe(0);
    expect(y(button)).toBeCloseTo(baseline, 1);
    fixture.componentInstance.visible = false;
    fixture.detectChanges();
    expect(y(button)).toBeCloseTo(baseline, 1);
  });

  it('closes from the current expansion when interrupted rather than jumping to full height', () => {
    const slot = open();
    const enter = slot.getAnimations()[0];
    enter.pause();
    enter.currentTime = 80;
    const before = slot.getBoundingClientRect().height;
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    const beforeY = y(button);
    fixture.componentInstance.closing = true;
    fixture.detectChanges();
    const leave = slot.getAnimations()[0];
    leave.pause();
    leave.currentTime = 0;
    expect(slot.getBoundingClientRect().height).toBeCloseTo(before, 1);
    expect(y(button)).toBeCloseTo(beforeY, 1);
    leave.currentTime = PANEL_MOTION.leave;
    expect(slot.getBoundingClientRect().height).toBe(0);
    expect(slot.getAnimations().length).toBe(1);
  });

  it('follows changing content sizes and keeps the full height after animation cleanup', async () => {
    const slot = open();
    const animation = slot.getAnimations()[0];
    animation.pause();
    animation.currentTime = 100;
    fixture.componentInstance.extra = true;
    fixture.detectChanges();
    animation.currentTime = PANEL_MOTION.enter;
    expect(slot.getBoundingClientRect().height).toBe(132);
    animation.finish();
    await animation.finished;
    expect(slot.getBoundingClientRect().height).toBe(132);
  });

  it('skips restored panels and reduced-motion starts, and finishes pending motion when hidden or reduced', async () => {
    fixture.componentInstance.opening = false;
    let slot = open();
    expect(slot.getAnimations().length).toBe(0);
    fixture.componentInstance.visible = false;
    fixture.detectChanges();
    fixture.componentInstance.opening = true;
    media.matches = true;
    slot = open();
    expect(slot.getAnimations().length).toBe(0);
    fixture.componentInstance.visible = false;
    fixture.detectChanges();
    media.matches = false;
    slot = open();
    let animation = slot.getAnimations()[0];
    media.matches = true;
    media.dispatchEvent(new Event('change'));
    await animation.finished;
    expect(slot.getAnimations().length).toBe(0);
    fixture.componentInstance.visible = false;
    fixture.detectChanges();
    media.matches = false;
    slot = open();
    animation = slot.getAnimations()[0];
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await animation.finished;
    expect(slot.getAnimations().length).toBe(0);
  });
});

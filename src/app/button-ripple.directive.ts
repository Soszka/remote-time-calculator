import { Directive, ElementRef, NgZone, OnDestroy } from '@angular/core';

/** A clipped ink ripple for pointer and keyboard presses, outside change detection. */
@Directive({ selector: 'button', standalone: true })
export class ButtonRippleDirective implements OnDestroy {
  private readonly button: HTMLButtonElement;
  private readonly activeRipples = new Map<HTMLElement, Animation>();
  private readonly removeListeners: (() => void)[] = [];
  private layer?: HTMLElement;

  constructor(element: ElementRef<HTMLButtonElement>, zone: NgZone) {
    this.button = element.nativeElement;
    zone.runOutsideAngular(() => {
      const pointerDown = (event: PointerEvent): void => {
        if (event.button !== 0) return;
        this.ripple(event.clientX, event.clientY);
      };
      const keyDown = (event: KeyboardEvent): void => {
        if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) this.ripple();
      };
      this.button.addEventListener('pointerdown', pointerDown);
      this.button.addEventListener('keydown', keyDown);
      this.removeListeners.push(
        () => this.button.removeEventListener('pointerdown', pointerDown),
        () => this.button.removeEventListener('keydown', keyDown),
      );
    });
  }

  ngOnDestroy(): void {
    this.removeListeners.forEach(remove => remove());
    this.activeRipples.forEach(animation => animation.cancel());
    this.activeRipples.clear();
    this.layer?.remove();
  }

  private ripple(clientX?: number, clientY?: number): void {
    if (this.button.disabled || this.button.getAttribute('aria-disabled') === 'true' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = this.button.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (!this.layer) {
      this.layer = document.createElement('span');
      this.layer.className = 'button-ripple-layer';
      this.layer.setAttribute('aria-hidden', 'true');
      this.button.append(this.layer);
    }

    // Bound rapid repeated presses, and cancel their compositor animations.
    if (this.activeRipples.size >= 4) {
      const oldest = this.activeRipples.entries().next().value as [HTMLElement, Animation];
      oldest[1].cancel();
      oldest[0].remove();
      this.activeRipples.delete(oldest[0]);
    }
    const x = clientX === undefined ? rect.width / 2 : Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = clientY === undefined ? rect.height / 2 : Math.max(0, Math.min(rect.height, clientY - rect.top));
    const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
    const ink = document.createElement('span');
    ink.className = 'button-ripple';
    ink.style.width = ink.style.height = `${radius * 2}px`;
    ink.style.left = `${x - radius}px`;
    ink.style.top = `${y - radius}px`;
    this.layer.append(ink);
    if (typeof ink.animate !== 'function') {
      ink.remove();
      return;
    }
    const animation = ink.animate([
      { transform: 'scale(0)', opacity: 0.22 },
      { transform: 'scale(1)', opacity: 0.14, offset: 0.65 },
      { transform: 'scale(1)', opacity: 0 },
    ], { duration: 520, easing: 'cubic-bezier(0, 0, 0.2, 1)' });
    this.activeRipples.set(ink, animation);
    const remove = (): void => {
      ink.remove();
      this.activeRipples.delete(ink);
    };
    void animation.finished.then(remove, remove);
  }
}

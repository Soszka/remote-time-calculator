import { AfterViewInit, Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';

export const PANEL_MOTION = { enter: 400, leave: 300, remove: 320 } as const;

/** Expand the actual layout slot, including its gap, without scaling text or inputs. */
@Directive({ selector: '[appPanelMotion]', standalone: true })
export class PanelMotionDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input() panelOpening = true;
  @Input() panelClosing = false;
  @Input() panelMotionEnabled = true;
  @Input() panelMotionBorder = false;

  private initialized = false;
  private animation?: Animation;
  private from = 0;
  private to = 1;
  private borderSurface?: HTMLElement;
  private readonly media = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly finishWhenReduced = () => { if (this.media.matches) this.animation?.finish(); };
  private readonly finishWhenHidden = () => { if (document.hidden) this.animation?.finish(); };

  constructor(private readonly element: ElementRef<HTMLElement>, private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    this.initialized = true;
    this.zone.runOutsideAngular(() => {
      this.media.addEventListener?.('change', this.finishWhenReduced);
      document.addEventListener('visibilitychange', this.finishWhenHidden);
      if (this.panelOpening && this.panelMotionEnabled) this.play(false);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['panelMotionBorder'] && !this.panelMotionBorder) this.clearBorder();
    if (this.initialized && changes['panelClosing'] && this.panelMotionEnabled) {
      this.zone.runOutsideAngular(() => this.play(this.panelClosing));
    }
  }

  ngOnDestroy(): void {
    this.animation?.cancel();
    this.clearBorder();
    this.media.removeEventListener?.('change', this.finishWhenReduced);
    document.removeEventListener('visibilitychange', this.finishWhenHidden);
  }

  private play(closing: boolean): void {
    const node = this.element.nativeElement;
    if (this.media.matches || document.hidden || typeof node.animate !== 'function') return;
    const view = node.ownerDocument.defaultView ?? window;
    const gap = parseFloat(view.getComputedStyle(node.parentElement!).rowGap) || 0;
    const progress = this.animation?.effect?.getComputedTiming().progress;
    const fraction = progress == null ? (closing ? 1 : 0) : this.from + (this.to - this.from) * progress;
    const margin = this.animation ? view.getComputedStyle(node).marginBottom : `${closing ? 0 : -gap}px`;
    const opacity = this.animation ? view.getComputedStyle(node).opacity : (closing ? '1' : '0.65');
    this.animation?.cancel();
    this.from = fraction;
    this.to = closing ? 0 : 1;
    this.prepareBorder(view);
    // Fractional tracks follow the content's natural size, also when another break is added mid-animation.
    const animation = node.animate([
      { gridTemplateRows: `${fraction}fr`, marginBottom: margin, opacity },
      { gridTemplateRows: `${this.to}fr`, marginBottom: `${closing ? -gap : 0}px`, opacity: closing ? 0 : 1 },
    ], {
      duration: closing ? PANEL_MOTION.leave : PANEL_MOTION.enter,
      easing: closing ? 'cubic-bezier(0.4, 0, 0.2, 1)' : 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'both',
    });
    this.animation = animation;
    void animation.finished.then(() => {
      if (this.animation === animation && !closing) {
        animation.cancel();
        this.animation = undefined;
        this.clearBorder();
      }
    }).catch(() => {});
  }

  private prepareBorder(view: Window): void {
    const node = this.element.nativeElement;
    if (!this.panelMotionBorder || this.borderSurface) return;
    const surface = node.querySelector<HTMLElement>('.break-row, .adjustment-row');
    if (!surface) return;
    const style = view.getComputedStyle(surface);
    node.style.setProperty('--motion-shadow', style.boxShadow);
    node.style.setProperty('--motion-radius', style.borderRadius);
    node.style.setProperty('--motion-border-top', `${surface.getBoundingClientRect().top - node.getBoundingClientRect().top}px`);
    this.borderSurface = surface;
    surface.classList.add('motion-border-surface');
    node.classList.add('motion-border-active');
  }

  private clearBorder(): void {
    const node = this.element.nativeElement;
    this.borderSurface?.classList.remove('motion-border-surface');
    this.borderSurface = undefined;
    node.classList.remove('motion-border-active');
    for (const property of ['--motion-shadow', '--motion-radius', '--motion-border-top']) node.style.removeProperty(property);
  }
}

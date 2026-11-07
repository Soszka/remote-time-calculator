import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { LiquidFlowRenderer } from './liquid-flow-renderer';

@Component({
  selector: 'app-liquid-backdrop',
  standalone: true,
  template: `
    <div class="liquid-flow-fallback"></div>
    <canvas #flowCanvas class="liquid-flow-canvas"></canvas>
  `,
  host: { 'aria-hidden': 'true', '[class.backdrop-pending]': 'motionPaused || resumeFrame !== null' },
})
export class LiquidBackdropComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() variant: 'exit' | 'remaining' = 'exit';
  @Input() value = '';
  @Input() active = true;
  @Input() motionPaused = false;
  @ViewChild('flowCanvas', { static: true }) private flowCanvas!: ElementRef<HTMLCanvasElement>;
  private renderer?: LiquidFlowRenderer;
  private ready = false;
  private attempted = false;
  protected resumeFrame: number | null = null;

  constructor(private readonly element: ElementRef<HTMLElement>, private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    this.ready = true;
    if (!this.motionPaused) this.zone.runOutsideAngular(() => this.syncRenderer());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.ready) return;
    this.zone.runOutsideAngular(() => {
      if (this.motionPaused) {
        this.cancelResume();
        this.renderer?.setPaused(true);
      } else if (changes['motionPaused']) {
        // Leave a paint between settling the panel and doing WebGL work.
        this.resumeFrame = requestAnimationFrame(() => {
          this.resumeFrame = requestAnimationFrame(() => {
            this.resumeFrame = null;
            this.syncRenderer();
            this.element.nativeElement.classList.remove('backdrop-pending');
          });
        });
      } else if (this.resumeFrame === null) {
        this.syncRenderer();
      }
    });
  }

  private syncRenderer(): void {
    if (this.renderer) {
      this.renderer.setValue(this.value);
      this.renderer.setActive(this.active);
      this.renderer.setPaused(false);
      return;
    }
    if (this.attempted) return;
    this.attempted = true;
    const card = this.element.nativeElement.parentElement;
    if (!card) return;
    try {
      this.renderer = new LiquidFlowRenderer(this.flowCanvas.nativeElement, card, this.variant === 'remaining' ? 1 : 0,
        this.value, this.active);
    } catch {
      // The semantic HTML clock and CSS backdrop remain visible without WebGL.
      card.classList.remove('has-liquid-canvas');
    }
  }

  private cancelResume(): void {
    if (this.resumeFrame !== null) cancelAnimationFrame(this.resumeFrame);
    this.resumeFrame = null;
  }

  ngOnDestroy(): void {
    this.cancelResume();
    this.renderer?.dispose();
  }
}

import { AfterViewInit, Component, ElementRef, HostListener, Input, NgZone, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { LiquidFlowRenderer } from './liquid-flow-renderer';

@Component({
  selector: 'app-liquid-backdrop',
  standalone: true,
  template: `
    <div class="liquid-flow-fallback"></div>
    <canvas #flowCanvas class="liquid-flow-canvas"></canvas>
  `,
  host: { 'aria-hidden': 'true' },
})
export class LiquidBackdropComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() variant: 'exit' | 'remaining' = 'exit';
  @Input() value = '';
  @Input() active = true;
  @Input() motionPaused = false;
  @ViewChild('flowCanvas', { static: true }) private flowCanvas!: ElementRef<HTMLCanvasElement>;
  private renderer?: LiquidFlowRenderer;

  constructor(private readonly element: ElementRef<HTMLElement>, private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const card = this.element.nativeElement.parentElement;
      if (!card) return;
      try {
        this.renderer = new LiquidFlowRenderer(this.flowCanvas.nativeElement, card, this.variant === 'remaining' ? 1 : 0,
          this.value, this.active, this.motionPaused);
      } catch {
        // The semantic HTML clock and CSS backdrop remain visible without WebGL.
        card.classList.remove('has-liquid-canvas');
      }
    });
  }

  ngOnChanges(): void {
    this.renderer?.setValue(this.value);
    this.renderer?.setPaused(this.motionPaused);
    this.renderer?.setActive(this.active);
  }

  @HostListener('liquid-snapshot', ['$event'])
  copyFrame(event: CustomEvent<HTMLCanvasElement>): void {
    this.renderer?.copyFrame(event.detail);
  }
  ngOnDestroy(): void { this.renderer?.dispose(); }
}

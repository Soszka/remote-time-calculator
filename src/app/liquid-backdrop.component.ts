import { AfterViewInit, Component, ElementRef, HostListener, Input, NgZone, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { LiquidFlowRenderer } from './liquid-flow-renderer';
import { GlassAnimation } from './card-animation';

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
  @Input() textScale = 100;
  @Input() timeline = false;
  @Input() sideScale = 100;
  @Input() earlyValue = '';
  @Input() lateValue = '';
  @Input() effect: GlassAnimation = 'liquid';
  @ViewChild('flowCanvas', { static: true }) private flowCanvas!: ElementRef<HTMLCanvasElement>;
  private renderer?: LiquidFlowRenderer;

  constructor(private readonly element: ElementRef<HTMLElement>, private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const card = this.element.nativeElement.parentElement;
      if (!card) return;
      try {
        this.renderer = new LiquidFlowRenderer(this.flowCanvas.nativeElement, card, this.variant === 'remaining' ? 1 : 0, this.value, this.active, this.effect);
      } catch {
        // The semantic HTML clock and CSS backdrop remain visible without WebGL.
        card.classList.remove('has-liquid-canvas');
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.renderer?.setValue(this.value);
    this.renderer?.setActive(this.active);
    if (changes['textScale'] || changes['timeline'] || changes['sideScale'] || changes['earlyValue'] || changes['lateValue']) this.renderer?.refreshTypography();
    if (changes['effect']) this.renderer?.setEffect(this.effect);
  }

  @HostListener('liquid-snapshot', ['$event'])
  copyFrame(event: CustomEvent<HTMLCanvasElement>): void {
    this.renderer?.copyFrame(event.detail);
  }
  ngOnDestroy(): void { this.renderer?.dispose(); }
}

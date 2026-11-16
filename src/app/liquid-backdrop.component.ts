import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
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
  @Output() readonly readinessChange = new EventEmitter<boolean>();
  @ViewChild('flowCanvas', { static: true }) private flowCanvas!: ElementRef<HTMLCanvasElement>;
  private renderer?: LiquidFlowRenderer;
  private updateQueued = false;
  private typographyChanged = false;
  private destroyed = false;
  private loading = true;
  private lastActive = false;
  private readinessRevision = 0;
  private loadingTimeout?: ReturnType<typeof setTimeout>;
  private effectChanged = false;

  constructor(private readonly element: ElementRef<HTMLElement>, private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const card = this.element.nativeElement.parentElement;
      if (!card) return;
      try {
        this.renderer = this.createRenderer(card);
      } catch {
        // The semantic HTML clock and CSS backdrop remain visible without WebGL.
        card.classList.remove('has-liquid-canvas');
      }
    });
  }

  private createRenderer(card: HTMLElement): LiquidFlowRenderer {
    return new LiquidFlowRenderer(this.flowCanvas.nativeElement, card, this.variant === 'remaining' ? 1 : 0, this.value, this.active, this.effect);
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.effectChanged ||= !!changes['effect'];
    this.typographyChanged ||= !!(changes['textScale'] || changes['timeline'] ||
      this.timeline && (changes['sideScale'] || changes['earlyValue'] || changes['lateValue']));
    if (this.updateQueued) return;
    this.updateQueued = true;
    queueMicrotask(() => {
      this.updateQueued = false;
      if (this.destroyed) return;
      const typographyChanged = this.typographyChanged;
      this.typographyChanged = false;
      this.zone.runOutsideAngular(() => {
        if (this.effectChanged || this.active && !this.lastActive) this.loading = true;
        this.effectChanged = false;
        this.lastActive = this.active;
        this.renderer?.updateFrame(this.value, this.active, this.effect, typographyChanged);
        if (!this.active) {
          ++this.readinessRevision;
          clearTimeout(this.loadingTimeout);
          this.loadingTimeout = undefined;
        } else if (this.loading) this.waitForGraphics();
      });
    });
  }

  private waitForGraphics(): void {
    const revision = ++this.readinessRevision;
    if (!this.renderer) { this.finishLoading(revision); return; }
    this.zone.run(() => this.readinessChange.emit(false));
    // A broken driver or a worker that never answers must not hide the clock.
    this.startLoadingTimeout();
    void this.renderer.ready.then(() => this.finishLoading(revision), () => {
      if (revision !== this.readinessRevision || this.destroyed) return;
      this.renderer?.dispose();
      this.finishLoading(revision);
    });
  }

  private startLoadingTimeout(): void {
    if (document.hidden || this.loadingTimeout !== undefined) return;
    this.loadingTimeout = setTimeout(() => {
      this.renderer?.dispose();
      this.finishLoading(this.readinessRevision);
    }, 4000);
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.hidden) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = undefined;
    } else if (this.loading && this.active) this.startLoadingTimeout();
  }

  private finishLoading(revision: number): void {
    if (this.destroyed || revision !== this.readinessRevision) return;
    clearTimeout(this.loadingTimeout);
    this.loadingTimeout = undefined;
    this.loading = false;
    this.zone.run(() => this.readinessChange.emit(true));
  }

  @HostListener('liquid-snapshot', ['$event'])
  copyFrame(event: CustomEvent<HTMLCanvasElement>): void {
    this.renderer?.copyFrame(event.detail);
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.loadingTimeout);
    this.renderer?.dispose();
  }
}

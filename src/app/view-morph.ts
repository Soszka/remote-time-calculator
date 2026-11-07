type ViewMode = 'form' | 'result';
type Bounds = { x: number; y: number; width: number; height: number };
type Outgoing = { node: HTMLElement; bounds: Bounds };

export interface ViewMorphSnapshot {
  panel: Bounds;
  outgoing: Outgoing[];
}

const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';
const foldEase = 'cubic-bezier(0.55, 0, 1, 0.45)';
export const ACCORDION_PHASES = { collapse: 200, expand: 360 } as const;
const bounds = (element: Element): Bounds => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
};

/** Fold an inert copy and unfold the entire prepared view. No frame-by-frame layout work. */
export class ViewMorph {
  private readonly animations = new Set<Animation>();
  private overlay?: HTMLElement;
  private readonly media = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly stopWhenHidden = () => { if (document.hidden) this.cancel(); };
  private readonly stopWhenReduced = () => { if (this.media.matches) this.cancel(); };
  private readonly stopOnResize = () => this.cancel();

  constructor(private readonly host: HTMLElement) {
    document.addEventListener('visibilitychange', this.stopWhenHidden);
    this.media.addEventListener?.('change', this.stopWhenReduced);
    window.addEventListener('resize', this.stopOnResize, { passive: true });
  }

  capture(mode: ViewMode): ViewMorphSnapshot | null {
    const panel = this.host.querySelector<HTMLElement>('.panel');
    if (!panel) return null;
    const panelBounds = bounds(panel);
    if (!panelBounds.width || !panelBounds.height) return null;
    const sources = Array.from(panel.querySelectorAll<HTMLElement>(mode === 'form'
      ? '.panel-header, .form > *'
      : '.highlight-card'));
    // The form's own surface must fold together with its controls, not disappear at the click.
    if (mode === 'form') sources.unshift(panel);
    const outgoing = sources.map(source => {
      const clone = source.cloneNode(source !== panel) as HTMLElement;
      // Visual copies have neither duplicate IDs nor interactive/accessibility targets.
      for (const node of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]) {
        node.removeAttribute('id');
        node.removeAttribute('for');
        node.removeAttribute('name');
      }
      const inputs = Array.from(source.querySelectorAll('input'));
      clone.querySelectorAll('input').forEach((input, index) => {
        const original = inputs[index];
        input.value = original.value;
        // Removing IDs must not change the start field's tint in the departing copy.
        const style = getComputedStyle(original);
        input.style.background = style.background;
        input.style.color = style.color;
        input.style.boxShadow = style.boxShadow;
      });
      clone.querySelectorAll('.button-ripple-layer').forEach(layer => layer.remove());
      // Use the same static clock face in either mode without reading pixels back from the GPU.
      clone.querySelectorAll('app-liquid-backdrop').forEach(backdrop => backdrop.remove());
      clone.querySelectorAll('.has-liquid-canvas').forEach(card => card.classList.remove('has-liquid-canvas'));
      return { node: clone, bounds: bounds(source) };
    });
    return { panel: panelBounds, outgoing };
  }

  play(snapshot: ViewMorphSnapshot | null): Animation | null {
    if (!snapshot || this.media.matches || document.hidden || typeof this.host.animate !== 'function') return null;
    const panel = this.host.querySelector<HTMLElement>('.panel');
    if (!panel) return null;
    // Measure before starting any animation, so intermediate transforms never feed layout.
    const target = bounds(panel);
    if (!target.width || !target.height) return null;
    const expandStart = ACCORDION_PHASES.collapse;
    const sx = snapshot.panel.width / target.width;
    const dx = snapshot.panel.x + snapshot.panel.width / 2 - target.x - target.width / 2;
    const dy = snapshot.panel.y + snapshot.panel.height / 2 - target.y - target.height / 2;
    const incoming = this.animate(panel, [
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, 0)` },
      { transform: 'translate3d(0, 0, 0) scale(1, 1)' },
    ].map(frame => ({ ...frame, transformOrigin: 'center center' })), ACCORDION_PHASES.expand, expandStart);

    this.showOutgoing(snapshot);
    return incoming;
  }

  cancel(): void {
    this.animations.forEach(animation => animation.cancel());
    this.animations.clear();
    this.overlay?.remove();
    this.overlay = undefined;
  }

  dispose(): void {
    this.cancel();
    document.removeEventListener('visibilitychange', this.stopWhenHidden);
    this.media.removeEventListener?.('change', this.stopWhenReduced);
    window.removeEventListener('resize', this.stopOnResize);
  }

  private showOutgoing(snapshot: ViewMorphSnapshot): void {
    const overlay = document.createElement('div');
    overlay.className = 'view-morph-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('inert', '');
    const surface = document.createElement('div');
    surface.className = 'panel compact-panel view-morph-surface';
    const origin = snapshot.panel;
    surface.style.cssText = `left:${origin.x}px;top:${origin.y}px;width:${origin.width}px;height:${origin.height}px;`;
    overlay.append(surface);
    this.host.append(overlay);
    this.overlay = overlay;
    for (const outgoing of snapshot.outgoing) {
      const { node, bounds: box } = outgoing;
      node.style.cssText += `;position:absolute;left:${box.x - origin.x}px;top:${box.y - origin.y}px;width:${box.width}px;height:${box.height}px;margin:0;box-sizing:border-box;`;
      surface.append(node);
    }
    // A single centre-origin transform folds the surface, cards, fields and labels together.
    this.animate(surface, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }]
      .map(frame => ({ ...frame, transformOrigin: 'center center' })), ACCORDION_PHASES.collapse, 0, foldEase);
  }

  private animate(element: HTMLElement, frames: Keyframe[], duration: number, delay = 0, easing = ease): Animation {
    const animation = element.animate(frames, { duration, delay, easing, fill: 'both' });
    this.animations.add(animation);
    // Keep final transforms until the coordinated cleanup, avoiding a premature
    // snap while the parent is still moving. Rejections from cancellation are expected.
    void animation.finished.catch(() => {});
    return animation;
  }
}

const duration = 280;

/** Hold the previous clock appearance while its replacement is prepared. */
export class ClockStyleTransition {
  private snapshot?: HTMLElement;
  private fade?: Animation;
  private entrance?: Animation;
  private readonly media = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly stop = () => this.cancel();

  constructor(private readonly host: HTMLElement) {
    window.addEventListener('resize', this.stop, { passive: true });
    this.media.addEventListener?.('change', this.stop);
  }

  capture(): void {
    this.finishEntrance();
    if (this.fade) this.cancel();
    if (this.snapshot || this.media.matches || document.hidden) return;
    const source = this.host.querySelector<HTMLElement>('.compact-highlight');
    if (!source || source.closest('.result-cache')) return;
    const box = source.getBoundingClientRect();
    if (!box.width || !box.height) return;
    // Keep the old theme and ancestor selectors, even after the real app-root
    // switches between its plain and animated card styles.
    const layer = this.host.cloneNode(false) as HTMLElement;
    layer.classList.add('clock-style-snapshot');
    layer.setAttribute('inert', '');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText += `;position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;min-height:0;margin:0;padding:0;background:none;pointer-events:none;z-index:5;display:block;`;
    const ancestors: HTMLElement[] = [];
    for (let node = source.parentElement; node && node !== this.host; node = node.parentElement) ancestors.unshift(node);
    let parent = layer;
    for (const ancestor of ancestors) {
      const wrapper = ancestor.cloneNode(false) as HTMLElement;
      wrapper.style.cssText += ';display:block;position:static;width:100%;max-width:none;height:100%;min-height:0;margin:0;padding:0;border:0;transform:none;visibility:visible;background:none;box-shadow:none;';
      parent.append(wrapper);
      parent = wrapper;
    }
    const clone = source.cloneNode(true) as HTMLElement;
    clone.style.cssText += ';width:100%;height:100%;margin:0;box-sizing:border-box;animation:none;';
    parent.append(clone);
    for (const node of [layer, ...Array.from(layer.querySelectorAll<HTMLElement>('*'))]) {
      for (const attribute of ['id', 'for', 'name', 'autofocus', 'aria-live']) node.removeAttribute(attribute);
    }
    const canvases = source.querySelectorAll<HTMLCanvasElement>('app-liquid-backdrop canvas');
    clone.querySelectorAll<HTMLCanvasElement>('app-liquid-backdrop canvas').forEach((canvas, index) => {
      canvases[index].closest('app-liquid-backdrop')?.dispatchEvent(new CustomEvent('liquid-snapshot', { detail: canvas }));
    });
    this.snapshot = layer;
    this.host.append(layer);
  }

  reveal(): void {
    if (!this.snapshot || this.fade) return;
    if (this.media.matches || document.hidden) { this.cancel(); return; }
    const fade = this.snapshot.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards',
    });
    this.fade = fade;
    void fade.finished.then(() => { if (this.fade === fade) this.cancel(); }, () => {});
  }

  enter(): void {
    if (this.media.matches || document.hidden) return;
    const card = this.host.querySelector<HTMLElement>('.compact-highlight');
    if (!card) return;
    const entrance = card.animate([
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    this.entrance = entrance;
    void entrance.finished.then(() => {
      if (this.entrance === entrance) { entrance.cancel(); this.entrance = undefined; }
    }, () => {});
  }

  private finishEntrance(): void { this.entrance?.cancel(); this.entrance = undefined; }

  cancel(): void {
    this.fade?.cancel();
    this.fade = undefined;
    this.snapshot?.remove();
    this.snapshot = undefined;
    this.finishEntrance();
  }

  dispose(): void {
    this.cancel();
    window.removeEventListener('resize', this.stop);
    this.media.removeEventListener?.('change', this.stop);
  }
}

export interface SettingsOrigin {
  button: HTMLElement;
  bounds: DOMRect;
}

export interface SettingsClosure {
  drawer: HTMLElement;
  bounds: DOMRect;
  anchor: DOMRect;
  scrollTop: number;
  surface: string;
}

/** Carry a visual copy of the profile button into the growing settings surface. */
export class SettingsMotion {
  private readonly animations = new Set<Animation>();
  private orb?: HTMLElement;
  private departing?: HTMLElement;
  private readonly stop = () => this.cancel();

  constructor(private readonly host: HTMLElement) {
    window.addEventListener('resize', this.stop, { passive: true });
  }

  capture(): SettingsOrigin | null {
    const button = this.host.querySelector<HTMLElement>('.settings-button');
    return button ? { button: button.cloneNode(true) as HTMLElement, bounds: button.getBoundingClientRect() } : null;
  }

  captureClose(): SettingsClosure | null {
    const drawer = this.host.querySelector<HTMLElement>('.config-drawer');
    const anchor = drawer?.querySelector<HTMLElement>('.config-close');
    if (!drawer || !anchor) return null;
    const style = getComputedStyle(drawer);
    return {
      drawer: drawer.cloneNode(true) as HTMLElement,
      bounds: drawer.getBoundingClientRect(),
      anchor: anchor.getBoundingClientRect(),
      scrollTop: drawer.querySelector('.config-form')?.scrollTop ?? 0,
      surface: `padding:${style.padding};border:${style.border};border-radius:${style.borderRadius};background:${style.background};box-shadow:${style.boxShadow};gap:${style.gap};`,
    };
  }

  open(origin: SettingsOrigin | null): void {
    this.cancel();
    const drawer = this.host.querySelector<HTMLElement>('.config-drawer');
    if (!origin || !drawer || document.hidden ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof drawer.animate !== 'function') return;
    const target = drawer.getBoundingClientRect();
    if (!target.width || !target.height || !origin.bounds.width) return;
    const close = drawer.querySelector<HTMLElement>('.config-close')!.getBoundingClientRect();
    const x = close.x + close.width / 2 - target.x;
    const y = close.y + close.height / 2 - target.y;
    const dx = target.x + x - origin.bounds.x - origin.bounds.width / 2;
    const dy = target.y + y - origin.bounds.y - origin.bounds.height / 2;
    const orb = origin.button;
    orb.classList.add('settings-orb');
    orb.removeAttribute('data-tooltip');
    orb.removeAttribute('aria-controls');
    orb.setAttribute('aria-hidden', 'true');
    orb.setAttribute('inert', '');
    orb.tabIndex = -1;
    orb.querySelectorAll('.button-ripple-layer').forEach(layer => layer.remove());
    orb.style.cssText = `position:fixed;left:${origin.bounds.x}px;top:${origin.bounds.y}px;width:${origin.bounds.width}px;height:${origin.bounds.height}px;margin:0;z-index:50;pointer-events:none;`;
    this.host.append(orb);
    this.orb = orb;
    const arrival = `translate(${dx}px, ${dy}px)`;
    const travel = this.animate(orb, [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `${arrival} scale(1)`, opacity: 1, offset: .48 },
      { transform: `${arrival} scale(1.08)`, opacity: 1, offset: .66 },
      { transform: `${arrival} scale(.3)`, opacity: 0 },
    ], 700);
    void travel.finished.then(() => { orb.remove(); if (this.orb === orb) this.orb = undefined; }, () => orb.remove());
    const radius = Math.hypot(target.width, target.height);
    this.animate(drawer, [
      { clipPath: `circle(26px at ${x}px ${y}px)`, opacity: 0 },
      { clipPath: `circle(36px at ${x}px ${y}px)`, opacity: 1, offset: .12 },
      { clipPath: `circle(${radius}px at ${x}px ${y}px)`, opacity: 1 },
    ], 510, 190);
    for (const content of Array.from(drawer.children)) {
      this.animate(content as HTMLElement, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 290, 360);
    }
    const preview = this.host.querySelector<HTMLElement>('.config-preview');
    if (preview) this.animate(preview, [{ opacity: 0, transform: 'translateX(20px)' }, { opacity: 1, transform: 'none' }], 430, 80);
  }

  close(snapshot: SettingsClosure | null): void {
    this.cancel();
    const button = this.host.querySelector<HTMLElement>('.settings-button');
    if (!snapshot || !button || !snapshot.bounds.width || document.hidden ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof button.animate !== 'function') return;
    const target = button.getBoundingClientRect();
    if (!target.width) return;
    const { bounds, anchor } = snapshot;
    const x = anchor.x + anchor.width / 2 - bounds.x;
    const y = anchor.y + anchor.height / 2 - bounds.y;
    const drawer = snapshot.drawer;
    drawer.classList.add('settings-departing');
    for (const node of [drawer, ...Array.from(drawer.querySelectorAll<HTMLElement>('*'))]) {
      node.removeAttribute('id');
      node.removeAttribute('for');
      node.removeAttribute('aria-controls');
    }
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('inert', '');
    drawer.style.cssText = `${snapshot.surface}position:fixed;left:${bounds.x}px;top:${bounds.y}px;width:${bounds.width}px;height:${bounds.height}px;max-height:none;display:flex;visibility:visible;opacity:1;margin:0;z-index:40;pointer-events:none;overflow:hidden;container-type:inline-size;`;
    this.host.append(drawer);
    this.departing = drawer;
    drawer.querySelector('.config-form')!.scrollTop = snapshot.scrollTop;
    const fold = this.animate(drawer, [
      { clipPath: `circle(${Math.hypot(bounds.width, bounds.height)}px at ${x}px ${y}px)`, opacity: 1 },
      { clipPath: `circle(27px at ${x}px ${y}px)`, opacity: 1, offset: .85 },
      { clipPath: `circle(24px at ${x}px ${y}px)`, opacity: 0 },
    ], 330);
    void fold.finished.then(() => { drawer.remove(); if (this.departing === drawer) this.departing = undefined; }, () => drawer.remove());
    for (const content of Array.from(drawer.children)) {
      this.animate(content as HTMLElement, [{ opacity: 1 }, { opacity: 0 }], 170);
    }
    const orb = button.cloneNode(true) as HTMLElement;
    orb.classList.add('settings-orb');
    orb.removeAttribute('data-tooltip');
    orb.removeAttribute('aria-controls');
    orb.setAttribute('aria-hidden', 'true');
    orb.setAttribute('inert', '');
    orb.tabIndex = -1;
    const startX = anchor.x + anchor.width / 2 - target.width / 2;
    const startY = anchor.y + anchor.height / 2 - target.height / 2;
    orb.style.cssText = `position:fixed;left:${startX}px;top:${startY}px;width:${target.width}px;height:${target.height}px;margin:0;z-index:50;pointer-events:none;`;
    this.host.append(orb);
    this.orb = orb;
    const travel = this.animate(orb, [
      { transform: 'translate(0, 0) scale(.35)', opacity: 0 },
      { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: .26 },
      { transform: `translate(${target.x - startX}px, ${target.y - startY}px) scale(1)`, opacity: 1 },
    ], 700);
    void travel.finished.then(() => { orb.remove(); if (this.orb === orb) this.orb = undefined; }, () => orb.remove());
    this.animate(button, [{ opacity: 0 }, { opacity: 0, offset: .92 }, { opacity: 1 }], 700);
    const form = this.host.querySelector<HTMLElement>('.panel');
    if (form) this.animate(form, [{ opacity: 0, transform: 'translateX(-20px)' }, { opacity: 1, transform: 'none' }], 430, 100);
  }

  cancel(): void {
    this.animations.forEach(animation => animation.cancel());
    this.animations.clear();
    this.orb?.remove();
    this.orb = undefined;
    this.departing?.remove();
    this.departing = undefined;
  }

  dispose(): void {
    this.cancel();
    window.removeEventListener('resize', this.stop);
  }

  private animate(node: HTMLElement, frames: Keyframe[], duration: number, delay = 0): Animation {
    const animation = node.animate(frames, { duration, delay, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards' });
    this.animations.add(animation);
    void animation.finished.then(() => this.animations.delete(animation), () => this.animations.delete(animation));
    return animation;
  }
}

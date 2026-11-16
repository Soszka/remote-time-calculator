import { encodeGlassMask, GlassMaskInput } from './glass-mask';

type MaskJob = { client: GlassMaskProcessor; id: number; input: GlassMaskInput; done: (surface: Uint8ClampedArray | null) => void };

/** Both cards share one worker and keep only their latest queued clock value. */
export class GlassMaskProcessor {
  private static readonly clients = new Set<GlassMaskProcessor>();
  private static readonly queue = new Map<GlassMaskProcessor, MaskJob>();
  private static worker: Worker | undefined;
  private static busy: MaskJob | undefined;
  private static unavailable = false;
  private static idle: number | undefined;
  private static timeout: ReturnType<typeof setTimeout> | undefined;
  private static nextJob = 0;
  private revision = 0;

  constructor() { GlassMaskProcessor.clients.add(this); }

  submit(input: GlassMaskInput, done: MaskJob['done']): void {
    const job = { client: this, id: ++GlassMaskProcessor.nextJob, input, done };
    this.revision = job.id;
    GlassMaskProcessor.queue.set(this, job);
    GlassMaskProcessor.pump();
  }

  cancel(): void {
    this.revision = -1;
    GlassMaskProcessor.queue.delete(this);
  }

  dispose(): void {
    this.cancel();
    GlassMaskProcessor.clients.delete(this);
    if (GlassMaskProcessor.clients.size) return;
    GlassMaskProcessor.worker?.terminate();
    GlassMaskProcessor.worker = undefined;
    GlassMaskProcessor.busy = undefined;
    GlassMaskProcessor.unavailable = false;
    if (GlassMaskProcessor.idle !== undefined) window.cancelIdleCallback(GlassMaskProcessor.idle);
    if (GlassMaskProcessor.timeout !== undefined) clearTimeout(GlassMaskProcessor.timeout);
    GlassMaskProcessor.idle = GlassMaskProcessor.timeout = undefined;
  }

  private static finish(job: MaskJob, surface: Uint8ClampedArray | null): void {
    this.busy = undefined;
    if (this.clients.has(job.client) && job.id === job.client.revision) job.done(surface);
    this.pump();
  }

  private static pump(): void {
    if (this.busy || !this.queue.size) return;
    const job = this.queue.values().next().value as MaskJob;
    this.queue.delete(job.client);
    this.busy = job;
    if (!this.worker && !this.unavailable) {
      try {
        this.worker = new Worker(new URL('./glass-mask.worker', import.meta.url), { type: 'module' });
        this.worker.onmessage = ({ data }: MessageEvent<{ id: number; surface: Uint8ClampedArray }>) => {
          const current = this.busy;
          if (current && current.id === data.id) this.finish(current, data.surface);
        };
        this.worker.onerror = event => {
          event.preventDefault();
          this.worker?.terminate();
          this.worker = undefined;
          this.unavailable = true;
          const current = this.busy;
          if (current) this.finish(current, null);
        };
      } catch { this.unavailable = true; }
    }
    if (this.worker) {
      try { this.worker.postMessage({ id: job.id, input: job.input }, [job.input.alpha.buffer, job.input.surface.buffer]); }
      catch { this.finish(job, null); }
    } else {
      // Older browsers still show the HTML clock first. Never run the fallback
      // calculation inside the click handler, and process only one card per task.
      const run = () => {
        this.idle = this.timeout = undefined;
        if (this.busy !== job) return;
        let result: Uint8ClampedArray | null = null;
        try { if (job.id === job.client.revision) result = encodeGlassMask(job.input); } catch { /* Retain the HTML fallback. */ }
        this.finish(job, result);
      };
      if (typeof window.requestIdleCallback === 'function') this.idle = window.requestIdleCallback(run, { timeout: 500 });
      else this.timeout = setTimeout(run, 16);
    }
  }
}

import { GlassMaskProcessor } from './glass-mask-processor';
import { encodeGlassMask, GlassMaskInput } from './glass-mask';

function maskInput(): GlassMaskInput {
  const alpha = new Uint8ClampedArray(9 * 9 * 4);
  const surface = new Uint8ClampedArray(alpha.length);
  for (let y = 2; y < 7; y++) for (let x = 2; x < 7; x++) {
    alpha[(y * 9 + x) * 4 + 3] = 255;
    surface[(y * 9 + x) * 4 + 3] = 255;
  }
  return { alpha, surface, width: 9, height: 9, ratio: 2 };
}

describe('Shared glass-mask worker queue', () => {
  let first: GlassMaskProcessor;
  let second: GlassMaskProcessor;
  let worker: Worker;
  let post: jasmine.Spy;
  let terminate: jasmine.Spy;

  beforeEach(() => {
    post = jasmine.createSpy('postMessage');
    terminate = jasmine.createSpy('terminate');
    worker = { postMessage: post, terminate, onmessage: null, onerror: null } as unknown as Worker;
    spyOn(window, 'Worker').and.returnValue(worker);
    first = new GlassMaskProcessor();
    second = new GlassMaskProcessor();
  });

  afterEach(() => { first.dispose(); second.dispose(); });

  function finish(index: number): void {
    const request = post.calls.argsFor(index)[0] as { id: number; input: GlassMaskInput };
    worker.onmessage!.call(worker, new MessageEvent('message', { data: { id: request.id, surface: encodeGlassMask(request.input) } }));
  }

  it('shares one worker between both clocks, transfers buffers and coalesces queued updates', () => {
    const a = jasmine.createSpy('first clock');
    const skipped = jasmine.createSpy('obsolete clock');
    const b = jasmine.createSpy('latest clock');
    first.submit(maskInput(), a);
    second.submit(maskInput(), skipped);
    const latest = maskInput();
    second.submit(latest, b);
    expect(window.Worker).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    finish(0);
    expect(a).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.calls.argsFor(1)[1]).toEqual([latest.alpha.buffer, latest.surface.buffer]);
    finish(1);
    expect(skipped).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('rejects in-flight stale results and terminates the worker after its last card disappears', () => {
    const old = jasmine.createSpy('old result');
    const latest = jasmine.createSpy('latest result');
    first.submit(maskInput(), old);
    first.submit(maskInput(), latest);
    finish(0);
    expect(old).not.toHaveBeenCalled();
    finish(1);
    expect(latest).toHaveBeenCalledTimes(1);
    first.dispose();
    expect(terminate).not.toHaveBeenCalled();
    second.dispose();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('schedules a readable fallback outside the caller when workers are unavailable', () => {
    (window.Worker as unknown as jasmine.Spy).and.throwError('Worker unavailable');
    let idle!: IdleRequestCallback;
    spyOn(window, 'requestIdleCallback').and.callFake(callback => { idle = callback; return 1; });
    spyOn(window, 'cancelIdleCallback').and.stub();
    const done = jasmine.createSpy('result');
    first.submit(maskInput(), done);
    expect(done).not.toHaveBeenCalled();
    idle({ didTimeout: false, timeRemaining: () => 50 });
    expect(done).toHaveBeenCalledWith(encodeGlassMask(maskInput()));
  });

  it('handles a worker failure without leaving its client waiting or an uncaught error', () => {
    const done = jasmine.createSpy('result');
    first.submit(maskInput(), done);
    const error = new ErrorEvent('error', { cancelable: true });
    worker.onerror!.call(worker, error);
    expect(error.defaultPrevented).toBeTrue();
    expect(done).toHaveBeenCalledWith(null);
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});

describe('Real glass-mask worker', () => {
  it('returns exactly the same optical pixels as the original calculation, using transferred buffers', async () => {
    const processor = new GlassMaskProcessor();
    try {
      const input = maskInput();
      const expected = encodeGlassMask(maskInput());
      const actual = await new Promise<Uint8ClampedArray | null>(resolve => processor.submit(input, resolve));
      expect(actual).toEqual(expected);
      expect(input.alpha.byteLength).toBe(0);
      expect(input.surface.byteLength).toBe(0);
    } finally { processor.dispose(); }
  });
});

import { encodeGlassMask, GlassMaskInput } from './glass-mask';

addEventListener('message', ({ data }: MessageEvent<{ id: number; input: GlassMaskInput }>) => {
  const surface = encodeGlassMask(data.input);
  postMessage({ id: data.id, surface }, [surface.buffer]);
});

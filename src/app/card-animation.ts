export type GlassAnimation = 'liquid' | 'reflections' | 'sheen';
export type CardAnimation = GlassAnimation | 'none';

export const CARD_ANIMATIONS: { value: CardAnimation; label: string }[] = [
  { value: 'liquid', label: 'Fale' },
  { value: 'none', label: 'Brak' },
  { value: 'reflections', label: 'Refleksy' },
  { value: 'sheen', label: 'Połysk' },
];

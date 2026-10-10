import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { TIME_COLON_GAP_EM, TIME_COLON_OFFSET_EM } from './time-typography';

@Component({
  selector: 'strong[appTimeValue]',
  standalone: true,
  imports: [CommonModule],
  template: `<span *ngFor="let glyph of glyphs; trackBy: trackGlyph" class="time-glyph" [class.time-separator]="glyph === ':'">{{ glyph }}</span>`,
  host: {
    '[style.--time-colon-gap]': 'colonGap',
    '[style.--time-colon-offset]': 'colonOffset',
  },
})
export class TimeValueComponent implements OnChanges {
  @Input({ required: true }) appTimeValue = '';
  readonly colonGap = `${TIME_COLON_GAP_EM}em`;
  readonly colonOffset = `${TIME_COLON_OFFSET_EM}em`;
  glyphs: string[] = [];

  ngOnChanges(): void {
    this.glyphs = Array.from(this.appTimeValue);
  }

  trackGlyph(index: number): number {
    return index;
  }
}

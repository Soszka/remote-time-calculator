import { CommonModule } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
interface BreakFormGroup extends FormGroup<{
  start: FormControl<string | null>;
  end: FormControl<string | null>;
}> {}

type ResultState = 'beforeStart' | 'inProgress' | 'complete';

interface ResultPayload {
  endTime: string;
  remainingLabel: string;
  message: string;
  state: ResultState;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnDestroy {
  private readonly baseMinutes = 8 * 60 + 15;
  private readonly minStartMinutes = 5 * 60 + 30;
  private readonly maxEndMinutes = 21 * 60;
  private readonly timePattern = /^([01]?\d|2[0-3])([:\.])([0-5]\d)$/;

  readonly confettiPieces = Array.from({ length: 14 }, (_, index) => index);

  private countdownId: ReturnType<typeof setInterval> | null = null;
  private activeSchedule: { startMinutes: number; endMinutes: number } | null = null;

  readonly dayNames: Record<number, string> = {
    0: 'Niedziela',
    1: 'Poniedziałek',
    2: 'Wtorek',
    3: 'Środa',
    4: 'Czwartek',
    5: 'Piątek',
    6: 'Sobota',
  };

  private readonly messageSets: Record<string, Record<'red' | 'orange' | 'yellow' | 'green', string[]>> = {
    Poniedziałek: {
      red: [
        '„Do końca zostało {time} – {day} się dopiero rozgrzewa i Ty niestety też.”',
        '„{time} przed Tobą… brzmi jak wyrok? Spokojnie, {day} właśnie się z tego śmieje.”',
        '„{day} patrzy i myśli: idealnie, jeszcze {time}, żeby przypomnieć Ci, kto tu rządzi.”',
        '„Kiedy słyszysz, że zostało {time}, wiesz już, że {day} to nie dzień, tylko instytucja cierpliwości.”',
        '„{time} do końca – a {day} właśnie zainstalował łatkę na Twoją motywację: naprawiono 0 błędów.”',
      ],
      orange: [
        '„Jeszcze {time} i wciąż {day} – czyli w praktyce dwa razy wolniej niż każda inna doba.”',
        '„{day} dorzuca gratis: {time} pełne okazji, by patrzeć w zegar jak w Netflixa bez fabuły.”',
        '„Masz przed sobą {time}, a {day} dosypuje do tego standardowy pakiet ‘zero satysfakcji’.”',
        '„{time} do końca – idealna ilość czasu, żeby trzy razy pomyśleć, że to już prawie piątek… i się pomylić.”',
        '„{day} nie żartuje: jeszcze {time}, a dopiero uczysz się chodzić po polu minowym kalendarza.”',
      ],
      yellow: [
        '„Kiedy zostało {time}, {day} lubi wysyłać Ci maile z dopiskiem ‘ważne’.”',
        '„{time} – i nagle każdy wokół przypomina sobie, że coś od Ciebie chciał. Magia {daya}.”',
        '„{day} w tej fazie to mistrz slow motion – {time} do końca potrafi ciągnąć się jak pół roku.”',
        '„Jeszcze {time}, czyli wystarczająco, by zrobić jeden task… i pięć razy stracić wątek.”',
        '„{day} daje Ci {time} – akurat tyle, żeby zdążyć zadać sobie pytanie, czemu nie zostałeś rentierem.”',
      ].map((text) => text.replace('{daya}', '{day}')),
      green: [
        '„{time} do końca – {day} specjalnie ustawia zegar na tryb ‘bateria wyczerpana’.”',
        '„Gdy słyszysz: {time}, wiesz, że {day} trzyma Cię na uwięzi tylko po to, by jeszcze raz się pośmiać.”',
        '„{day} potrafi z {time} zrobić maraton – ale dasz radę, bo inaczej się nie da.”',
        '„Zostało {time}, więc czas najwyższy udawać, że coś dopisujesz w notatkach. {day} to kupuje.”',
        '„{day} kończy dzień w swoim stylu: {time} do wolności, ale każdy e-mail wygląda jak boss fight.”',
      ],
    },
    Wtorek: {
      red: [
        '„Jeszcze {time} i wciąż {day} – czyli udawanie, że wczoraj się czegoś nauczyłeś, a dziś wszystko działa wolniej.”',
        '„{day} właśnie Ci przypomina: {time} do końca, a Twój entuzjazm skończył się w piątek.”',
        '„{time} przed Tobą, a {day} już planuje, gdzie Ci dorzuci małe spotkanko na szybko.”',
        '„{day} z dumą melduje: {time} – wystarczy, żeby rozgrzać fotel, ale nie ambicje.”',
        '„{time} zostało, a {day} patrzy z boku i mówi: spokojnie, do weekendu jeszcze dwa razy tyle.”',
      ],
      orange: [
        '„{day} ma dla Ciebie {time} – idealny pakiet: trochę pracy, dużo kawy i zero satysfakcji.”',
        '„Zostało {time}, a {day} specjalnie wydłuża każdą minutę, jakby robił Ci na złość.”',
        '„{day} podrzuca {time}, byś miał czas na kolejne ‘zaraz do tego wrócę’.”',
        '„{time} do końca – w sam raz, żeby drugi raz sprawdzić kuchnię, jakby nagle pojawiło się ciasto.”',
        '„{day} się uśmiecha: {time} i jeszcze zdążysz złapać jedno spotkanie, które nic nie wniesie.”',
      ],
      yellow: [
        '„{time} przed Tobą – czyli ta część {daya}, w której każdy mail wygląda jak prezent, którego nie chciałeś.”',
        '„{day} mruga okiem: {time} do końca, ale spokojnie, i tak wyjdziesz z poczuciem, że nic nie zrobiłeś.”',
        '„Jeszcze {time}, a {day} sprawia, że zegar chodzi jakby na bateriach z bazaru.”',
        '„{day} przypomina: {time} – to wystarczy na jedno zadanie i pięć razy sprawdzenie kalendarza.”',
        '„{time} – akurat tyle, żeby wpaść na genialny pomysł, który poczeka do przyszłego roku.”',
      ].map((text) => text.replace('{daya}', '{day}')),
      green: [
        '„{day} szepcze: {time} – niby mało, a potrafi ciągnąć się jak trzy odcinki serialu z reklamami.”',
        '„{time} zostało, a {day} rzuca Ci ostatni test cierpliwości – drobny task na koniec.”',
        '„{day} kończy dzień po swojemu: {time}, więc udawaj, że notujesz coś ważnego.”',
        '„{time} i prawie wolność, ale {day} jeszcze specjalnie ustawi zegar w trybie slow motion.”',
        '„{day} mówi: {time} – czyli idealny moment, by ktoś nagle zapytał ‘masz chwilkę?’.”',
      ],
    },
    Środa: {
      red: [
        '„Jeszcze {time}, a {day} i tak udaje, że daje Ci nadzieję na weekend.”',
        '„{day} melduje: {time} – połowa tygodnia, a czujesz się jak po całym maratonie.”',
        '„{time} do końca i {day} już myśli, jak Ci przypomnieć, że piątek wciąż jest tylko legendą.”',
        '„{day} mówi: {time} – idealnie, by trzy razy pomyśleć, że to już z górki, i pięć razy się rozczarować.”',
        '„Masz {time}, a {day} śmieje się, bo do weekendu bliżej… ale wciąż za daleko.”',
      ],
      orange: [
        '„{day} daje Ci {time}, żebyś mógł spokojnie zapomnieć, po co tu przyszedłeś.”',
        '„{time} – czyli wystarczająco, by złapać dwa spotkania i zero sensu w kalendarzu. Tak działa {day}.”',
        '„{day} przypomina: {time} do końca, ale Twój poziom energii już dawno spadł poniżej normy.”',
        '„Zostało {time}, a {day} udaje, że jest lepsza od poniedziałku. Spoiler: nie jest.”',
        '„{day} informuje: {time} – w sam raz, by docenić smak kawy i brak postępów.”',
      ],
      yellow: [
        '„Jeszcze {time}, a {day} puszcza Ci oko: hej, jesteśmy w połowie, ale ja i tak będę bolała.”',
        '„{day} pokazuje: {time} do końca – czas płynie tak wolno, że kalendarz się zaciął.”',
        '„{time} – i {day} daje Ci złudzenie, że to już prawie piątek. Piękny trolling.”',
        '„{day} mówi: {time}, więc możesz jeszcze trochę poudawać, że masz siłę.”',
        '„{day} dorzuca {time} – akurat tyle, żeby przemyśleć, czy czwartek ma w ogóle sens.”',
      ],
      green: [
        '„{time} i {day} kończy dzień – czyli ostatnie chwile, w których każdy udaje produktywność.”',
        '„{day} mówi: {time} – w sam raz, by przygotować twarz do entuzjazmu, którego nie czujesz.”',
        '„Jeszcze {time}, a {day} już szykuje Cię na czwartek – czyli poniedziałek w przebraniu.”',
        '„{day} przypomina: {time}, więc patrz w zegar – to Twoje główne narzędzie pracy.”',
        '„{time} do końca – {day} puszcza Ci sarkastyczny uśmiech: no widzisz, jednak przeżyłeś.”',
      ],
    },
    Czwartek: {
      red: [
        '„Jeszcze {time}, a {day} już udaje piątek – tyle że bez happy endu.”',
        '„{day} oznajmia: {time} – taki sam zapach weekendu, jak w środę po południu, czyli żaden.”',
        '„{time} do końca i {day} przypomina Ci, że to tylko przygrywka do prawdziwego dnia wolności.”',
        '„{day} patrzy z ironią: {time} – idealnie, żeby dwa razy uwierzyć, że jutro będzie lżej.”',
        '„Masz {time}, a {day} już podsuwa wizję piątku, żeby zaraz ją zabrać.”',
      ],
      orange: [
        '„{day} informuje: {time} – czyli moment, w którym zaczynasz planować weekend i udajesz, że coś robisz.”',
        '„{time} zostało – {day} pozwala Ci marzyć o wolności, ale śmieje się w tle.”',
        '„{day} daje Ci {time}, żebyś spokojnie otworzył dziesięć razy kalendarz i upewnił się, że to nie piątek.”',
        '„Zostało {time} – idealna ilość, by przyjąć zaproszenie na spotkanie, które mogło być mailem.”',
        '„{day} przypomina: {time} – weekend za rogiem, ale rogi się przesuwają.”',
      ],
      yellow: [
        '„{time} – a {day} kusi, żeby już otworzyć piwo, ale jeszcze trzyma Cię w open space.”',
        '„{day} mówi: {time}, więc to ten etap dnia, gdzie produktywność udaje martwą.”',
        '„Jeszcze {time}, a {day} szykuje Ci nagrodę – długi piątek, oczywiście w pracy.”',
        '„{day} dorzuca {time} – wystarczy, żebyś uwierzył, że to już prawie koniec tygodnia. Spoiler: nie.”',
        '„{time} do końca, a {day} puszcza ironiczne oko: jutro to samo, tylko z większą nadzieją.”',
      ],
      green: [
        '„{day} informuje: {time} – już prawie wolność, ale nie zapominaj, że jutro znów tu wrócisz.”',
        '„{time} – i {day} pozwala Ci poczuć piątkowy vibe, tylko po to, żeby go zaraz zgasić.”',
        '„Jeszcze {time}, a {day} przygotowuje Cię psychicznie na rozczarowanie piątkiem.”',
        '„{day} szepcze: {time} – udawaj, że kończysz zadania, a myślami jesteś już w sklepie po chipsy.”',
        '„{time} do końca, a {day} wie, że to Twój generalny trening przed finałem tygodnia.”',
      ],
    },
    Piątek: {
      red: [
        '„Jeszcze {time}, a {day} udaje, że jest Twoim kumplem – w praktyce to tylko poniedziałek w garniturze.”',
        '„{day} melduje: {time} – na tyle dużo, że możesz zapomnieć o weekendzie, zanim się zacznie.”',
        '„{time} do końca, a {day} już rozdaje złudzenia wolności – bez faktury, bez gwarancji.”',
        '„{day} daje Ci {time}, żebyś zdążył jeszcze trzy razy znienawidzić Outlooka.”',
        '„{time} – i {day} przypomina, że weekend to nie prezent, tylko chwilowy trial.”',
      ],
      orange: [
        '„{day} uśmiecha się krzywo: {time} – to taki czas, kiedy myślisz o browarze, a pijesz tylko wodę.”',
        '„{time} do końca – {day} pozwala Ci marzyć o wolności, ale jeszcze każe klikać w Excela.”',
        '„Jeszcze {time}, a {day} mruga: spokojnie, zaraz to się skończy… ale jeszcze nie teraz.”',
        '„{day} raportuje: {time} – czyli dokładnie tyle, żeby ktoś wysłał Ci maila z dopiskiem ważne.”',
        '„{time} – a {day} udowadnia, że nadzieja to najgorsza pułapka tygodnia.”',
      ],
      yellow: [
        '„Jeszcze {time}, a {day} puszcza w tle muzyczkę z baru – szkoda tylko, że siedzisz w biurze.”',
        '„{time} – i {day} przypomina, że wolność jest blisko, ale raport sam się nie napisze.”',
        '„{day} mówi: {time} do końca – czyli moment, w którym twoja produktywność udaje zgon.”',
        '„Zostało {time}, a {day} już szykuje Ci niespodziankę: szybki call na koniec dnia.”',
        '„{time} – idealny czas, by patrzeć w zegar jak w trailer filmu, którego premiera dopiero jutro.”',
      ],
      green: [
        '„{time} i {day} trzyma Cię jeszcze chwilę w klatce – żebyś docenił smak pierwszego łyka wolności.”',
        '„{day} szepcze: {time} – ostatnie minuty i możesz udawać, że Twoje maile naprawdę miały sens.”',
        '„Jeszcze {time}, a {day} patrzy jak się miotasz – i powoli otwiera drzwi do weekendu.”',
        '„{time} – i {day} podsuwa Ci wizję browarka, ale każe jeszcze dwa razy kliknąć wyślij.”',
        '„{day} kończy grę: {time} do wolności, a potem bugfix w lodówce – otwieranie piwa.”',
      ],
    },
  };

  private readonly beforeStartMessages: string[] = [
    '„{day} czeka spokojnie do {start}, a Ty już kombinujesz jak się z tego wymigać.”',
    '„Jeszcze nie wystartowałeś – {day} dopiero zapina klamrę o {start}. Może kawka na odwagę?”',
    '„{day} stoi w blokach startowych do {start}, więc masz chwilę, by mentalnie pożegnać wolność.”',
    '„Plan jest prosty: {start} i udajesz, że jesteś gotowy. {day} już wie, że to ściema.”',
  ];

  private readonly afterWorkMessages: string[] = [
    '„{day} odhaczone – wyszedłeś o {end}. Teraz Twoim projektem jest leżenie i nicnierobienie.”',
    '„{end} i po sprawie. {day} właśnie wręczył Ci certyfikat z kategorii ‘przeżył i nie zwariował’.”',
    '„{day} skończony o {end}. Idź świętować, zanim ktoś przypomni Ci o jutrzejszym stand-upie.”',
    '„{day} zamknięty o {end}. Możesz oficjalnie włączyć tryb kanapa i ignorowanie telefonów.”',
  ];

  private readonly timeValidatorFn = (
    control: AbstractControl<string | null>
  ): ValidationErrors | null => {
    const value = control.value;
    if (!value) {
      return { required: true };
    }

    return this.isTimeValid(value) ? null : { invalidTime: true };
  };

  private readonly optionalTimeValidatorFn = (
    control: AbstractControl<string | null>
  ): ValidationErrors | null => {
    const value = control.value;
    if (!value) {
      return null;
    }

    return this.isTimeValid(value) ? null : { invalidTime: true };
  };

  private readonly startTimeValidatorFn = (
    control: AbstractControl<string | null>
  ): ValidationErrors | null => {
    const baseValidation = this.timeValidatorFn(control);
    if (baseValidation) {
      return baseValidation;
    }

    const value = control.value;
    const minutes = this.parseTime(value);
    if (minutes === null) {
      return { invalidTime: true };
    }

    if (minutes < this.minStartMinutes) {
      return { tooEarly: true };
    }

    return null;
  };

  readonly form = this.fb.group({
    startTime: ['', [Validators.required, this.startTimeValidatorFn]],
    breaks: this.fb.array<BreakFormGroup>([]),
  });

  readonly result = signal<ResultPayload | null>(null);
  readonly scheduleError = signal<string | null>(null);

  constructor(private readonly fb: FormBuilder) {
    this.form.valueChanges.subscribe(() => this.scheduleError.set(null));
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  get breaks(): FormArray<BreakFormGroup> {
    return this.form.controls.breaks;
  }

  addBreak(): void {
    this.scheduleError.set(null);
    this.breaks.push(
      this.fb.group({
        start: this.fb.control<string | null>(null, this.optionalTimeValidatorFn),
        end: this.fb.control<string | null>(null, this.optionalTimeValidatorFn),
      })
    );
  }

  removeBreak(index: number): void {
    this.scheduleError.set(null);
    this.breaks.removeAt(index);
  }

  get canCalculate(): boolean {
    if (this.form.invalid) {
      return false;
    }

    return !this.breaks.controls.some((group) => this.hasIncompleteBreak(group));
  }

  calculate(): void {
    if (!this.canCalculate) {
      this.form.markAllAsTouched();
      this.breaks.controls.forEach((group) => group.markAllAsTouched());
      return;
    }

    const startValue = this.form.controls.startTime.value as string;
    const startMinutes = this.parseTime(startValue);
    if (startMinutes === null) {
      return;
    }

    const scheduleCheck = this.validateSchedule(startMinutes);
    if (scheduleCheck.error) {
      this.scheduleError.set(scheduleCheck.error);
      this.result.set(null);
      this.activeSchedule = null;
      this.stopCountdown();
      return;
    }

    this.scheduleError.set(null);
    this.activeSchedule = {
      startMinutes,
      endMinutes: scheduleCheck.totalEndMinutes,
    };

    this.updateResultForSchedule(this.activeSchedule, { recomputeMessage: true });

    if (this.result()?.state === 'complete') {
      this.stopCountdown();
    } else {
      this.startCountdown();
    }
  }

  trackByIndex(_index: number, _item: unknown): number {
    return _index;
  }

  hasIncompleteBreak(group: BreakFormGroup): boolean {
    const start = group.controls.start.value;
    const end = group.controls.end.value;
    return (!!start && !end) || (!start && !!end);
  }

  private isTimeValid(value: string): boolean {
    return this.timePattern.test(value.trim());
  }

  private parseTime(value: string | null): number | null {
    if (!value || !this.isTimeValid(value)) {
      return null;
    }
    const normalized = value.trim().replace('.', ':');
    const [hours, minutes] = normalized.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private formatMinutes(totalMinutes: number): string {
    const normalizedMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
    const hours = Math.floor(normalizedMinutes / 60) % 24;
    const minutes = normalizedMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  private formatRemaining(diffSeconds: number): string {
    const safeSeconds = Math.max(0, diffSeconds);
    if (safeSeconds === 0) {
      return '0s';
    }

    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0 || hours > 0) {
      parts.push(`${minutes}min`);
    }
    parts.push(`${seconds}s`);
    return parts.join(' ');
  }

  private startCountdown(): void {
    this.stopCountdown();

    if (!this.activeSchedule) {
      return;
    }

    this.countdownId = setInterval(() => {
      if (this.activeSchedule) {
        this.updateResultForSchedule(this.activeSchedule);
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownId !== null) {
      clearInterval(this.countdownId);
      this.countdownId = null;
    }
  }

  private updateResultForSchedule(
    schedule: { startMinutes: number; endMinutes: number },
    options: { recomputeMessage?: boolean } = {},
  ): void {
    const { recomputeMessage = false } = options;

    const startLabel = this.formatMinutes(schedule.startMinutes);
    const endTimeLabel = this.formatMinutes(schedule.endMinutes);
    const now = new Date();
    const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const startSeconds = schedule.startMinutes * 60;
    const endSeconds = schedule.endMinutes * 60;

    let diffSeconds = endSeconds - nowSeconds;
    let state: ResultState = 'inProgress';

    if (nowSeconds >= endSeconds) {
      diffSeconds = 0;
      state = 'complete';
    } else if (nowSeconds < startSeconds) {
      state = 'beforeStart';
    }

    if (diffSeconds < 0) {
      diffSeconds = 0;
    }

    const remainingLabel = this.formatRemaining(diffSeconds);
    const dayName = this.dayNames[now.getDay()];
    const previousResult = this.result();
    const minutesForMessage = Math.ceil(diffSeconds / 60);
    const shouldRecomputeMessage =
      recomputeMessage || !previousResult || previousResult.state !== state;

    const message =
      shouldRecomputeMessage || !previousResult
        ? this.pickMessage(dayName, remainingLabel, minutesForMessage, state, startLabel, endTimeLabel)
        : previousResult.message;

    this.result.set({
      endTime: endTimeLabel,
      remainingLabel,
      message,
      state,
    });

    if (state === 'complete') {
      this.stopCountdown();
    }
  }

  private validateSchedule(startMinutes: number): { totalEndMinutes: number; error: string | null } {
    if (startMinutes < this.minStartMinutes) {
      return {
        totalEndMinutes: startMinutes,
        error: 'Start pracy nie może być wcześniejszy niż 05:30.',
      };
    }

    const intervals = this.breaks.controls
      .map((group) => {
        const start = this.parseTime(group.controls.start.value);
        const end = this.parseTime(group.controls.end.value);
        if (start === null || end === null) {
          return null;
        }
        return { start, end };
      })
      .filter((value): value is { start: number; end: number } => value !== null)
      .sort((a, b) => a.start - b.start);

    let previousEnd = startMinutes;
    let totalBreakMinutes = 0;

    for (const interval of intervals) {
      if (interval.start < startMinutes) {
        return {
          totalEndMinutes: startMinutes,
          error: 'Przerwa nie może zaczynać się przed rozpoczęciem pracy.',
        };
      }

      if (interval.start < previousEnd) {
        return {
          totalEndMinutes: startMinutes,
          error: 'Przerwy nie mogą na siebie nachodzić ani zaczynać się w tych samych godzinach.',
        };
      }

      if (interval.end <= interval.start) {
        return {
          totalEndMinutes: startMinutes,
          error: 'Koniec przerwy musi być późniejszy niż jej początek.',
        };
      }

      if (interval.start > this.maxEndMinutes || interval.end > this.maxEndMinutes) {
        return {
          totalEndMinutes: startMinutes,
          error: 'Cały plan musi zmieścić się maksymalnie do 21:00.',
        };
      }

      totalBreakMinutes += interval.end - interval.start;
      previousEnd = interval.end;
    }

    const totalEndMinutes = startMinutes + this.baseMinutes + totalBreakMinutes;

    if (totalEndMinutes > this.maxEndMinutes) {
      return {
        totalEndMinutes,
        error: 'Koniec pracy wypada po 21:00. Skróć przerwy albo zacznij wcześniej.',
      };
    }

    return { totalEndMinutes, error: null };
  }

  private pickMessage(
    dayName: string,
    remainingLabel: string,
    diffMinutes: number,
    state: ResultState,
    startLabel: string,
    endLabel: string,
  ): string {
    if (state === 'beforeStart') {
      return this.resolveTemplate(this.beforeStartMessages, dayName, remainingLabel, startLabel, endLabel);
    }

    if (state === 'complete') {
      return this.resolveTemplate(this.afterWorkMessages, dayName, remainingLabel, startLabel, endLabel);
    }

    const range: 'red' | 'orange' | 'yellow' | 'green' = diffMinutes > 360
      ? 'red'
      : diffMinutes > 240
        ? 'orange'
        : diffMinutes >= 60
          ? 'yellow'
          : 'green';

    const messageDay = this.messageSets[dayName] ? dayName : 'Poniedziałek';
    const templates = this.messageSets[messageDay][range];
    return this.resolveTemplate(templates, dayName, remainingLabel, startLabel, endLabel);
  }

  private resolveTemplate(
    templates: string[],
    dayName: string,
    remainingLabel: string,
    startLabel: string,
    endLabel: string,
  ): string {
    const template = templates[Math.floor(Math.random() * templates.length)];
    return this.formatTemplate(template, dayName, remainingLabel, startLabel, endLabel);
  }

  private formatTemplate(
    template: string,
    dayName: string,
    remainingLabel: string,
    startLabel: string,
    endLabel: string,
  ): string {
    return template
      .replaceAll('{time}', remainingLabel)
      .replaceAll('{day}', dayName)
      .replaceAll('{start}', startLabel)
      .replaceAll('{end}', endLabel)
      .replace(/[„”]/g, '')
      .trim();
  }
}

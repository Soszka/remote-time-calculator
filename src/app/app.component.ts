import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostBinding, NgZone, OnDestroy, ViewChild, computed, effect, signal } from '@angular/core';
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
import { Title } from '@angular/platform-browser';
import { LiquidBackdropComponent } from './liquid-backdrop.component';
import { ButtonRippleDirective } from './button-ripple.directive';
import { TimeValueComponent } from './time-value.component';
import { ViewMorph, ViewMorphSnapshot } from './view-morph';
import { PANEL_MOTION, PanelMotionDirective } from './panel-motion.directive';
interface BreakFormGroup extends FormGroup<{
  start: FormControl<string | null>;
  end: FormControl<string | null>;
}> {}

interface DurationFormGroup extends FormGroup<{
  hours: FormControl<number | null>;
  minutes: FormControl<number | null>;
}> {}

type ResultState = 'beforeStart' | 'inProgress' | 'complete';
type AdjustmentKind = 'overtimePickup' | 'undertimeMakeup';
type ThemeMode = 'light' | 'dark';
type AccentColor = 'violet' | 'green' | 'red' | 'pink' | 'yellow' | 'black' | 'white';
type AccentSelection = Exclude<AccentColor, 'black' | 'white'> | 'monochrome';
type FavoriteHour = 6 | 7 | 8 | null;
type TabDisplayMode = 'endTime' | 'remainingTime';

interface ResultPayload {
  endTime: string;
  remainingLabel: string;
  remainingClockLabel: string;
  remainingTitleLabel: string;
  progressPercent: number;
  message: string;
  state: ResultState;
  startTime: string;
  adjustmentLabel: string | null;
  breaksLabel: string | null;
}

interface AppSettings {
  theme: ThemeMode;
  favoriteHour: FavoriteHour;
  tabDisplayMode: TabDisplayMode;
  sliderEnabled: boolean;
  animationsEnabled: boolean;
  accentColor: AccentSelection;
}

interface BreakSnapshot {
  start: string;
  end: string;
}

interface DurationSnapshot {
  hours: number | null;
  minutes: number | null;
}

interface DailyPlanSnapshot {
  date: string;
  exitOffsetMinutes: number;
  startTime: string;
  breaks: BreakSnapshot[];
  overtimePickup: DurationSnapshot;
  undertimeMakeup: DurationSnapshot;
  adjustmentPanels: Record<AdjustmentKind, boolean>;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LiquidBackdropComponent, ButtonRippleDirective, TimeValueComponent, PanelMotionDirective],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  private readonly baseMinutes = 8 * 60 + 15;
  readonly flexMinutes = 15;
  private readonly minStartMinutes = 5 * 60 + 30;
  private readonly maxEndMinutes = 21 * 60;
  private readonly timePattern = /^([01]?\d|2[0-3])([:\.])([0-5]\d)$/;
  private readonly settingsStorageKey = 'workEndCalculator.settings';
  private readonly startTimeStorageKey = 'workEndCalculator.startTime';
  private readonly dailyPlanStorageKey = 'workEndCalculator.dailyPlan';
  private readonly defaultDocumentTitle = 'Kalkulator końca pracy';
  private readonly dynamicCardExitMs = PANEL_MOTION.remove;
  private readonly dynamicCardHighlightMs = 860;
  private readonly defaultSettings: AppSettings = {
    theme: 'dark',
    favoriteHour: null,
    tabDisplayMode: 'endTime',
    sliderEnabled: true,
    animationsEnabled: true,
    accentColor: 'violet',
  };

  private readonly colorAccentOptions: { value: AccentColor; label: string }[] = [
    { value: 'violet', label: 'Niebiesko-fioletowy' },
    { value: 'green', label: 'Zielony' },
    { value: 'red', label: 'Czerwony' },
    { value: 'pink', label: 'Różowy' },
    { value: 'yellow', label: 'Żółty' },
  ];
  private readonly accentOptionsByTheme = {
    light: [...this.colorAccentOptions, { value: 'black' as AccentColor, label: 'Czarny' }],
    dark: [...this.colorAccentOptions, { value: 'white' as AccentColor, label: 'Biały' }],
  };

  get accentOptions(): { value: AccentColor; label: string }[] {
    return this.accentOptionsByTheme[this.settings().theme];
  }
  readonly favoriteHourOptions: {
    value: FavoriteHour;
    label: string;
    tooltip: string;
  }[] = [
    { value: null, label: 'Brak', tooltip: 'Brak' },
    { value: 6, label: '6', tooltip: '6:00' },
    { value: 7, label: '7', tooltip: '7:00' },
    { value: 8, label: '8', tooltip: '8:00' },
  ];
  readonly tabDisplayOptions: { value: TabDisplayMode; label: string }[] = [
    { value: 'endTime', label: 'Godzina wyjścia' },
    { value: 'remainingTime', label: 'Czas do końca' },
  ];

  readonly confettiPieces: { left: number; delay: number; duration: number }[] =
    [
      { left: 6, delay: -0.2, duration: 2.6 },
      { left: 14, delay: -0.6, duration: 2.8 },
      { left: 22, delay: -1, duration: 2.5 },
      { left: 30, delay: -0.4, duration: 2.7 },
      { left: 38, delay: -0.9, duration: 2.3 },
      { left: 46, delay: -0.3, duration: 2.6 },
      { left: 54, delay: -0.7, duration: 2.9 },
      { left: 62, delay: -1.1, duration: 2.4 },
      { left: 70, delay: -0.5, duration: 2.8 },
      { left: 78, delay: -0.95, duration: 2.5 },
      { left: 86, delay: -0.35, duration: 2.6 },
      { left: 94, delay: -0.8, duration: 2.2 },
      { left: 2, delay: -1.25, duration: 2.7 },
      { left: 98, delay: -0.55, duration: 2.3 },
      { left: 10, delay: -1.35, duration: 2.1 },
      { left: 26, delay: -0.85, duration: 2.9 },
      { left: 42, delay: -1.6, duration: 2.4 },
      { left: 58, delay: -0.45, duration: 2.2 },
      { left: 74, delay: -1.05, duration: 2.6 },
      { left: 88, delay: -1.45, duration: 2.8 },
    ];

  readonly sparkles: {
    top: number;
    left: number;
    delay: number;
    duration: number;
  }[] = [
    { top: 18, left: 28, delay: 0, duration: 2.8 },
    { top: 10, left: 52, delay: 0.4, duration: 3 },
    { top: 24, left: 76, delay: 0.8, duration: 2.6 },
    { top: 38, left: 18, delay: 1.2, duration: 3.2 },
    { top: 48, left: 48, delay: 1.6, duration: 2.7 },
    { top: 62, left: 22, delay: 0.6, duration: 3.1 },
    { top: 58, left: 72, delay: 1, duration: 2.9 },
    { top: 32, left: 58, delay: 1.4, duration: 3.3 },
    { top: 76, left: 42, delay: 2, duration: 2.8 },
    { top: 68, left: 82, delay: 2.4, duration: 3.1 },
    { top: 12, left: 16, delay: 2.8, duration: 2.9 },
    { top: 84, left: 18, delay: 1.8, duration: 3.4 },
    { top: 86, left: 64, delay: 0.2, duration: 3 },
    { top: 44, left: 86, delay: 0.95, duration: 2.7 },
  ];

  readonly dayNames: Record<number, string> = {
    0: 'Niedziela',
    1: 'Poniedziałek',
    2: 'Wtorek',
    3: 'Środa',
    4: 'Czwartek',
    5: 'Piątek',
    6: 'Sobota',
  };

  private readonly messageSets: Record<
    string,
    Record<'red' | 'orange' | 'yellow' | 'green', string[]>
  > = {
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
    control: AbstractControl<string | null>,
  ): ValidationErrors | null => {
    const value = control.value;
    if (!value) {
      return { required: true };
    }

    return this.isTimeValid(value) ? null : { invalidTime: true };
  };

  private readonly optionalTimeValidatorFn = (
    control: AbstractControl<string | null>,
  ): ValidationErrors | null => {
    const value = control.value;
    if (!value) {
      return null;
    }

    return this.isTimeValid(value) ? null : { invalidTime: true };
  };

  private readonly startTimeValidatorFn = (
    control: AbstractControl<string | null>,
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

  private readonly durationPartValidatorFn =
    (max: number) =>
    (control: AbstractControl): ValidationErrors | null => {
      const value = control.value as number | string | null;
      if (value === null || value === '') {
        return null;
      }

      const numericValue = Number(value);
      if (
        !Number.isFinite(numericValue) ||
        !Number.isInteger(numericValue) ||
        numericValue < 0 ||
        numericValue > max
      ) {
        return { invalidDuration: true };
      }

      return null;
    };

  private readonly favoriteHourValidatorFn = (
    control: AbstractControl,
  ): ValidationErrors | null => {
    const value = control.value as number | string | null;
    if (value === null || value === '') {
      return null;
    }

    return this.normalizeFavoriteHour(value) === null
      ? { invalidFavoriteHour: true }
      : null;
  };

  readonly form = this.fb.group({
    startTime: ['', [Validators.required, this.startTimeValidatorFn]],
    breaks: this.fb.array<BreakFormGroup>([]),
    overtimePickup: this.createDurationGroup(),
    undertimeMakeup: this.createDurationGroup(),
  });

  readonly configForm = this.fb.group({
    darkMode: this.fb.control(false, { nonNullable: true }),
    accentColor: this.fb.control<AccentColor>('violet', { nonNullable: true }),
    tabDisplayMode: this.fb.control<TabDisplayMode>('endTime', {
      nonNullable: true,
    }),
    sliderEnabled: this.fb.control(true, { nonNullable: true }),
    animationsEnabled: this.fb.control(true, { nonNullable: true }),
    favoriteHour: this.fb.control<FavoriteHour>(
      null,
      this.favoriteHourValidatorFn,
    ),
  });

  readonly result = signal<ResultPayload | null>(null);
  private readonly surfacePrepared = signal(false);
  // Only used by the invisible, inert GPU preparation surface. Never saved as a plan.
  readonly resultSurface = computed<ResultPayload | null>(() => this.result() ?? (this.surfacePrepared() ? {
    endTime: '16:15', remainingLabel: '', remainingClockLabel: '08:15:00',
    remainingTitleLabel: '', progressPercent: 0, message: '', state: 'beforeStart',
    startTime: '', adjustmentLabel: null, breaksLabel: null,
  } : null));
  readonly exitOffsetMinutes = signal(0);
  readonly exitOffsetPercent = computed(() =>
    ((this.exitOffsetMinutes() + this.flexMinutes) / (2 * this.flexMinutes)) * 100,
  );
  readonly exitOffsetLabel = computed(() => {
    const offset = this.exitOffsetMinutes();
    return offset === 0 ? '' : `${offset > 0 ? '+' : ''}${offset} min`;
  });
  readonly scheduleError = signal<string | null>(null);
  readonly isConfigOpen = signal(false);
  readonly isCompactMode = signal(false);
  readonly isSwitchingToResult = signal(false);
  readonly isSwitchingToForm = signal(false);
  readonly isResultRevealing = signal(false);
  readonly toastMessage = signal<string | null>(null);
  readonly settings = signal<AppSettings>(this.defaultSettings);
  readonly showExitSlider = computed(() =>
    this.isCompactMode() &&
    this.settings().sliderEnabled,
  );
  readonly removingBreaks = signal<ReadonlySet<BreakFormGroup>>(
    new Set<BreakFormGroup>(),
  );
  readonly highlightedBreaks = signal<ReadonlySet<BreakFormGroup>>(
    new Set<BreakFormGroup>(),
  );
  readonly removingAdjustments = signal<Record<AdjustmentKind, boolean>>({
    overtimePickup: false,
    undertimeMakeup: false,
  });
  readonly highlightedAdjustments = signal<Record<AdjustmentKind, boolean>>({
    overtimePickup: false,
    undertimeMakeup: false,
  });
  readonly adjustmentPanels = signal<Record<AdjustmentKind, boolean>>({
    overtimePickup: false,
    undertimeMakeup: false,
  });

  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  @ViewChild('startTimeField') private startTimeField?: ElementRef<HTMLInputElement>;
  @ViewChild('resultHeading') private resultHeading?: ElementRef<HTMLElement>;

  private resultTransition: Animation | null = null;
  private readonly viewMorph: ViewMorph;
  private warmupIdle: number | null = null;
  private dynamicCardTimeouts: ReturnType<typeof setTimeout>[] = [];
  private dynamicCardHighlightTimeouts: ReturnType<typeof setTimeout>[] = [];
  private countdownBaseTargetSeconds: number | null = null;
  private countdownStartSeconds: number | null = null;
  private countdownDateKey: string | null = null;
  private messageContext: {
    dayName: string;
    startLabel: string;
    template: string;
  } | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly title: Title,
    element: ElementRef<HTMLElement>,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly zone: NgZone,
  ) {
    this.viewMorph = new ViewMorph(element.nativeElement);
    const settings = this.loadSettings();
    this.settings.set(settings);
    this.configForm.patchValue(
      {
        darkMode: settings.theme === 'dark',
        accentColor: this.getActiveAccent(settings),
        tabDisplayMode: settings.tabDisplayMode,
        sliderEnabled: settings.sliderEnabled,
        animationsEnabled: settings.animationsEnabled,
        favoriteHour: settings.favoriteHour,
      },
      { emitEvent: false },
    );

    const savedDailyPlan = this.loadDailyPlan();
    if (savedDailyPlan) {
      this.restoreDailyPlan(savedDailyPlan);
    } else {
      const savedStartTime = this.loadStartTime();
      const initialStartTime =
        savedStartTime ?? this.getFavoriteStartPrefix(settings.favoriteHour);
      if (initialStartTime) {
        this.form.controls.startTime.setValue(initialStartTime, {
          emitEvent: false,
        });
      }
    }

    this.form.valueChanges.subscribe(() => this.scheduleError.set(null));
    this.form.controls.startTime.valueChanges.subscribe((value) =>
      this.persistStartTime(value),
    );
    this.configForm.controls.darkMode.valueChanges.subscribe(() =>
      this.syncThemeFromConfig(),
    );
    this.configForm.controls.accentColor.valueChanges.subscribe((accentColor) =>
      this.syncAccentFromConfig(accentColor),
    );
    this.configForm.controls.tabDisplayMode.valueChanges.subscribe(
      (tabDisplayMode) => this.syncTabDisplayModeFromConfig(tabDisplayMode),
    );
    this.configForm.controls.sliderEnabled.valueChanges.subscribe((enabled) =>
      this.syncVisualPreferenceFromConfig('sliderEnabled', enabled),
    );
    this.configForm.controls.animationsEnabled.valueChanges.subscribe((enabled) =>
      this.syncVisualPreferenceFromConfig('animationsEnabled', enabled),
    );

    effect(() => {
      this.syncDocumentTitle(this.result(), this.settings().tabDisplayMode);
    });

    if (savedDailyPlan) {
      this.calculate(false);
      this.setExitOffset(savedDailyPlan.exitOffsetMinutes);
    }
  }

  @HostBinding('class.dark-mode')
  get darkModeClass(): boolean {
    return this.settings().theme === 'dark';
  }

  @HostBinding('class.accent-violet')
  get accentVioletClass(): boolean {
    return this.getActiveAccent(this.settings()) === 'violet';
  }

  @HostBinding('class.accent-green')
  get accentGreenClass(): boolean {
    return this.getActiveAccent(this.settings()) === 'green';
  }

  @HostBinding('class.accent-red')
  get accentRedClass(): boolean {
    return this.getActiveAccent(this.settings()) === 'red';
  }

  @HostBinding('class.accent-pink')
  get accentPinkClass(): boolean {
    return this.getActiveAccent(this.settings()) === 'pink';
  }

  @HostBinding('class.accent-yellow')
  get accentYellowClass(): boolean {
    return this.getActiveAccent(this.settings()) === 'yellow';
  }

  @HostBinding('class.accent-black')
  get accentBlackClass(): boolean {
    return this.getActiveAccent(this.settings()) === 'black';
  }

  @HostBinding('class.accent-white')
  get accentWhiteClass(): boolean {
    return this.getActiveAccent(this.settings()) === 'white';
  }

  ngAfterViewInit(): void {
    if (typeof window.requestIdleCallback !== 'function') return;
    this.zone.runOutsideAngular(() => {
      this.warmupIdle = window.requestIdleCallback(() => {
        this.warmupIdle = null;
        if (this.result() || !this.settings().animationsEnabled || !this.canAnimate()) return;
        this.zone.run(() => {
          this.surfacePrepared.set(true);
          this.changeDetector.detectChanges();
        });
      });
    });
  }

  ngOnDestroy(): void {
    if (this.warmupIdle !== null) window.cancelIdleCallback(this.warmupIdle);
    this.clearCountdown();
    this.clearToast();
    this.clearResultTransition();
    this.viewMorph.dispose();
    this.clearDynamicCardTimeouts();
    this.clearDynamicCardHighlightTimeouts();
  }

  get breaks(): FormArray<BreakFormGroup> {
    return this.form.controls.breaks;
  }

  get overtimePickup(): DurationFormGroup {
    return this.form.controls.overtimePickup;
  }

  get undertimeMakeup(): DurationFormGroup {
    return this.form.controls.undertimeMakeup;
  }

  openConfig(): void {
    const settings = this.settings();
    this.configForm.patchValue(
      {
        darkMode: settings.theme === 'dark',
        accentColor: this.getActiveAccent(settings),
        tabDisplayMode: settings.tabDisplayMode,
        sliderEnabled: settings.sliderEnabled,
        animationsEnabled: settings.animationsEnabled,
        favoriteHour: settings.favoriteHour,
      },
      { emitEvent: false },
    );
    this.configForm.controls.favoriteHour.markAsUntouched();
    this.isConfigOpen.set(true);
  }

  closeConfig(): void {
    this.isConfigOpen.set(false);
  }

  setDarkMode(enabled: boolean): void {
    this.configForm.controls.darkMode.setValue(enabled);
  }

  setAccentColor(accentColor: AccentColor): void {
    this.configForm.controls.accentColor.setValue(accentColor);
  }

  isAccentSelected(accentColor: AccentColor): boolean {
    return this.getActiveAccent(this.settings()) === accentColor;
  }

  setFavoriteHour(favoriteHour: FavoriteHour): void {
    const favoriteHourControl = this.configForm.controls.favoriteHour;
    if (this.settings().favoriteHour === favoriteHour) {
      return;
    }

    favoriteHourControl.setValue(favoriteHour, { emitEvent: false });

    const nextSettings: AppSettings = {
      ...this.settings(),
      favoriteHour,
    };

    this.settings.set(nextSettings);
    this.saveSettings(nextSettings);
    this.showToast(
      nextSettings.favoriteHour === null
        ? 'Ulubiona godzina startu została wyczyszczona.'
        : 'Nowa ulubiona godzina startu została zapisana.',
    );
  }

  isFavoriteHourSelected(favoriteHour: FavoriteHour): boolean {
    return this.settings().favoriteHour === favoriteHour;
  }

  setTabDisplayMode(tabDisplayMode: TabDisplayMode): void {
    this.configForm.controls.tabDisplayMode.setValue(tabDisplayMode);
  }

  isTabDisplayModeSelected(tabDisplayMode: TabDisplayMode): boolean {
    return this.settings().tabDisplayMode === tabDisplayMode;
  }

  setSliderEnabled(enabled: boolean): void {
    this.configForm.controls.sliderEnabled.setValue(enabled);
  }

  setAnimationsEnabled(enabled: boolean): void {
    this.configForm.controls.animationsEnabled.setValue(enabled);
  }

  onBinarySettingKeydown(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const option = event.target as HTMLButtonElement;
    const other = option.nextElementSibling ?? option.previousElementSibling;
    if (!(other instanceof HTMLButtonElement)) return;

    event.preventDefault();
    other.click();
    other.focus();
  }

  addBreak(): void {
    this.scheduleError.set(null);
    const breakGroup = this.createBreakGroup();
    this.breaks.push(breakGroup);
    this.highlightBreak(breakGroup);
  }

  removeBreak(index: number): void {
    this.scheduleError.set(null);
    const breakGroup = this.breaks.at(index);
    if (!breakGroup || this.isBreakRemoving(breakGroup)) {
      return;
    }

    this.removingBreaks.update((current) => {
      const next = new Set(current);
      next.add(breakGroup);
      return next;
    });

    this.queueDynamicCardRemoval(() => {
      const currentIndex = this.breaks.controls.indexOf(breakGroup);
      if (currentIndex > -1) {
        this.breaks.removeAt(currentIndex);
      }

      this.removingBreaks.update((current) => {
        const next = new Set(current);
        next.delete(breakGroup);
        return next;
      });
    });
  }

  showAdjustment(kind: AdjustmentKind): void {
    this.scheduleError.set(null);
    const otherKind: AdjustmentKind =
      kind === 'overtimePickup' ? 'undertimeMakeup' : 'overtimePickup';

    this.adjustmentGroup(otherKind).reset();
    this.adjustmentPanels.set({
      overtimePickup: kind === 'overtimePickup',
      undertimeMakeup: kind === 'undertimeMakeup',
    });
    this.highlightAdjustment(kind);
  }

  removeAdjustment(kind: AdjustmentKind): void {
    this.scheduleError.set(null);
    if (!this.isAdjustmentVisible(kind) || this.isAdjustmentRemoving(kind)) {
      return;
    }

    this.removingAdjustments.update((current) => ({
      ...current,
      [kind]: true,
    }));

    this.queueDynamicCardRemoval(() => {
      this.adjustmentGroup(kind).reset();
      this.adjustmentPanels.update((current) => ({
        ...current,
        [kind]: false,
      }));
      this.removingAdjustments.update((current) => ({
        ...current,
        [kind]: false,
      }));
    });
  }

  editPlan(useTransition = true): void {
    if (useTransition && (this.isSwitchingToForm() || this.isSwitchingToResult())) return;
    const snapshot = useTransition && this.isCompactMode() && this.canAnimate()
      ? this.viewMorph.capture('result') : null;
    this.clearResultTransition();
    this.isCompactMode.set(false);
    if (useTransition) this.changeView(snapshot, 'form');
  }

  onExitOffsetInput(event: Event): void {
    this.setExitOffset(Number((event.target as HTMLInputElement).value));
  }

  adjustExitOffset(delta: number): void {
    this.setExitOffset(this.exitOffsetMinutes() + delta);
  }

  setExitOffset(value: number): void {
    if (!this.isCompactMode() || this.countdownBaseTargetSeconds === null) {
      return;
    }

    const offset = this.normalizeExitOffset(value);
    if (offset === this.exitOffsetMinutes()) {
      return;
    }

    this.exitOffsetMinutes.set(offset);
    this.updateCountdown(true);
    this.saveDailyPlan();
    this.startCountdown();
  }

  isAdjustmentVisible(kind: AdjustmentKind): boolean {
    return this.adjustmentPanels()[kind];
  }

  isAdjustmentRemoving(kind: AdjustmentKind): boolean {
    return this.removingAdjustments()[kind];
  }

  isBreakRemoving(group: BreakFormGroup): boolean {
    return this.removingBreaks().has(group);
  }

  isBreakGroupRemoving(): boolean {
    return this.breaks.length > 0 && this.breaks.controls.every(group => this.isBreakRemoving(group));
  }

  isBreakHighlighted(group: BreakFormGroup): boolean {
    return this.highlightedBreaks().has(group);
  }

  isAdjustmentHighlighted(kind: AdjustmentKind): boolean {
    return this.highlightedAdjustments()[kind];
  }

  hasAnyAdjustment(): boolean {
    const adjustmentPanels = this.adjustmentPanels();
    return adjustmentPanels.overtimePickup || adjustmentPanels.undertimeMakeup;
  }

  isInvalid(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  get canCalculate(): boolean {
    // Closing cards retain their controls until the visual fold finishes.
    // Do not calculate or persist values the user has already chosen to remove.
    if (this.form.invalid || this.removingBreaks().size > 0 ||
        this.isAdjustmentRemoving('overtimePickup') || this.isAdjustmentRemoving('undertimeMakeup')) {
      return false;
    }

    return !this.breaks.controls.some((group) =>
      this.hasIncompleteBreak(group),
    );
  }

  calculate(useTransition = true): void {
    if (useTransition && (this.isSwitchingToResult() || this.isSwitchingToForm())) return;
    if (!this.canCalculate) {
      this.form.markAllAsTouched();
      this.breaks.controls.forEach((group) => group.markAllAsTouched());
      return;
    }

    const openingResult = useTransition && !this.isCompactMode();
    this.clearDynamicCardHighlights();
    this.clearResultTransition();
    this.clearCountdown();
    this.countdownBaseTargetSeconds = null;
    this.countdownStartSeconds = null;
    this.messageContext = null;
    this.exitOffsetMinutes.set(0);

    const startValue = this.form.controls.startTime.value as string;
    const startMinutes = this.parseTime(startValue);
    if (startMinutes === null) {
      return;
    }

    const scheduleCheck = this.validateSchedule(startMinutes);
    if (scheduleCheck.error) {
      this.scheduleError.set(scheduleCheck.error);
      this.result.set(null);
      this.isCompactMode.set(false);
      this.clearDailyPlan();
      return;
    }

    this.scheduleError.set(null);
    const snapshot = openingResult && this.canAnimate() ? this.viewMorph.capture('form') : null;

    const rawEndMinutes = scheduleCheck.totalEndMinutes;
    const totalMinutes = ((rawEndMinutes % (24 * 60)) + 24 * 60) % (24 * 60);

    const startLabel = this.formatMinutes(startMinutes);
    const endTimeLabel = this.formatMinutes(totalMinutes);
    const now = new Date();
    const startSecondsTotal = startMinutes * 60;
    const targetSecondsTotal = rawEndMinutes * 60;
    const nowSecondsTotal =
      now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const beforeStart = nowSecondsTotal < startSecondsTotal;
    const workFinished = nowSecondsTotal >= targetSecondsTotal;

    let state: ResultState = 'inProgress';

    if (workFinished) {
      state = 'complete';
    } else if (beforeStart) {
      state = 'beforeStart';
    }

    let diffSeconds = targetSecondsTotal - nowSecondsTotal;
    if (diffSeconds < 0 || workFinished) {
      diffSeconds = 0;
    }

    const diffMinutes = Math.ceil(diffSeconds / 60);
    const remainingLabel = this.formatRemainingLabel(diffSeconds);
    const remainingForMessage = this.formatRemainingMessage(diffSeconds);
    const dayName = this.dayNames[now.getDay()];
    const template = this.pickMessageTemplate(dayName, diffMinutes, state);
    const message = this.formatTemplate(template, dayName, remainingForMessage, startLabel, endTimeLabel);

    const nextResult: ResultPayload = {
      endTime: endTimeLabel,
      remainingLabel,
      remainingClockLabel: this.formatRemainingClock(diffSeconds),
      remainingTitleLabel: remainingForMessage,
      progressPercent: this.calculateProgress(startSecondsTotal, targetSecondsTotal, nowSecondsTotal),
      message,
      state,
      startTime: startLabel,
      adjustmentLabel: this.createAdjustmentLabel(),
      breaksLabel: this.createBreaksLabel(),
    };
    const nextMessageContext = {
      dayName,
      startLabel,
      template,
    };
    const showResult = () => {
      this.result.set(nextResult);
      this.isCompactMode.set(true);
      this.isSwitchingToResult.set(false);

      this.messageContext = nextMessageContext;
      this.saveDailyPlan();

      this.countdownBaseTargetSeconds = targetSecondsTotal;
      this.countdownStartSeconds = startSecondsTotal;
      this.countdownDateKey = this.getTodayKey(now);
      this.startCountdown();
    };

    showResult();
    if (openingResult) this.changeView(snapshot, 'result');
  }

  trackByIndex(_index: number, _item: unknown): number {
    return _index;
  }

  trackByBreakControl(_index: number, group: BreakFormGroup): BreakFormGroup {
    return group;
  }

  trackByAccentOption(
    _index: number,
    option: { value: AccentColor; label: string },
  ): AccentColor {
    return option.value;
  }

  trackByFavoriteHourOption(
    _index: number,
    option: { value: FavoriteHour; label: string; tooltip: string },
  ): string {
    return option.value === null ? 'none' : String(option.value);
  }

  trackByTabDisplayOption(
    _index: number,
    option: { value: TabDisplayMode; label: string },
  ): TabDisplayMode {
    return option.value;
  }

  hasIncompleteBreak(group: BreakFormGroup): boolean {
    const start = group.controls.start.value;
    const end = group.controls.end.value;
    return (!!start && !end) || (!start && !!end);
  }

  private createAdjustmentLabel(): string | null {
    if (this.isAdjustmentVisible('overtimePickup')) {
      const durationMinutes = this.getDurationMinutes(this.overtimePickup);
      return durationMinutes > 0
        ? `Odbiór nadgodzin: ${this.formatDurationSummary(durationMinutes)}`
        : null;
    }

    if (this.isAdjustmentVisible('undertimeMakeup')) {
      const durationMinutes = this.getDurationMinutes(this.undertimeMakeup);
      return durationMinutes > 0
        ? `Odrobienie niedoczasu: ${this.formatDurationSummary(durationMinutes)}`
        : null;
    }

    return null;
  }

  private createBreaksLabel(): string | null {
    const totalBreakMinutes = this.breaks.controls.reduce((sum, group) => {
      const start = this.parseTime(group.controls.start.value);
      const end = this.parseTime(group.controls.end.value);
      if (start === null || end === null || end <= start) {
        return sum;
      }

      return sum + end - start;
    }, 0);

    if (totalBreakMinutes === 0) {
      return null;
    }

    return `Przerwy: ${this.formatDurationSummary(totalBreakMinutes)}`;
  }

  private formatDurationSummary(totalMinutes: number): string {
    const safeMinutes = Math.max(0, totalMinutes);
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;

    if (hours === 0) {
      return `${minutes}min`;
    }

    if (minutes === 0) {
      return `${hours}h`;
    }

    return `${hours}h ${minutes}min`;
  }

  private createDurationGroup(): DurationFormGroup {
    return this.fb.group({
      hours: this.fb.control<number | null>(
        null,
        this.durationPartValidatorFn(23),
      ),
      minutes: this.fb.control<number | null>(
        null,
        this.durationPartValidatorFn(59),
      ),
    });
  }

  private createBreakGroup(value?: BreakSnapshot): BreakFormGroup {
    return this.fb.group({
      start: this.fb.control<string | null>(
        value?.start ?? null,
        this.optionalTimeValidatorFn,
      ),
      end: this.fb.control<string | null>(
        value?.end ?? null,
        this.optionalTimeValidatorFn,
      ),
    });
  }

  private adjustmentGroup(kind: AdjustmentKind): DurationFormGroup {
    return kind === 'overtimePickup'
      ? this.overtimePickup
      : this.undertimeMakeup;
  }

  private getDurationMinutes(group: DurationFormGroup): number {
    const hours = Number(group.controls.hours.value ?? 0);
    const minutes = Number(group.controls.minutes.value ?? 0);
    return hours * 60 + minutes;
  }

  private readStorage(key: string): string | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
      // Saving is optional: blocked storage or a full quota must not stop work.
    }
  }

  private removeStorage(key: string): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      // Browsers may also block removal of previously saved data.
    }
  }

  private getTodayKey(today = new Date()): string {
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    return `${today.getFullYear()}-${month}-${day}`;
  }

  private loadDailyPlan(): DailyPlanSnapshot | null {
    const rawPlan = this.readStorage(this.dailyPlanStorageKey);
    if (!rawPlan) {
      return null;
    }

    try {
      const snapshot = this.normalizeDailyPlanSnapshot(JSON.parse(rawPlan));
      if (!snapshot) {
        this.removeStorage(this.dailyPlanStorageKey);
        return null;
      }

      if (snapshot.date !== this.getTodayKey()) {
        this.removeStorage(this.dailyPlanStorageKey);
        this.removeStorage(this.startTimeStorageKey);
        return null;
      }

      return snapshot;
    } catch {
      this.removeStorage(this.dailyPlanStorageKey);
      return null;
    }
  }

  private saveDailyPlan(): void {
    this.writeStorage(this.dailyPlanStorageKey, JSON.stringify(this.createDailyPlanSnapshot()));
  }

  private clearDailyPlan(): void {
    this.removeStorage(this.dailyPlanStorageKey);
  }

  private restoreDailyPlan(snapshot: DailyPlanSnapshot): void {
    this.form.controls.startTime.setValue(snapshot.startTime, {
      emitEvent: false,
    });
    this.breaks.clear({ emitEvent: false });
    snapshot.breaks.forEach((breakSnapshot) =>
      this.breaks.push(this.createBreakGroup(breakSnapshot), {
        emitEvent: false,
      }),
    );
    this.overtimePickup.setValue(snapshot.overtimePickup, { emitEvent: false });
    this.undertimeMakeup.setValue(snapshot.undertimeMakeup, {
      emitEvent: false,
    });
    this.adjustmentPanels.set({ ...snapshot.adjustmentPanels });
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private createDailyPlanSnapshot(): DailyPlanSnapshot {
    const adjustmentPanels = this.adjustmentPanels();
    const filledBreaks = this.breaks.controls
      .map((group): BreakSnapshot | null => {
        const start = this.normalizeTimeValue(group.controls.start.value);
        const end = this.normalizeTimeValue(group.controls.end.value);
        return start && end ? { start, end } : null;
      })
      .filter((value): value is BreakSnapshot => value !== null);

    return {
      date: this.getTodayKey(),
      exitOffsetMinutes: this.exitOffsetMinutes(),
      startTime:
        this.normalizeTimeValue(this.form.controls.startTime.value) ?? '',
      breaks: filledBreaks,
      overtimePickup: adjustmentPanels.overtimePickup
        ? this.createDurationSnapshot(this.overtimePickup)
        : this.emptyDurationSnapshot(),
      undertimeMakeup: adjustmentPanels.undertimeMakeup
        ? this.createDurationSnapshot(this.undertimeMakeup)
        : this.emptyDurationSnapshot(),
      adjustmentPanels: { ...adjustmentPanels },
    };
  }

  private normalizeDailyPlanSnapshot(value: unknown): DailyPlanSnapshot | null {
    if (!this.isRecord(value)) {
      return null;
    }

    const date = typeof value['date'] === 'string' ? value['date'] : null;
    const startTime = this.normalizeTimeValue(value['startTime']);
    const startMinutes = this.parseTime(startTime);
    if (
      !date ||
      !startTime ||
      startMinutes === null ||
      startMinutes < this.minStartMinutes
    ) {
      return null;
    }

    const rawBreaks = value['breaks'];
    if (!Array.isArray(rawBreaks)) {
      return null;
    }

    const breaks: BreakSnapshot[] = [];
    for (const rawBreak of rawBreaks) {
      const breakSnapshot = this.normalizeBreakSnapshot(rawBreak);
      if (!breakSnapshot) {
        return null;
      }

      breaks.push(breakSnapshot);
    }

    return {
      date,
      exitOffsetMinutes: this.normalizeExitOffset(value['exitOffsetMinutes']),
      startTime,
      breaks,
      overtimePickup: this.normalizeDurationSnapshot(value['overtimePickup']),
      undertimeMakeup: this.normalizeDurationSnapshot(value['undertimeMakeup']),
      adjustmentPanels: this.normalizeAdjustmentPanels(
        value['adjustmentPanels'],
      ),
    };
  }

  private normalizeBreakSnapshot(value: unknown): BreakSnapshot | null {
    if (!this.isRecord(value)) {
      return null;
    }

    const start = this.normalizeTimeValue(value['start']);
    const end = this.normalizeTimeValue(value['end']);
    return start && end ? { start, end } : null;
  }

  private normalizeAdjustmentPanels(
    value: unknown,
  ): Record<AdjustmentKind, boolean> {
    if (!this.isRecord(value)) {
      return {
        overtimePickup: false,
        undertimeMakeup: false,
      };
    }

    const overtimePickup = value['overtimePickup'] === true;
    const undertimeMakeup = value['undertimeMakeup'] === true;

    return {
      overtimePickup,
      undertimeMakeup: overtimePickup ? false : undertimeMakeup,
    };
  }

  private createDurationSnapshot(group: DurationFormGroup): DurationSnapshot {
    return {
      hours: this.normalizeDurationPart(group.controls.hours.value, 23),
      minutes: this.normalizeDurationPart(group.controls.minutes.value, 59),
    };
  }

  private normalizeDurationSnapshot(value: unknown): DurationSnapshot {
    if (!this.isRecord(value)) {
      return this.emptyDurationSnapshot();
    }

    return {
      hours: this.normalizeDurationPart(value['hours'], 23),
      minutes: this.normalizeDurationPart(value['minutes'], 59),
    };
  }

  private emptyDurationSnapshot(): DurationSnapshot {
    return {
      hours: null,
      minutes: null,
    };
  }

  private normalizeDurationPart(value: unknown, max: number): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numericValue = Number(value);
    if (
      !Number.isFinite(numericValue) ||
      !Number.isInteger(numericValue) ||
      numericValue < 0 ||
      numericValue > max
    ) {
      return null;
    }

    return numericValue;
  }

  private normalizeTimeValue(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalizedValue = value.trim().replace('.', ':');
    return this.isTimeValid(normalizedValue) ? normalizedValue : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private loadSettings(): AppSettings {
    try {
      const rawSettings = this.readStorage(this.settingsStorageKey);
      if (!rawSettings) {
        return this.defaultSettings;
      }

      const parsedSettings = JSON.parse(rawSettings) as Partial<AppSettings> & {
        endTimeDisplayMode?: unknown;
        remainingTimeDisplayMode?: unknown;
        accentByTheme?: unknown;
      };
      const theme = parsedSettings.theme === 'dark' || parsedSettings.theme === 'light'
        ? parsedSettings.theme : this.defaultSettings.theme;
      return {
        theme,
        favoriteHour: this.normalizeFavoriteHour(parsedSettings.favoriteHour),
        tabDisplayMode: this.normalizeTabDisplayMode(
          parsedSettings.tabDisplayMode,
        ),
        // Either legacy card option enabled the same shared slider.
        sliderEnabled: typeof parsedSettings.sliderEnabled === 'boolean'
          ? parsedSettings.sliderEnabled
          : parsedSettings.endTimeDisplayMode !== 'standard' || parsedSettings.remainingTimeDisplayMode !== 'standard',
        animationsEnabled: typeof parsedSettings.animationsEnabled === 'boolean'
          ? parsedSettings.animationsEnabled
          : this.defaultSettings.animationsEnabled,
        accentColor: this.normalizeAccentSelection(
          parsedSettings.accentColor, parsedSettings.accentByTheme, theme,
        ),
      };
    } catch {
      return this.defaultSettings;
    }
  }

  private saveSettings(settings: AppSettings): void {
    this.writeStorage(this.settingsStorageKey, JSON.stringify(settings));
  }

  private syncThemeFromConfig(): void {
    const theme = this.configForm.controls.darkMode.value ? 'dark' : 'light';
    const nextSettings: AppSettings = {
      ...this.settings(),
      theme,
    };

    this.settings.set(nextSettings);
    this.configForm.controls.accentColor.setValue(
      this.getActiveAccent(nextSettings),
      { emitEvent: false },
    );
    this.saveSettings(nextSettings);
  }

  private syncAccentFromConfig(accentColor: AccentColor): void {
    const currentSettings = this.settings();
    const accent = this.normalizeAccentColor(accentColor, this.getActiveAccent(currentSettings), currentSettings.theme);
    if (accent !== accentColor) {
      this.configForm.controls.accentColor.setValue(accent, { emitEvent: false });
      return;
    }
    const nextSettings: AppSettings = {
      ...currentSettings,
      accentColor: accent === 'black' || accent === 'white' ? 'monochrome' : accent,
    };

    this.settings.set(nextSettings);
    this.saveSettings(nextSettings);
  }

  private syncTabDisplayModeFromConfig(
    tabDisplayMode: TabDisplayMode,
  ): void {
    const nextSettings: AppSettings = {
      ...this.settings(),
      tabDisplayMode,
    };

    this.settings.set(nextSettings);
    this.saveSettings(nextSettings);
  }

  private syncVisualPreferenceFromConfig(
    kind: 'sliderEnabled' | 'animationsEnabled',
    enabled: boolean,
  ): void {
    const nextSettings: AppSettings = {
      ...this.settings(),
      [kind]: enabled,
    };
    this.settings.set(nextSettings);
    this.saveSettings(nextSettings);
  }

  private syncDocumentTitle(
    payload: ResultPayload | null,
    tabDisplayMode: TabDisplayMode,
  ): void {
    this.title.setTitle(this.createDocumentTitle(payload, tabDisplayMode));
  }

  private createDocumentTitle(
    payload: ResultPayload | null,
    tabDisplayMode: TabDisplayMode,
  ): string {
    if (!payload) {
      return this.defaultDocumentTitle;
    }

    if (tabDisplayMode === 'remainingTime') {
      return `Do końca ${payload.remainingTitleLabel}`;
    }

    return `Wyjście o ${payload.endTime}`;
  }

  private showToast(message: string): void {
    this.clearToast();
    this.toastMessage.set(message);
    this.toastTimeout = setTimeout(() => {
      this.toastMessage.set(null);
      this.toastTimeout = null;
    }, 3200);
  }

  private clearToast(): void {
    if (this.toastTimeout !== null) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
  }

  private loadStartTime(): string | null {
    const savedStartTime = this.readStorage(this.startTimeStorageKey);
    if (!savedStartTime) {
      return null;
    }

    try {
      const parsedStartTime = JSON.parse(savedStartTime);
      if (this.isRecord(parsedStartTime)) {
        const date =
          typeof parsedStartTime['date'] === 'string'
            ? parsedStartTime['date']
            : null;
        const value = this.normalizeTimeValue(parsedStartTime['value']);

        if (date !== this.getTodayKey()) {
          this.removeStorage(this.startTimeStorageKey);
          return null;
        }

        if (value) {
          return value;
        }
      }
    } catch {
      const legacyStartTime = this.normalizeTimeValue(savedStartTime);
      if (legacyStartTime) {
        this.persistStartTime(legacyStartTime);
        return legacyStartTime;
      }
    }

    if (!this.normalizeTimeValue(savedStartTime)) {
      this.removeStorage(this.startTimeStorageKey);
      return null;
    }

    return savedStartTime.trim().replace('.', ':');
  }

  private persistStartTime(value: string | null): void {
    const normalizedValue = value?.trim() ?? '';
    if (!normalizedValue) {
      this.removeStorage(this.startTimeStorageKey);
      return;
    }

    const startTime = this.normalizeTimeValue(normalizedValue);
    if (startTime) {
      this.writeStorage(
        this.startTimeStorageKey,
        JSON.stringify({
          date: this.getTodayKey(),
          value: startTime,
        }),
      );
    }
  }

  private normalizeFavoriteHour(value: unknown): FavoriteHour {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numericValue = Number(value);
    return numericValue === 6 || numericValue === 7 || numericValue === 8
      ? numericValue
      : null;
  }

  private normalizeTabDisplayMode(value: unknown): TabDisplayMode {
    return value === 'remainingTime' ? 'remainingTime' : 'endTime';
  }

  private normalizeExitOffset(value: unknown): number {
    const offset = typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value)
      : 0;
    return Math.max(-this.flexMinutes, Math.min(this.flexMinutes, offset));
  }

  private normalizeAccentSelection(value: unknown, legacy: unknown, theme: ThemeMode): AccentSelection {
    if (value === 'monochrome' || value === 'black' || value === 'white') return 'monochrome';
    // Migrate the current palette once; the other theme's old selection no longer applies.
    const fallback = this.normalizeAccentColor(
      this.isRecord(legacy) ? legacy[theme] : undefined,
      this.getActiveAccent({ ...this.defaultSettings, theme }), theme,
    );
    const accent = this.normalizeAccentColor(value, fallback, theme);
    return accent === 'black' || accent === 'white' ? 'monochrome' : accent;
  }

  private normalizeAccentColor(
    value: unknown,
    fallback: AccentColor,
    theme: ThemeMode,
  ): AccentColor {
    return (
      value === 'violet' ||
      value === 'green' ||
      value === 'red' ||
      value === 'pink' ||
      value === 'yellow' ||
      (value === 'black' && theme === 'light') ||
      (value === 'white' && theme === 'dark')
    )
      ? value
      : fallback;
  }

  private getActiveAccent(settings: AppSettings): AccentColor {
    return settings.accentColor === 'monochrome'
      ? settings.theme === 'dark' ? 'white' : 'black'
      : settings.accentColor;
  }

  private getFavoriteStartPrefix(favoriteHour: FavoriteHour): string {
    return favoriteHour === null ? '' : `${favoriteHour}:`;
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
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}`;
  }

  private splitDuration(diffSeconds: number): {
    hours: number;
    minutes: number;
    seconds: number;
  } {
    const safeSeconds = Math.max(0, diffSeconds);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    return { hours, minutes, seconds };
  }

  private formatRemainingLabel(diffSeconds: number): string {
    const { hours, minutes, seconds } = this.splitDuration(diffSeconds);
    return `${hours}h ${minutes}min ${seconds}s`;
  }

  private formatRemainingClock(diffSeconds: number): string {
    const { hours, minutes, seconds } = this.splitDuration(diffSeconds);
    return [hours, minutes, seconds]
      .map((part) => part.toString().padStart(2, '0'))
      .join(':');
  }

  private formatRemainingMessage(diffSeconds: number): string {
    const { hours, minutes } = this.splitDuration(diffSeconds);
    return `${hours}h ${minutes}min`;
  }

  private calculateProgress(startSeconds: number, targetSeconds: number, nowSeconds: number): number {
    const duration = targetSeconds - startSeconds;
    if (duration <= 0) {
      return nowSeconds >= targetSeconds ? 100 : 0;
    }
    return Math.round(Math.min(1, Math.max(0, (nowSeconds - startSeconds) / duration)) * 100);
  }

  private startCountdown(): void {
    if (this.countdownBaseTargetSeconds === null || this.result()?.state === 'complete') {
      this.stopCountdownTimer();
      return;
    }
    if (this.countdownInterval !== null) {
      return;
    }

    this.countdownInterval = setInterval(() => {
      this.updateCountdown();
      if (this.result()?.state === 'complete') {
        this.stopCountdownTimer();
      }
    }, 1000);
  }

  private updateCountdown(preserveMessage = false): void {
    const baseTarget = this.countdownBaseTargetSeconds;
    const start = this.countdownStartSeconds;
    if (baseTarget === null || start === null) {
      return;
    }

    // Keep the calculated plan as the baseline so repeated changes never accumulate.
    const target = baseTarget + this.exitOffsetMinutes() * 60;
    const endTime = this.formatMinutes(target / 60);
    const now = new Date();
    const nowSecondsTotal = this.countdownDateKey === this.getTodayKey(now)
      ? now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
      : Math.max(target, start);
    const diffSeconds = Math.max(0, target - nowSecondsTotal);
    const remainingTitleLabel = this.formatRemainingMessage(diffSeconds);

    this.result.update((current) => {
      if (!current) {
        return current;
      }

      const state: ResultState = nowSecondsTotal >= target
        ? 'complete'
        : nowSecondsTotal < start ? 'beforeStart' : 'inProgress';
      let message = current.message;
      const context = this.messageContext;
      if (context) {
        // A slider gesture keeps the sentence, even when it crosses the exit time.
        // Only a natural start/end transition selects a new message.
        if (!preserveMessage && state !== current.state) {
          context.template = this.pickMessageTemplate(context.dayName, Math.ceil(diffSeconds / 60), state);
        }
        message = this.formatTemplate(
          context.template,
          context.dayName,
          remainingTitleLabel,
          context.startLabel,
          endTime,
        );
      }

      return {
        ...current,
        endTime,
        state,
        remainingLabel: this.formatRemainingLabel(diffSeconds),
        remainingClockLabel: this.formatRemainingClock(diffSeconds),
        remainingTitleLabel,
        progressPercent: this.calculateProgress(start, target, nowSecondsTotal),
        message,
      };
    });
  }

  private stopCountdownTimer(): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  private clearCountdown(): void {
    this.stopCountdownTimer();
    this.countdownDateKey = null;
  }

  private clearResultTransition(): void {
    this.resultTransition = null;
    this.isSwitchingToResult.set(false);
    this.isSwitchingToForm.set(false);
    this.isResultRevealing.set(false);
    this.viewMorph.cancel();
  }

  private changeView(snapshot: ViewMorphSnapshot | null, mode: 'form' | 'result'): void {
    if (!snapshot) {
      this.focusView(mode);
      return;
    }

    this.isSwitchingToResult.set(mode === 'result');
    this.isSwitchingToForm.set(mode === 'form');
    this.isResultRevealing.set(mode === 'result');
    this.changeDetector.detectChanges();
    this.zone.runOutsideAngular(() => {
      const animation = this.viewMorph.play(snapshot);
      this.resultTransition = animation;
      const settle = (): void => {
        if (this.resultTransition !== animation) return;
        this.zone.run(() => {
          this.clearResultTransition();
          this.focusView(mode);
        });
      };
      if (animation) void animation.finished.then(settle, settle);
      else settle();
    });
  }

  private focusView(mode: 'form' | 'result'): void {
    this.changeDetector.detectChanges();
    const target = mode === 'result' ? this.resultHeading : this.startTimeField;
    target?.nativeElement.focus();
  }

  private canAnimate(): boolean {
    return !document.hidden &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private queueDynamicCardRemoval(callback: () => void): void {
    if (!this.canAnimate()) {
      callback();
      return;
    }
    const timeout = setTimeout(() => {
      callback();
      this.dynamicCardTimeouts = this.dynamicCardTimeouts.filter(
        (currentTimeout) => currentTimeout !== timeout,
      );
    }, this.dynamicCardExitMs);

    this.dynamicCardTimeouts.push(timeout);
  }

  private highlightBreak(group: BreakFormGroup): void {
    this.highlightedBreaks.update((current) => {
      const next = new Set(current);
      next.add(group);
      return next;
    });

    const timeout = setTimeout(() => {
      this.highlightedBreaks.update((current) => {
        const next = new Set(current);
        next.delete(group);
        return next;
      });
      this.dynamicCardHighlightTimeouts =
        this.dynamicCardHighlightTimeouts.filter(
          (currentTimeout) => currentTimeout !== timeout,
        );
    }, this.dynamicCardHighlightMs);

    this.dynamicCardHighlightTimeouts.push(timeout);
  }

  private highlightAdjustment(kind: AdjustmentKind): void {
    this.highlightedAdjustments.update((current) => ({
      ...current,
      [kind]: true,
    }));

    const timeout = setTimeout(() => {
      this.highlightedAdjustments.update((current) => ({
        ...current,
        [kind]: false,
      }));
      this.dynamicCardHighlightTimeouts =
        this.dynamicCardHighlightTimeouts.filter(
          (currentTimeout) => currentTimeout !== timeout,
        );
    }, this.dynamicCardHighlightMs);

    this.dynamicCardHighlightTimeouts.push(timeout);
  }

  private clearDynamicCardHighlights(): void {
    this.highlightedBreaks.set(new Set<BreakFormGroup>());
    this.highlightedAdjustments.set({
      overtimePickup: false,
      undertimeMakeup: false,
    });
    this.clearDynamicCardHighlightTimeouts();
  }

  private clearDynamicCardTimeouts(): void {
    this.dynamicCardTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.dynamicCardTimeouts = [];
  }

  private clearDynamicCardHighlightTimeouts(): void {
    this.dynamicCardHighlightTimeouts.forEach((timeout) =>
      clearTimeout(timeout),
    );
    this.dynamicCardHighlightTimeouts = [];
  }

  private validateSchedule(startMinutes: number): {
    totalEndMinutes: number;
    error: string | null;
  } {
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
      .filter(
        (value): value is { start: number; end: number } => value !== null,
      )
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
          error:
            'Przerwy nie mogą na siebie nachodzić ani zaczynać się w tych samych godzinach.',
        };
      }

      if (interval.end <= interval.start) {
        return {
          totalEndMinutes: startMinutes,
          error: 'Koniec przerwy musi być późniejszy niż jej początek.',
        };
      }

      if (
        interval.start > this.maxEndMinutes ||
        interval.end > this.maxEndMinutes
      ) {
        return {
          totalEndMinutes: startMinutes,
          error: 'Cały plan musi zmieścić się maksymalnie do 21:00.',
        };
      }

      totalBreakMinutes += interval.end - interval.start;
      previousEnd = interval.end;
    }

    const overtimePickupMinutes = this.isAdjustmentVisible('overtimePickup')
      ? this.getDurationMinutes(this.overtimePickup)
      : 0;
    const undertimeMakeupMinutes = this.isAdjustmentVisible('undertimeMakeup')
      ? this.getDurationMinutes(this.undertimeMakeup)
      : 0;
    const totalEndMinutes =
      startMinutes +
      this.baseMinutes +
      totalBreakMinutes -
      overtimePickupMinutes +
      undertimeMakeupMinutes;

    if (totalEndMinutes < startMinutes) {
      return {
        totalEndMinutes,
        error: 'Odbiór nadgodzin jest większy niż zaplanowany czas pracy.',
      };
    }

    const lastBreakEnd = intervals.length
      ? intervals[intervals.length - 1].end
      : startMinutes;

    if (totalEndMinutes < lastBreakEnd) {
      return {
        totalEndMinutes,
        error: 'Przerwa nie może wypadać po wyliczonym końcu pracy.',
      };
    }

    if (totalEndMinutes > this.maxEndMinutes) {
      return {
        totalEndMinutes,
        error:
          'Koniec pracy wypada po 21:00. Skróć przerwy albo zacznij wcześniej.',
      };
    }

    return { totalEndMinutes, error: null };
  }

  private pickMessageTemplate(
    dayName: string,
    diffMinutes: number,
    state: ResultState,
  ): string {
    if (state === 'beforeStart') {
      return this.randomTemplate(this.beforeStartMessages);
    }

    if (state === 'complete') {
      return this.randomTemplate(this.afterWorkMessages);
    }

    const range: 'red' | 'orange' | 'yellow' | 'green' =
      diffMinutes > 360
        ? 'red'
        : diffMinutes > 240
          ? 'orange'
          : diffMinutes >= 60
            ? 'yellow'
            : 'green';

    const messageDay = this.messageSets[dayName] ? dayName : 'Poniedziałek';
    const templates = this.messageSets[messageDay][range];
    return this.randomTemplate(templates);
  }

  private randomTemplate(templates: string[]): string {
    return templates[Math.floor(Math.random() * templates.length)];
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

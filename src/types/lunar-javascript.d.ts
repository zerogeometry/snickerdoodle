// The small part of lunar-javascript (MIT, 6tail) the family calendar uses — Chinese lunar ⇄ Gregorian.
declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    getLunar(): Lunar;
    toYmd(): string;
  }
  export class Lunar {
    /** month < 0 = that LEAP month */
    static fromYmd(lunarYear: number, lunarMonth: number, lunarDay: number): Lunar;
    getSolar(): Solar;
    getYear(): number;
    getMonth(): number;
    getDay(): number;
  }
  export class LunarYear {
    static fromYear(lunarYear: number): LunarYear;
    getLeapMonth(): number;
  }
  export class LunarMonth {
    static fromYm(lunarYear: number, lunarMonth: number): LunarMonth | null;
    getDayCount(): number;
  }
}

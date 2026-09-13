// Turning a plan into a schedule.
//
// The traveller picks stops; this works out what time they actually get to each
// one, where a day realistically has to end, and what is going to go wrong.
// Pure functions throughout — no clock reads, no React — so the whole thing is
// testable and so the same inputs always produce the same schedule.
//
// A note on ordering: stops are kept in road order and cannot be shuffled. On a
// route from A to B the order is a fact of geography, not a preference — moving
// a stop before one it comes after would mean driving past it and doubling
// back. What the traveller controls instead is how long they linger, when they
// set off, and where a day ends.

import type { Stop } from '../types';
import { hoursStatus } from './hours';

export interface ItineraryOptions {
  /** When the traveller sets off on day one. */
  departAt: Date;
  /** Minutes past midnight they set off on every following day. */
  dailyDepartMin: number;
  /** Most driving they are willing to do in one day, in minutes. */
  maxDriveMinPerDay: number;
  /** Whole-route figures, used to derive a realistic pace for each leg. */
  totalDistanceKm: number;
  totalDurationMin: number;
  /** Stop ids the traveller has explicitly chosen to end a day after. */
  dayBreaksAfter?: ReadonlySet<string>;
  /** How many days they have. Only used to warn; never truncates the trip. */
  maxDays?: number;
}

export interface ItineraryStop {
  stop: Stop;
  arrive: Date;
  depart: Date;
  driveMinFromPrev: number;
  /** True only when the place publishes hours AND they say it is shut. */
  closedOnArrival: boolean;
}

export interface ItineraryDay {
  index: number;
  departAt: Date;
  stops: ItineraryStop[];
  driveMin: number;
  visitMin: number;
  /** When the day's driving finishes — the last stop's departure, or arrival
   *  at the destination on the final day. */
  endsAt: Date;
  isFinal: boolean;
}

export type WarningCode = 'overDriveCap' | 'closedOnArrival' | 'needsMoreDays' | 'lateArrival';

export interface ItineraryWarning {
  code: WarningCode;
  dayIndex?: number;
  stopId?: string;
  /** Minutes, or a day count, depending on the code. */
  value?: number;
}

export interface Itinerary {
  days: ItineraryDay[];
  warnings: ItineraryWarning[];
  arriveAt: Date;
  totalDriveMin: number;
  totalVisitMin: number;
}

const MIN_PER_DAY = 24 * 60;
// Arriving late enough to be worth flagging. Both ends matter: a trip that runs
// past midnight rolls the clock over, so checking only "after 22:00" would score
// a 00:30 arrival as 30 minutes past midnight and call it early.
const LATE_ARRIVAL_HOUR = 22;
const SMALL_HOURS_UNTIL = 6;

const addMin = (d: Date, m: number): Date => new Date(d.getTime() + m * 60_000);

/** Same calendar day as `after`, or the next one, at `minutesPastMidnight`. */
function nextMorning(after: Date, minutesPastMidnight: number): Date {
  const d = new Date(after);
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() + MIN_PER_DAY * 60_000 + minutesPastMidnight * 60_000);
  return d;
}

export function buildItinerary(plan: Stop[], opts: ItineraryOptions): Itinerary {
  const {
    departAt, dailyDepartMin, maxDriveMinPerDay,
    totalDistanceKm, totalDurationMin, dayBreaksAfter, maxDays,
  } = opts;

  // Pace from the route the router actually returned, rather than a guessed
  // average speed: it already accounts for the real roads on this drive.
  const minPerKm = totalDistanceKm > 0 ? totalDurationMin / totalDistanceKm : 0;
  const legMin = (km: number) => Math.max(0, km) * minPerKm;

  const ordered = [...plan].sort((a, b) => a.alongKm - b.alongKm);
  const warnings: ItineraryWarning[] = [];
  const days: ItineraryDay[] = [];

  let cursor = new Date(departAt);
  let dayStart = new Date(departAt);
  let dayDrive = 0;
  let dayVisit = 0;
  let current: ItineraryStop[] = [];
  let prevKm = 0;
  let totalDrive = 0;
  let totalVisit = 0;

  const closeDay = (endsAt: Date, isFinal: boolean) => {
    days.push({
      index: days.length,
      departAt: new Date(dayStart),
      stops: current,
      driveMin: Math.round(dayDrive),
      visitMin: Math.round(dayVisit),
      endsAt,
      isFinal,
    });
    current = [];
    dayDrive = 0;
    dayVisit = 0;
  };

  for (const stop of ordered) {
    // Reaching a stop costs the drive along the route plus its detour. detourMin
    // is a round trip, so half of it gets you there and the other half is spent
    // rejoining the road — which the next leg would otherwise not account for.
    const drive = legMin(stop.alongKm - prevKm) + stop.detourMin / 2;

    // Start a new day when this leg would push the day past the cap. A day that
    // has no stops yet is never split: one unavoidable long leg is not a reason
    // to produce an empty day.
    if (current.length > 0 && dayDrive + drive > maxDriveMinPerDay) {
      closeDay(new Date(cursor), false);
      cursor = nextMorning(cursor, dailyDepartMin);
      dayStart = new Date(cursor);
    }

    const arrive = addMin(cursor, drive);
    const depart = addMin(arrive, stop.visitMin);
    const hs = hoursStatus(stop.hours, arrive);

    current.push({
      stop,
      arrive,
      depart,
      driveMinFromPrev: Math.round(drive),
      closedOnArrival: hs ? !hs.open : false,
    });
    if (hs && !hs.open) warnings.push({ code: 'closedOnArrival', stopId: stop.id, dayIndex: days.length });

    dayDrive += drive;
    dayVisit += stop.visitMin;
    totalDrive += drive;
    totalVisit += stop.visitMin;
    cursor = depart;
    prevKm = stop.alongKm;

    // An explicit "end the day here" always wins over the automatic split.
    if (dayBreaksAfter?.has(stop.id)) {
      closeDay(new Date(cursor), false);
      cursor = nextMorning(cursor, dailyDepartMin);
      dayStart = new Date(cursor);
    }
  }

  // The run home from the last stop to the destination.
  const finalDrive = legMin(totalDistanceKm - prevKm);
  if (current.length > 0 && dayDrive + finalDrive > maxDriveMinPerDay) {
    closeDay(new Date(cursor), false);
    cursor = nextMorning(cursor, dailyDepartMin);
    dayStart = new Date(cursor);
  }
  const arriveAt = addMin(cursor, finalDrive);
  dayDrive += finalDrive;
  totalDrive += finalDrive;
  closeDay(arriveAt, true);

  for (const d of days) {
    if (d.driveMin > maxDriveMinPerDay) {
      warnings.push({ code: 'overDriveCap', dayIndex: d.index, value: d.driveMin - maxDriveMinPerDay });
    }
  }
  if (maxDays && days.length > maxDays) {
    warnings.push({ code: 'needsMoreDays', value: days.length - maxDays });
  }
  const arriveHour = arriveAt.getHours();
  if (arriveHour >= LATE_ARRIVAL_HOUR || arriveHour < SMALL_HOURS_UNTIL) {
    warnings.push({
      code: 'lateArrival',
      dayIndex: days.length - 1,
      value: arriveHour * 60 + arriveAt.getMinutes(),
    });
  }

  return {
    days,
    warnings,
    arriveAt,
    totalDriveMin: Math.round(totalDrive),
    totalVisitMin: Math.round(totalVisit),
  };
}

/** A sensible default departure: tomorrow at 08:00, relative to a given "now". */
export function defaultDeparture(now: Date = new Date()): Date {
  return nextMorning(now, 8 * 60);
}

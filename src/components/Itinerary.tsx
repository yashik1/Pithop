// Day-by-day view of a planned trip: what time you reach each stop, where a day
// has to end, and what is going to go wrong.
//
// Presentational. All the scheduling lives in lib/itinerary.ts, so this file
// only renders and raises events — which is also why the timings can be unit
// tested without touching React.

import type { Stop } from '../types';
import type { Itinerary, ItineraryDay, ItineraryWarning } from '../lib/itinerary';
import { CATEGORY_MAP } from '../lib/categories';
import { fmtDur, type Units, distValue } from '../lib/format';
import { t } from '../lib/i18n';

const VISIT_CHOICES = [10, 15, 30, 45, 60, 90, 120, 180];

const clock = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayLabel = (d: Date) => d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

interface Props {
  itinerary: Itinerary;
  units: Units;
  departAt: Date;
  maxDriveMin: number;
  maxDays: number | null;
  dayBreaks: ReadonlySet<string>;
  /** Overnight suggestions per day index. Absent until they have loaded. */
  lodging: ReadonlyMap<number, Stop[]>;
  onDepartChange: (d: Date) => void;
  onMaxDriveChange: (min: number) => void;
  onMaxDaysChange: (days: number | null) => void;
  onToggleDayBreak: (stopId: string) => void;
  onVisitChange: (stopId: string, min: number) => void;
  onRemove: (stopId: string) => void;
  onSelect: (stopId: string) => void;
}

function WarningList({ warnings, dayIndex }: { warnings: ItineraryWarning[]; dayIndex?: number }) {
  const mine = warnings.filter((w) => (dayIndex === undefined ? w.dayIndex === undefined : w.dayIndex === dayIndex));
  const shown = mine.filter((w) => w.code !== 'closedOnArrival'); // shown on the stop itself
  if (!shown.length) return null;
  return (
    <ul className="itin-warnings">
      {shown.map((w, i) => (
        <li key={`${w.code}-${i}`}>
          ⚠️{' '}
          {w.code === 'overDriveCap'
            ? t('warnOverDrive', { n: fmtDur(w.value ?? 0) })
            : w.code === 'needsMoreDays'
              ? t('warnMoreDays', { n: w.value ?? 0 })
              : t('warnLateArrival')}
        </li>
      ))}
    </ul>
  );
}

function DayCard(props: { day: ItineraryDay; warnings: ItineraryWarning[] } & Omit<Props, 'itinerary'>) {
  const { day, units, dayBreaks, lodging, onToggleDayBreak, onVisitChange, onRemove, onSelect } = props;
  const beds = lodging.get(day.index) ?? [];
  return (
    <section className="itin-day">
      <header className="itin-day-head">
        <h3>
          {t('dayN', { n: day.index + 1 })} · {dayLabel(day.departAt)}
        </h3>
        <span className="itin-day-meta">
          🚗 {fmtDur(day.driveMin)}
          {day.visitMin > 0 ? ` · ⏱ ${fmtDur(day.visitMin)}` : ''}
        </span>
      </header>

      <div className="itin-row depart">
        <span className="itin-time">{clock(day.departAt)}</span>
        <span className="itin-what">{t('departHere')}</span>
      </div>

      {day.stops.map((s) => {
        const c = CATEGORY_MAP[s.stop.category];
        return (
          <div className={`itin-row${s.closedOnArrival ? ' closed' : ''}`} key={s.stop.id}>
            <span className="itin-time">{clock(s.arrive)}</span>
            <div className="itin-what">
              <button type="button" className="itin-name" onClick={() => onSelect(s.stop.id)}>
                {c.emoji} {s.stop.name}
              </button>
              <div className="itin-sub">
                {t('drivePrev', { n: fmtDur(s.driveMinFromPrev) })} · {distValue(s.stop.alongKm, units)} {units}
                {s.closedOnArrival ? ` · ⚠️ ${t('hoursClosedShort')}` : ''}
              </div>
              <div className="itin-actions">
                <label>
                  <span className="sr-only">{t('visitLength')}</span>
                  <select
                    value={VISIT_CHOICES.includes(s.stop.visitMin) ? s.stop.visitMin : 30}
                    onChange={(e) => onVisitChange(s.stop.id, Number(e.target.value))}
                  >
                    {VISIT_CHOICES.map((m) => (
                      <option key={m} value={m}>
                        {fmtDur(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={`itin-break${dayBreaks.has(s.stop.id) ? ' active' : ''}`}
                  aria-pressed={dayBreaks.has(s.stop.id)}
                  onClick={() => onToggleDayBreak(s.stop.id)}
                >
                  🌙 {t('endDayHere')}
                </button>
                <button type="button" className="itin-remove" onClick={() => onRemove(s.stop.id)}>
                  ✕ <span className="sr-only">{t('removeFromTrip')}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <div className={`itin-row end${day.isFinal ? ' final' : ''}`}>
        <span className="itin-time">{clock(day.endsAt)}</span>
        <span className="itin-what">{day.isFinal ? `🏁 ${t('arriveDest')}` : `🌙 ${t('overnightHere')}`}</span>
      </div>

      {!day.isFinal && beds.length > 0 && (
        <div className="itin-beds">
          <span className="itin-beds-label">{t('overnightNear')}</span>
          {beds.slice(0, 3).map((b) => (
            <span className="itin-bed" key={b.id}>
              {b.website ? (
                <a href={b.website} target="_blank" rel="noreferrer">
                  {b.name} ↗
                </a>
              ) : (
                b.name
              )}
            </span>
          ))}
        </div>
      )}

      <WarningList warnings={props.warnings} dayIndex={day.index} />
    </section>
  );
}

export function ItineraryView(props: Props) {
  const { itinerary, departAt, maxDriveMin, maxDays, onDepartChange, onMaxDriveChange, onMaxDaysChange } = props;
  // <input type="datetime-local"> wants local wall-clock text, not an ISO
  // instant — toISOString would shift it by the timezone offset.
  const localValue = new Date(departAt.getTime() - departAt.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

  return (
    <div className="itinerary">
      <div className="itin-controls">
        <label>
          {t('departLabel')}
          <input
            type="datetime-local"
            value={localValue}
            onChange={(e) => {
              const d = new Date(e.target.value);
              if (!Number.isNaN(d.getTime())) onDepartChange(d);
            }}
          />
        </label>
        <label>
          {t('maxDrivePerDay')}
          <select value={maxDriveMin} onChange={(e) => onMaxDriveChange(Number(e.target.value))}>
            {[180, 240, 300, 360, 420, 480, 600].map((m) => (
              <option key={m} value={m}>
                {fmtDur(m)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('daysAvailable')}
          <select
            value={maxDays ?? ''}
            onChange={(e) => onMaxDaysChange(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t('daysAny')}</option>
            {[1, 2, 3, 4, 5, 6, 7, 10, 14].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="itin-summary">
        {t('itinSummary', {
          d: itinerary.days.length,
          drive: fmtDur(itinerary.totalDriveMin),
          visit: fmtDur(itinerary.totalVisitMin),
        })}
      </div>

      <WarningList warnings={itinerary.warnings} />

      {itinerary.days.map((day) => (
        <DayCard key={day.index} day={day} {...props} warnings={itinerary.warnings} />
      ))}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { geoapifySuggest, hasGeoapify } from '../api/geoapify';

export interface PlacePick {
  label: string;
  lat: number;
  lng: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

// Turn on with ?debug in the URL (or localStorage 'sq-debug' = '1') to see the
// raw Photon responses in the console — the fastest way to tell "the data
// doesn't have this address" apart from "the app mislabeled it".
const DEBUG =
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).has('debug') || window.localStorage.getItem('sq-debug') === '1');

// Street addresses come back as housenumber/street with no name — join them
// so "782 Bethany Crescent" shows instead of collapsing to just the city.
// district/county/postcode fill in the rest of the address when present.
function toLabel(f: PhotonFeature): string {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const parts = [p.name, street, p.district, p.city ?? p.county, p.state, p.postcode, p.country].filter(
    Boolean,
  ) as string[];
  return [...new Set(parts)].join(', ');
}

interface Props {
  value: string;
  placeholder: string;
  onChange: (text: string) => void;
  onSelect: (pick: PlacePick) => void;
}

// Text input with debounced search-as-you-type suggestions (Photon/OSM).
// Selecting a suggestion hands exact coordinates to the parent, so the
// search can skip geocoding entirely; free-typed text still works via the
// regular geocode fallback.
export function PlaceInput({ value, placeholder, onChange, onSelect }: Props) {
  const [items, setItems] = useState<PlacePick[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const ctrlRef = useRef<AbortController | null>(null);
  // Set when a suggestion is chosen so the resulting value change doesn't
  // immediately re-open the dropdown.
  const skipNextFetch = useRef(false);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    ctrlRef.current?.abort();
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    if (value.trim().length < 3) {
      setItems([]);
      setOpen(false);
      return;
    }
    // Programmatic changes (example button, trip restore) shouldn't pop the
    // dropdown — only fetch while the user is actually typing in this field.
    if (document.activeElement !== inputRef.current) {
      setItems([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      try {
        let picks: PlacePick[];
        if (hasGeoapify()) {
          picks = await geoapifySuggest(value, ctrl.signal);
        } else {
          const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=6`, {
            signal: ctrl.signal,
          });
          if (!res.ok) {
            if (DEBUG) console.warn(`[sq-debug] Photon HTTP ${res.status} for "${value}"`);
            return;
          }
          const data = await res.json();
          if (DEBUG) {
            console.log(`[sq-debug] Photon raw response for "${value}":`, JSON.stringify(data.features ?? [], null, 2));
          }
          const seen = new Set<string>();
          picks = [];
          for (const f of (data.features ?? []) as PhotonFeature[]) {
            const label = toLabel(f);
            if (!label || seen.has(label)) continue;
            seen.add(label);
            picks.push({ label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });
          }
        }
        if (DEBUG) console.table(picks.map((p) => ({ label: p.label, lat: p.lat, lng: p.lng })));
        setItems(picks);
        setOpen(picks.length > 0);
        setActive(-1);
      } catch {
        // Aborted or offline — leave the dropdown closed; plain-text search still works.
      }
    }, 250);
    return () => window.clearTimeout(debounceRef.current);
  }, [value]);

  function choose(pick: PlacePick) {
    skipNextFetch.current = true;
    onSelect(pick);
    setOpen(false);
    setItems([]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="place-input">
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(items.length > 0)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        autoComplete="off"
        spellCheck={false}
      />
      {open && (
        <ul className="suggestions" role="listbox">
          {items.map((p, i) => (
            <li
              key={`${p.label}|${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              onMouseEnter={() => setActive(i)}
            >
              📍 {p.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

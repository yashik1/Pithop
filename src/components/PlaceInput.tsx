import { useEffect, useRef, useState } from 'react';

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
    city?: string;
    state?: string;
    country?: string;
  };
}

// Street addresses come back as housenumber/street with no name — join them
// so "782 Bethany Crescent" shows instead of collapsing to just the city.
function toLabel(f: PhotonFeature): string {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const parts = [p.name, street, p.city, p.state, p.country].filter(Boolean) as string[];
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
    debounceRef.current = window.setTimeout(async () => {
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      try {
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&limit=6`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const seen = new Set<string>();
        const picks: PlacePick[] = [];
        for (const f of (data.features ?? []) as PhotonFeature[]) {
          const label = toLabel(f);
          if (!label || seen.has(label)) continue;
          seen.add(label);
          picks.push({ label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });
        }
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

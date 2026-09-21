import { useEffect, useMemo, useRef, useState } from 'react';
import type { FloorplanEntry } from '../types';
import { getFloorplans } from '../api/endpoints';

interface FloorplanSelectorProps {
  /** Called with ('', '') when the selection is cleared. */
  onFloorSelect: (floorId: string, floorName: string, entry?: FloorplanEntry) => void;
}

const CONTROL_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '0.4rem',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  color: 'var(--text-bright)',
  fontSize: '0.8rem',
  fontFamily: "'IBM Plex Sans', sans-serif",
};

/**
 * Searchable floor-plan picker backed by the /api/floorplans registry.
 * Type across campus/building/floor ("parkview 8", "cam roof") or focus
 * to browse. Scales to hundreds of sheets — unlike the old two-tier
 * building+floor <select> which required a code change per new campus.
 */
export default function FloorplanSelector({ onFloorSelect }: FloorplanSelectorProps) {
  const [entries, setEntries] = useState<FloorplanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getFloorplans()
      .then((rows) => {
        if (cancelled) return;
        setEntries(rows);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Floor plans unavailable');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const matches = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return entries.slice(0, 24); // browse mode
    return entries
      .filter((e) => {
        const hay = `${e.campus} ${e.building} ${e.floor_name}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 60);
  }, [entries, query]);

  const groups = useMemo(() => {
    const g = new Map<string, FloorplanEntry[]>();
    for (const m of matches) {
      const key = `${m.campus} · ${m.building}`;
      const arr = g.get(key);
      if (arr) arr.push(m);
      else g.set(key, [m]);
    }
    return g;
  }, [matches]);

  const select = (e: FloorplanEntry) => {
    setSelectedLabel(`${e.building} — ${e.floor_name}`);
    setQuery('');
    setOpen(false);
    onFloorSelect(e.floor_id, e.floor_name, e);
  };

  const clear = () => {
    setSelectedLabel('');
    setQuery('');
    onFloorSelect('', '');
  };

  return (
    <div
      ref={boxRef}
      style={{
        background: 'rgba(11, 18, 25, 0.95)',
        border: '1px solid var(--border)',
        padding: '0.75rem 1rem',
        borderRadius: '6px',
        fontFamily: "'IBM Plex Sans', sans-serif",
        width: '280px',
        position: 'relative',
      }}
    >
      <div style={{
        fontWeight: 600,
        color: 'var(--text-bright)',
        marginBottom: '0.5rem',
        fontSize: '0.75rem',
        letterSpacing: '0.1em',
      }}>
        SELECT LOCATION
      </div>

      <div style={{ position: 'relative' }}>
        <input
          role="combobox"
          aria-expanded={open}
          aria-label="Search floor plans"
          placeholder={loading ? 'Loading floor plans…' : 'Search building / floor…'}
          value={open ? query : selectedLabel}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length) {
              e.preventDefault();
              select(matches[0]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          style={{ ...CONTROL_STYLE, paddingRight: '1.6rem' }}
        />
        {(selectedLabel || query) && (
          <button
            aria-label="Clear floor selection"
            onClick={clear}
            style={{
              position: 'absolute', right: '0.35rem', top: '50%',
              transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--muted-foreground, #888)',
              cursor: 'pointer', fontSize: '0.85rem', padding: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#f87171' }}>
          {error}
        </div>
      )}

      {open && (
        <div
          style={{
            marginTop: '0.4rem',
            maxHeight: '300px',
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: 'rgba(11, 18, 25, 0.98)',
          }}
        >
          {loading && (
            <div style={{ padding: '0.5rem 0.6rem', fontSize: '0.75rem', color: '#8aa' }}>
              Loading…
            </div>
          )}
          {!loading && !error && matches.length === 0 && (
            <div style={{ padding: '0.5rem 0.6rem', fontSize: '0.75rem', color: '#8aa' }}>
              No matching floor plans
            </div>
          )}
          {!loading &&
            [...groups.entries()].map(([groupLabel, items]) => (
              <div key={groupLabel}>
                <div style={{
                  padding: '0.35rem 0.6rem 0.15rem',
                  fontSize: '0.62rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#7d93a8',
                  position: 'sticky',
                  top: 0,
                  background: 'rgba(11, 18, 25, 0.98)',
                }}>
                  {groupLabel}
                </div>
                {items.map((m) => (
                  <button
                    key={m.floor_id}
                    onClick={() => select(m)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.35rem 0.6rem 0.35rem 1rem',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-bright)',
                      fontSize: '0.78rem',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      cursor: 'pointer',
                    }}
                  >
                    {m.floor_name}
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

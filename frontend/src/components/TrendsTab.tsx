import { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ColorMapping } from '../types';
import { INCIDENT_TYPE_LABELS, DEFAULT_COLOR_MAP } from '../types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TrendBucket {
  date_str: string;
  count: number;
  by_type: Record<string, number>;
}

type ExportType = 'csv' | 'pdf';

interface TrendsTabProps {
  colorConfig: ColorMapping[];
  filterStatus: string;
  onFilterStatusChange: (v: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Build a color map from the colour-config API (falls back to defaults). */
function buildColorMap(colorConfig: ColorMapping[]): Record<string, string> {
  const map: Record<string, string> = { ...DEFAULT_COLOR_MAP };
  for (const cm of colorConfig) {
    map[cm.incident_type] = cm.color;
  }
  return map;
}

/** Derive the active incident types from the data (or all known types). */
function getActiveTypes(
  buckets: TrendBucket[],
  colorConfig: ColorMapping[]
): string[] {
  const colorMap = buildColorMap(colorConfig);
  // Collect types that appear in any bucket
  const seen = new Set<string>();
  for (const b of buckets) {
    for (const t of Object.keys(b.by_type)) {
      seen.add(t);
    }
  }
  // Also include all known types that have a color config
  if (seen.size === 0) {
    return Object.keys(colorMap).filter((t) => colorMap[t]);
  }
  return [...seen];
}

/** Format a date for display. */
function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

/** Compute period query param for the API. */
function periodToApiPeriod(period: string): string {
  if (period === '90d') return 'monthly';
  return 'weekly';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function TrendsTab({
  colorConfig,
  onFilterStatusChange,
  filterStatus,
}: TrendsTabProps) {
  /* ---- period buttons (7d default) ---- */
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');

  /* ---- shared date range ---- */
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const [startDate, setStartDate] = useState(
    weekAgo.toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    today.toISOString().split('T')[0]
  );
  const [manualDateEdit, setManualDateEdit] = useState(false);

  /* ---- trend data ---- */
  const [trendsData, setTrendsData] = useState<TrendBucket[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

  /* ---- export state ---- */
  const [exportType, setExportType] = useState<ExportType>('csv');
  const [includeIncidents, setIncludeIncidents] = useState(true);
  const [includeHandoff, setIncludeHandoff] = useState(true);
  const [exporting, setExporting] = useState(false);

  /* ---- load trends from API ---- */
  const loadTrends = useCallback(async () => {
    setLoadingTrends(true);
    try {
      const params = new URLSearchParams({
        period: periodToApiPeriod(period),
        start_date: startDate,
        end_date: endDate,
      });
      const res = await fetch(`/api/incidents/trends?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TrendBucket[] = await res.json();
      setTrendsData(data);
    } catch (err) {
      console.error('Failed to load trends:', err);
      setTrendsData([]);
    } finally {
      setLoadingTrends(false);
    }
  }, [period, startDate, endDate]);

  useEffect(() => {
    loadTrends();
  }, [loadTrends]);

  /* ---- period button handler ---- */
  function handlePeriodChange(p: '7d' | '30d' | '90d') {
    setPeriod(p);
    setManualDateEdit(false);

    const end = new Date();
    const start = new Date(end);
    if (p === '7d') start.setDate(end.getDate() - 7);
    else if (p === '30d') start.setDate(end.getDate() - 30);
    else if (p === '90d') start.setDate(end.getDate() - 90);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    setStartDate(startStr);
    setEndDate(endStr);
  }

  /* ---- date changed manually ---- */
  function handleDateChange(field: 'start' | 'end', value: string) {
    if (field === 'start') setStartDate(value);
    else setEndDate(value);
    setManualDateEdit(true);
  }

  /* ---- export handler ---- */
  async function handleExport() {
    setExporting(true);
    try {
      if (exportType === 'csv') {
        await downloadBlob(
          `/api/incidents/export.csv?status=${encodeURIComponent(filterStatus || '')}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
          `incidents_${startDate}_${endDate}.csv`
        );
      } else {
        // PDF: same endpoint pattern (backend returns PDF blob)
        await downloadBlob(
          `/api/incidents/export.pdf?status=${encodeURIComponent(filterStatus || '')}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
          `incidents_${startDate}_${endDate}.pdf`
        );
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Check console for details.');
    } finally {
      setExporting(false);
    }
  }

  /** Generic blob download helper using URL.createObjectURL. */
  async function downloadBlob(url: string, filename: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Export HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }

  /* ---- colour map ---- */
  const colorMap = buildColorMap(colorConfig);

  /* ---- active types for legend ---- */
  const activeTypes = getActiveTypes(trendsData, colorConfig);

  /* ---- prepare chart data (fill missing types with 0) ---- */
  const chartData = trendsData.map((bucket) => {
    const entry: Record<string, string | number> = { date: bucket.date_str };
    for (const t of activeTypes) {
      entry[t] = bucket.by_type[t] ?? 0;
    }
    return entry;
  });

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div style={{ width: '100%' }}>
      {/* ---- Time period toggle ---- */}
      <div style={{ marginBottom: 8 }}>
        <span
          style={{
            fontSize: '0.55rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          Time Period
        </span>
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginTop: 4,
          }}
        >
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              style={{
                flex: 1,
                padding: '4px 0',
                fontSize: '0.6rem',
                fontWeight: period === p ? 700 : 500,
                fontFamily: "'IBM Plex Mono', monospace",
                background: period === p ? 'var(--accent-dim)' : 'transparent',
                color: period === p ? 'var(--accent)' : 'var(--text-primary)',
                border: `1px solid ${period === p ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Date range picker ---- */}
      <div style={{ marginBottom: 12 }}>
        <span
          style={{
            fontSize: '0.55rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          Date Range
        </span>
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 4,
          }}
        >
          <div style={{ flex: 1 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.5rem',
                color: 'var(--text-muted)',
                marginBottom: 2,
              }}
            >
              From
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleDateChange('start', e.target.value)}
              style={{
                width: '100%',
                padding: '3px 6px',
                fontSize: '0.6rem',
                fontFamily: "'IBM Plex Mono', monospace",
                border: '1px solid var(--border)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                borderRadius: 3,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.5rem',
                color: 'var(--text-muted)',
                marginBottom: 2,
              }}
            >
              To
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleDateChange('end', e.target.value)}
              style={{
                width: '100%',
                padding: '3px 6px',
                fontSize: '0.6rem',
                fontFamily: "'IBM Plex Mono', monospace",
                border: '1px solid var(--border)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                borderRadius: 3,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div
          style={{
            fontSize: '0.5rem',
            color: 'var(--text-muted)',
            marginTop: 3,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {manualDateEdit
            ? `Custom: ${formatDate(startDate)} – ${formatDate(endDate)}`
            : `${formatDate(startDate)} – ${formatDate(endDate)}`}
        </div>
      </div>

      {/* ---- Trend chart ---- */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 6,
          border: '1px solid var(--border)',
          padding: 10,
          marginBottom: 12,
        }}
      >
        <h4
          style={{
            margin: '0 0 8px 0',
            fontSize: '0.6rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          Incident Trends
        </h4>

        {loadingTrends ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: '0.7rem' }}>
            Loading trends...
          </div>
        ) : trendsData.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 24,
              color: 'var(--text-muted)',
              fontSize: '0.7rem',
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            No data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }}
                stroke="var(--text-muted)"
              />
              <YAxis
                tick={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }}
                stroke="var(--text-muted)"
                allowDecimals={false}
                width={24}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  fontSize: '0.65rem',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
                labelStyle={{ fontWeight: 700, marginBottom: 4 }}
              />
              <Legend
                wrapperStyle={{ fontSize: '0.55rem', fontFamily: "'IBM Plex Mono', monospace" }}
                align="right"
                verticalAlign="middle"
              />
              {activeTypes.map((type) => (
                <Line
                  key={type}
                  type="monotone"
                  dataKey={type}
                  stroke={colorMap[type] || DEFAULT_COLOR_MAP[type as keyof typeof DEFAULT_COLOR_MAP] || '#666'}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                  name={INCIDENT_TYPE_LABELS[type as keyof typeof INCIDENT_TYPE_LABELS] || type}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ---- Export Report Section ---- */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 6,
          border: '1px solid var(--border)',
          padding: 10,
        }}
      >
        <h4
          style={{
            margin: '0 0 8px 0',
            fontSize: '0.6rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          Export Report
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Export type */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.5rem',
                color: 'var(--text-muted)',
                marginBottom: 2,
              }}
            >
              Format
            </label>
            <select
              value={exportType}
              onChange={(e) => setExportType(e.target.value as ExportType)}
              style={{
                width: '100%',
                padding: '3px 6px',
                fontSize: '0.6rem',
                fontFamily: "'IBM Plex Mono', monospace",
                border: '1px solid var(--border)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                borderRadius: 3,
                boxSizing: 'border-box',
              }}
            >
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </select>
          </div>

          {/* Content checkboxes */}
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: 3 }}>
              <input
                type="checkbox"
                checked={includeIncidents}
                onChange={(e) => setIncludeIncidents(e.target.checked)}
              />
              Incidents
            </label>
            <label style={{ fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: 3 }}>
              <input
                type="checkbox"
                checked={includeHandoff}
                onChange={(e) => setIncludeHandoff(e.target.checked)}
              />
              Handoff Notes
            </label>
          </div>

          {/* Status filter */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.5rem',
                color: 'var(--text-muted)',
                marginBottom: 2,
              }}
            >
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => onFilterStatusChange(e.target.value)}
              style={{
                width: '100%',
                padding: '3px 6px',
                fontSize: '0.6rem',
                fontFamily: "'IBM Plex Mono', monospace",
                border: '1px solid var(--border)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                borderRadius: 3,
                boxSizing: 'border-box',
              }}
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="escalating">Escalating</option>
              <option value="monitoring">Monitoring</option>
              <option value="resolved">Resolved</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Date range (shared with trends) */}
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.5rem',
                  color: 'var(--text-muted)',
                  marginBottom: 2,
                }}
              >
                From
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleDateChange('start', e.target.value)}
                style={{
                  width: '100%',
                  padding: '3px 6px',
                  fontSize: '0.6rem',
                  fontFamily: "'IBM Plex Mono', monospace",
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  borderRadius: 3,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.5rem',
                  color: 'var(--text-muted)',
                  marginBottom: 2,
                }}
              >
                To
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleDateChange('end', e.target.value)}
                style={{
                  width: '100%',
                  padding: '3px 6px',
                  fontSize: '0.6rem',
                  fontFamily: "'IBM Plex Mono', monospace",
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  borderRadius: 3,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Download button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              width: '100%',
              padding: '5px 0',
              fontSize: '0.6rem',
              fontWeight: 600,
              fontFamily: "'IBM Plex Mono', monospace",
              background: exporting ? 'var(--bg-input)' : 'var(--accent)',
              color: exporting ? 'var(--text-muted)' : '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              letterSpacing: '0.05em',
            }}
          >
            {exporting ? 'Downloading...' : `⬇ Download ${exportType.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

import { Fragment, useCallback, useEffect, useState } from 'react';
import type { ShiftReport } from '../types';
import { getShiftReport, downloadShiftReportPdf } from '../api/endpoints';
import { INCIDENT_TYPE_LABELS } from '../types';

type ReportIncident = ShiftReport['incidents'][number] & {
  room_label?: string | null;
  floorplan_version_id?: number | string | null;
  floorplan_x?: number | null;
  floorplan_y?: number | null;
  floorplan?: { id: number | string; version: number; campus: string; building: string; building_id: string; floor_name: string } | null;
};

const LABEL = (t: string) =>
  (INCIDENT_TYPE_LABELS as Record<string, string>)[t] || t.replace(/_/g, ' ');

/**
 * Shift Report — leadership-only preview of one shift (CONTEXT.md).
 * Loads the most-recently-ended shift by default; date+code overrides.
 */
export default function ShiftReportView() {
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [date, setDate] = useState('');
  const [code, setCode] = useState('');

  const load = useCallback(async (d?: string, c?: string) => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getShiftReport(d || undefined, c || undefined));
      setExpanded(new Set());
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) setError('Shift not found — pick another date/code.');
      else if (status === 403) setError('Shift reports are for supervisors.');
      else setError('Failed to load shift report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onPick = () => {
    if (date && code) load(date, code);
    else load();
  };

  const onDownload = async () => {
    if (!report) return;
    setDownloading(true);
    try {
      const blob = await downloadShiftReportPdf(report.shift.date, report.shift.code);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shift_report_${report.shift.date}_${report.shift.code}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('PDF download failed.');
    } finally {
      setDownloading(false);
    }
  };

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const section: React.CSSProperties = {
    fontSize: '0.6rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--accent)',
    margin: '14px 0 6px',
    fontFamily: "'IBM Plex Mono', monospace",
  };
  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '3px 6px',
    fontSize: '0.58rem',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '3px 6px',
    fontSize: '0.62rem',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'top',
  };

  return (
    <div style={{ padding: '8px 10px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              display: 'block', background: 'var(--bg-input)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 3, fontSize: '0.6rem', padding: '2px 4px',
            }}
          />
        </label>
        <label style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
          Shift
          <select
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{
              display: 'block', background: 'var(--bg-input)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 3, fontSize: '0.6rem', padding: '2px 4px',
            }}
          >
            <option value="">—</option>
            <option value="DAY">Day</option>
            <option value="EVE">Evening</option>
            <option value="NIGHT">Night</option>
          </select>
        </label>
        <button
          onClick={onPick}
          style={{
            fontSize: '0.6rem', padding: '4px 8px', background: 'var(--accent-dim)',
            color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 3, cursor: 'pointer',
          }}
        >
          Load
        </button>
        {report && (
          <button
            onClick={onDownload}
            disabled={downloading}
            style={{
              marginLeft: 'auto', fontSize: '0.6rem', padding: '4px 8px',
              background: 'transparent', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', borderRadius: 3,
              cursor: downloading ? 'wait' : 'pointer',
            }}
          >
            {downloading ? 'Building…' : '⬇ PDF'}
          </button>
        )}
      </div>

      {loading && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 12 }}>Loading…</div>}
      {error && <div style={{ fontSize: '0.65rem', color: '#f87171', marginTop: 12 }}>{error}</div>}

      {!loading && !error && report && (
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, marginTop: 10 }}>
            {report.shift.date} · {LABEL(report.shift.code)} shift ·{' '}
            {report.shift.start_time}–{report.shift.end_time}
            {report.shift.in_progress && (
              <span style={{ color: '#fbbf24', marginLeft: 6 }}>● LIVE SNAPSHOT</span>
            )}
          </div>

          <div style={section}>Stats</div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>
            {report.stats.total} incident{report.stats.total === 1 ? '' : 's'}
          </div>
          {Object.keys(report.stats.by_type).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
              <tbody>
                {Object.entries(report.stats.by_type)
                  .sort((a, b) => b[1] - a[1])
                  .map(([t, n]) => (
                    <tr key={t}>
                      <td style={td}>{LABEL(t)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{n}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          {report.stats.by_officer.length > 0 && (
            <>
              <div style={section}>By officer</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Officer</th>
                    <th style={{ ...th, textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.stats.by_officer.map((o) => (
                    <Fragment key={o.author}>
                      <tr>
                        <td style={td}>{o.author}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{o.total}</td>
                      </tr>
                      <tr>
                        <td colSpan={2} style={{ ...td, color: 'var(--text-secondary)', fontSize: '0.55rem' }}>
                          {Object.entries(o.by_type)
                            .sort((a, b) => b[1] - a[1])
                            .map(([t, n]) => `${LABEL(t)} × ${n}`)
                            .join('  ·  ')}
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div style={section}>Reports by hour</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 54 }}>
            {report.timeline.map((b) => {
              const max = Math.max(1, ...report.timeline.map((x) => x.count));
              return (
                <div key={b.label} title={`${b.label} — ${b.count}`} style={{ flex: 1, textAlign: 'center' }}>
                  <div
                    style={{
                      height: `${Math.max(2, (b.count / max) * 40)}px`,
                      background: b.count ? 'var(--accent)' : 'var(--border)',
                      borderRadius: 2,
                    }}
                  />
                  <div style={{ fontSize: '0.42rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {b.label.slice(0, 2)}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={section}>Incidents</div>
          {report.incidents.length === 0 ? (
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>None logged.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Time</th>
                  <th style={th}>Type</th>
                  <th style={th}>Location</th>
                  <th style={th}>Status</th>
                  <th style={th}>Phase</th>
                </tr>
              </thead>
              <tbody>
                {report.incidents.map((incident) => {
                  const r = incident as ReportIncident;
                  return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => toggle(r.id)}
                      style={{ cursor: 'pointer' }}
                      title="Toggle description"
                    >
                      <td style={td}>{r.created_at.slice(11, 16)}</td>
                      <td style={td}>{LABEL(r.incident_type)}</td>
                      <td style={td}>{r.location_ref}</td>
                      <td style={td}>{r.status}</td>
                      <td style={td}>{r.response_phase || '—'}</td>
                    </tr>
                    {expanded.has(r.id) && (r.description || r.room_label || r.floorplan || r.floorplan_version_id != null) && (
                      <tr>
                        <td colSpan={5} style={{ ...td, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          {r.description && <div>{r.description}</div>}
                          {(r.room_label || r.floorplan) && (
                            <div style={{ fontStyle: 'normal', marginTop: 3 }}>
                              {r.room_label && <span>Room: {r.room_label}</span>}
                              {r.floorplan && <span style={{ marginLeft: 8 }}>Floorplan: {r.floorplan.campus} / {r.floorplan.building} / {r.floorplan.floor_name} (v{r.floorplan.version})</span>}
                              {r.floorplan_x != null && r.floorplan_y != null && <span style={{ marginLeft: 8 }}>Pin: ({r.floorplan_x}, {r.floorplan_y})</span>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}

          <div style={section}>Handoff notes</div>
          {report.handoff_notes.length === 0 ? (
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>None recorded.</div>
          ) : (
            report.handoff_notes.map((n) => (
              <div key={n.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
                  {n.created_at.slice(11, 16)} — {n.author || 'unknown'}
                </div>
                <div style={{ fontSize: '0.64rem', whiteSpace: 'pre-wrap' }}>{n.note}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

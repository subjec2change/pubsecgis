import { useCallback, useEffect, useState } from 'react';
import type { Incident, HandoffNote } from '../types';
import {
  getHandoffNotes,
  createHandoffNote,
  deleteIncident as apiDeleteIncident,
  updateIncident as apiUpdateIncident,
} from '../api/endpoints';
import { INCIDENT_TYPE_LABELS, DEFAULT_COLOR_MAP, SHIFTS } from '../types';

const RESPONSE_PHASE_LABELS: Record<string, string> = {
  en_route: 'Officer en route',
  situational_awareness: 'Situational awareness',
  on_scene: 'Officer on scene',
  dps_intervention: 'DPS intervention concluded',
  supervisor_on_scene: 'Supervisor on scene',
  medical_needed: 'Medical response needed',
  situation_stabilized: 'Situation stabilized',
  pending_followup: 'Pending follow-up',
  report_completed: 'Incident report completed',
};

interface SidebarProps {
  incidents: Incident[];
  selectedIncidentId: string | null;
  onIncidentSelect: (incident: Incident) => void;
  onMapClick: () => void;
  onIncidentCreated: () => void;
  onIncidentUpdated: () => void;
  onIncidentEdit: (incident: Incident) => void;
  onIncidentDelete: (id: string) => void;
  filterType: string;
  filterStatus: string;
  filterShift: string;
  shiftIds: Record<string, number>;
  onFilterTypeChange: (v: string) => void;
  onFilterStatusChange: (v: string) => void;
  onFilterShiftChange: (v: string) => void;
  formOpen: boolean;
  setFormOpen: (v: boolean) => void;
}

export default function Sidebar({
  incidents,
  selectedIncidentId,
  onIncidentSelect,
  onMapClick,
  onIncidentCreated,
  onIncidentEdit,
  filterType,
  filterStatus,
  filterShift,
  shiftIds,
  onFilterTypeChange,
  onFilterStatusChange,
  onFilterShiftChange,
}: Omit<SidebarProps, 'formOpen' | 'setFormOpen'>) {
  const [handoffNotes, setHandoffNotes] = useState<HandoffNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [justifyOpen, setJustifyOpen] = useState(false);
  const [justifyIncident, setJustifyIncident] = useState<Incident | null>(null);
  const [justifyText, setJustifyText] = useState('');
  const [justifying, setJustifying] = useState(false);

  const openJustify = (incident: Incident) => {
    setJustifyIncident(incident);
    setJustifyText('');
    setJustifyOpen(true);
  };

  const submitJustify = async () => {
    if (!justifyIncident || !justifyText.trim()) return;
    setJustifying(true);
    try {
      const currentDesc = justifyIncident.description || '';
      const updatedDesc = currentDesc
        ? `${currentDesc}\n[RESOLVED: ${justifyText.trim()}]`
        : `[RESOLVED: ${justifyText.trim()}]`;
      await apiUpdateIncident(justifyIncident.id, { status: 'resolved', description: updatedDesc });
      onIncidentCreated();
    } catch (err) {
      console.error('Failed to resolve with justification:', err);
    } finally {
      setJustifying(false);
      setJustifyOpen(false);
      setJustifyIncident(null);
      setJustifyText('');
    }
  };

  const loadHandoffNotes = useCallback(async () => {
    try {
      // Convert shift name to numeric ID
      let shiftId: number | undefined;
      if (filterShift) {
        const shiftCode = filterShift.toUpperCase();
        shiftId = shiftIds[shiftCode];
      }
      const notes = await getHandoffNotes({ shift: shiftId?.toString() });
      setHandoffNotes(notes);
    } catch (err) {
      console.error('Failed to load handoff notes:', err);
    }
  }, [filterShift, shiftIds]);

  useEffect(() => {
    loadHandoffNotes();
  }, [loadHandoffNotes]);

  const handleAddHandoffNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setSavingNote(true);
    try {
      // Convert shift name to numeric ID
      let shiftId: number | undefined;
      if (filterShift) {
        const shiftCode = filterShift.toUpperCase();
        shiftId = shiftIds[shiftCode];
      }
      if (!shiftId) {
        throw new Error('No shift selected');
      }
      const note = await createHandoffNote({
        shift_id: shiftId,
        note: newNote.trim(),
      });
      setHandoffNotes((prev) => [note, ...prev]);
      setNewNote('');
    } catch (err) {
      console.error('Failed to add handoff note:', err);
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteIncident = async (id: string) => {
    if (!confirm('Are you sure you want to delete this incident?')) return;
    try {
      await apiDeleteIncident(id);
      onIncidentCreated();
    } catch (err) {
      console.error('Failed to delete incident:', err);
    }
  };

  const handleEditIncident = (incident: Incident) => {
    onIncidentEdit(incident);
  };

  const filteredIncidents = incidents
    .filter((i) => {
      if (filterType && i.incident_type !== filterType) return false;
      if (filterStatus && i.status !== filterStatus) return false;
      if (filterShift) {
        // Map shift name to shift code then to numeric ID
        const nameToCode: Record<string, string> = {
          'day': 'DAY',
          'evening': 'EVE',
          'night': 'NIGHT',
        };
        const code = nameToCode[filterShift.toLowerCase()] || filterShift.toUpperCase();
        const filterShiftId = shiftIds[code];
        if (filterShiftId != null && String(i.shift_id) !== String(filterShiftId)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Severity order: open > escalating > monitoring > resolved > archived
      const severityOrder: Record<string, number> = {
        open: 0,
        escalating: 1,
        monitoring: 2,
        resolved: 3,
        archived: 4,
      };
      const severityDiff = (severityOrder[a.status] ?? 5) - (severityOrder[b.status] ?? 5);
      if (severityDiff !== 0) return severityDiff;
      // Within same severity, newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const activeIncidents = filteredIncidents.filter((i) => i.status !== 'archived');
  const archivedIncidents = filteredIncidents.filter((i) => i.status === 'archived');

  return (
    <div className="sidebar" style={{ position: 'relative' }}>
      <div className="sidebar-header">
        <div className="sidebar-title">
          📋 Active Incidents <span className="count">{activeIncidents.length}</span>
        </div>
        <div className="filters">
          <select value={filterType} onChange={(e) => onFilterTypeChange(e.target.value)}>
            <option value="">All Types</option>
            {(Object.keys(INCIDENT_TYPE_LABELS) as (keyof typeof INCIDENT_TYPE_LABELS)[]).map(
              (type) => (
                <option key={type} value={type}>
                  {INCIDENT_TYPE_LABELS[type]}
                </option>
              )
            )}
          </select>

          <select value={filterStatus} onChange={(e) => onFilterStatusChange(e.target.value)}>
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="monitoring">Monitoring</option>
            <option value="escalating">Escalating</option>
            <option value="resolved">Resolved</option>
            <option value="archived">Archived</option>
          </select>

          <select value={filterShift} onChange={(e) => onFilterShiftChange(e.target.value)}>
            <option value="">All Shifts</option>
            {SHIFTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button className="new-incident-btn" onClick={onMapClick}>
          ＋ New Incident
        </button>
      </div>

      <div className="incident-list">
        {filteredIncidents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📍</div>
            No incidents found<br/>
            <span style={{ fontSize: '0.8rem', marginTop: '0.5rem', display: 'block' }}>
              Click on the map or use "New Incident" to create one
            </span>
          </div>
        ) : (
          <>
            {activeIncidents.map((incident) => (
              <div
                key={incident.id}
                className={`incident-card ${selectedIncidentId === incident.id ? 'selected' : ''}`}
                style={{
                  ['--card-color' as string]: DEFAULT_COLOR_MAP[incident.incident_type] || '#3b82f6',
                }}
                onClick={() => onIncidentSelect(incident)}
              >
                <div className="incident-card-header">
                  <div className="incident-type">
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: DEFAULT_COLOR_MAP[incident.incident_type] || '#666',
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    {INCIDENT_TYPE_LABELS[incident.incident_type] || incident.incident_type}
                  </div>
                  <span
                    className={`status-badge status-${incident.status}`}
                  >
                    {incident.status}
                  </span>
                </div>

                <div className="incident-details">
                  <div className="location">📍 {incident.location_ref}</div>
                  {incident.response_phase && (
                    <div style={{ marginTop: '0.2rem', fontSize: '0.75rem', color: 'var(--accent)' }}>
                      {RESPONSE_PHASE_LABELS[incident.response_phase] || incident.response_phase}
                    </div>
                  )}
                  {incident.description && (
                    <div style={{ marginTop: '0.2rem', fontSize: '0.8rem' }}>{incident.description}</div>
                  )}
                  <div className="time">
                    {new Date(incident.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </div>
                </div>

                <div className="incident-actions" onClick={(e) => e.stopPropagation()}>
                  {incident.status !== 'resolved' && incident.status !== 'archived' && (
                    <button
                      className="btn-sm btn-resolve"
                      onClick={() => openJustify(incident)}
                    >
                      ✓ Resolve
                    </button>
                  )}
                  <button
                    className="btn-sm btn-edit"
                    onClick={() => handleEditIncident(incident)}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    className="btn-sm btn-delete"
                    onClick={() => handleDeleteIncident(incident.id)}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
            {archivedIncidents.length > 0 && (
              <>
                <div className="archived-divider">— Archived —</div>
                {archivedIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    className={`incident-card archived ${selectedIncidentId === incident.id ? 'selected' : ''}`}
                    style={{
                      ['--card-color' as string]: DEFAULT_COLOR_MAP[incident.incident_type] || '#3b82f6',
                    }}
                    onClick={() => onIncidentSelect(incident)}
                  >
                    <div className="incident-card-header">
                      <div className="incident-type">
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: DEFAULT_COLOR_MAP[incident.incident_type] || '#666',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                        {INCIDENT_TYPE_LABELS[incident.incident_type] || incident.incident_type}
                      </div>
                      <span
                        className={`status-badge status-${incident.status}`}
                      >
                        {incident.status}
                      </span>
                    </div>

                    <div className="incident-details">
                      <div className="location">📍 {incident.location_ref}</div>
                      {incident.description && (
                        <div style={{ marginTop: '0.2rem', fontSize: '0.8rem' }}>{incident.description}</div>
                      )}
                      <div className="time">
                        {new Date(incident.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: false,
                        })}
                      </div>
                    </div>

                    <div className="incident-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-sm btn-reopen"
                        onClick={async () => {
                          try {
                            await apiUpdateIncident(incident.id, { status: 'open' });
                            onIncidentCreated();
                          } catch (err) {
                            console.error('Failed to reopen:', err);
                          }
                        }}
                      >
                        ↻ Reopen
                      </button>
                      <button
                        className="btn-sm btn-edit"
                        onClick={() => handleEditIncident(incident)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="btn-sm btn-delete"
                        onClick={() => handleDeleteIncident(incident.id)}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      <div className="handoff-section">
        <h3>📝 Shift Handoff Notes</h3>
        <div className="handoff-notes-list">
          {handoffNotes.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.5rem 0' }}>
              No handoff notes yet for this shift
            </div>
          ) : (
            handoffNotes.map((note) => (
              <div key={note.id} className="handoff-note">
                <div className="note-meta">
                  {note.location_ref && `📍 ${note.location_ref} · `}
                  {new Date(note.created_at).toLocaleString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </div>
                {note.note}
              </div>
            ))
          )}
        </div>

        <form className="handoff-input-row" onSubmit={handleAddHandoffNote}>
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a handoff note..."
            rows={2}
          />
          <button type="submit" disabled={savingNote || !newNote.trim()}>
            {savingNote ? '...' : 'Add Note'}
          </button>
        </form>
      </div>

      {justifyOpen && justifyIncident && (
        <div className="justify-popup-overlay" onClick={() => setJustifyOpen(false)}>
          <div className="justify-popup" onClick={(e) => e.stopPropagation()}>
            <h3>Resolve Incident</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              {justifyIncident.location_ref} · {INCIDENT_TYPE_LABELS[justifyIncident.incident_type] || justifyIncident.incident_type}
            </p>
            <textarea
              value={justifyText}
              onChange={(e) => setJustifyText(e.target.value)}
              placeholder="Brief justification for resolving this incident..."
              rows={3}
              autoFocus
            />
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
              This will be appended to the incident description as [RESOLVED: ...]
            </p>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn-cancel" onClick={() => setJustifyOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-submit"
                disabled={justifying || !justifyText.trim()}
                onClick={submitJustify}
              >
                {justifying ? 'Resolving...' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

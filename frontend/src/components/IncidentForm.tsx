import { useState, useEffect } from 'react';
import type { Incident, IncidentType } from '../types';
import { INCIDENT_TYPE_LABELS } from '../types';
import { searchLocations, createIncident, updateIncident } from '../api/endpoints';
import ShiftSelector from './ShiftSelector';

interface IncidentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  editIncident?: Incident | null;
  initialShift?: string;
  preSelectedBuilding?: string | null;
  preSelectedFloor?: string | null;
}

export default function IncidentForm({
  isOpen,
  onClose,
  onSubmit,
  editIncident,
  initialShift,
  preSelectedBuilding,
  preSelectedFloor,
}: IncidentFormProps) {
  const [shift, setShift] = useState(initialShift || 'day');
  const [incidentType, setIncidentType] = useState<IncidentType>(
    editIncident?.incident_type || 'victim_of_violence'
  );
  const [locationQuery, setLocationQuery] = useState('');
  const [locationRef, setLocationRef] = useState(editIncident?.location_ref || '');
  const [locations, setLocations] = useState<{ id: string; name: string; ref_code?: string; description?: string }[]>([]);
  const [description, setDescription] = useState(editIncident?.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Incident['status']>(
    editIncident?.status || 'open'
  );
  const [responsePhase, setResponsePhase] = useState<string | null>(
    editIncident?.response_phase || null
  );

  useEffect(() => {
    if (editIncident) {
      setIncidentType(editIncident.incident_type);
      setLocationRef(editIncident.location_ref);
      setDescription(editIncident.description || '');
      setStatus(editIncident.status);
      setResponsePhase(editIncident.response_phase ?? null);
      setLocationQuery('');
    }
  }, [editIncident]);

  // Location autocomplete
  useEffect(() => {
    if (locationQuery.length < 2) {
      setLocations([]);
      return;
    }

    let cancelled = false;
    const fetchLocations = async () => {
      try {
        const results = await searchLocations(locationQuery);
        if (!cancelled) setLocations(results);
      } catch {
        // Silently fail - just no results
      }
    };

    const timeout = setTimeout(fetchLocations, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [locationQuery]);

  // Pre-fill location from floorplan selection when opening form
  useEffect(() => {
    if (isOpen && !editIncident && (preSelectedBuilding || preSelectedFloor)) {
      const loc = preSelectedFloor
        ? `${preSelectedBuilding} - ${preSelectedFloor}`
        : preSelectedBuilding || '';
      setLocationQuery(loc);
      setLocationRef(loc);
    }
  }, [isOpen, preSelectedBuilding, preSelectedFloor, editIncident]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editIncident) {
        await updateIncident(editIncident.id, {
          incident_type: incidentType,
          location_ref: locationRef,
          description: description || undefined,
          status: status,
          response_phase: responsePhase,
        });
      } else {
        await createIncident({
          shift_id: shift,
          incident_type: incidentType,
          location_ref: locationRef,
          description: description || undefined,
          status: status,
          response_phase: responsePhase || undefined,
        });
      }
      onSubmit();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Unknown error';
      console.error('IncidentForm: Failed to save incident:', err);
      setError('Failed to save: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editIncident ? 'Edit Incident' : 'New Incident'}</h2>

        <form onSubmit={handleSubmit}>
          <ShiftSelector value={shift} onChange={setShift} />

          {/* Floorplan Location Selection */}
          <div className="form-group">
            <label htmlFor="floorplan-building">Building / Floor</label>
            <select
              id="floorplan-building"
              value={locationRef}
              onChange={(e) => {
                setLocationQuery(e.target.value);
                setLocationRef(e.target.value);
              }}
            >
              <option value="">— Select Building / Floor —</option>
              <optgroup label="Main Building">
                <option value="Main Building - Floor 1 - Lobby">Main Building - Floor 1 - Lobby</option>
                <option value="Main Building - Floor 2 - Offices">Main Building - Floor 2 - Offices</option>
                <option value="Main Building - Floor 3 - Medical">Main Building - Floor 3 - Medical</option>
                <option value="Main Building - Floor 1 - Emergency">Main Wing (B Floor) - Floor 1 - Emergency</option>
                <option value="Main Building - Floor 2 - Surgery">Main Wing (B Floor) - Floor 2 - Surgery</option>
              </optgroup>
              <optgroup label="Children's Hospital">
                <option value="Children's Hospital - Floor 1 - ER">Children's Hospital - Floor 1 - ER</option>
                <option value="Children's Hospital - Floor 2 - Inpatient">Children's Hospital - Floor 2 - Inpatient</option>
                <option value="Children's Hospital - Floor 3 - ICN">Children's Hospital - Floor 3 - ICN</option>
              </optgroup>
              <optgroup label="Adult ED">
                <option value="Adult ED - Floor 1 - Triage">Adult ED - Floor 1 - Triage</option>
                <option value="Adult ED - Floor 2 - Consults">Adult ED - Floor 2 - Consults</option>
              </optgroup>
              <optgroup label="Parking Garage">
                <option value="Parking Garage - Level -1">Parking Garage - Level -1</option>
                <option value="Parking Garage - Level -2">Parking Garage - Level -2</option>
              </optgroup>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="incident-type">Incident Type</label>
            <select
              id="incident-type"
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value as IncidentType)}
            >
              {(Object.keys(INCIDENT_TYPE_LABELS) as IncidentType[]).map((type) => (
                <option key={type} value={type}>
                  {INCIDENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          {!editIncident && (
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as Incident['status'])}
              >
                <option value="open">Open</option>
                <option value="escalating">Escalating</option>
                <option value="monitoring">Monitoring</option>
                <option value="resolved">Resolved</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          )}

          {editIncident && (
            <div className="form-group">
              <label htmlFor="edit-status">Change Status</label>
              <select
                id="edit-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as Incident['status'])}
              >
                <option value="open">Open</option>
                <option value="escalating">Escalating</option>
                <option value="monitoring">Monitoring</option>
                <option value="resolved">Resolved</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="response-phase">Response Phase</label>
            <select
              id="response-phase"
              value={responsePhase || ''}
              onChange={(e) => setResponsePhase(e.target.value || null)}
            >
              <option value="">— None —</option>
              <option value="en_route">Officer en route</option>
              <option value="situational_awareness">Situational awareness</option>
              <option value="on_scene">Officer on scene</option>
              <option value="dps_intervention">DPS intervention concluded</option>
              <option value="supervisor_on_scene">Supervisor on scene</option>
              <option value="medical_needed">Medical response needed</option>
              <option value="situation_stabilized">Situation stabilized</option>
              <option value="pending_followup">Pending follow-up</option>
              <option value="report_completed">Incident report completed</option>
            </select>
          </div>

          <div className="form-group" style={{ position: 'relative' }}>
            <label htmlFor="location">Location</label>
            <input
              id="location"
              type="text"
              value={locationQuery || locationRef}
              onChange={(e) => {
                setLocationQuery(e.target.value);
                setLocationRef(e.target.value);
              }}
              onFocus={() => {
                if (locationQuery.length >= 2) setLocations(locations);
              }}
              placeholder="Search locations or enter manually"
              required
            />
            {locations.length > 0 && (
              <div className="autocomplete-list">
                {locations.map((loc) => (
                  <div
                    key={loc.id}
                    className="autocomplete-item"
                    onClick={() => {
                      setLocationRef(loc.ref_code || loc.name);
                      setLocationQuery(loc.ref_code || loc.name);
                      setLocations([]);
                    }}
                  >
                    {loc.ref_code || loc.name}
                    {loc.description ? ` - ${loc.description}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details about the incident..."
              rows={3}
            />
          </div>

          {error && (
            <div className="form-error" style={{ color: '#DC2626', padding: '10px', background: '#FEF2F2', borderRadius: 4, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={saving}>
              {saving ? 'Saving...' : editIncident ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

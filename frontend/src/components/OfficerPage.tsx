import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import OfficerMap from './OfficerMap';
import IncidentForm from './IncidentForm';
import type { Incident, BroadcastIncident, ColorMapping } from '../types';
import {
  getIncidents,
  getBroadcastIncidents,
  getColorConfig,
} from '../api/endpoints';

export default function OfficerPage() {
  const { user, logout } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [broadcastIncidents, setBroadcastIncidents] = useState<BroadcastIncident[]>([]);
  const [colorConfig, setColorConfig] = useState<ColorMapping[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null);

  // Floorplan navigation state
  const [currentView, setCurrentView] = useState<'streetmap' | 'floorplan'>('streetmap');
  const [selectedBuildingName, setSelectedBuildingName] = useState<string | null>(null);
  const [selectedFloorName, setSelectedFloorName] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [shiftIds, setShiftIds] = useState<Record<string, number>>({});

  useEffect(() => {
    // Load today's shifts and resolve current shift to its ID
    const loadShiftIds = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const res = await fetch('http://localhost:8000/api/shifts?date=' + today);
        if (!res.ok) return;
        const shifts = await res.json();
        const ids: Record<string, number> = {};
        for (const s of shifts) {
          ids[s.shift_code] = s.id;
        }
        setShiftIds(ids);
      } catch {
        // Silently fail - shift lookup is best-effort
      }
    };
    loadShiftIds();
  }, []);

  const loadIncidents = async () => {
    try {
      const params: Record<string, string | number> = { include_archived: 1 };
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.type = filterType;

      const data = await getIncidents(params as Record<string, string>);
      setIncidents(data);
    } catch (err) {
      console.error('Failed to load incidents:', err);
    }
  };

  const loadBroadcast = async () => {
    try {
      const [broadcast, config] = await Promise.all([
        getBroadcastIncidents(24),
        getColorConfig(),
      ]);
      setBroadcastIncidents(broadcast);
      setColorConfig(config);
    } catch (err) {
      console.error('Failed to load broadcast data:', err);
    }
  };

  useEffect(() => {
    loadIncidents();
    loadBroadcast();
  }, [filterType, filterStatus, filterShift]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadBroadcast();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleIncidentCreated = () => {
    loadIncidents();
    setFormOpen(false);
    setEditingIncident(null);
  };

  const handleIncidentUpdated = () => {
    loadIncidents();
    setFormOpen(false);
    setEditingIncident(null);
  };

  const handleMapClick = () => {
    setEditingIncident(null);
    setFormOpen(true);
  };

  const handleCurrentViewChange = (view: 'streetmap' | 'floorplan') => {
    setCurrentView(view);
  };

  const handleBuildingSelect = (_buildingId: string | null, buildingName?: string) => {
    setSelectedBuildingName(buildingName || null);
  };

  const handleFloorSelect = (_floorId: string | null, floorName?: string) => {
    setSelectedFloorName(floorName || null);
  };

  const handleIncidentEdit = (incident: Incident) => {
    setEditingIncident(incident);
    setFormOpen(true);
  };

  const handleIncidentSelect = (incident: Incident) => {
    setSelectedIncidentId(incident.id);
  };

  const handleDeleteIncident = async (id: string) => {
    if (!confirm('Are you sure you want to delete this incident?')) return;
    try {
      await (window as any).deleteIncident?.(id);
      loadIncidents();
    } catch (err) {
      console.error('Failed to delete incident:', err);
    }
  };

  const getShiftInfo = () => {
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    if (hour < 6.5 || hour >= 22.5) return { name: 'Night Shift', icon: '🌙' };
    if (hour < 14.5) return { name: 'Day Shift', icon: '☀️' };
    return { name: 'Evening Shift', icon: '🌇' };
  };

  const [currentShift, setCurrentShift] = useState(getShiftInfo().name);
  const [shiftIcon, setShiftIcon] = useState(getShiftInfo().icon);

  useEffect(() => {
    const interval = setInterval(() => {
      const info = getShiftInfo();
      setCurrentShift(info.name);
      setShiftIcon(info.icon);
    }, 60000); // check every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="dashboard-container">
      {/* Header Bar */}
      <header className="dashboard-header">
        <div className="header-left">
          <span className="header-icon">{shiftIcon}</span>
          <div>
            <div className="header-title">Officer Dashboard</div>
            <div className="header-subtitle">BJC Public Safety — Barnes-Jewish Hospital</div>
          </div>
        </div>

        <div className="header-right">
          <div className="header-badge">
            <span className="pulse"></span>
            {shiftIcon} {currentShift}
          </div>
          <div className="header-time">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</div>
          {user && (
            <div className="header-user">
              <span>👤</span>
              <span>{user.username}</span>
            </div>
          )}
          <button className="header-logout" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {/* Body: Sidebar + Map side by side */}
      <div className="dashboard-body">
        {/* Sidebar */}
        <Sidebar
          incidents={incidents}
          selectedIncidentId={selectedIncidentId}
          onIncidentSelect={handleIncidentSelect}
          onMapClick={handleMapClick}
          onIncidentCreated={handleIncidentCreated}
          onIncidentUpdated={handleIncidentUpdated}
          onIncidentEdit={handleIncidentEdit}
          onIncidentDelete={handleDeleteIncident}
          filterType={filterType}
          filterStatus={filterStatus}
          filterShift={filterShift}
          shiftIds={shiftIds}
          onFilterTypeChange={setFilterType}
          onFilterStatusChange={setFilterStatus}
          onFilterShiftChange={setFilterShift}
        />

        {/* Map */}
        <div className="map-container">
        <OfficerMap
          incidents={incidents}
          broadcastIncidents={broadcastIncidents}
          colorConfig={colorConfig}
          onIncidentClick={handleIncidentSelect}
          onMapClick={handleMapClick}
          selectedIncidentId={selectedIncidentId}
          currentView={currentView}
          onCurrentViewChange={handleCurrentViewChange}
          onBuildingSelect={handleBuildingSelect}
          onFloorSelect={handleFloorSelect}
        />

        <div className="map-overlay">
          <button className="map-btn new-incident-btn-map" onClick={() => { setEditingIncident(null); setFormOpen(true); }}>
            + New Incident
          </button>
          <button className="map-btn" onClick={loadIncidents}>
            ↻ Refresh
          </button>
          <button className="map-btn" onClick={() => window.open('https://www.openstreetmap.org', '_blank')}>
            🗺️ Open in OSM
          </button>
        </div>
      </div>
      </div>

      {/* Incident Form Modal */}
      {formOpen && (
        <IncidentForm
          isOpen={formOpen}
          onClose={() => { setFormOpen(false); setEditingIncident(null); }}
          onSubmit={editingIncident ? handleIncidentUpdated : handleIncidentCreated}
          editIncident={editingIncident}
          initialShift={filterShift}
          preSelectedBuilding={selectedBuildingName}
          preSelectedFloor={selectedFloorName}
        />
      )}
    </div>
  );
}

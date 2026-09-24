import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ViewSwitcher from './ViewSwitcher';
import Sidebar from './Sidebar';
import OfficerMap from './OfficerMap';
import IncidentForm from './IncidentForm';
import type { Incident, BroadcastIncident, ColorMapping, FloorplanEntry } from '../types';
import {
  getIncidents,
  getBroadcastIncidents,
  getColorConfig,
  getShiftsByDate,
} from '../api/endpoints';

const VIEW_KEY = 'pusecgis_view';

type ViewId = 'officer' | 'broadcast';

export default function OfficerPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentView, setCurrentView] = useState<ViewId>(
    (localStorage.getItem(VIEW_KEY) as ViewId) || 'officer'
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, currentView);
  }, [currentView]);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [broadcastIncidents, setBroadcastIncidents] = useState<BroadcastIncident[]>([]);
  const [colorConfig, setColorConfig] = useState<ColorMapping[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null);

  // Floorplan navigation state
  const [mapView, setMapView] = useState<'streetmap' | 'floorplan'>('streetmap');
  const [selectedBuildingName, setSelectedBuildingName] = useState<string | null>(null);
  const [selectedFloorName, setSelectedFloorName] = useState<string | null>(null);

  // Map placement state (Task 3)
  const [placementMode, setPlacementMode] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedFloorplanPin, setSelectedFloorplanPin] = useState<{ floorplan_version_id: number | string; floorplan_x: number; floorplan_y: number } | null>(null);
  const [floorplanSelection, setFloorplanSelection] = useState<{ entry: FloorplanEntry } | null>(null);

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
        const shifts = await getShiftsByDate(today);
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
      const params: Record<string, string | number> = {};
      if (filterStatus === 'archived') params.include_archived = 1;
      if (filterStatus && filterStatus !== 'archived') params.status = filterStatus;
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
    setFloorplanSelection(null);
    setPlacementMode(false);
    setSelectedCoords(null);
    setSelectedFloorplanPin(null);
  };

  const handleIncidentUpdated = () => {
    loadIncidents();
    setFormOpen(false);
    setEditingIncident(null);
    setFloorplanSelection(null);
    setPlacementMode(false);
    setSelectedCoords(null);
    setSelectedFloorplanPin(null);
  };

  // Handle map clicks for placement (Task 3)
  const handleMapClick = (lat?: number, lng?: number) => {
    if (lat != null && lng != null && placementMode) {
      setSelectedCoords({ latitude: lat, longitude: lng });
      setFormOpen(true);
      if (!editingIncident) setEditingIncident(null);
      setPlacementMode(false);
    }
  };

  const handleFloorplanPinClick = (pin: { floorplan_version_id: number | string; floorplan_x: number; floorplan_y: number }) => {
    if (!placementMode) return;
    setSelectedFloorplanPin(pin);
    setSelectedCoords(null);
    setPlacementMode(false);
    setFormOpen(true);
    if (!editingIncident) setEditingIncident(null);
  };

  // Toggle placement mode
  const handleSetLocationOnMap = () => {
    setPlacementMode(true);
    setSelectedCoords(null);
    setSelectedFloorplanPin(null);
    setFormOpen(true);
    setEditingIncident(null);
  };

  const handleRequestPinPlacement = () => {
    setPlacementMode(true);
    setSelectedCoords(null);
    setSelectedFloorplanPin(null);
    setFormOpen(false);
  };

  const handleCurrentViewChange = (view: 'streetmap' | 'floorplan') => {
    setMapView(view);
  };

  const handleBuildingSelect = (_buildingId: string | null, buildingName?: string) => {
    setSelectedBuildingName(buildingName || null);
  };

  const handleFloorSelect = (_floorId: string | null, floorName?: string) => {
    setSelectedFloorName(floorName || null);
  };

  const handleIncidentEdit = (incident: Incident) => {
    setEditingIncident(incident);
    setSelectedFloorplanPin(incident.floorplan_version_id != null && incident.floorplan_x != null && incident.floorplan_y != null
      ? { floorplan_version_id: incident.floorplan_version_id, floorplan_x: incident.floorplan_x, floorplan_y: incident.floorplan_y }
      : null);
    setFloorplanSelection(incident.floorplan_version
      ? { entry: {
          floor_id: incident.floorplan_version.floor_id || `version-${incident.floorplan_version.id}`,
          campus: incident.floorplan_version.campus,
          building: incident.floorplan_version.building,
          building_id: incident.floorplan_version.building_id,
          floor_name: incident.floorplan_version.floor_name,
          image: incident.floorplan_version.image,
          bounds: incident.floorplan_version.bounds,
          rotation: incident.floorplan_version.rotation,
          floorplan_version_id: incident.floorplan_version.id,
        } }
      : null);
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

  const handleViewSwitch = (view: ViewId) => {
    setCurrentView(view);
    localStorage.setItem(VIEW_KEY, view);
    if (view !== 'officer') {
      navigate(`/${view}`);
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
          <ViewSwitcher currentView={currentView} onSwitch={handleViewSwitch} />
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
          colorConfig={colorConfig}
          selectedIncidentId={selectedIncidentId}
          onIncidentSelect={handleIncidentSelect}
          onMapClick={handleSetLocationOnMap}
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
          onFloorplanPinClick={handleFloorplanPinClick}
          selectedIncidentId={selectedIncidentId}
          currentView={mapView}
          onCurrentViewChange={handleCurrentViewChange}
          onBuildingSelect={handleBuildingSelect}
          onFloorSelect={handleFloorSelect}
          floorplanSelection={floorplanSelection}
          placementMode={placementMode}
          onPlacementModeToggle={() => setPlacementMode((m) => !m)}
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
          onClose={() => { setFormOpen(false); setEditingIncident(null); setPlacementMode(false); setSelectedCoords(null); }}
          onSubmit={editingIncident ? handleIncidentUpdated : handleIncidentCreated}
          editIncident={editingIncident}
          initialShift={filterShift}
          preSelectedBuilding={selectedBuildingName}
          preSelectedFloor={selectedFloorName}
          coordinates={selectedCoords}
          floorplanPin={selectedFloorplanPin}
          onRequestPinPlacement={handleRequestPinPlacement}
        />
      )}
    </div>
  );
}

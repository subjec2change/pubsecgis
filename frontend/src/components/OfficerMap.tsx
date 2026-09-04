import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Incident, BroadcastIncident, ColorMapping } from '../types';
import { DEFAULT_COLOR_MAP, INCIDENT_TYPE_LABELS } from '../types';

interface OfficerMapProps {
  incidents: Incident[];
  broadcastIncidents: BroadcastIncident[];
  colorConfig: ColorMapping[];
  onIncidentClick?: (incident: Incident) => void;
  onMapClick?: (lat: number, lng: number) => void;
  selectedIncidentId?: string | null;
  center?: [number, number];
  zoom?: number;
  currentView?: 'streetmap' | 'floorplan';
  onCurrentViewChange?: (view: 'streetmap' | 'floorplan') => void;
  onBuildingSelect?: (buildingId: string | null, buildingName?: string) => void;
  onFloorSelect?: (floorId: string | null, floorName?: string) => void;
}

export default function OfficerMap({
  incidents,
  broadcastIncidents,
  colorConfig,
  onIncidentClick,
  onMapClick,
  selectedIncidentId,
  center = [38.6270, -90.2418],
  zoom = 17,
  currentView = 'streetmap',
  onCurrentViewChange,
  onBuildingSelect,
  onFloorSelect,
}: OfficerMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const broadcastMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const floorplanLayersRef = useRef<L.LayerGroup | null>(null);
  const streetLayersRef = useRef<L.Layer | null>(null);
  const broadcastMarkerPositionsRef = useRef<Map<string, [number, number]>>(new Map());


  // Placeholder floorplan buildings (ready to replace with real floorplan images)
  const floorplanBuildings = [
    { id: 'main-building', name: 'Main Building', color: '#3B82F6', bounds: [[38.6273, -90.2425], [38.6271, -90.2415]], floors: [{ id: 'a1', name: 'Floor 1 - Lobby' }, { id: 'a2', name: 'Floor 2 - Offices' }, { id: 'a3', name: 'Floor 3 - Medical' }] },
    { id: 'childrens-hospital', name: "Children's Hospital", color: '#22C55E', bounds: [[38.6265, -90.2420], [38.6260, -90.2410]], floors: [{ id: 'c1', name: 'Floor 1 - ER' }, { id: 'c2', name: 'Floor 2 - Inpatient' }, { id: 'c3', name: 'Floor 3 - ICN' }] },
    { id: 'adult-ed', name: 'Adult ED', color: '#EF4444', bounds: [[38.6268, -90.2412], [38.6264, -90.2405]], floors: [{ id: 'd1', name: 'Floor 1 - Triage' }, { id: 'd2', name: 'Floor 2 - Consults' }] },
    { id: 'parking-garage', name: 'Parking Garage', color: '#6B7280', bounds: [[38.6275, -90.2408], [38.6272, -90.2400]], floors: [{ id: 'g1', name: 'Level -1' }, { id: 'g2', name: 'Level -2' }] },
  ];

  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

  useEffect(() => {
    if (currentView === 'floorplan') {
      const map = mapRef.current;
      if (map) {
        // Hide street map tiles — remove layer, hide opacity, and hide tile pane div
        if (streetLayersRef.current) {
          (streetLayersRef.current as any).setOpacity(0);
          map.removeLayer(streetLayersRef.current);
        }
        // Also hide the tile pane div directly
        const tilePane = map.getContainer().querySelector('.leaflet-tile-pane');
        if (tilePane) {
          (tilePane as HTMLElement).style.display = 'none';
        }
        // Pan/zoom to the building area so rectangles are clearly visible
        map.setView([38.6268, -90.2418], 18, { animate: false });
        // Always ensure floorplan layer exists and is visible
        if (!floorplanLayersRef.current) {
          const fg = L.layerGroup();
          floorplanBuildings.forEach((building) => {
            const [sw, ne] = building.bounds as [L.LatLngTuple, L.LatLngTuple];
            const rectangle = L.rectangle(building.bounds as L.LatLngBoundsLiteral, {
              color: '#ffffff',
              fillColor: building.color,
              fillOpacity: 0.5,
              weight: 2,
              dashArray: '5 5',
            }).addTo(fg);
            rectangle.on('click', () => {
              const isSelected = selectedBuildingId === building.id;
              if (isSelected) {
                setSelectedBuildingId(null);
                setSelectedFloorId(null);
                onBuildingSelect?.(null);
                onFloorSelect?.(null);
              } else {
                setSelectedBuildingId(building.id);
                setSelectedFloorId(null);
                onBuildingSelect?.(building.id, building.name);
                onFloorSelect?.(null);
              }
            });
            if (building.floors && building.floors.length > 0) {
              building.floors.forEach((floor) => {
                const center: L.LatLngTuple = [
                  (sw[0] + ne[0]) / 2,
                  (sw[1] + ne[1]) / 2,
                ];
                const floorMarker = L.circleMarker(center, {
                  radius: 6,
                  fillColor: '#ffffff',
                  fillOpacity: 0.8,
                  color: building.color,
                  weight: 2,
                }).addTo(fg);
                floorMarker.bindPopup(`<strong>${floor.name}</strong>`);
              });
            }
            const center: L.LatLngTuple = [
              (sw[0] + ne[0]) / 2,
              (sw[1] + ne[1]) / 2,
            ];
            L.marker(center as L.LatLngExpression, {
              icon: L.divIcon({
                className: 'floorplan-label',
                html: `<div style="color: ${building.color}; font-weight: 700; font-size: 12px; font-family: 'IBM Plex Sans', sans-serif; text-shadow: 0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.6); text-align: center; white-space: nowrap; pointer-events: none;">${building.name}</div>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
              }),
              interactive: false,
            }).addTo(fg);
          });
          fg.addTo(map);
          (fg as any).bringToFront();
          floorplanLayersRef.current = fg;
        }
        (floorplanLayersRef.current as any).setOpacity(1);
        (floorplanLayersRef.current as any).bringToFront();
      }
    } else {
      // Show tiles, hide floorplan
      const map = mapRef.current;
      if (map) {
        // Restore tile pane visibility
        const tilePane = map.getContainer().querySelector('.leaflet-tile-pane');
        if (tilePane) {
          (tilePane as HTMLElement).style.display = '';
        }
        if (streetLayersRef.current) {
          (streetLayersRef.current as any).setOpacity(1);
          map.addLayer(streetLayersRef.current);
        }
        // Hide floorplan
        if (floorplanLayersRef.current) {
          (floorplanLayersRef.current as any).setOpacity(0);
        }
      }
    }
  }, [currentView]);

  const colorMap = useMemo(() => {
    const map: Record<string, string> = { ...DEFAULT_COLOR_MAP };
    colorConfig.forEach((c) => {
      map[c.incident_type] = c.color;
    });
    return map;
  }, [colorConfig]);

  const seededRandom = useCallback((seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    return () => {
      hash = (hash * 1664525 + 1013904223) | 0;
      return (hash >>> 0) / 4294967296;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(center, zoom);
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    streetLayersRef.current = tileLayer;
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    });

    return () => {
      map.off('click');
      map.remove();
      mapRef.current = null;
    };
  }, [onMapClick]);

  // CRITICAL: Only update view when center/zoom actually change (not on every render)
  const prevCenterRef = useRef<[number, number]>([38.6270, -90.2418]);
  const prevZoomRef = useRef<number>(17);

  // Update center/zoom without recreating the map
  useEffect(() => {
    const map = mapRef.current;
    if (map) {
      // Only update if values actually changed (not just reference)
      if (prevCenterRef.current[0] !== center[0] ||
          prevCenterRef.current[1] !== center[1] ||
          prevZoomRef.current !== zoom) {
        map.setView(center, zoom, { animate: true, duration: 0.5 });
        prevCenterRef.current = center;
        prevZoomRef.current = zoom;
      }
    }
  }, [center, zoom]);

  // Fix map pulsing: don't reposition markers on every render, only on incident changes
  const markersInitializedRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker, id) => {
      const activeIncident = incidents.find((i) => i.id === id && i.status !== 'archived');
      if (!activeIncident) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    incidents.filter((i) => i.status !== 'archived').forEach((incident) => {
      const color = colorMap[incident.incident_type] || '#666666';
      const isSelected = selectedIncidentId === incident.id;

      if (markersRef.current.has(incident.id)) {
        const marker = markersRef.current.get(incident.id)!;
        marker.setStyle({
          fillColor: color,
          fillOpacity: 0.8,
          color: isSelected ? '#ffffff' : color,
          weight: isSelected ? 4 : 2,
          radius: isSelected ? 18 : 12,
        });
      } else {
        // Only position new markers, never reposition existing ones
        const random = seededRandom(incident.id);
        const latOffset = (random() - 0.5) * 0.0008;
        const lngOffset = (random() - 0.5) * 0.0008;
        const latLng: [number, number] = [center[0] + latOffset, center[1] + lngOffset];

        const marker = L.circleMarker(latLng, {
          radius: 12,
          fillColor: color,
          fillOpacity: 0.8,
          color: color,
          weight: 2,
        }).addTo(map);

        if (isSelected) {
          marker.setStyle({ weight: 4, radius: 18, color: '#ffffff' });
        }

        marker.bindPopup(
          `<strong>${INCIDENT_TYPE_LABELS[incident.incident_type] || incident.incident_type}</strong><br/>` +
          `Status: ${incident.status}<br/>` +
          (incident.description ? `<br/>${incident.description}` : '')
        );

        marker.on('click', () => {
          if (onIncidentClick) {
            onIncidentClick(incident);
          }
        });

        markersRef.current.set(incident.id, marker);
      }
    });

    // Mark markers as initialized after first render
    if (incidents.length > 0) {
      markersInitializedRef.current = true;
    }
  }, [incidents, colorMap, selectedIncidentId, seededRandom, onIncidentClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove markers for incidents no longer in broadcastIncidents
    broadcastMarkersRef.current.forEach((marker, id) => {
      if (!broadcastIncidents.find((bi) => bi.id === id)) {
        marker.remove();
        broadcastMarkersRef.current.delete(id);
        broadcastMarkerPositionsRef.current.delete(id);
      }
    });

    broadcastIncidents.forEach((bi) => {
      const color = colorMap[bi.incident_type] || '#666666';

      if (broadcastMarkersRef.current.has(bi.id)) {
        // Update existing marker style only
        const marker = broadcastMarkersRef.current.get(bi.id)!;
        marker.setStyle({
          fillColor: color,
          fillOpacity: 0.3,
          color: color,
          weight: 1,
          dashArray: '4 4',
        });
      } else {
        // Create new marker with persisted position
        let position = broadcastMarkerPositionsRef.current.get(bi.id);
        if (!position) {
          const random = seededRandom(bi.id || bi.created_at);
          const latOffset = (random() - 0.5) * 0.0006;
          const lngOffset = (random() - 0.5) * 0.0006;
          position = [center[0] + latOffset, center[1] + lngOffset];
          broadcastMarkerPositionsRef.current.set(bi.id, position);
        }

        const marker = L.circleMarker(position as L.LatLngTuple, {
          radius: 8,
          fillColor: color,
          fillOpacity: 0.3,
          color: color,
          weight: 1,
          dashArray: '4 4',
        }).addTo(map);

        (marker as any)._isBroadcast = true;

        marker.bindPopup(
          `<strong>[Broadcast]</strong> ${INCIDENT_TYPE_LABELS[bi.incident_type] || bi.incident_type}<br/>` +
          (bi.description ? `<br/>${bi.description}` : '')
        );

        broadcastMarkersRef.current.set(bi.id, marker);
      }
    });
  }, [broadcastIncidents, colorMap, seededRandom]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {/* Floorplan View Switcher */}
      <div style={{
        position: 'absolute', top: '1rem', left: '1rem', zIndex: 1000,
        background: 'rgba(11, 18, 25, 0.95)', border: '1px solid var(--border)',
        padding: '0.75rem 1rem', borderRadius: '6px',
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => onCurrentViewChange?.('streetmap')}
            style={{
              padding: '0.4rem 0.75rem',
              background: currentView === 'streetmap' ? '#3B82F6' : 'transparent',
              color: currentView === 'streetmap' ? '#ffffff' : 'var(--text-secondary)',
              border: `1px solid ${currentView === 'streetmap' ? '#3B82F6' : 'var(--border)'}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 500,
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            Street Map
          </button>
          <button
            onClick={() => onCurrentViewChange?.('floorplan')}
            style={{
              padding: '0.4rem 0.75rem',
              background: currentView === 'floorplan' ? '#3B82F6' : 'transparent',
              color: currentView === 'floorplan' ? '#ffffff' : 'var(--text-secondary)',
              border: `1px solid ${currentView === 'floorplan' ? '#3B82F6' : 'var(--border)'}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 500,
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            Floorplan
          </button>
        </div>
      </div>
      {/* Building/Floor Selection Panel */}
      {currentView === 'floorplan' && (
        <div style={{
          position: 'absolute', top: '1rem', right: '1rem', zIndex: 1000,
          background: 'rgba(11, 18, 25, 0.95)', border: '1px solid var(--border)',
          padding: '0.75rem 1rem', borderRadius: '6px',
          fontFamily: "'IBM Plex Sans', sans-serif",
          maxWidth: '280px',
        }}>
          <div style={{
            fontWeight: 600,
            color: 'var(--text-bright)',
            marginBottom: '0.5rem',
            fontSize: '0.75rem',
            letterSpacing: '0.1em',
          }}>
            CURRENT LOCATION
          </div>
          {/* Building selector */}
          <div style={{
            background: selectedBuildingId ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            border: selectedBuildingId ? '1px solid #3B82F6' : '1px solid var(--border)',
            borderRadius: '4px',
            padding: '0.5rem',
            marginBottom: '0.5rem',
          }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              BUILDING
            </div>
            <div style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: selectedBuildingId ? '#ffffff' : 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {floorplanBuildings.find((b) => b.id === selectedBuildingId)?.name || 'None selected'}
            </div>
          </div>
          {/* Floor selector */}
          {selectedBuildingId && (
            <div style={{
              background: selectedFloorId ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              border: selectedFloorId ? '1px solid #3B82F6' : '1px solid var(--border)',
              borderRadius: '4px',
              padding: '0.5rem',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                FLOOR
              </div>
              <div style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: selectedFloorId ? '#ffffff' : 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {floorplanBuildings.find((b) => b.id === selectedBuildingId)?.floors?.find((f) => f.id === selectedFloorId)?.name || 'None selected'}
              </div>
            </div>
          )}
          {/* Reset button */}
          {(selectedBuildingId || selectedFloorId) && (
            <button
              onClick={() => {
                setSelectedBuildingId(null);
                setSelectedFloorId(null);
                onBuildingSelect?.(null);
                onFloorSelect?.(null);
              }}
              style={{
                width: '100%',
                marginTop: '0.5rem',
                padding: '0.4rem',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontFamily: "'IBM Plex Sans', sans-serif",
              }}
            >
              Clear Selection
            </button>
          )}
        </div>
      )}
      {/* Map Legend */}
      <div style={{
        position: 'absolute', bottom: '1rem', left: '1rem', zIndex: 1000,
        background: 'rgba(11, 18, 25, 0.95)', border: '1px solid var(--border)',
        padding: '0.75rem 1rem', fontSize: '0.65rem',
        fontFamily: "'IBM Plex Mono', monospace",
      }}>
        <div style={{ fontWeight: 600, color: 'var(--text-bright)', marginBottom: '0.5rem', letterSpacing: '0.1em' }}>
          INCIDENT TYPES
        </div>
        {Object.entries(DEFAULT_COLOR_MAP).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            <span style={{ color: 'var(--text-secondary)' }}>
              {INCIDENT_TYPE_LABELS[type as keyof typeof INCIDENT_TYPE_LABELS] || type}
            </span>
          </div>
        ))}
        <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-bright)', marginBottom: '0.5rem', letterSpacing: '0.1em' }}>
            STATUS
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Open</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f97316' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Escalating</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Monitoring</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Resolved</span>
          </div>
        </div>
      </div>
    </div>
  );
}

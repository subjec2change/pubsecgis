import { useEffect, useRef, useCallback, useMemo } from 'react';
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
  onMapReady?: (map: L.Map) => void;
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
}: OfficerMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const floorplanLayersRef = useRef<L.LayerGroup | null>(null);
  const streetLayersRef = useRef<L.Layer | null>(null);

  // Placeholder floorplan buildings (ready to replace with real floorplan images)
  const floorplanBuildings = [
    { name: 'Main Building', color: '#3B82F6', bounds: [[38.6273, -90.2425], [38.6271, -90.2415]] },
    { name: 'Children\'s Hospital', color: '#22C55E', bounds: [[38.6265, -90.2420], [38.6260, -90.2410]] },
    { name: 'Adult ED', color: '#EF4444', bounds: [[38.6268, -90.2412], [38.6264, -90.2405]] },
    { name: 'Parking Garage', color: '#6B7280', bounds: [[38.6275, -90.2408], [38.6272, -90.2400]] },
  ];

  useEffect(() => {
    if (currentView === 'floorplan') {
      const map = mapRef.current;
      if (map) {
        // Show floorplan overlay, hide tiles (no remove — just hide)
        if (streetLayersRef.current) {
          (streetLayersRef.current as any).setOpacity(0);
        }
        if (!floorplanLayersRef.current) {
          const fg = L.layerGroup();
          floorplanBuildings.forEach((building) => {
            const [sw, ne] = building.bounds as [L.LatLngTuple, L.LatLngTuple];
            L.rectangle(building.bounds as L.LatLngBoundsLiteral, {
              color: building.color,
              fillColor: building.color,
              fillOpacity: 0.25,
              weight: 2,
              dashArray: '5 5',
            }).addTo(fg);
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
          floorplanLayersRef.current = fg;
        }
      }
    } else {
      // Street map mode - show tiles, hide floorplan
      if (streetLayersRef.current) {
        (streetLayersRef.current as any).setOpacity(1);
      }
      if (floorplanLayersRef.current) {
        (floorplanLayersRef.current as any).setOpacity(0);
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
  }, [center, zoom, onMapClick]);

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
  }, [incidents, colorMap, selectedIncidentId, center, seededRandom, onIncidentClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.eachLayer((layer) => {
      if ((layer as any)._isBroadcast) {
        map.removeLayer(layer);
      }
    });

    broadcastIncidents.forEach((bi) => {
      const random = seededRandom(bi.id || bi.created_at);
      const latOffset = (random() - 0.5) * 0.0006;
      const lngOffset = (random() - 0.5) * 0.0006;
      const latLng: [number, number] = [center[0] + latOffset, center[1] + lngOffset];

      const color = colorMap[bi.incident_type] || '#666666';

      const marker = L.circleMarker(latLng, {
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
    });
  }, [broadcastIncidents, colorMap, center, seededRandom]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
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

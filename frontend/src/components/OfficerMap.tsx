import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import type { Incident, BroadcastIncident, ColorMapping } from '../types';
import { DEFAULT_COLOR_MAP, INCIDENT_TYPE_LABELS } from '../types';
import { getHeatmapData } from '../api/endpoints';
import FloorplanSelector from './FloorplanSelector';
import floorplans from '../data/floorplans.json';

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
  /** When true, map clicks create incidents instead of selecting */
  placementMode?: boolean;
  onPlacementModeToggle?: () => void;
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
  placementMode = false,
  onPlacementModeToggle,
}: OfficerMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const broadcastMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const floorplanLayersRef = useRef<L.LayerGroup | null>(null);
  const floorplanImageRef = useRef<L.ImageOverlay | null>(null);
  const streetLayersRef = useRef<L.Layer | null>(null);
  const broadcastMarkerPositionsRef = useRef<Map<string, [number, number]>>(new Map());
  const activeHeatmapRef = useRef<L.Layer | null>(null);
  const heatmapLegendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placementModeRef = useRef(placementMode);
  placementModeRef.current = placementMode;

  // Import shared coordinate resolver (Task 4)
  const getIncidentCoords = useCallback((incidentList: typeof incidents) => {
    // Inline implementation of the same logic as src/utils/incident-coords
    // to avoid module import issues during map initialization
    const ACTIVE_STATUSES = ['open', 'monitoring', 'escalating'];
    const clat = center[0];
    const clng = center[1];

    return incidentList
      .filter((incident) => ACTIVE_STATUSES.includes(incident.status))
      .map((incident) => {
        let lat: number;
        let lng: number;

        if (incident.latitude != null && incident.longitude != null) {
          lat = incident.latitude;
          lng = incident.longitude;
        } else {
          // Deterministic fallback using seeded random (same as utility)
          let hash = 0;
          for (let i = 0; i < incident.id.length; i++) {
            hash = ((hash << 5) - hash + incident.id.charCodeAt(i)) | 0;
          }
          const random = () => {
            hash = (hash * 1664525 + 1013904223) | 0;
            return (hash >>> 0) / 4294967296;
          };
          lat = clat + (random() - 0.5) * 0.0008;
          lng = clng + (random() - 0.5) * 0.0008;
        }

        return { lat, lng, intensity: incident.status === 'open' ? 3 : incident.status === 'escalating' ? 2 : 1 };
      });
  }, [center]);

  // Store callbacks in refs so they don't trigger re-renders (same pattern as kiosk)
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onIncidentClickRef = useRef(onIncidentClick);
  onIncidentClickRef.current = onIncidentClick;
  const onCurrentViewChangeRef = useRef(onCurrentViewChange);
  onCurrentViewChangeRef.current = onCurrentViewChange;
  const onBuildingSelectRef = useRef(onBuildingSelect);
  onBuildingSelectRef.current = onBuildingSelect;
  const onFloorSelectRef = useRef(onFloorSelect);
  onFloorSelectRef.current = onFloorSelect;

  // Heatmap state
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapLegendVisible, setHeatmapLegendVisible] = useState(false);

  // Placeholder floorplan buildings (ready to replace with real floorplan images)
  const floorplanBuildings = [
    { id: 'main-building', name: 'Main Building', color: '#3B82F6', bounds: [[38.6300, -90.2460], [38.6250, -90.2380]], floors: [{ id: 'a1', name: 'Floor 1 - Lobby' }, { id: 'a2', name: 'Floor 2 - Offices' }, { id: 'a3', name: 'Floor 3 - Medical' }] },
    { id: 'childrens-hospital', name: "Children's Hospital", color: '#22C55E', bounds: [[38.6300, -90.2460], [38.6250, -90.2380]], floors: [{ id: 'c1', name: 'Floor 1 - ER' }, { id: 'c2', name: 'Floor 2 - Inpatient' }, { id: 'c3', name: 'Floor 3 - ICN' }] },
    { id: 'adult-ed', name: 'Adult ED', color: '#EF4444', bounds: [[38.6300, -90.2460], [38.6250, -90.2380]], floors: [{ id: 'd1', name: 'Floor 1 - Triage' }, { id: 'd2', name: 'Floor 2 - Consults' }] },
    { id: 'parking-garage', name: 'Parking Garage', color: '#6B7280', bounds: [[38.6300, -90.2460], [38.6250, -90.2380]], floors: [{ id: 'g1', name: 'Level -1' }, { id: 'g2', name: 'Level -2' }] },
  ];

  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (currentView === 'floorplan') {
      // Keep tiles underneath, create floorplan overlay on top
      if (!floorplanLayersRef.current) {
        const fg = L.layerGroup();
        // Add a dark overlay rectangle covering the viewport
        const overlayBounds = [
          [38.60, -90.30],
          [38.65, -90.20],
        ] as L.LatLngBoundsLiteral;
        L.rectangle(overlayBounds, {
          color: 'transparent',
          fillColor: '#0b1219',
          fillOpacity: 0.92,
          weight: 0,
        }).addTo(fg);
        floorplanBuildings.forEach((building) => {
          const rectangle = L.rectangle(building.bounds as L.LatLngBoundsLiteral, {
            color: building.color,
            fillColor: building.color,
            fillOpacity: 0.4,
            weight: 2,
          }).addTo(fg);
          rectangle.on('click', () => {
            const isSelected = selectedBuildingId === building.id;
            if (isSelected) {
              setSelectedBuildingId(null);
              setSelectedFloorId(null);
              onBuildingSelectRef.current?.(null);
              onFloorSelectRef.current?.(null);
            } else {
              setSelectedBuildingId(building.id);
              setSelectedFloorId(null);
              onBuildingSelectRef.current?.(building.id, building.name);
              onFloorSelectRef.current?.(null);
            }
          });
          const [sw, ne] = building.bounds as [L.LatLngTuple, L.LatLngTuple];
          const center: L.LatLngTuple = [
            (sw[0] + ne[0]) / 2,
            (sw[1] + ne[1]) / 2,
          ];
          L.marker(center as L.LatLngExpression, {
            icon: L.divIcon({
              className: 'floorplan-label',
              html: `<div style="color: ${building.color}; font-weight: 700; font-size: 14px; font-family: 'IBM Plex Sans', sans-serif; text-shadow: 0 0 8px rgba(0,0,0,0.9); text-align: center; pointer-events: none;">${building.name}</div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            }),
            interactive: false,
          }).addTo(fg);
        });
        fg.addTo(map);
        floorplanLayersRef.current = fg;
      }
    } else {
      if (floorplanLayersRef.current) {
        map.removeLayer(floorplanLayersRef.current);
        floorplanLayersRef.current = null;
      }
    }
  }, [currentView]);

  // Handle floor selection: add/remove image overlay + fitBounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (currentView !== 'floorplan' || !selectedFloorId) {
      // Clear any existing overlay and reset view
      if (floorplanImageRef.current) {
        if (floorplanLayersRef.current) {
          floorplanLayersRef.current.removeLayer(floorplanImageRef.current);
        }
        map.removeLayer(floorplanImageRef.current);
        floorplanImageRef.current = null;
      }
      if (selectedFloorId && !selectedBuildingId) {
        // Floor was cleared
        map.flyTo(center, zoom, { animate: true, duration: 0.5 });
      }
      return;
    }

    // Find the selected floor's data
    let floorData: { image: string; bounds: number[][] } | undefined;
    for (const building of floorplans) {
      if (selectedBuildingId && building.buildingId === selectedBuildingId) {
        floorData = building.floors.find((f) => f.id === selectedFloorId);
        break;
      }
    }
    if (!floorData || !floorData.image) return;

    // Remove previous overlay if any
    if (floorplanImageRef.current) {
      if (floorplanLayersRef.current) {
        floorplanLayersRef.current.removeLayer(floorplanImageRef.current);
      }
      map.removeLayer(floorplanImageRef.current);
      floorplanImageRef.current = null;
    }

    // Convert bounds from [lat, lng] to Leaflet format
    const leafletBounds: [L.LatLngTuple, L.LatLngTuple] = [
      [floorData.bounds[0][0], floorData.bounds[0][1]],
      [floorData.bounds[1][0], floorData.bounds[1][1]],
    ];

    // Add image overlay
    const imageOverlay = L.imageOverlay(floorData.image, leafletBounds, {
      opacity: 0.85,
    }).addTo(map);
    floorplanImageRef.current = imageOverlay;

    // Zoom to floor bounds
    map.flyToBounds(leafletBounds, { animate: true, duration: 0.8, padding: [40, 40] });
  }, [selectedFloorId, selectedBuildingId, currentView, center, zoom]);

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

    // maxZoom 22 lets users zoom past the OSM tile ceiling to read floorplan
    // detail; maxNativeZoom 19 below keeps tile requests at OSM's real max.
    const map = L.map(containerRef.current, { maxZoom: 22 }).setView(center, zoom);
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 22,
      maxNativeZoom: 19,
    }).addTo(map);
    streetLayersRef.current = tileLayer;
    mapRef.current = map;

    // Use ref to avoid map recreation when onMapClick changes reference
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapClickRef.current) {
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
      }
    });

    // Add heatmap layer if initially enabled
    if (showHeatmap) {
    map.whenReady(async () => {
      try {
        const heatmapData = await getHeatmapData(center[0], center[1], 8047, 200);
        // Use shared coordinate resolver (same as markers) for heatmap points (Task 4)
        const resolvedPoints = getIncidentCoords(incidents);
        const heatPoints = resolvedPoints.map(
          (d) => [d.lat, d.lng, d.intensity] as L.HeatLatLngTuple,
        );
        const points = heatmapData.length > 0 ? heatmapData : heatPoints;
        if (points.length > 0 && mapRef.current) {
          let finalHeatPoints: L.HeatLatLngTuple[];
          if (heatmapData.length > 0) {
            finalHeatPoints = points as L.HeatLatLngTuple[];
          } else {
            finalHeatPoints = heatPoints;
          }
          const heatLayer = L.heatLayer(finalHeatPoints, {
            radius: 25,
            blur: 15,
            maxZoom: 18,
          }).addTo(map);
          activeHeatmapRef.current = heatLayer;
        }
      } catch (err) {
        console.error('Failed to load heatmap data:', err);
      }
    });
    }

    // Cleanup heatmap layer on map removal
    map.once('remove', () => {
      if (activeHeatmapRef.current) {
        map.removeLayer(activeHeatmapRef.current);
        activeHeatmapRef.current = null;
      }
    });

    return () => {
      map.off('click');
      map.remove();
      mapRef.current = null;
    };
  }, []); // Empty deps — map created once, persists like the kiosk

  const prevCenterRef = useRef<[number, number]>([38.6270, -90.2418]);
  const prevZoomRef = useRef<number>(17);

  // Update center/zoom without recreating the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    
    // Only update if values actually changed (not just reference)
    if (prevCenterRef.current[0] !== center[0] ||
        prevCenterRef.current[1] !== center[1] ||
        prevZoomRef.current !== zoom) {
      map.setView(center, zoom, { animate: true, duration: 0.5 });
      prevCenterRef.current = center;
      prevZoomRef.current = zoom;
    }
  }, [center, zoom]);

  // Toggle heatmap handler
  const handleHeatmapToggle = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const newShowHeatmap = !showHeatmap;
    setShowHeatmap(newShowHeatmap);

    if (newShowHeatmap) {
      // Turn on heatmap
      try {
        const heatmapData = await getHeatmapData(center[0], center[1], 8047, 200);
        // Use shared coordinate resolver (same as markers) for heatmap points (Task 4)
        const resolvedPoints = getIncidentCoords(incidents);
        const heatPoints = resolvedPoints.map(
          (d) => [d.lat, d.lng, d.intensity] as L.HeatLatLngTuple,
        );
        const points = heatmapData.length > 0 ? heatmapData : heatPoints;
        if (points.length > 0) {
          let finalHeatPoints: L.HeatLatLngTuple[];
          if (heatmapData.length > 0) {
            // heatmapData is already HeatLatLngTuple[]
            finalHeatPoints = points as L.HeatLatLngTuple[];
          } else {
            // resolvedPoints have { lat, lng, intensity } shape
            finalHeatPoints = resolvedPoints.map(
              (d) => [d.lat, d.lng, d.intensity] as L.HeatLatLngTuple,
            );
          }
          const heatLayer = L.heatLayer(finalHeatPoints, {
            radius: 25,
            blur: 15,
            maxZoom: 18,
          }).addTo(map);
          activeHeatmapRef.current = heatLayer;
        }
      } catch (err) {
        console.error('Failed to load heatmap data:', err);
        setShowHeatmap(false);
        return;
      }

      // Keep the legend visible while the heatmap is enabled.
      setHeatmapLegendVisible(true);
    } else {
      // Turn off heatmap
      if (activeHeatmapRef.current) {
        map.removeLayer(activeHeatmapRef.current);
        activeHeatmapRef.current = null;
      }
      setHeatmapLegendVisible(false);
      if (heatmapLegendTimerRef.current) {
        clearTimeout(heatmapLegendTimerRef.current);
      }
    }
  }, [showHeatmap, center]);

  // Reset fade timer on hover
  const handleLegendMouseEnter = useCallback(() => {
    if (heatmapLegendTimerRef.current) {
      clearTimeout(heatmapLegendTimerRef.current);
    }
  }, []);

  const handleLegendMouseLeave = useCallback(() => {
    heatmapLegendTimerRef.current = setTimeout(() => {
      setHeatmapLegendVisible(false);
    }, 500);
  }, []);

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

    // Use shared coordinate resolver for markers (Task 4: unified coords)
    const resolvedPoints = getIncidentCoords(incidents);

    incidents
      .filter((i) => ['open', 'monitoring', 'escalating'].includes(i.status))
      .forEach((incident) => {
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
          // Use the shared resolver to position markers and heatmap identically
          const point = resolvedPoints.find((p) => p.lat !== undefined);
          let latLng: [number, number];
          if (point) {
            // Check if this incident has real coords (not fallback)
            if (incident.latitude != null && incident.longitude != null) {
              latLng = [incident.latitude, incident.longitude] as [number, number];
            } else {
              // Deterministic fallback — same as getIncidentCoords
              const random = seededRandom(incident.id);
              latLng = [
                center[0] + (random() - 0.5) * 0.0008,
                center[1] + (random() - 0.5) * 0.0008,
              ];
            }
          } else {
            latLng = [center[0], center[1]];
          }

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
    console.log(`[BroadcastMarkers] effect fired, broadcastIncidents=${broadcastIncidents.length}, existingRefs=${broadcastMarkersRef.current.size}, existingPositions=${broadcastMarkerPositionsRef.current.size}`);

    // Remove markers for incidents no longer in broadcastIncidents
    broadcastMarkersRef.current.forEach((marker, id) => {
      if (!broadcastIncidents.find((bi) => bi.id === id)) {
        console.log(`[BroadcastMarkers] removing marker for id=${id}`);
        marker.remove();
        broadcastMarkersRef.current.delete(id);
        broadcastMarkerPositionsRef.current.delete(id);
      }
    });

    broadcastIncidents.forEach((bi) => {
      const color = colorMap[bi.incident_type] || '#666666';

      if (broadcastMarkersRef.current.has(bi.id)) {
        // Update existing marker style only
        console.log(`[BroadcastMarkers] updating style for existing marker id=${bi.id}`);
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
          console.log(`[BroadcastMarkers] creating new marker id=${bi.id} at [${position[0]},${position[1]}] from center [${center[0]},${center[1]}]`);
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
        console.log(`[BroadcastMarkers] created marker id=${bi.id}, total=${broadcastMarkersRef.current.size}`);
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
      {/* Heatmap Toggle & Legend */}
      <div style={{
        position: 'absolute', bottom: '1rem', right: '1rem', zIndex: 1000,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem',
      }}>
        {/* Legend - slides in when heatmap is active */}
        {heatmapLegendVisible && (
          <div
            style={{
              background: 'rgba(11, 18, 25, 0.95)',
              border: '1px solid var(--border)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: '0.6rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: heatmapLegendVisible ? 1 : 0,
              transform: heatmapLegendVisible ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 0.3s ease, transform 0.3s ease',
              pointerEvents: 'none',
            }}
            onMouseEnter={handleLegendMouseEnter}
            onMouseLeave={handleLegendMouseLeave}
          >
            <span style={{ color: '#d44a42' }}>🔴</span>
            <div style={{
              width: '60px',
              height: '8px',
              borderRadius: '4px',
              background: 'linear-gradient(to right, #dc2626, #eab308, #3b82f6)',
            }} />
            <span style={{ color: '#3b82f6' }}>🔵</span>
            <span style={{ color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>
              Hot → Cool
            </span>
          </div>
        )}
        {/* Heatmap Toggle Button */}
        <button
          onClick={handleHeatmapToggle}
          title={showHeatmap ? 'Hide Heatmap' : 'Show Heatmap'}
          style={{
            width: '2.25rem',
            height: '2.25rem',
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: showHeatmap ? 'rgba(220, 38, 38, 0.2)' : 'rgba(11, 18, 25, 0.95)',
            color: showHeatmap ? '#dc2626' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}
        >
          🔥
        </button>
        {/* Placement mode toggle (Task 3) */}
        {onPlacementModeToggle && (
          <button
            onClick={onPlacementModeToggle}
            title={placementMode ? 'Cancel map placement' : 'Place incident on map'}
            style={{
              width: '2.25rem',
              height: '2.25rem',
              borderRadius: '50%',
              border: `1px solid ${placementMode ? '#3B82F6' : 'var(--border)'}`,
              background: placementMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(11, 18, 25, 0.95)',
              color: placementMode ? '#3B82F6' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            📍
          </button>
        )}
      </div>
      {/* Floorplan Selection Panel (Task 3) */}
      {currentView === 'floorplan' && (
        <div style={{
          position: 'absolute', top: '1rem', right: '1rem', zIndex: 1000,
          background: 'rgba(11, 18, 25, 0.95)', border: '1px solid var(--border)',
          padding: '0.5rem', borderRadius: '6px',
        }}>
          <FloorplanSelector onFloorSelect={(floorId, floorName) => {
            if (!floorId) {
              setSelectedBuildingId(null);
              setSelectedFloorId(null);
            } else {
              const building = floorplans.find((b) => b.floors.some((f) => f.id === floorId));
              setSelectedBuildingId(building?.buildingId ?? null);
              setSelectedFloorId(floorId);
            }
            onFloorSelectRef.current?.(floorId || null, floorName || '');
          }} />
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

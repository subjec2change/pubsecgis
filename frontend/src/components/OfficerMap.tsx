import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import type { Incident, BroadcastIncident, ColorMapping, FloorplanEntry } from '../types';
import { DEFAULT_COLOR_MAP, INCIDENT_TYPE_LABELS } from '../types';
import { getHeatmapData, getFloorplans } from '../api/endpoints';
import FloorplanSelector from './FloorplanSelector';
import { floorplanIncidentPins, normalizedFloorplanPoint, escapeLeafletHtml } from '../utils/floorplan-pins';

interface OfficerMapProps {
  incidents: Incident[];
  broadcastIncidents: BroadcastIncident[];
  colorConfig: ColorMapping[];
  onIncidentClick?: (incident: Incident) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onFloorplanPinClick?: (pin: { floorplan_version_id: number | string; floorplan_x: number; floorplan_y: number }) => void;
  selectedIncidentId?: string | null;
  center?: [number, number];
  zoom?: number;
  currentView?: 'streetmap' | 'floorplan';
  onCurrentViewChange?: (view: 'streetmap' | 'floorplan') => void;
  onBuildingSelect?: (buildingId: string | null, buildingName?: string) => void;
  onFloorSelect?: (floorId: string | null, floorName?: string) => void;
  /** Exact floorplan selection to show when editing an incident pin. */
  floorplanSelection?: { entry: FloorplanEntry } | null;
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
  onFloorplanPinClick,
  selectedIncidentId,
  center = [38.6270, -90.2418],
  zoom = 17,
  currentView = 'streetmap',
  onCurrentViewChange,
  onBuildingSelect,
  onFloorSelect,
  floorplanSelection,
  placementMode = false,
  onPlacementModeToggle,
}: OfficerMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const broadcastMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const floorplanLayersRef = useRef<L.LayerGroup | null>(null);
  const floorplanImageRef = useRef<L.ImageOverlay | null>(null);
  const floorplanIncidentLayersRef = useRef<L.LayerGroup | null>(null);
  const streetLayersRef = useRef<L.Layer | null>(null);
  const broadcastMarkerPositionsRef = useRef<Map<string, [number, number]>>(new Map());
  const activeHeatmapRef = useRef<L.Layer | null>(null);
  const heatmapLegendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placementModeRef = useRef(placementMode);
  placementModeRef.current = placementMode;
  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;

  // Latest center/zoom props without re-triggering the overlay effect
  const centerRef = useRef<[number, number]>(center);
  centerRef.current = center;
  const zoomRef = useRef<number>(zoom);
  zoomRef.current = zoom;
  // Last floor we auto-fit to — prevents re-flying (and undoing user zoom)
  // when the effect re-runs for unrelated re-renders.
  const lastFlownFloorRef = useRef<string | null>(null);
  const lastFlownBuildingRef = useRef<string | null>(null);
  // Teardown for the floorplan rotation listeners (see overlay effect)
  const floorplanRotationOffRef = useRef<(() => void) | null>(null);

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
  const onFloorplanPinClickRef = useRef(onFloorplanPinClick);
  onFloorplanPinClickRef.current = onFloorplanPinClick;
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

  // Floor-plan registry (from /api/floorplans) — drives building outlines,
  // sheet overlays and the searchable selector.
  const [allEntries, setAllEntries] = useState<FloorplanEntry[]>([]);
  const selectedEntryRef = useRef<FloorplanEntry | null>(null);

  useEffect(() => {
    getFloorplans().then(setAllEntries).catch(() => setAllEntries([]));
  }, []);

  // Building footprint outlines derived from the registry (one rect per
  // building; every sheet of a building shares the surveyed bounds).
  const buildingOutlines = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; bounds: number[][] }>();
    for (const e of allEntries) {
      if (!byId.has(e.building_id)) {
        byId.set(e.building_id, { id: e.building_id, name: e.building, bounds: e.bounds });
      }
    }
    const palette = ['#3B82F6', '#22C55E', '#EF4444', '#F59E0B', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];
    return [...byId.values()].map((b, i) => ({ ...b, color: palette[i % palette.length] }));
  }, [allEntries]);

  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

  // Apply an exact incident snapshot when edit mode opens. This bypasses the
  // registry's current-version row so historical pins remain on their original sheet.
  useEffect(() => {
    if (!floorplanSelection?.entry) return;
    const entry = floorplanSelection.entry;
    selectedEntryRef.current = entry;
    setSelectedBuildingId(entry.building_id);
    setSelectedFloorId(entry.floor_id);
    onCurrentViewChangeRef.current?.('floorplan');
  }, [floorplanSelection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Teardown previous outlines (rebuilt when view or registry changes)
    if (floorplanLayersRef.current) {
      map.removeLayer(floorplanLayersRef.current);
      floorplanLayersRef.current = null;
    }

    if (currentView === 'floorplan') {
      // Keep tiles underneath, create floorplan overlay on top
      {
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
        buildingOutlines.forEach((building) => {
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
              html: `<div style="color: ${escapeLeafletHtml(building.color)}; font-weight: 700; font-size: 14px; font-family: 'IBM Plex Sans', sans-serif; text-shadow: 0 0 8px rgba(0,0,0,0.9); text-align: center; pointer-events: none;">${escapeLeafletHtml(building.name)}</div>`,
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
  }, [currentView, buildingOutlines]);

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
      if (floorplanRotationOffRef.current) {
        floorplanRotationOffRef.current();
      }
      if (selectedFloorId && !selectedBuildingId) {
        // Floor was cleared
        map.flyTo(centerRef.current, zoomRef.current, { animate: true, duration: 0.5 });
      }
      lastFlownFloorRef.current = null;
      return;
    }

    // Skip re-adding overlay / re-fitting if this exact floor is already shown.
    // (The default `center` prop is a fresh array each render, so any parent
    // re-render used to re-fire flyToBounds and yank the user's zoom back out.)
    if (
      floorplanImageRef.current &&
      lastFlownFloorRef.current === selectedFloorId &&
      selectedBuildingId === lastFlownBuildingRef.current
    ) {
      return;
    }

    // Find the selected floor's data from the registry
    const floorData =
      selectedEntryRef.current && selectedEntryRef.current.floor_id === selectedFloorId
        ? selectedEntryRef.current
        : allEntries.find(
            (e) =>
              e.floor_id === selectedFloorId &&
              (!selectedBuildingId || e.building_id === selectedBuildingId),
          );
    if (!floorData || !floorData.image) return;
    selectedEntryRef.current = floorData;

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

    // Add image overlay. L.imageOverlay only supports axis-aligned rects, so
    // we CSS-rotate the underlying <img> about its centre to match the
    // surveyed (slightly rotated) building footprints.
    //
    // Leaflet internals matter here:
    //  - overlay.getElement() IS the <img> (no wrapper div) in Leaflet 1.9
    //  - _reset() writes translate3d+scale into img.style.transform on every
    //    zoom/pan, so we must APPEND rotate() to Leaflet's transform, never
    //    replace it, and re-apply after each reposition.
    const imageOverlay = L.imageOverlay(floorData.image, leafletBounds, {
      opacity: 1,
      interactive: false,
      // Dedicated pane (z 450): above the dark backdrop SVG (z 200 inside
      // overlay pane z 400), below incident markers (marker pane z 600).
      pane: 'floorplanImage',
    }).addTo(map);
    floorplanImageRef.current = imageOverlay;

    const applyRotation = () => {
      const el = imageOverlay.getElement() as HTMLElement | undefined;
      if (!el) return;
      const img = el.tagName === 'IMG' ? (el as HTMLImageElement) : el.querySelector('img');
      if (!img) return;
      img.style.transformOrigin = 'center center';
      // Strip any rotate() we added before, keep Leaflet's translate/scale, append ours
      const base = (img.style.transform || '')
        .replace(/rotate\([^)]*\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      img.style.transform = `${base} rotate(${floorData.rotation ?? 0}deg)`.trim();
    };
    applyRotation();
    // 'zoom'/'move' fire on EVERY animation frame (flyTo), 'zoomend'/etc on
    // settle. Without the per-frame events the sheet lands un-tilted and
    // snaps to angle after the flight animation — the visible "delay".
    map.on('zoom move zoomend moveend resize', applyRotation);
    // Clean up the listener when this overlay is replaced/removed
    const prevListeners = floorplanRotationOffRef.current;
    if (prevListeners) prevListeners();
    floorplanRotationOffRef.current = () => {
      map.off('zoom move zoomend moveend resize', applyRotation);
      floorplanRotationOffRef.current = null;
    };

    // Zoom to floor bounds — only when the floor actually changed
    lastFlownFloorRef.current = selectedFloorId;
    lastFlownBuildingRef.current = selectedBuildingId;
    map.flyToBounds(leafletBounds, { animate: true, duration: 0.8, padding: [40, 40] });
  }, [selectedFloorId, selectedBuildingId, currentView]);

  // Floorplan-local pins use the exact selected version and normalized
  // top-left coordinates. Geographic markers below remain independent.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (floorplanIncidentLayersRef.current) {
      map.removeLayer(floorplanIncidentLayersRef.current);
      floorplanIncidentLayersRef.current = null;
    }
    if (currentView !== 'floorplan' || !selectedEntryRef.current) return;
    const entry = selectedEntryRef.current;
    const version = entry.floorplan_version_id ?? entry.version_id ?? entry.current_version_id;
    if (version == null) return;
    const layer = L.layerGroup().addTo(map);
    floorplanIncidentPins(incidents, version)
      .forEach((incident) => {
        const x = Math.max(0, Math.min(1, Number(incident.floorplan_x)));
        const y = Math.max(0, Math.min(1, Number(incident.floorplan_y)));
        const [[south, west], [north, east]] = entry.bounds;
        const marker = L.marker([north - y * (north - south), west + x * (east - west)], {
          icon: L.divIcon({ className: 'floorplan-incident-pin', html: `<span>${escapeLeafletHtml(INCIDENT_TYPE_LABELS[incident.incident_type] || 'Incident')}</span>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
          zIndexOffset: 1000,
        }).addTo(layer);
        marker.bindPopup(`${escapeLeafletHtml(INCIDENT_TYPE_LABELS[incident.incident_type] || incident.incident_type)}${incident.room_label ? `<br/>${escapeLeafletHtml(incident.room_label)}` : ''}`);
        marker.on('click', () => onIncidentClickRef.current?.(incident));
      });
    floorplanIncidentLayersRef.current = layer;
    return () => { if (floorplanIncidentLayersRef.current === layer) { map.removeLayer(layer); floorplanIncidentLayersRef.current = null; } };
  }, [incidents, selectedFloorId, currentView]);

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

    // Dedicated pane for floor-plan sheets: sits above the overlay pane
    // (z 400 — dark backdrop SVG) and below the marker pane (z 600), so the
    // 92%-opaque backdrop never paints over the plan while incident markers
    // still draw on top of it.
    map.createPane('floorplanImage');
    map.getPane('floorplanImage')!.style.zIndex = '450';

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 22,
      maxNativeZoom: 19,
    }).addTo(map);
    streetLayersRef.current = tileLayer;
    mapRef.current = map;

    // Use ref to avoid map recreation when onMapClick changes reference
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (placementModeRef.current && currentViewRef.current === 'floorplan' && selectedEntryRef.current) {
        const entry = selectedEntryRef.current;
        const version = entry.floorplan_version_id ?? entry.version_id ?? entry.current_version_id;
        if (version != null) {
          onFloorplanPinClickRef.current?.({ floorplan_version_id: version, ...normalizedFloorplanPoint(e.latlng.lat, e.latlng.lng, entry.bounds) });
          return;
        }
      }
      onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
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
          `<strong>${escapeLeafletHtml(INCIDENT_TYPE_LABELS[incident.incident_type] || incident.incident_type)}</strong><br/>` +
          `Status: ${escapeLeafletHtml(incident.status)}<br/>` +
          (incident.description ? `<br/>${escapeLeafletHtml(incident.description)}` : '')
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
          `<strong>[Broadcast]</strong> ${escapeLeafletHtml(INCIDENT_TYPE_LABELS[bi.incident_type] || bi.incident_type)}<br/>` +
          (bi.description ? `<br/>${escapeLeafletHtml(bi.description)}` : '')
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
          <FloorplanSelector onFloorSelect={(floorId, floorName, entry) => {
            if (!floorId) {
              selectedEntryRef.current = null;
              setSelectedBuildingId(null);
              setSelectedFloorId(null);
            } else {
              selectedEntryRef.current = entry ?? null;
              setSelectedBuildingId(entry?.building_id ?? null);
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

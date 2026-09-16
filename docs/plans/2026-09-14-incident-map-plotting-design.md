# Incident Map Plotting and Heatmap Alignment Design

**Status:** Approved design
**Date:** 2026-09-14
**Project:** PUSECGIS

## Goal

Ensure newly created incidents can be placed through either a map click or a known location, and ensure sidebar incidents, map markers, and heatmap points represent the same active incident set and coordinates.

## Scope

Active incidents are exactly those with status `open`, `monitoring`, or `escalating`. Resolved and archived incidents are excluded from active map markers and heatmap points.

## User experience

- `+ New Incident` opens the form immediately.
- The form provides `Set location on map`.
- That action enters map-placement mode; the next map click captures latitude and longitude and shows a temporary marker.
- The form reopens with the selected coordinates visible.
- A known location may be selected from autocomplete.
- A known location with coordinates takes precedence over a temporary map point.
- If the known location lacks coordinates, the map point is used.
- If neither is available, a deterministic synthetic fallback is used and marked approximate.

## Data contract

Incident create, update, and response payloads expose optional `latitude` and `longitude` values. When coordinates are supplied, the backend persists both coordinate columns and the PostGIS `geom` point. Existing text `location_ref` remains supported.

## Coordinate precedence

1. Known location coordinates.
2. Explicit map-click coordinates.
3. Deterministic synthetic coordinates derived from the incident ID, only as a demo fallback.

The same resolved coordinate must be used by the visible marker and heatmap. Real database coordinates take precedence over fallback coordinates.

## Heatmap

The frontend requests real heatmap data within five miles (8,047 metres). The backend returns active incidents with status-weighted intensity. If no real points are returned, the frontend derives fallback points from the same coordinate function used by markers. The legend remains visible while enabled and disappears only when toggled off.

## Sidebar and map consistency

The map receives the same loaded active incident collection as the sidebar. Sidebar pagination or presentation limits must not silently remove incidents from the map or heatmap. Filtering by status/type must apply consistently to both surfaces.

## Error handling

- Invalid coordinate pairs are rejected by backend validation.
- Failed map placement leaves the form state intact and displays an actionable error.
- Heatmap API failures preserve the toggle state only if a usable fallback can be rendered; otherwise the UI reports that no heatmap data is available.
- Synthetic fallback coordinates are clearly treated as approximate demo data.

## Testing strategy

- Backend tests validate coordinate persistence and geometry generation.
- Backend tests validate active-status filtering and heatmap response shape.
- Frontend tests validate map-placement state and payload coordinates.
- A coordinate consistency test proves marker and fallback heatmap coordinates are identical for the same incident ID.
- Build and live verification must be run after implementation; UI changes require frontend/backend rebuild and restart.

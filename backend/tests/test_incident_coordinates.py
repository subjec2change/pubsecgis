"""Incident coordinate contract and known-location precedence tests.

Covers:
  - Task 1: Backend coordinate contract (schema validation, PostGIS geom)
  - Task 2: Known-location coordinate precedence
"""
import pytest
from models.database import Location
from models.schemas import IncidentUpdate
from routes.incidents import _validate_resolved_correction


# ──────────────────────────────────────────────
# Task 1: Coordinate contract tests
# ──────────────────────────────────────────────

class TestIncidentCoordinates:
    """Validate the IncidentCreate schema accepts lat/lng."""

    def test_incident_create_schema_accepts_latitude(self):
        """IncidentCreate accepts latitude as a float."""
        from models.schemas import IncidentCreate

        data = {
            "shift_id": 1,
            "incident_type": "victim_of_violence",
            "location_ref": "MAIN-LOBBY",
            "latitude": 38.6270,
        }
        inc = IncidentCreate(**data)
        assert inc.latitude is not None

    def test_incident_create_schema_accepts_longitude(self):
        """IncidentCreate accepts longitude as a float."""
        from models.schemas import IncidentCreate

        data = {
            "shift_id": 1,
            "incident_type": "victim_of_violence",
            "location_ref": "MAIN-LOBBY",
            "longitude": -90.2418,
        }
        inc = IncidentCreate(**data)
        assert inc.longitude is not None

    def test_incident_create_schema_accepts_both(self):
        """IncidentCreate accepts both latitude and longitude together."""
        from models.schemas import IncidentCreate

        data = {
            "shift_id": 1,
            "incident_type": "victim_of_violence",
            "location_ref": "MAIN-LOBBY",
            "latitude": 38.6270,
            "longitude": -90.2418,
        }
        inc = IncidentCreate(**data)
        assert inc.latitude == 38.6270
        assert inc.longitude == -90.2418

    def test_incident_create_schema_rejects_invalid_latitude(self):
        """IncidentCreate rejects latitude < -90 or > 90."""
        from models.schemas import IncidentCreate
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            IncidentCreate(
                shift_id=1,
                incident_type="victim_of_violence",
                location_ref="MAIN-LOBBY",
                latitude=91.0,
            )

        with pytest.raises(ValidationError):
            IncidentCreate(
                shift_id=1,
                incident_type="victim_of_violence",
                location_ref="MAIN-LOBBY",
                latitude=-91.0,
            )

    def test_incident_create_schema_rejects_invalid_longitude(self):
        """IncidentCreate rejects longitude < -180 or > 180."""
        from models.schemas import IncidentCreate
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            IncidentCreate(
                shift_id=1,
                incident_type="victim_of_violence",
                location_ref="MAIN-LOBBY",
                longitude=181.0,
            )

        with pytest.raises(ValidationError):
            IncidentCreate(
                shift_id=1,
                incident_type="victim_of_violence",
                location_ref="MAIN-LOBBY",
                longitude=-181.0,
            )

    def test_incident_create_schema_defaults_none_without_coords(self):
        """IncidentCreate defaults latitude/longitude to None when not provided."""
        from models.schemas import IncidentCreate

        inc = IncidentCreate(
            shift_id=1,
            incident_type="victim_of_violence",
            location_ref="MAIN-LOBBY",
        )
        assert inc.latitude is None
        assert inc.longitude is None

    def test_incident_update_schema_accepts_latitude(self):
        """IncidentUpdate accepts latitude as a float."""
        from models.schemas import IncidentUpdate

        data = {
            "incident_type": "victim_of_violence",
            "latitude": 38.6270,
        }
        upd = IncidentUpdate(**data)
        assert upd.latitude == 38.6270

    def test_incident_update_schema_rejects_invalid_latitude(self):
        """IncidentUpdate rejects latitude > 90."""
        from models.schemas import IncidentUpdate
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            IncidentUpdate(latitude=91.0)

    def test_incident_response_returns_lat_lng(self):
        """IncidentResponse schema includes latitude and longitude."""
        from models.schemas import IncidentResponse
        from datetime import datetime, timezone

        resp = IncidentResponse(
            id=1,
            shift_id=1,
            incident_type="victim_of_violence",
            location_ref="MAIN-LOBBY",
            description="test",
            status="open",
            logged_by=1,
            logged_by_user=None,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            latitude=38.6270,
            longitude=-90.2418,
        )
        assert resp.latitude == 38.6270
        assert resp.longitude == -90.2418


# ──────────────────────────────────────────────
# Task 2: Known-location precedence tests
# ──────────────────────────────────────────────

class TestResolvedIncidentRules:
    def test_resolved_incident_cannot_reopen(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as excinfo:
            _validate_resolved_correction("resolved", IncidentUpdate(
                status="open", floorplan_version_id=None, floorplan_x=None,
                floorplan_y=None, room_label=None, pin_reason=None,
            ))
        assert excinfo.value.status_code == 422


class TestKnownLocationPrecedence:
    """Known location coordinates take precedence over explicit map coordinates."""

    def test_crud_resolve_known_location_coords(self):
        """create_incident resolves coords from known location when both provided."""
        from crud.incidents import resolve_location_coords

        known_location = Location(
            name="Test Location",
            building="Main Wing",
            latitude=38.6270,
            longitude=-90.2418,
        )

        # Known location has coords – they should win
        result = resolve_location_coords(
            location_ref="Test Location",
            known_locations=[known_location],
            explicit_lat=10.0,
            explicit_lng=20.0,
        )
        assert result.latitude == 38.6270
        assert result.longitude == -90.2418

    def test_crud_fallback_to_explicit_when_no_known_location(self):
        """When location_ref doesn't match a known location, use explicit coords."""
        from crud.incidents import resolve_location_coords

        known_location = Location(
            name="Different Location",
            building="Other Wing",
            latitude=39.0,
            longitude=-91.0,
        )

        result = resolve_location_coords(
            location_ref="Unknown Location",
            known_locations=[known_location],
            explicit_lat=38.6270,
            explicit_lng=-90.2418,
        )
        assert result.latitude == 38.6270
        assert result.longitude == -90.2418

    def test_crud_no_known_location_coords(self):
        """When known location has no lat/lng, fall back to explicit coords."""
        from crud.incidents import resolve_location_coords

        unknown_location = Location(
            name="Unknown Location",
            building="Main Wing",
            latitude=None,
            longitude=None,
        )

        result = resolve_location_coords(
            location_ref="Unknown Location",
            known_locations=[unknown_location],
            explicit_lat=38.6270,
            explicit_lng=-90.2418,
        )
        assert result.latitude == 38.6270
        assert result.longitude == -90.2418

    def test_crud_no_coords_at_all_defaults_none(self):
        """When nothing has coords, both are None."""
        from crud.incidents import resolve_location_coords

        known_location = Location(
            name="No Coords Location",
            building="Main Wing",
            latitude=None,
            longitude=None,
        )

        result = resolve_location_coords(
            location_ref="No Coords Location",
            known_locations=[known_location],
            explicit_lat=None,
            explicit_lng=None,
        )
        assert result.latitude is None
        assert result.longitude is None

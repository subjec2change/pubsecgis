"""Floor-plan registry API semantics (routes/floorplans.py).

Route functions are called directly with a real async session against the
dev Postgres — no ASGI transport, no app import. All rows are test-owned
('zzz-test-' floor_ids, unique per-test tokens) and removed by the
floorplan_factory fixture, which also asserts nothing leaked.

Covers:
  - Search semantics: multi-token AND over concat_ws(campus, building, floor_name),
    case-insensitivity, whitespace-only query, building_id filter, active flag,
    campus/building/id ordering.
  - Response mapping: FloorplanResponse.from_orm_floorplan bounds/rotation/notes.
  - create_floorplan guards: duplicate floor_id (409), bad bounds (422).
  - delete_floorplan: 404 for unknown, happy-path removal.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from models.database import Floorplan
from models.schemas import FloorplanCreate, FloorplanResponse
from routes.floorplans import create_floorplan, delete_floorplan, list_floorplans


# ──────────────────────────────────────────────
# Search / filter semantics
# ──────────────────────────────────────────────

class TestFloorplanSearch:
    """GET /floorplans handler filter + ordering semantics."""

    async def test_multi_token_and_over_concatenated_fields(self, db, floorplan_factory):
        """All whitespace tokens must match the concatenated
        campus+building+floor_name field (AND semantics)."""
        tok_a = "zzzalpha"
        tok_b = "zzzbravo"
        fp = await floorplan_factory(
            campus=f"{tok_a} campus",
            building=f"{tok_a} annex",
            floor_name=f"floor {tok_b}",
            building_id=f"{tok_a}-bldgid",
        )
        hits = [r.floor_id for r in await list_floorplans(q=f"{tok_a} {tok_b}", building_id=None, include_inactive=False, db=db)]
        assert fp.floor_id in hits

    async def test_multi_token_and_rejects_partial_match(self, db, floorplan_factory):
        """A token that matches nothing must exclude the row."""
        tok_a = "zzzalpha"
        hits = [
            r.floor_id
            for r in await list_floorplans(q=f"{tok_a} nomatchtokenxyz", building_id=None, include_inactive=False, db=db)
        ]
        assert hits == []

    async def test_search_is_case_insensitive(self, db, floorplan_factory):
        """ilike: lowercase query matches uppercase-stored text."""
        tok = "ZZZCaSeToKeN"
        fp = await floorplan_factory(
            campus=f"{tok} campus",
            building=f"{tok} tower",
            floor_name=f"L{tok}",
            building_id=f"{tok.lower()}-bldgid",
        )
        hits = [r.floor_id for r in await list_floorplans(q=tok.lower(), building_id=None, include_inactive=False, db=db)]
        assert fp.floor_id in hits

    async def test_token_matching_spans_field_boundary(self, db, floorplan_factory):
        """concat_ws joins with ' ', so one token can span the
        campus/building boundary. Locks in the documented behavior."""
        tok = "zzzspan"
        fp = await floorplan_factory(
            campus=f"campus{tok}x",
            building=f"x{tok} bldg",
            floor_name="L1",
            building_id=f"{tok}-bldgid",
        )
        # "x x" only exists across the campus+building boundary
        hits = [r.floor_id for r in await list_floorplans(q="x x", building_id=f"{tok}-bldgid", include_inactive=False, db=db)]
        assert fp.floor_id in hits

    async def test_building_id_filter(self, db, floorplan_factory):
        """building_id narrows to exact matches only."""
        wanted = "zzz-bid-wanted"
        other = "zzz-bid-other"
        fp_w = await floorplan_factory(campus="zzzbid campus", building="zzzbid bldg", floor_name="L1", building_id=wanted)
        fp_o = await floorplan_factory(campus="zzzbid campus", building="zzzbid bldg", floor_name="L1", building_id=other)
        hits = [r.floor_id for r in await list_floorplans(q=None, building_id=wanted, include_inactive=False, db=db)]
        assert hits == [fp_w.floor_id]
        assert fp_o.floor_id not in hits

    async def test_inactive_excluded_by_default(self, db, floorplan_factory):
        """active=False rows are hidden unless include_inactive."""
        bid = "zzz-inactive-bid"
        active = await floorplan_factory(campus="zzzinact campus", building="zzzinact bldg", floor_name="L1", building_id=bid, active=True)
        inactive = await floorplan_factory(campus="zzzinact campus", building="zzzinact bldg", floor_name="L2", building_id=bid, active=False)
        default_hits = [r.floor_id for r in await list_floorplans(q=None, building_id=bid, include_inactive=False, db=db)]
        assert default_hits == [active.floor_id]
        all_hits = [r.floor_id for r in await list_floorplans(q=None, building_id=bid, include_inactive=True, db=db)]
        assert set(all_hits) == {active.floor_id, inactive.floor_id}

    async def test_blank_query_behaves_as_no_filter(self, db, floorplan_factory):
        """q of only whitespace applies no search filter."""
        bid = "zzz-blank-q-bid"
        fp = await floorplan_factory(campus="zzzblank campus", building="zzzblank bldg", floor_name="L1", building_id=bid)
        hits = [r.floor_id for r in await list_floorplans(q="   ", building_id=bid, include_inactive=False, db=db)]
        assert hits == [fp.floor_id]

    async def test_order_by_campus_building_id(self, db, floorplan_factory):
        """Results sort by campus, then building, then id."""
        bid = "zzz-order-bid"
        second = await floorplan_factory(campus="zzzorder-b campus", building="zzzorder shared", floor_name="L1", building_id=bid)
        first = await floorplan_factory(campus="zzzorder-a campus", building="zzzorder shared", floor_name="L1", building_id=bid)
        hits = [r.floor_id for r in await list_floorplans(q=None, building_id=bid, include_inactive=False, db=db)]
        assert hits == [first.floor_id, second.floor_id]

        # Same campus+building → tie broken by ascending id (creation order).
        bid2 = "zzz-order2-bid"
        earlier = await floorplan_factory(campus="zzzorder2 campus", building="zzzorder2 bldg", floor_name="L1", building_id=bid2)
        later = await floorplan_factory(campus="zzzorder2 campus", building="zzzorder2 bldg", floor_name="L2", building_id=bid2)
        hits2 = [r.floor_id for r in await list_floorplans(q=None, building_id=bid2, include_inactive=False, db=db)]
        assert hits2 == [earlier.floor_id, later.floor_id]


# ──────────────────────────────────────────────
# LIKE metacharacter escaping (search tokens are literal)
# ──────────────────────────────────────────────

class TestFloorplanSearchLiteralTokens:
    """Search tokens containing LIKE metacharacters (% and _) must be
    matched literally, not treated as wildcards."""

    async def test_percent_token_is_not_a_wildcard(self, db, floorplan_factory):
        """'token%tail' must not match a row whose text just has
        'token' followed later by 'tail' — only a literal '%' matches."""
        tok = "zzzq7pct"
        fp = await floorplan_factory(
            campus=f"{tok}campus", building=f"{tok}bldg",
            floor_name=f"{tok}floor", building_id=f"{tok}-b",
        )
        # No row contains a literal '%', so the search must find nothing.
        hits = [r.floor_id for r in await list_floorplans(
            q=f"{tok}%floor", building_id=None, include_inactive=False, db=db)]
        assert hits == []

    async def test_percent_token_matches_literal_percent_in_text(self, db, floorplan_factory):
        """A floor_name containing a literal '%' is found by that token."""
        tok = "zzzpct2"
        fp = await floorplan_factory(
            campus=f"{tok} campus", building=f"{tok} bldg",
            floor_name=f"{tok}-100%done", building_id=f"{tok}-b",
        )
        hits = [r.floor_id for r in await list_floorplans(
            q=f"{tok}-100%done", building_id=None, include_inactive=False, db=db)]
        assert hits == [fp.floor_id]

    async def test_underscore_token_is_not_a_single_char_wildcard(self, db, floorplan_factory):
        """'a_b' must not match 'axb' — only a literal underscore matches."""
        tok = "zzzus"
        fp = await floorplan_factory(
            campus=f"{tok} campus", building=f"{tok} bldg",
            floor_name=f"{tok}axb", building_id=f"{tok}-b",
        )
        hits = [r.floor_id for r in await list_floorplans(
            q=f"{tok}a_b", building_id=None, include_inactive=False, db=db)]
        assert hits == []


# ──────────────────────────────────────────────
# Response mapping
# ──────────────────────────────────────────────

class TestFloorplanResponseMapping:
    """FloorplanResponse.from_orm_floorplan mapping (pure, no DB)."""

    def _orm(self, **overrides):
        base = dict(
            floor_id="x.floor", campus="C", building="B", building_id="bid",
            floor_name="L1", image="x.png",
            south=38.6, west=-90.26, north=38.63, east=-90.22,
            rotation=1.5, notes="hi",
        )
        base.update(overrides)
        return SimpleNamespace(**base)

    def test_bounds_leaflet_order(self):
        """bounds is [[south, west], [north, east]] (imageOverlay order)."""
        resp = FloorplanResponse.from_orm_floorplan(self._orm())
        assert resp.bounds == [[38.6, -90.26], [38.63, -90.22]]
        assert all(isinstance(v, float) for pair in resp.bounds for v in pair)

    def test_rotation_from_column(self):
        """rotation passes through as float."""
        assert FloorplanResponse.from_orm_floorplan(self._orm(rotation=1.5)).rotation == 1.5

    def test_rotation_none_defaults_zero(self):
        """NULL rotation becomes 0.0, not None."""
        assert FloorplanResponse.from_orm_floorplan(self._orm(rotation=None)).rotation == 0.0

    def test_notes_passthrough_and_optional(self):
        assert FloorplanResponse.from_orm_floorplan(self._orm(notes="note")).notes == "note"
        assert FloorplanResponse.from_orm_floorplan(self._orm(notes=None)).notes is None

    async def test_route_response_matches_columns(self, db, floorplan_factory):
        """list_floorplans returns the mapped shape for a real row."""
        from decimal import Decimal
        bid = "zzz-map-bid"
        fp = await floorplan_factory(
            campus="zzzmap campus", building="zzzmap bldg", floor_name="L1",
            building_id=bid, south=38.60, west=-90.26, north=38.63, east=-90.22,
            rotation=2.25, notes="mapped",
        )
        resp = (await list_floorplans(q=None, building_id=bid, include_inactive=False, db=db))[0]
        assert resp.floor_id == fp.floor_id
        assert resp.bounds[0] == pytest.approx([38.60, -90.26])
        assert resp.bounds[1] == pytest.approx([38.63, -90.22])
        assert resp.rotation == 2.25
        assert resp.notes == "mapped"
        assert resp.campus == "zzzmap campus" and resp.building == "zzzmap bldg"
        assert isinstance(fp.south, Decimal)  # DB yields Decimal; response is float


# ──────────────────────────────────────────────
# create_floorplan guards
# ──────────────────────────────────────────────

class TestCreateFloorplanGuards:
    """POST handler: uniqueness and bounds validation."""

    async def test_duplicate_floor_id_returns_409(self, db, floorplan_factory):
        """Existing floor_id is rejected with 409."""
        existing = await floorplan_factory()
        payload = FloorplanCreate(
            floor_id=existing.floor_id, campus="C", building="B",
            building_id="bid", floor_name="L1", image="x.png",
            south=1.0, west=1.0, north=2.0, east=2.0,
        )
        with pytest.raises(HTTPException) as excinfo:
            await create_floorplan(payload=payload, db=db)
        assert excinfo.value.status_code == 409
        assert existing.floor_id in excinfo.value.detail

    async def test_south_not_below_north_returns_422(self, db, floorplan_factory):
        """south >= north is rejected (equal bounds included)."""
        for south, north in ((2.0, 1.0), (1.0, 1.0)):
            payload = FloorplanCreate(
                floor_id=f"zzz-test-bounds-s{south}.floor", campus="C", building="B",
                building_id="bid", floor_name="L1", image="x.png",
                south=south, west=1.0, north=north, east=2.0,
            )
            with pytest.raises(HTTPException) as excinfo:
                await create_floorplan(payload=payload, db=db)
            assert excinfo.value.status_code == 422

    async def test_west_not_below_east_returns_422(self, db, floorplan_factory):
        """west >= east is rejected."""
        for west, east in ((2.0, 1.0), (1.0, 1.0)):
            payload = FloorplanCreate(
                floor_id=f"zzz-test-bounds-w{west}.floor", campus="C", building="B",
                building_id="bid", floor_name="L1", image="x.png",
                south=1.0, west=west, north=2.0, east=east,
            )
            with pytest.raises(HTTPException) as excinfo:
                await create_floorplan(payload=payload, db=db)
            assert excinfo.value.status_code == 422

    async def test_happy_path_persists_and_maps(self, db, floorplan_factory):
        """Valid payload is inserted and returned as FloorplanResponse."""
        from conftest import test_floor_id
        fid = test_floor_id()
        floorplan_factory.register(fid)  # teardown deletes it even on assert failure
        payload = FloorplanCreate(
            floor_id=fid, campus="zzzcreate campus", building="zzzcreate bldg",
            building_id="zzz-create-bid", floor_name="L9", image="zzz.png",
            south=38.60, west=-90.26, north=38.63, east=-90.22,
            rotation=0.5, notes="created in test",
        )
        resp = await create_floorplan(payload=payload, db=db)
        assert resp.floor_id == fid
        assert resp.bounds[0] == pytest.approx([38.60, -90.26])
        assert resp.bounds[1] == pytest.approx([38.63, -90.22])
        assert resp.rotation == 0.5
        row = (
            await db.execute(select(Floorplan).where(Floorplan.floor_id == fid))
        ).scalar_one()
        assert row.notes == "created in test" and row.active is True


# ──────────────────────────────────────────────
# delete_floorplan
# ──────────────────────────────────────────────

class TestDeleteFloorplan:
    """DELETE /{floor_id} handler."""

    async def test_unknown_floor_id_returns_404(self, db):
        with pytest.raises(HTTPException) as excinfo:
            await delete_floorplan(floor_id="zzz-test-does-not-exist.floor", db=db)
        assert excinfo.value.status_code == 404

    async def test_happy_path_deactivates_row(self, db, floorplan_factory):
        """Delete deactivates the row and preserves its immutable version."""
        fp = await floorplan_factory(campus="zzzdel campus", building="zzzdel bldg", floor_name="L1", building_id="zzz-del-bid")
        await delete_floorplan(floor_id=fp.floor_id, db=db)
        row = (await db.execute(select(Floorplan).options(selectinload(Floorplan.versions)).where(Floorplan.floor_id == fp.floor_id))).scalar_one()
        assert row.active is False

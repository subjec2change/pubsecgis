"""Auth/security core tests (dependencies.py) — no DB required.

Covers:
  - create_access_token / jwt.decode roundtrip (sub/role claims, exp present).
  - Expired token rejection (JWTError from jose on decode).
  - Tampered-signature and wrong-key rejection.
  - require_role factory: allow for matching role, 403 for non-matching,
    and multi-role grants.
  - get_current_user: missing 'sub' claim -> 401 (dependency driven directly).
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import JWTError, jwt

from config import settings
from dependencies import create_access_token, get_current_user, require_role


def _decode(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


# ──────────────────────────────────────────────
# Token create / decode roundtrip
# ──────────────────────────────────────────────

class TestTokenRoundtrip:
    """create_access_token produces tokens decodable with app settings."""

    def test_roundtrip_preserves_claims(self):
        """sub/role claims survive encode/decode."""
        token = create_access_token({"sub": "officer1", "role": "officer"})
        payload = _decode(token)
        assert payload["sub"] == "officer1"
        assert payload["role"] == "officer"

    def test_exp_claim_is_utc_future(self):
        """Token carries an 'exp' in the future by default lifetime."""
        token = create_access_token({"sub": "u"})
        payload = _decode(token)
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert exp > datetime.now(timezone.utc)

    def test_input_dict_not_mutated(self):
        """create_access_token copies the payload before adding 'exp'."""
        data = {"sub": "u"}
        create_access_token(data)
        assert "exp" not in data


# ──────────────────────────────────────────────
# Rejection paths
# ──────────────────────────────────────────────

class TestTokenRejection:
    """Invalid tokens must raise JWTError at decode."""

    def test_expired_token_rejected(self):
        """expires_delta in the past -> JWTError (signature alone is not enough)."""
        token = create_access_token({"sub": "u"}, expires_delta=timedelta(minutes=-5))
        with pytest.raises(JWTError):
            _decode(token)

    def test_tampered_signature_rejected(self):
        """Flipping one char of the signature breaks verification."""
        token = create_access_token({"sub": "u", "role": "officer"})
        header, body, signature = token.split(".")
        last = signature[-1]
        flipped = ("A" if last != "A" else "B")
        tampered = f"{header}.{body}.{signature[:-1]}{flipped}"
        with pytest.raises(JWTError):
            _decode(tampered)

    def test_tampered_claims_rejected(self):
        """Re-encoding modified claims with a different key is rejected."""
        forged = jwt.encode(
            {"sub": "u", "role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            "attacker-key",
            algorithm=settings.algorithm,
        )
        with pytest.raises(JWTError):
            _decode(forged)

    def test_garbage_token_rejected(self):
        with pytest.raises(JWTError):
            _decode("not-a-jwt")


# ──────────────────────────────────────────────
# get_current_user guard (no DB hit on bad token)
# ──────────────────────────────────────────────

class _NoopSession:
    """Any DB access means the token guard failed to short-circuit."""

    async def execute(self, *args, **kwargs):  # pragma: no cover - guard
        raise AssertionError("DB must not be queried for invalid tokens")


class TestGetCurrentUserGuards:
    """get_current_user rejects invalid tokens before touching the DB."""

    @staticmethod
    def _cred(token: str) -> HTTPAuthorizationCredentials:
        return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    async def test_expired_token_401(self):
        token = create_access_token({"sub": "u"}, expires_delta=timedelta(minutes=-5))
        with pytest.raises(HTTPException) as excinfo:
            await get_current_user(credentials=self._cred(token), db=_NoopSession())
        assert excinfo.value.status_code == 401

    async def test_missing_sub_401(self):
        """Valid signature but no 'sub' claim -> 401 Invalid token."""
        token = jwt.encode(
            {"role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            settings.secret_key,
            algorithm=settings.algorithm,
        )
        with pytest.raises(HTTPException) as excinfo:
            await get_current_user(credentials=self._cred(token), db=_NoopSession())
        assert excinfo.value.status_code == 401
        assert excinfo.value.detail == "Invalid token"

    async def test_wrong_key_401(self):
        forged = jwt.encode(
            {"sub": "u", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            "attacker-key",
            algorithm=settings.algorithm,
        )
        with pytest.raises(HTTPException) as excinfo:
            await get_current_user(credentials=self._cred(forged), db=_NoopSession())
        assert excinfo.value.status_code == 401


# ──────────────────────────────────────────────
# require_role factory
# ──────────────────────────────────────────────

class TestRequireRole:
    """require_role(*roles) dependency: allow-list semantics."""

    async def test_matching_role_allowed(self):
        """Allowed role passes through and returns the user."""
        role_dep = require_role("admin")
        user = SimpleNamespace(role="admin")
        assert await role_dep(current_user=user) is user

    async def test_non_matching_role_403(self):
        """Officer hitting an admin-only guard gets 403 with role hint."""
        role_dep = require_role("admin")
        with pytest.raises(HTTPException) as excinfo:
            await role_dep(current_user=SimpleNamespace(role="officer"))
        assert excinfo.value.status_code == 403
        assert "admin" in excinfo.value.detail

    async def test_multiple_allowed_roles(self):
        """require_role('admin','supervisor') accepts either."""
        role_dep = require_role("admin", "supervisor")
        for role in ("admin", "supervisor"):
            assert (await role_dep(current_user=SimpleNamespace(role=role))).role == role
        with pytest.raises(HTTPException) as excinfo:
            await role_dep(current_user=SimpleNamespace(role="officer"))
        assert excinfo.value.status_code == 403

    async def test_empty_roles_denies_everyone(self):
        """require_role() with no roles denies any user."""
        role_dep = require_role()
        with pytest.raises(HTTPException) as excinfo:
            await role_dep(current_user=SimpleNamespace(role="admin"))
        assert excinfo.value.status_code == 403

    async def test_factory_returns_independent_dependencies(self):
        """Each call builds a distinct dependency bound to its own roles."""
        admin_only = require_role("admin")
        sup_only = require_role("supervisor")
        assert admin_only is not sup_only
        assert await admin_only(current_user=SimpleNamespace(role="admin"))
        with pytest.raises(HTTPException):
            await sup_only(current_user=SimpleNamespace(role="admin"))

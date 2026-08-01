"""Login for the internal admin panel.

sqladmin renders its own login page once a backend is attached; this supplies
the three hooks it calls (`login`, `logout`, `authenticate`) and checks
credentials against the `admin_users` table.

The session is a signed cookie (Starlette's `SessionMiddleware`, which sqladmin
installs for us), so it carries only the admin's id — never the password hash,
and never a tenant. Every request re-reads the row, so deactivating an admin
takes effect immediately instead of waiting for their cookie to expire.
"""
from datetime import datetime, timedelta

from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from starlette.responses import RedirectResponse
from werkzeug.security import check_password_hash

from ..database import SessionLocal
from .models import AdminUser

SESSION_KEY = "admin_user_id"
# How long a signed-in admin stays signed in. Short by web-app standards: this
# panel can read and write every tenant's data, so an unattended browser is a
# real risk.
SESSION_MAX_AGE = int(timedelta(hours=8).total_seconds())


def verify_admin(email: str, password: str) -> AdminUser | None:
    """The active admin matching these credentials, or None.

    Returns None for unknown email, wrong password, and deactivated account
    alike — the caller shows one generic message, so the login page can't be
    used to discover which admin emails exist.
    """
    db = SessionLocal()
    try:
        admin = (
            db.query(AdminUser)
            .filter(AdminUser.email == (email or "").strip().lower())
            .first()
        )
        if admin is None or not admin.is_active:
            return None
        if not check_password_hash(admin.password_hash, password or ""):
            return None
        admin.last_login_at = datetime.utcnow()
        db.commit()
        db.refresh(admin)
        db.expunge(admin)
        return admin
    finally:
        db.close()


def active_admin(admin_id: str | None) -> AdminUser | None:
    """Re-read the admin behind a session cookie, or None if they can no longer
    sign in (deleted or deactivated since the cookie was issued)."""
    if not admin_id:
        return None
    db = SessionLocal()
    try:
        admin = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
        if admin is None or not admin.is_active:
            return None
        db.expunge(admin)
        return admin
    except Exception:
        # A malformed id in a tampered cookie must read as "not signed in",
        # not as a 500 on every admin page.
        return None
    finally:
        db.close()


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        admin = verify_admin(str(form.get("username", "")), str(form.get("password", "")))
        if admin is None:
            return False
        request.session.update({SESSION_KEY: str(admin.id)})
        return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool | RedirectResponse:
        admin = active_admin(request.session.get(SESSION_KEY))
        if admin is None:
            request.session.clear()
            return RedirectResponse(request.url_for("admin:login"), status_code=302)
        return True

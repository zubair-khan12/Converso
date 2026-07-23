"""Small management CLI.

Usage:
    python manage.py create-user --tenant acme --email a@b.com --password secret [--name "A B"] [--role owner]
    python manage.py set-password --email a@b.com --password newsecret
    python manage.py list-users
"""
import argparse
import sys

from werkzeug.security import generate_password_hash

import app.models  # noqa: F401  (register all tables)
from app.auth.models import User
from app.database import SessionLocal
from app.tenants.models import Tenant


def create_user(args) -> int:
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter_by(slug=args.tenant).first()
        if tenant is None:
            print(f"error: no tenant with slug '{args.tenant}'", file=sys.stderr)
            return 1
        if db.query(User).filter(User.email == args.email.lower()).first():
            print(f"error: a user with email '{args.email}' already exists", file=sys.stderr)
            return 1
        user = User(
            tenant_id=tenant.id,
            email=args.email.lower(),
            password_hash=generate_password_hash(args.password),
            name=args.name,
            role=args.role,
        )
        db.add(user)
        db.commit()
        print(f"created user {user.email} (role={user.role}) in tenant {tenant.slug}")
        return 0
    finally:
        db.close()


def set_password(args) -> int:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == args.email.lower()).first()
        if user is None:
            print(f"error: no user with email '{args.email}'", file=sys.stderr)
            return 1
        user.password_hash = generate_password_hash(args.password)
        db.commit()
        print(f"password updated for {user.email}")
        return 0
    finally:
        db.close()


def list_users(_args) -> int:
    db = SessionLocal()
    try:
        for u in db.query(User).order_by(User.email).all():
            print(f"{u.email:32} role={u.role:8} active={u.is_active} tenant={u.tenant_id}")
        return 0
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Backend management CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p_create = sub.add_parser("create-user", help="Create a login user")
    p_create.add_argument("--tenant", required=True, help="tenant slug")
    p_create.add_argument("--email", required=True)
    p_create.add_argument("--password", required=True)
    p_create.add_argument("--name", default=None)
    p_create.add_argument("--role", default="member", choices=["owner", "member"])
    p_create.set_defaults(func=create_user)

    p_pw = sub.add_parser("set-password", help="Reset a user's password")
    p_pw.add_argument("--email", required=True)
    p_pw.add_argument("--password", required=True)
    p_pw.set_defaults(func=set_password)

    p_list = sub.add_parser("list-users", help="List all users")
    p_list.set_defaults(func=list_users)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

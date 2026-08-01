"""Create, list and deactivate admin-panel accounts from the command line.

The admin panel requires a login, so the *first* admin can't be created through
it — this script solves that chicken-and-egg. After that you can add colleagues
from the panel itself (Tenancy → Admins), and this stays useful for recovery
when nobody can sign in.

    python create_admin.py                       # prompts for email + password
    python create_admin.py --email me@co.com     # prompts for the password only
    python create_admin.py --list
    python create_admin.py --deactivate me@co.com
    python create_admin.py --password-reset me@co.com

The password is never taken as an argument: shell arguments end up in your
history and in `ps` output. It's prompted for, hidden, and confirmed.
"""
import argparse
import getpass
import sys

from werkzeug.security import generate_password_hash

import app.models  # noqa: F401  — registers every mapper before we query
from app.admin.models import AdminUser
from app.database import SessionLocal

MIN_PASSWORD_LENGTH = 12


def _prompt_password() -> str:
    for _ in range(3):
        pw = getpass.getpass("Password: ")
        if len(pw) < MIN_PASSWORD_LENGTH:
            print(f"  Too short — use at least {MIN_PASSWORD_LENGTH} characters.")
            continue
        if pw != getpass.getpass("Confirm password: "):
            print("  Passwords didn't match.")
            continue
        return pw
    sys.exit("Giving up after 3 attempts.")


def list_admins(db) -> None:
    admins = db.query(AdminUser).order_by(AdminUser.email).all()
    if not admins:
        print("No admins yet. Run this script with no arguments to create the first one.")
        return
    print(f"{'EMAIL':40} {'ACTIVE':8} LAST LOGIN")
    for a in admins:
        last = a.last_login_at.strftime("%Y-%m-%d %H:%M") if a.last_login_at else "never"
        print(f"{a.email:40} {'yes' if a.is_active else 'NO':8} {last}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage admin-panel accounts.")
    parser.add_argument("--email", help="Admin email address.")
    parser.add_argument("--name", help="Display name (optional).")
    parser.add_argument("--list", action="store_true", help="List all admins and exit.")
    parser.add_argument("--deactivate", metavar="EMAIL", help="Revoke an admin's access.")
    parser.add_argument("--activate", metavar="EMAIL", help="Restore a deactivated admin.")
    parser.add_argument("--password-reset", metavar="EMAIL", help="Set a new password.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.list:
            return list_admins(db)

        for flag, active in (("deactivate", False), ("activate", True)):
            email = getattr(args, flag)
            if email:
                admin = db.query(AdminUser).filter(AdminUser.email == email.strip().lower()).first()
                if admin is None:
                    sys.exit(f"No admin with email {email!r}.")
                admin.is_active = active
                db.commit()
                print(f"{'Activated' if active else 'Deactivated'} {admin.email}.")
                return

        if args.password_reset:
            admin = (
                db.query(AdminUser)
                .filter(AdminUser.email == args.password_reset.strip().lower())
                .first()
            )
            if admin is None:
                sys.exit(f"No admin with email {args.password_reset!r}.")
            admin.password_hash = generate_password_hash(_prompt_password())
            db.commit()
            print(f"Password updated for {admin.email}.")
            return

        # Default: create a new admin.
        email = (args.email or input("Email: ")).strip().lower()
        if not email or "@" not in email:
            sys.exit("A valid email address is required.")
        if db.query(AdminUser).filter(AdminUser.email == email).first():
            sys.exit(f"{email} is already an admin. Use --password-reset to change their password.")

        admin = AdminUser(
            email=email,
            name=(args.name or "").strip() or None,
            password_hash=generate_password_hash(_prompt_password()),
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print(f"\nCreated admin {email}. Sign in at /admin.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

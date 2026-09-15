"""
Auth helpers - acquire Supabase JWTs for admin and client test accounts
using the Supabase REST auth API directly (no JS SDK required).
"""
import os
import requests


def acquire_token(email: str, password: str, supabase_url: str, anon_key: str) -> str:
    """
    Sign in via Supabase REST and return the access_token JWT.
    Raises RuntimeError on failure.
    """
    url = f"{supabase_url}/auth/v1/token?grant_type=password"
    resp = requests.post(
        url,
        json={"email": email, "password": password},
        headers={"apikey": anon_key, "Content-Type": "application/json"},
        timeout=10,
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"Auth failed for {email}: {resp.status_code} {resp.text[:200]}"
        )
    data = resp.json()
    token = data.get("access_token")
    if not token:
        raise RuntimeError(f"No access_token in auth response: {data}")
    return token


def acquire_admin_token() -> str:
    return acquire_token(
        email=os.environ["TEST_ADMIN_EMAIL"],
        password=os.environ["TEST_ADMIN_PASSWORD"],
        supabase_url=os.environ["SUPABASE_URL"],
        anon_key=os.environ["SUPABASE_ANON_KEY"],
    )


def acquire_client_token() -> str:
    return acquire_token(
        email=os.environ["TEST_CLIENT_EMAIL"],
        password=os.environ["TEST_CLIENT_PASSWORD"],
        supabase_url=os.environ["SUPABASE_URL"],
        anon_key=os.environ["SUPABASE_ANON_KEY"],
    )

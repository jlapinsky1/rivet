"""
Service-role Supabase REST client for test setup and teardown ONLY.
Never use the service-role key inside test assertions - it bypasses RLS
and would give false confidence about authorization.
"""
import os
import requests


class SupabaseServiceClient:
    """Thin REST wrapper using the service-role key."""

    def __init__(self, url: str, service_role_key: str):
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def _table_url(self, table: str) -> str:
        return f"{self.url}/rest/v1/{table}"

    def select(self, table: str, filters: dict | None = None, columns: str = "*") -> list:
        params = {"select": columns}
        if filters:
            params.update(filters)
        resp = requests.get(self._table_url(table), headers=self.headers, params=params, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def insert(self, table: str, data: dict | list) -> list:
        resp = requests.post(
            self._table_url(table),
            headers=self.headers,
            json=data if isinstance(data, list) else [data],
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def update(self, table: str, data: dict, filters: dict) -> list:
        params = {k: v for k, v in filters.items()}
        resp = requests.patch(
            self._table_url(table),
            headers=self.headers,
            json=data,
            params=params,
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def delete(self, table: str, filters: dict) -> None:
        params = {k: v for k, v in filters.items()}
        resp = requests.delete(
            self._table_url(table),
            headers=self.headers,
            params=params,
            timeout=10,
        )
        resp.raise_for_status()

    def rpc(self, function_name: str, params: dict | None = None) -> dict:
        resp = requests.post(
            f"{self.url}/rest/v1/rpc/{function_name}",
            headers=self.headers,
            json=params or {},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()


def get_service_client() -> SupabaseServiceClient:
    return SupabaseServiceClient(
        url=os.environ["SUPABASE_URL"],
        service_role_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

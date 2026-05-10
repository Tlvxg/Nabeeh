"""Supabase client initialization."""

from supabase import create_client, Client
from app.config import settings

# Read-only client (anon key) - for public data queries
_supabase_client: Client | None = None

# Service client (service_role key) - for write operations
_supabase_service: Client | None = None


def get_supabase() -> Client:
    """Get the Supabase client with anon key (read-only public access)."""
    global _supabase_client
    if _supabase_client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be set in environment"
            )
        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _supabase_client


def get_supabase_service() -> Client:
    """Get the Supabase client with service_role key (write access, bypasses RLS)."""
    global _supabase_service
    if _supabase_service is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment"
            )
        _supabase_service = create_client(
            settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY
        )
    return _supabase_service

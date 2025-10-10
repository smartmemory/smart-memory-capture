"""
Authentication and authorization
"""
from fastapi import HTTPException, Header
from typing import Optional
import os
import secrets

# In production, store API keys in database or environment variables
# For now, we'll use a simple API key system
VALID_API_KEYS = set(os.getenv("API_KEYS", "").split(","))

# Generate a default API key if none provided
if not VALID_API_KEYS or VALID_API_KEYS == {''}:
    default_key = secrets.token_urlsafe(32)
    VALID_API_KEYS = {default_key}
    print(f"\n{'='*60}")
    print(f"⚠️  No API keys configured!")
    print(f"Generated default API key: {default_key}")
    print(f"Set this in your Chrome extension settings.")
    print(f"{'='*60}\n")


async def verify_api_key(authorization: Optional[str] = Header(None)) -> str:
    """
    Verify API key from Authorization header
    
    Expected format: "Bearer <api_key>"
    """
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header"
        )
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise ValueError("Invalid authentication scheme")
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header format. Use: Bearer <api_key>"
        )
    
    if token not in VALID_API_KEYS:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key"
        )
    
    return token


def generate_api_key() -> str:
    """Generate a new API key"""
    return secrets.token_urlsafe(32)


def add_api_key(api_key: str):
    """Add a new API key to valid keys"""
    VALID_API_KEYS.add(api_key)


def remove_api_key(api_key: str):
    """Remove an API key"""
    VALID_API_KEYS.discard(api_key)

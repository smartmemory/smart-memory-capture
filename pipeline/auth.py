"""
Authentication for pipeline service
"""
from fastapi import HTTPException, Header
from typing import Optional
import os

# API keys for pipeline access
VALID_API_KEYS = set(os.getenv("PIPELINE_API_KEYS", "").split(","))

# Generate default key if none provided
if not VALID_API_KEYS or VALID_API_KEYS == {''}:
    import secrets
    default_key = secrets.token_urlsafe(32)
    VALID_API_KEYS = {default_key}
    print(f"\n{'='*60}")
    print(f"⚠️  No pipeline API keys configured!")
    print(f"Generated default API key: {default_key}")
    print(f"Set this in your Chrome extension settings.")
    print(f"{'='*60}\n")


async def verify_api_key(authorization: Optional[str] = Header(None)) -> str:
    """Verify API key from Authorization header"""
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

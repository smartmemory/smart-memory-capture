"""
Smart Memory Capture - FastAPI Service
A production-ready backend for the Chrome extension
"""
from fastapi import FastAPI, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional, List
import uvicorn
from datetime import datetime

from models import Clip, ClipCreate, ClipResponse, ClipsListResponse, SearchResponse
from database import get_db, init_db
from auth import verify_api_key
from sqlalchemy.orm import Session

app = FastAPI(
    title="Smart Memory Capture API",
    description="Backend service for Smart Memory Capture Chrome Extension",
    version="1.0.0"
)

# CORS configuration - allows Chrome extension to make requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your extension ID
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    init_db()
    print("✓ Database initialized")
    print("✓ Smart Memory Capture API is ready")


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Smart Memory Capture API",
        "status": "running",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """Detailed health check with database status"""
    try:
        # Test database connection
        db.execute("SELECT 1")
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return {
        "status": "healthy",
        "database": db_status,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/api/clips", response_model=ClipResponse)
async def create_clip(
    clip: ClipCreate,
    db: Session = Depends(get_db),
    api_key: str = Depends(verify_api_key)
):
    """
    Create a new clip (called by Chrome extension)
    
    - **clip**: Clip data from the extension
    - **Authorization**: Bearer token required
    """
    try:
        # Create clip in database
        db_clip = Clip(
            clip_id=clip.id,
            title=clip.title,
            url=clip.url,
            mode=clip.mode,
            content_type=clip.content.type,
            content_data=clip.content.data,
            content_html=clip.content.html,
            tags=",".join(clip.tags) if clip.tags else "",
            notes=clip.notes or "",
            timestamp=clip.timestamp,
            favicon=clip.favicon,
            user_id=api_key  # Use API key as user identifier
        )
        
        db.add(db_clip)
        db.commit()
        db.refresh(db_clip)
        
        return ClipResponse(
            success=True,
            message="Clip saved successfully",
            clip_id=db_clip.clip_id
        )
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save clip: {str(e)}")


@app.get("/api/clips", response_model=ClipsListResponse)
async def list_clips(
    skip: int = Query(0, ge=0, description="Number of clips to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Number of clips to return"),
    mode: Optional[str] = Query(None, description="Filter by capture mode"),
    tag: Optional[str] = Query(None, description="Filter by tag"),
    db: Session = Depends(get_db),
    api_key: str = Depends(verify_api_key)
):
    """
    List all clips for the authenticated user
    
    - **skip**: Pagination offset
    - **limit**: Number of results (max 1000)
    - **mode**: Filter by capture mode (full, article, selection, screenshot)
    - **tag**: Filter by tag
    """
    query = db.query(Clip).filter(Clip.user_id == api_key)
    
    # Apply filters
    if mode:
        query = query.filter(Clip.mode == mode)
    if tag:
        query = query.filter(Clip.tags.contains(tag))
    
    # Get total count
    total = query.count()
    
    # Get paginated results
    clips = query.order_by(Clip.created_at.desc()).offset(skip).limit(limit).all()
    
    return ClipsListResponse(
        success=True,
        total=total,
        clips=[clip.to_dict() for clip in clips]
    )


@app.get("/api/clips/{clip_id}")
async def get_clip(
    clip_id: str,
    db: Session = Depends(get_db),
    api_key: str = Depends(verify_api_key)
):
    """Get a specific clip by ID"""
    clip = db.query(Clip).filter(
        Clip.clip_id == clip_id,
        Clip.user_id == api_key
    ).first()
    
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    
    return {
        "success": True,
        "clip": clip.to_dict()
    }


@app.put("/api/clips/{clip_id}")
async def update_clip(
    clip_id: str,
    clip_update: ClipCreate,
    db: Session = Depends(get_db),
    api_key: str = Depends(verify_api_key)
):
    """Update an existing clip"""
    clip = db.query(Clip).filter(
        Clip.clip_id == clip_id,
        Clip.user_id == api_key
    ).first()
    
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    
    # Update fields
    clip.title = clip_update.title
    clip.url = clip_update.url
    clip.mode = clip_update.mode
    clip.content_type = clip_update.content.type
    clip.content_data = clip_update.content.data
    clip.content_html = clip_update.content.html
    clip.tags = ",".join(clip_update.tags) if clip_update.tags else ""
    clip.notes = clip_update.notes or ""
    clip.updated_at = datetime.utcnow()
    
    db.commit()
    
    return {
        "success": True,
        "message": "Clip updated successfully"
    }


@app.delete("/api/clips/{clip_id}")
async def delete_clip(
    clip_id: str,
    db: Session = Depends(get_db),
    api_key: str = Depends(verify_api_key)
):
    """Delete a clip"""
    clip = db.query(Clip).filter(
        Clip.clip_id == clip_id,
        Clip.user_id == api_key
    ).first()
    
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    
    db.delete(clip)
    db.commit()
    
    return {
        "success": True,
        "message": "Clip deleted successfully"
    }


@app.get("/api/search", response_model=SearchResponse)
async def search_clips(
    q: str = Query(..., min_length=1, description="Search query"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    api_key: str = Depends(verify_api_key)
):
    """
    Full-text search across clips
    
    - **q**: Search query (searches title, content, tags)
    - **skip**: Pagination offset
    - **limit**: Number of results
    """
    search_term = f"%{q}%"
    
    query = db.query(Clip).filter(
        Clip.user_id == api_key,
        (
            Clip.title.ilike(search_term) |
            Clip.content_data.ilike(search_term) |
            Clip.tags.ilike(search_term) |
            Clip.notes.ilike(search_term)
        )
    )
    
    total = query.count()
    clips = query.order_by(Clip.created_at.desc()).offset(skip).limit(limit).all()
    
    return SearchResponse(
        success=True,
        query=q,
        total=total,
        results=[clip.to_dict() for clip in clips]
    )


@app.get("/api/tags")
async def get_tags(
    db: Session = Depends(get_db),
    api_key: str = Depends(verify_api_key)
):
    """Get all unique tags for the user"""
    clips = db.query(Clip).filter(Clip.user_id == api_key).all()
    
    tags_set = set()
    for clip in clips:
        if clip.tags:
            tags_set.update(tag.strip() for tag in clip.tags.split(","))
    
    return {
        "success": True,
        "tags": sorted(list(tags_set))
    }


@app.get("/api/stats")
async def get_stats(
    db: Session = Depends(get_db),
    api_key: str = Depends(verify_api_key)
):
    """Get statistics about user's clips"""
    total_clips = db.query(Clip).filter(Clip.user_id == api_key).count()
    
    # Count by mode
    modes = db.query(Clip.mode, db.func.count(Clip.id)).filter(
        Clip.user_id == api_key
    ).group_by(Clip.mode).all()
    
    # Recent clips (last 7 days)
    from datetime import timedelta
    week_ago = datetime.utcnow() - timedelta(days=7)
    recent_clips = db.query(Clip).filter(
        Clip.user_id == api_key,
        Clip.created_at >= week_ago
    ).count()
    
    return {
        "success": True,
        "total_clips": total_clips,
        "clips_by_mode": {mode: count for mode, count in modes},
        "clips_last_7_days": recent_clips
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )

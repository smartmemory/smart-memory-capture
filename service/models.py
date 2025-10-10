"""
Data models for Smart Memory Capture API
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ContentData(BaseModel):
    """Content structure from the extension"""
    type: str = Field(..., description="Content type: html, text, or screenshot")
    data: str = Field(..., description="The actual content")
    html: Optional[str] = Field(None, description="Original HTML if available")


class ClipCreate(BaseModel):
    """Clip data received from Chrome extension"""
    id: str = Field(..., description="Unique clip ID (timestamp)")
    title: str = Field(..., description="Page title")
    url: str = Field(..., description="Source URL")
    mode: str = Field(..., description="Capture mode: full, article, selection, screenshot")
    content: ContentData
    tags: List[str] = Field(default_factory=list, description="List of tags")
    notes: Optional[str] = Field("", description="User notes")
    timestamp: str = Field(..., description="ISO timestamp")
    favicon: Optional[str] = Field(None, description="Page favicon URL")
    
    class Config:
        schema_extra = {
            "example": {
                "id": "1728519120000",
                "title": "Example Page",
                "url": "https://example.com",
                "mode": "full",
                "content": {
                    "type": "html",
                    "data": "Page content here...",
                    "html": "<div>HTML content</div>"
                },
                "tags": ["research", "important"],
                "notes": "Interesting article about...",
                "timestamp": "2025-10-09T19:21:50.000Z",
                "favicon": "https://example.com/favicon.ico"
            }
        }


class ClipResponse(BaseModel):
    """Response after creating/updating a clip"""
    success: bool
    message: Optional[str] = None
    clip_id: Optional[str] = None


class ClipDict(BaseModel):
    """Clip data returned to client"""
    id: str
    clip_id: str
    title: str
    url: str
    mode: str
    content_type: str
    content_data: str
    content_html: Optional[str]
    tags: List[str]
    notes: str
    timestamp: str
    favicon: Optional[str]
    created_at: str
    updated_at: str


class ClipsListResponse(BaseModel):
    """Response for listing clips"""
    success: bool
    total: int
    clips: List[dict]


class SearchResponse(BaseModel):
    """Response for search queries"""
    success: bool
    query: str
    total: int
    results: List[dict]

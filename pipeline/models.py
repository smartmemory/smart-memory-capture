"""
Data models for pipeline service
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class ContentData(BaseModel):
    """Content from extension"""
    type: str
    data: str
    html: Optional[str] = None


class ClipInput(BaseModel):
    """Clip received from Chrome extension"""
    id: str
    title: str
    url: str
    mode: str
    content: ContentData
    tags: List[str] = []
    notes: str = ""
    timestamp: str
    favicon: Optional[str] = None


class ClipProcessed(BaseModel):
    """Processed clip with AI-extracted metadata"""
    id: str
    title: str
    url: str
    mode: str
    content: ContentData
    tags: List[str]
    notes: str
    timestamp: str
    favicon: Optional[str]
    metadata: Dict[str, Any]


class PipelineResponse(BaseModel):
    """Response from pipeline processing"""
    success: bool
    message: str
    clip_id: str
    processing_stages: Dict[str, bool]
    metadata: Dict[str, Any]

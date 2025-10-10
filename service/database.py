"""
Database configuration and models
"""
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

# Database URL - use environment variable or default to SQLite
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./smart_memory.db")

# For PostgreSQL in production, use:
# DATABASE_URL = "postgresql://user:password@localhost/smart_memory"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Clip(Base):
    """Clip database model"""
    __tablename__ = "clips"
    
    id = Column(Integer, primary_key=True, index=True)
    clip_id = Column(String(50), unique=True, index=True, nullable=False)
    user_id = Column(String(100), index=True, nullable=False)  # API key as user ID
    
    # Clip metadata
    title = Column(String(500), nullable=False)
    url = Column(Text, nullable=False)
    mode = Column(String(20), nullable=False)  # full, article, selection, screenshot
    
    # Content
    content_type = Column(String(20), nullable=False)  # html, text, screenshot
    content_data = Column(Text, nullable=False)
    content_html = Column(Text, nullable=True)
    
    # Organization
    tags = Column(String(500), default="")
    notes = Column(Text, default="")
    
    # Timestamps
    timestamp = Column(String(50), nullable=False)  # Original timestamp from extension
    favicon = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Indexes for better query performance
    __table_args__ = (
        Index('idx_user_created', 'user_id', 'created_at'),
        Index('idx_user_mode', 'user_id', 'mode'),
        Index('idx_user_tags', 'user_id', 'tags'),
    )
    
    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            "id": self.id,
            "clip_id": self.clip_id,
            "title": self.title,
            "url": self.url,
            "mode": self.mode,
            "content_type": self.content_type,
            "content_data": self.content_data,
            "content_html": self.content_html,
            "tags": [tag.strip() for tag in self.tags.split(",") if tag.strip()],
            "notes": self.notes,
            "timestamp": self.timestamp,
            "favicon": self.favicon,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

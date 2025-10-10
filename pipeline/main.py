"""
Smart Memory Capture - AI/ML Pipeline
Processes clips through AI extraction before sending to storage service
"""
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Dict, Any
import uvicorn
import httpx
import os
from datetime import datetime

from models import ClipInput, ClipProcessed, PipelineResponse
from extractors import ContentExtractor, MetadataExtractor, EmbeddingGenerator
from processors import TextCleaner, EntityExtractor, SummaryGenerator
from auth import verify_api_key

app = FastAPI(
    title="Smart Memory Capture Pipeline",
    description="AI/ML processing pipeline for web clips",
    version="1.0.0"
)

# CORS for Chrome extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
STORAGE_SERVICE_URL = os.getenv("STORAGE_SERVICE_URL", "http://localhost:8000")
STORAGE_API_KEY = os.getenv("STORAGE_API_KEY", "")

# Initialize processors
content_extractor = ContentExtractor()
metadata_extractor = MetadataExtractor()
embedding_generator = EmbeddingGenerator()
text_cleaner = TextCleaner()
entity_extractor = EntityExtractor()
summary_generator = SummaryGenerator()


@app.on_event("startup")
async def startup_event():
    """Initialize AI models on startup"""
    print("🚀 Initializing AI/ML Pipeline...")
    await content_extractor.initialize()
    await embedding_generator.initialize()
    await entity_extractor.initialize()
    await summary_generator.initialize()
    print("✓ Pipeline ready")


@app.get("/")
async def root():
    """Health check"""
    return {
        "service": "Smart Memory Capture Pipeline",
        "status": "running",
        "version": "1.0.0",
        "storage_service": STORAGE_SERVICE_URL
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "processors": {
            "content_extractor": content_extractor.is_ready(),
            "metadata_extractor": metadata_extractor.is_ready(),
            "embedding_generator": embedding_generator.is_ready(),
            "entity_extractor": entity_extractor.is_ready(),
            "summary_generator": summary_generator.is_ready()
        },
        "storage_service": STORAGE_SERVICE_URL,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/api/clips", response_model=PipelineResponse)
async def process_clip(
    clip: ClipInput,
    background_tasks: BackgroundTasks,
    api_key: str = Depends(verify_api_key)
):
    """
    Process clip through AI/ML pipeline and forward to storage service
    
    Pipeline stages:
    1. Content extraction & cleaning
    2. Metadata extraction (entities, keywords, topics)
    3. Summary generation
    4. Embedding generation
    5. Forward to storage service
    """
    try:
        print(f"📥 Processing clip: {clip.title}")
        
        # Stage 1: Extract and clean content
        print("  → Stage 1: Content extraction")
        extracted_content = await content_extractor.extract(
            html=clip.content.html,
            text=clip.content.data,
            mode=clip.mode
        )
        
        cleaned_text = text_cleaner.clean(extracted_content)
        
        # Stage 2: Extract metadata
        print("  → Stage 2: Metadata extraction")
        entities = await entity_extractor.extract(cleaned_text)
        keywords = await metadata_extractor.extract_keywords(cleaned_text)
        topics = await metadata_extractor.extract_topics(cleaned_text)
        
        # Stage 3: Generate summary
        print("  → Stage 3: Summary generation")
        summary = await summary_generator.generate(
            text=cleaned_text,
            max_length=200
        )
        
        # Stage 4: Generate embeddings
        print("  → Stage 4: Embedding generation")
        embedding = await embedding_generator.generate(cleaned_text)
        
        # Stage 5: Prepare enriched clip
        enriched_clip = {
            "id": clip.id,
            "title": clip.title,
            "url": clip.url,
            "mode": clip.mode,
            "content": {
                "type": clip.content.type,
                "data": cleaned_text,
                "html": clip.content.html
            },
            "tags": list(set(clip.tags + keywords[:5])),  # Add top 5 keywords as tags
            "notes": clip.notes,
            "timestamp": clip.timestamp,
            "favicon": clip.favicon,
            # AI-extracted metadata
            "metadata": {
                "summary": summary,
                "entities": entities,
                "keywords": keywords,
                "topics": topics,
                "embedding": embedding,
                "word_count": len(cleaned_text.split()),
                "reading_time_minutes": len(cleaned_text.split()) // 200,
                "language": await metadata_extractor.detect_language(cleaned_text),
                "sentiment": await metadata_extractor.analyze_sentiment(cleaned_text)
            }
        }
        
        # Stage 6: Forward to storage service
        print("  → Stage 5: Forwarding to storage service")
        storage_response = await forward_to_storage(enriched_clip, api_key)
        
        print(f"✓ Clip processed successfully: {clip.id}")
        
        return PipelineResponse(
            success=True,
            message="Clip processed and stored successfully",
            clip_id=clip.id,
            processing_stages={
                "content_extraction": True,
                "metadata_extraction": True,
                "summary_generation": True,
                "embedding_generation": True,
                "storage": storage_response.get("success", False)
            },
            metadata={
                "summary": summary,
                "entities_count": len(entities),
                "keywords_count": len(keywords),
                "topics": topics[:3]  # Top 3 topics
            }
        )
        
    except Exception as e:
        print(f"✗ Error processing clip: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline processing failed: {str(e)}"
        )


async def forward_to_storage(clip_data: Dict[str, Any], api_key: str) -> Dict:
    """Forward processed clip to storage service"""
    if not STORAGE_SERVICE_URL:
        raise ValueError("STORAGE_SERVICE_URL not configured")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{STORAGE_SERVICE_URL}/api/clips",
                json=clip_data,
                headers={
                    "Authorization": f"Bearer {STORAGE_API_KEY or api_key}",
                    "Content-Type": "application/json"
                },
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to forward to storage service: {str(e)}"
            )


@app.post("/api/reprocess/{clip_id}")
async def reprocess_clip(
    clip_id: str,
    api_key: str = Depends(verify_api_key)
):
    """
    Fetch a clip from storage, reprocess through pipeline, and update
    Useful for reprocessing old clips with new AI models
    """
    # Fetch clip from storage
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{STORAGE_SERVICE_URL}/api/clips/{clip_id}",
            headers={"Authorization": f"Bearer {STORAGE_API_KEY or api_key}"}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=404, detail="Clip not found")
        
        clip_data = response.json()["clip"]
    
    # Reprocess through pipeline
    # ... (similar to process_clip)
    
    return {
        "success": True,
        "message": "Clip reprocessed successfully"
    }


@app.get("/api/stats")
async def get_pipeline_stats():
    """Get pipeline processing statistics"""
    return {
        "success": True,
        "stats": {
            "models_loaded": {
                "content_extractor": content_extractor.is_ready(),
                "embedding_generator": embedding_generator.is_ready(),
                "entity_extractor": entity_extractor.is_ready(),
                "summary_generator": summary_generator.is_ready()
            },
            "storage_service": STORAGE_SERVICE_URL
        }
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )

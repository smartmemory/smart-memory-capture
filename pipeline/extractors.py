"""
Content extraction and processing
"""
from typing import Optional, List, Dict
from bs4 import BeautifulSoup
import re


class ContentExtractor:
    """Extract clean content from HTML"""
    
    def __init__(self):
        self.ready = True
    
    async def initialize(self):
        """Initialize extractor"""
        print("  ✓ Content extractor initialized")
    
    def is_ready(self) -> bool:
        return self.ready
    
    async def extract(self, html: Optional[str], text: str, mode: str) -> str:
        """
        Extract clean content from HTML or text
        
        For 'article' mode: Extract main article content
        For 'full' mode: Extract all text content
        For 'selection' mode: Return text as-is
        For 'screenshot' mode: Return text as-is
        """
        if mode in ['selection', 'screenshot'] or not html:
            return text
        
        if mode == 'article':
            return self._extract_article(html)
        
        return self._extract_full_text(html)
    
    def _extract_article(self, html: str) -> str:
        """Extract main article content using readability-like algorithm"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside']):
            element.decompose()
        
        # Try to find article content
        article = (
            soup.find('article') or
            soup.find('main') or
            soup.find(class_=re.compile(r'article|post|content|entry')) or
            soup.find('body')
        )
        
        if article:
            return article.get_text(separator=' ', strip=True)
        
        return soup.get_text(separator=' ', strip=True)
    
    def _extract_full_text(self, html: str) -> str:
        """Extract all text from HTML"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Remove scripts and styles
        for element in soup(['script', 'style']):
            element.decompose()
        
        return soup.get_text(separator=' ', strip=True)


class MetadataExtractor:
    """Extract metadata from content"""
    
    def __init__(self):
        self.ready = True
    
    def is_ready(self) -> bool:
        return self.ready
    
    async def extract_keywords(self, text: str, max_keywords: int = 10) -> List[str]:
        """
        Extract keywords from text
        
        In production, use:
        - RAKE (Rapid Automatic Keyword Extraction)
        - YAKE (Yet Another Keyword Extractor)
        - KeyBERT
        """
        # Simple implementation: extract most common meaningful words
        words = re.findall(r'\b[a-z]{4,}\b', text.lower())
        
        # Filter common stop words
        stop_words = {'that', 'this', 'with', 'from', 'have', 'been', 'were', 
                     'will', 'would', 'could', 'should', 'about', 'their', 'there'}
        words = [w for w in words if w not in stop_words]
        
        # Count frequency
        from collections import Counter
        word_freq = Counter(words)
        
        return [word for word, _ in word_freq.most_common(max_keywords)]
    
    async def extract_topics(self, text: str) -> List[str]:
        """
        Extract topics from text
        
        In production, use:
        - LDA (Latent Dirichlet Allocation)
        - BERTopic
        - Top2Vec
        """
        # Simple implementation: categorize based on keywords
        topics = []
        
        text_lower = text.lower()
        
        topic_keywords = {
            'technology': ['software', 'code', 'programming', 'api', 'database', 'algorithm'],
            'business': ['market', 'company', 'revenue', 'strategy', 'customer', 'sales'],
            'science': ['research', 'study', 'data', 'analysis', 'experiment', 'theory'],
            'education': ['learn', 'tutorial', 'course', 'teach', 'student', 'guide'],
            'news': ['report', 'announce', 'today', 'recent', 'update', 'breaking']
        }
        
        for topic, keywords in topic_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                topics.append(topic)
        
        return topics[:3] if topics else ['general']
    
    async def detect_language(self, text: str) -> str:
        """
        Detect language of text
        
        In production, use:
        - langdetect
        - fasttext language identification
        """
        # Simple heuristic
        if any(ord(char) > 127 for char in text[:100]):
            return 'non-english'
        return 'english'
    
    async def analyze_sentiment(self, text: str) -> Dict[str, float]:
        """
        Analyze sentiment of text
        
        In production, use:
        - VADER
        - TextBlob
        - Transformers sentiment models
        """
        # Simple implementation
        positive_words = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'best']
        negative_words = ['bad', 'terrible', 'awful', 'worst', 'horrible', 'poor']
        
        text_lower = text.lower()
        pos_count = sum(text_lower.count(word) for word in positive_words)
        neg_count = sum(text_lower.count(word) for word in negative_words)
        
        total = pos_count + neg_count
        if total == 0:
            return {'positive': 0.5, 'negative': 0.5, 'neutral': 1.0}
        
        return {
            'positive': pos_count / total if total > 0 else 0,
            'negative': neg_count / total if total > 0 else 0,
            'neutral': 1 - (pos_count + neg_count) / max(len(text.split()) / 10, 1)
        }


class EmbeddingGenerator:
    """Generate embeddings for semantic search"""
    
    def __init__(self):
        self.ready = False
        self.model = None
    
    async def initialize(self):
        """
        Initialize embedding model
        
        In production, use:
        - sentence-transformers (all-MiniLM-L6-v2)
        - OpenAI embeddings
        - Cohere embeddings
        """
        # For now, just mark as ready
        # In production: self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.ready = True
        print("  ✓ Embedding generator initialized (mock)")
    
    def is_ready(self) -> bool:
        return self.ready
    
    async def generate(self, text: str, max_length: int = 512) -> List[float]:
        """
        Generate embedding vector for text
        
        Returns 384-dimensional vector (for all-MiniLM-L6-v2)
        """
        # Mock implementation - returns zero vector
        # In production: return self.model.encode(text[:max_length]).tolist()
        return [0.0] * 384

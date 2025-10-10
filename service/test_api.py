"""
Test script for Smart Memory Capture API
Run this to verify your API is working correctly
"""
import requests
import json
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000"
API_KEY = "your-api-key-here"  # Replace with your actual API key

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}


def test_health():
    """Test health check endpoint"""
    print("\n1. Testing health check...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.json()}")
    return response.status_code == 200


def test_create_clip():
    """Test creating a clip"""
    print("\n2. Testing clip creation...")
    
    clip_data = {
        "id": str(int(datetime.now().timestamp() * 1000)),
        "title": "Test Clip",
        "url": "https://example.com/test",
        "mode": "full",
        "content": {
            "type": "text",
            "data": "This is a test clip created by the test script.",
            "html": None
        },
        "tags": ["test", "api"],
        "notes": "Created by test_api.py",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "favicon": "https://example.com/favicon.ico"
    }
    
    response = requests.post(
        f"{BASE_URL}/api/clips",
        headers=headers,
        json=clip_data
    )
    
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.json()}")
    
    if response.status_code == 200:
        return response.json().get("clip_id")
    return None


def test_list_clips():
    """Test listing clips"""
    print("\n3. Testing clip listing...")
    
    response = requests.get(
        f"{BASE_URL}/api/clips?skip=0&limit=10",
        headers=headers
    )
    
    print(f"   Status: {response.status_code}")
    data = response.json()
    print(f"   Total clips: {data.get('total', 0)}")
    print(f"   Returned: {len(data.get('clips', []))}")
    
    return response.status_code == 200


def test_search():
    """Test search functionality"""
    print("\n4. Testing search...")
    
    response = requests.get(
        f"{BASE_URL}/api/search?q=test",
        headers=headers
    )
    
    print(f"   Status: {response.status_code}")
    data = response.json()
    print(f"   Query: {data.get('query')}")
    print(f"   Results: {data.get('total', 0)}")
    
    return response.status_code == 200


def test_stats():
    """Test statistics endpoint"""
    print("\n5. Testing statistics...")
    
    response = requests.get(
        f"{BASE_URL}/api/stats",
        headers=headers
    )
    
    print(f"   Status: {response.status_code}")
    print(f"   Stats: {json.dumps(response.json(), indent=2)}")
    
    return response.status_code == 200


def test_tags():
    """Test tags endpoint"""
    print("\n6. Testing tags...")
    
    response = requests.get(
        f"{BASE_URL}/api/tags",
        headers=headers
    )
    
    print(f"   Status: {response.status_code}")
    data = response.json()
    print(f"   Tags: {data.get('tags', [])}")
    
    return response.status_code == 200


def main():
    """Run all tests"""
    print("="*60)
    print("Smart Memory Capture API Test Suite")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print(f"API Key: {API_KEY[:10]}..." if len(API_KEY) > 10 else "NOT SET")
    
    if API_KEY == "your-api-key-here":
        print("\n⚠️  WARNING: Please set your API key in this script!")
        print("   Update the API_KEY variable at the top of the file.")
        return
    
    results = []
    
    # Run tests
    results.append(("Health Check", test_health()))
    clip_id = test_create_clip()
    results.append(("Create Clip", clip_id is not None))
    results.append(("List Clips", test_list_clips()))
    results.append(("Search", test_search()))
    results.append(("Statistics", test_stats()))
    results.append(("Tags", test_tags()))
    
    # Summary
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\nPassed: {passed}/{total}")
    
    if passed == total:
        print("\n🎉 All tests passed!")
    else:
        print("\n⚠️  Some tests failed. Check the output above.")


if __name__ == "__main__":
    try:
        main()
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to API")
        print("   Make sure the server is running: python main.py")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")

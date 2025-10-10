#!/usr/bin/env python3
"""
Simple icon generator for the Chrome extension.
Creates three PNG files with gradient backgrounds.
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("PIL/Pillow not installed. Install with: pip install Pillow")

def create_icon(size, filename):
    """Create a simple gradient icon with clipboard emoji"""
    # Create image with gradient
    img = Image.new('RGB', (size, size))
    draw = ImageDraw.Draw(img)
    
    # Draw gradient background (purple to blue)
    for y in range(size):
        # Interpolate between two colors
        r = int(102 + (118 - 102) * y / size)
        g = int(126 + (75 - 126) * y / size)
        b = int(234 + (162 - 234) * y / size)
        draw.line([(0, y), (size, y)], fill=(r, g, b))
    
    # Try to add text
    try:
        font_size = int(size * 0.5)
        # Try to use a system font
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Apple Color Emoji.ttc", font_size)
        except:
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)
            except:
                font = ImageFont.load_default()
        
        # Draw clipboard icon (using text as fallback)
        text = "📋"
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        position = ((size - text_width) // 2, (size - text_height) // 2 - bbox[1])
        draw.text(position, text, fill='white', font=font)
    except Exception as e:
        # Fallback: draw a simple rectangle
        margin = size // 4
        draw.rectangle([margin, margin, size-margin, size-margin], 
                      outline='white', width=max(2, size//16))
    
    # Save
    img.save(filename, 'PNG')
    print(f"Created {filename}")

def main():
    if not PIL_AVAILABLE:
        print("\nCreating simple colored squares instead...")
        # Create very simple icons without PIL
        for size in [16, 48, 128]:
            img_data = create_simple_png(size)
            filename = f"icons/icon{size}.png"
            with open(filename, 'wb') as f:
                f.write(img_data)
            print(f"Created {filename}")
        return
    
    import os
    os.makedirs('icons', exist_ok=True)
    
    # Create icons in three sizes
    create_icon(16, 'icons/icon16.png')
    create_icon(48, 'icons/icon48.png')
    create_icon(128, 'icons/icon128.png')
    
    print("\n✓ All icons created successfully!")
    print("You can now load the extension in Chrome.")

def create_simple_png(size):
    """Create a minimal PNG without PIL"""
    # This creates a simple purple square
    import struct
    import zlib
    
    # PNG header
    png = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png += struct.pack('>I', len(ihdr))
    png += b'IHDR' + ihdr
    png += struct.pack('>I', zlib.crc32(b'IHDR' + ihdr) & 0xffffffff)
    
    # IDAT chunk (image data)
    raw_data = b''
    for y in range(size):
        raw_data += b'\x00'  # Filter type
        for x in range(size):
            # Purple color (102, 126, 234)
            raw_data += bytes([102, 126, 234])
    
    compressed = zlib.compress(raw_data, 9)
    png += struct.pack('>I', len(compressed))
    png += b'IDAT' + compressed
    png += struct.pack('>I', zlib.crc32(b'IDAT' + compressed) & 0xffffffff)
    
    # IEND chunk
    png += struct.pack('>I', 0)
    png += b'IEND'
    png += struct.pack('>I', zlib.crc32(b'IEND') & 0xffffffff)
    
    return png

if __name__ == '__main__':
    main()

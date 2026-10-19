#!/usr/bin/env python3
"""Render the extension icons (16/32/48/128) from the shipped SmartMemory logo.

Source: icons/logo.svg, a verbatim copy of smart-memory-web/public/logo.svg
(canonical; also smart-memory-design-system/assets/logo.svg). Requires rsvg-convert.
Sizes 48 and up use the logo as shipped. Sizes under 48 use the same mark with a
heavier stroke and larger nodes so it stays legible (the design system's
smartmemory-filament-color-bold.svg uses the same idea, stroke 4 vs 2.2).

Run from this folder:  python3 generate_icons.py
"""
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOGO = (HERE / "icons" / "logo.svg").read_text()


def small_variant(svg: str, stroke: float, node_r: float, hub_r: float) -> str:
    """Heavier-stroke variant of the logo for small sizes."""
    svg = svg.replace('stroke-width="4.348"', f'stroke-width="{stroke}"')
    svg = svg.replace('r="4.8"', f'r="{node_r}"')
    svg = svg.replace('r="8.2"', f'r="{hub_r}"')
    svg = svg.replace('r="6.1"', f'r="{hub_r + stroke / 2:.2f}"')
    return svg


VARIANTS = {
    16: small_variant(LOGO, stroke=7.5, node_r=5.5, hub_r=9.0),
    32: small_variant(LOGO, stroke=6.0, node_r=5.2, hub_r=8.6),
    48: LOGO,
    128: LOGO,
}


def main() -> int:
    for size, svg in VARIANTS.items():
        out = HERE / "icons" / f"icon{size}.png"
        proc = subprocess.run(
            ["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(out)],
            input=svg.encode(), capture_output=True,
        )
        if proc.returncode != 0:
            print(proc.stderr.decode(), file=sys.stderr)
            return 1
        print(f"wrote {out.relative_to(HERE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

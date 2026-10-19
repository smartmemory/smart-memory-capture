#!/usr/bin/env python3
"""WCAG contrast and palette check for the SmartMemory Capture extension (stdlib only).

Reads brand.css (dark default, light under prefers-color-scheme), popup.css, options.css,
library.css and the sheet <style> block in content.js. For every rule that sets both a text
color and a background, it merges the state variants (:hover, :active, :focus-visible,
:disabled, .btn-disabled, .active) over the base rule, resolves var() per scheme and prints
the contrast. A table of text-on-surface roles covers text whose background is set elsewhere.
Exits 1 if any pair is under 4.5:1, or if any color literal is not a colors_and_type.css token
(rgba() is allowed when its rgb is a token color, or black/white as in the token shadows).

Usage: check_contrast.py [--tokens PATH/colors_and_type.css] [--quiet]
"""
import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.dirname(HERE)
DEFAULT_TOKENS = os.environ.get(
    "SM_DESIGN_TOKENS",
    os.path.expanduser("~/reg/my/SmartMemory/smart-memory-design-system/colors_and_type.css"),
)
MIN_RATIO = 4.5
STATE_RE = re.compile(r":hover|:active|:focus-visible|:focus|:disabled|\.btn-disabled|\.active")
HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
RGBA_RE = re.compile(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)")


def strip_comments(text):
    return re.sub(r"/\*.*?\*/", "", text, flags=re.S)


def parse_decls(body):
    out = {}
    for part in body.split(";"):
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def parse_rules(text):
    rules = []
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", strip_comments(text)):
        sel = sel.strip()
        if sel.startswith("@"):
            continue
        rules.append((sel, parse_decls(body)))
    return rules


def hex_rgb(h):
    h = h.lstrip("#")
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def parse_color(v):
    """Return (r, g, b, a) or None."""
    v = v.strip()
    if v == "transparent":
        return (0, 0, 0, 0.0)
    m = HEX_RE.fullmatch(v)
    if m:
        r, g, b = hex_rgb(v)
        return (r, g, b, 1.0)
    m = RGBA_RE.fullmatch(v)
    if m:
        a = float(m.group(4)) if m.group(4) is not None else 1.0
        return (int(m.group(1)), int(m.group(2)), int(m.group(3)), a)
    return None


def composite(top, base):
    r, g, b, a = top
    return tuple(round(a * t + (1 - a) * u) for t, u in zip((r, g, b), base[:3])) + (1.0,)


def luminance(c):
    def lin(x):
        x /= 255
        return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = c[:3]
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def ratio(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def load_vars(brand_text):
    text = strip_comments(brand_text)
    dark = {}
    light = {}
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", text):
        if sel.strip() == ":root":
            decls = {k: v for k, v in parse_decls(body).items() if k.startswith("--")}
            # the media block's :root is the second :root in the file
            (dark if not dark else light).update(decls)
    schemes = {"dark": dict(dark), "light": {**dark, **light}}
    return schemes


def resolve(value, vars_, depth=0):
    if depth > 10:
        raise ValueError("var() cycle: " + value)
    m = re.fullmatch(r"var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)", value.strip())
    if m:
        name, fallback = m.groups()
        if name in vars_:
            return resolve(vars_[name], vars_, depth + 1)
        if fallback:
            return resolve(fallback, vars_, depth + 1)
        raise KeyError(name)
    return value.strip()


def color_of(expr, vars_, over=None):
    c = parse_color(resolve(expr, vars_))
    if c is None:
        return None
    if c[3] < 1.0:
        if over is None:
            return None
        c = composite(c, over)
    return c


def base_selector(sel):
    return re.sub(r"\s+", " ", STATE_RE.sub("", sel)).strip()


def states_of(sel):
    return sorted(set(STATE_RE.findall(sel)))


def sheet_css(content_js):
    m = re.search(r"<style>(.*?)</style>", content_js, flags=re.S)
    return m.group(1) if m else ""


def auto_pairs(name, rules, surfaces_order):
    """Yield (file, selector, state, fg_expr, bg_expr) for every rule with text + background."""
    bases = {}
    for sel, decls in rules:
        for one in (s.strip() for s in sel.split(",")):
            if not states_of(one):
                bases.setdefault(base_selector(one), {}).update(decls)
    seen = set()
    for sel, decls in rules:
        for one in (s.strip() for s in sel.split(",")):
            st = states_of(one)
            merged = dict(bases.get(base_selector(one), {})) if st else {}
            merged.update(decls)
            fg = merged.get("color")
            bg = merged.get("background") or merged.get("background-color")
            if not fg or not bg:
                continue
            key = (one, fg, bg)
            if key in seen:
                continue
            seen.add(key)
            yield name, one, "+".join(st) or "default", fg, bg


# text whose background is set by an ancestor: (label, fg, [background exprs])
SURFACES = ["var(--bg)", "var(--surface)", "var(--surface-2)"]
ROLE_PAIRS = [
    ("fg", "var(--fg)", SURFACES),
    ("fg-body", "var(--fg-body)", SURFACES),
    ("fg-muted / placeholder", "var(--fg-muted)", SURFACES),
    ("link", "var(--link)", SURFACES),
    ("link on selected", "var(--link)", ["var(--selected-bg)"]),
    ("option icon/title on selected", "var(--fg)", ["var(--selected-bg)"]),
    ("ok text", "var(--ok-fg)", ["var(--bg)", "var(--ok-bg)"]),
    ("warn text", "var(--warn-fg)", ["var(--bg)", "var(--warn-bg)"]),
    ("err text", "var(--err-fg)", ["var(--bg)", "var(--err-bg)"]),
    ("code text", "var(--code-fg)", ["var(--code-bg)"]),
    ("code language label", "var(--gray-400)", ["var(--code-bg)"]),
    ("header name", "#ffffff", ["var(--brand-bg)"]),
    ("header name span", "var(--gray-400)", ["var(--brand-bg)"]),
    ("danger", "var(--on-danger)", ["var(--danger)", "var(--danger-hover)"]),
]


def surface_base(vars_):
    return color_of("var(--bg)", vars_)


def check_contrast(files, schemes):
    rows = []
    fails = 0
    for scheme, vars_ in schemes.items():
        base_bg = surface_base(vars_)
        surf = color_of("var(--surface)", vars_)
        for label, fg, bgs in ROLE_PAIRS:
            for bg in bgs:
                try:
                    f = color_of(fg, vars_)
                    b = color_of(bg, vars_, over=surf)
                except KeyError:
                    continue  # role token not defined in this brand.css
                rows.append((scheme, "role", f"{label} on {bg[6:-1]}", fg, bg, ratio(f, b)))
        for fname, sel, st, fg, bg in files:
            # a transparent background shows the surface underneath: check both page surfaces
            bg_rgb = parse_color(resolve(bg, vars_)) if not bg.startswith("linear") else None
            if bg_rgb is None:
                continue
            under = [("bg", base_bg), ("surface", surf)] if bg_rgb[3] < 1.0 else [("", base_bg)]
            for tag, u in under:
                b = color_of(bg, vars_, over=u) if bg_rgb[3] < 1.0 else color_of(bg, vars_)
                if bg_rgb[3] == 0.0:
                    b = u
                f = color_of(fg, vars_, over=b)
                if f is None or b is None:
                    continue
                rows.append((scheme, fname, f"{sel} [{st}]" + (f" on {tag}" if tag else ""), fg, bg,
                             ratio(f, b)))
    for r in rows:
        if r[5] < MIN_RATIO:
            fails += 1
    return rows, fails


def token_set(tokens_text):
    toks = set()
    for h in HEX_RE.findall(strip_comments(tokens_text)):
        toks.add(hex_rgb(h))
    for m in RGBA_RE.finditer(strip_comments(tokens_text)):
        pass
    return toks


def check_palette(texts, tokens):
    allowed = set(tokens) | {(0, 0, 0), (255, 255, 255)}
    bad = []
    for name, text in texts:
        for lineno, line in enumerate(strip_comments(text).splitlines(), 1):
            for h in HEX_RE.findall(line):
                if hex_rgb(h) not in tokens:
                    bad.append((name, lineno, h))
            for m in RGBA_RE.finditer(line):
                if (int(m.group(1)), int(m.group(2)), int(m.group(3))) not in allowed:
                    bad.append((name, lineno, m.group(0)))
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tokens", default=DEFAULT_TOKENS)
    ap.add_argument("--quiet", action="store_true", help="print failures and the summary only")
    args = ap.parse_args()

    read = lambda n: open(os.path.join(EXT, n), encoding="utf-8").read()
    brand = read("brand.css")
    schemes = load_vars(brand)
    sheet = sheet_css(read("content.js"))
    sources = [("brand.css", brand), ("popup.css", read("popup.css")),
               ("options.css", read("options.css")), ("library.css", read("library.css")),
               ("content.js sheet", sheet)]
    files = []
    for name, text in sources:
        files.extend(auto_pairs(name, parse_rules(text), None))

    # The sheet has literal colors, no var(); it lives on a dark surface in both schemes.
    rows, fails = check_contrast(
        [f for f in files if f[0] != "content.js sheet"], schemes)
    sheet_rows, sheet_fails = check_contrast(
        [f for f in files if f[0] == "content.js sheet"], {"dark": schemes["dark"]})
    sheet_rows = [r for r in sheet_rows if r[1] == "content.js sheet"]
    # the sheet has no text-on-bg unless declared in one rule: add its surface roles explicitly
    sheet_roles = [
        ("sheet body text", "#d1d5db", "#111827"), ("sheet title", "#ffffff", "#111827"),
        ("sheet close", "#9ca3af", "#111827"), ("sheet preview", "#d1d5db", "#030712"),
        ("sheet input", "#ffffff", "#030712"), ("sheet placeholder", "#9ca3af", "#030712"),
        ("sheet status ok", "#4ade80", "#111827"), ("sheet status error", "#f87171", "#111827"),
    ]
    for label, fg, bg in sheet_roles:
        sheet_rows.append(("dark", "content.js sheet", label, fg, bg, ratio(parse_color(fg), parse_color(bg))))
    rows = [r for r in rows] + sheet_rows
    fails = sum(1 for r in rows if r[5] < MIN_RATIO)

    print(f"{'scheme':6} {'file':16} {'pair':58} {'ratio':>7}  ok")
    for scheme, fname, label, fg, bg, rt in rows:
        ok = rt >= MIN_RATIO
        if args.quiet and ok:
            continue
        print(f"{scheme:6} {fname:16} {label[:58]:58} {rt:7.3f}  {'ok' if ok else 'FAIL'}")

    if not os.path.exists(args.tokens):
        print(f"ERROR: token file not found: {args.tokens}", file=sys.stderr)
        return 2
    tokens = token_set(open(args.tokens, encoding="utf-8").read())
    bad = check_palette(sources, tokens)
    for name, lineno, lit in bad:
        print(f"PALETTE not a token: {name}:{lineno} {lit}")
    print(f"pairs={len(rows)} contrast_failures={fails} palette_violations={len(bad)} (min {MIN_RATIO}:1)")
    return 1 if fails or bad else 0


if __name__ == "__main__":
    sys.exit(main())

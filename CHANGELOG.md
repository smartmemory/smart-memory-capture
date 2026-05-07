# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CAP-ENH-1 hardening batch (1a/1c/1d/1f/1g/1h)
- Readability.js extraction + page metadata (CAP-ENH-1a/1f)
- Duplicate URL detection with `duplicatePolicy` config option (CAP-ENH-1c)
- YouTube transcript extraction (CAP-ENH-1d)
- Hero image inlining + selection-first capture sheet (CAP-ENH-1g/1h)
- Code page detection and extraction (CAP-ENH-1e)
- Compact layout, dark mode, design system tokens (v1.1.0)
- Generated icons committed so install works without manual generation

### Fixed
- CAP-SEC-1 — harden extension against XSS, auth, and injection vulnerabilities
- Re-capture prompt on updated page (CAP-ENH-1c)
- Remove spurious `return true` from message listener (async channel-closed warning)

### Changed
- Bump to v0.4.0; standardize versioning to 0.3.9 baseline (then to 0.4.0)

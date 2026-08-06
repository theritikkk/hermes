# ADR-023: Python for AI Workers

## Status

**Superseded** — OCR/classify duplicates removed during Phase 1 remediation (August 2026)

## Original Decision

Use Python 3.12 for all AI/ML activity workers (ocr-worker, classify-worker, embed-worker, ner-worker, ai-gateway).

## Why This Was Superseded

The Python `ocr_worker` and `classify_worker` duplicated the TypeScript implementations already present in `services/activity-workers/`. Neither Python version used any Python-specific ML library — both were simple stubs returning hardcoded data, identical in capability to the TypeScript stubs.

Per the "no second implementation" principle, the duplicates were removed. The TypeScript stubs in `services/activity-workers/` are the canonical Phase 1 implementations.

The remaining Python workers (`embed_worker`, `ner_worker`, `ai_gateway`) address Phase 2+ AI/ML capabilities. They have been moved out of the active build path. If Python is genuinely needed for Phase 2 ML libraries (pytesseract, spaCy, sentence-transformers), a new ADR should be written at that time with specific library justifications.

## References

- ADR-013: Node.js/TypeScript Lambda Runtime
- `services/activity-workers/` — canonical OCR and classify implementations

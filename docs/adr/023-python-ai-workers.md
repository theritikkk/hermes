# ADR-023: Python for AI Workers

## Status

Accepted

## Context

The platform requires advanced AI/ML capabilities, including OCR (pytesseract, Textract), NLP (spaCy), embeddings (sentence-transformers), and LLM orchestration (LangChain/LangGraph). The Python ecosystem offers first-class, mature libraries for these tasks, whereas Java and TypeScript alternatives are significantly inferior or incomplete.

## Decision

Use **Python 3.12** for all AI/ML activity workers (e.g., `ocr-worker`, `classify-worker`, `embed-worker`, `ner-worker`, `ai-gateway`).

These workers will be deployed as **Container Lambdas** rather than standard zip archives to accommodate the large deployment sizes of ML dependencies.

## Consequences

**Positive**
- Access to the industry-standard AI/ML ecosystem, ensuring high-quality and maintainable implementations.
- Container Lambdas sidestep the 250MB unzipped limit, easily accommodating large libraries like PyTorch or spaCy.

**Negative**
- Introduces a third runtime into the fleet (alongside Node.js/TypeScript and Java/Spring Boot).
- Increased operational overhead to manage Python dependencies, Dockerfile definitions, and build pipelines. This overhead is justified by the ecosystem quality advantage.

## Alternatives Considered

| Alternative | Rejected because |
|-------------|------------------|
| Java | Lacks a production-grade Textract OCR pipeline library and native ML bindings are cumbersome. |
| TypeScript | Frameworks like LangChain.js lag significantly behind their Python counterparts in features and stability. |

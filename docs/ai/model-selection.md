# Model Selection

Reviewed on March 3, 2026.

## Recommended starting stack

### Primary chat and drafting model

- `Qwen/Qwen3-14B`

Why:

- Strong multilingual coverage
- Good fit for drafting, summarization, and workflow assistance
- Open weights with broad ecosystem support
- Better quality ceiling than the smallest models without moving immediately into very expensive hardware

### Development fallback

- `Qwen/Qwen3-8B`

Why:

- Much easier local development footprint
- Good enough for UI integration, prompt iteration, and internal demos

### Embeddings

- `Qwen/Qwen3-Embedding-4B`

Why:

- Strong multilingual retrieval candidate
- Better fit than English-heavy embedding models when staff notes and user content may mix languages

### Guardrails

- `Qwen/Qwen3Guard-4B`

Why:

- Fits the need for prompt and output moderation before staff see or send model output

### OCR and document parsing

- `PaddleOCR-VL`
- `PP-StructureV3`

Why:

- Good fit for PDFs, scans, forms, tables, and layout-heavy documents
- Better starting point than forcing a general LLM to do document extraction alone

## Secondary option

- `Mistral Small 3.2`

Use it if:

- The team prefers the Mistral ecosystem
- You want a lighter general-purpose alternative for some chat workloads
- You later decide to compare drafting quality head-to-head against Qwen3

It is a good alternative, but the current repo needs multilingual intake and staff-assist workflows more than it needs a narrow benchmark win.

## Serving recommendation

- Development: `Ollama`
- Staging and production: `vLLM`

Both expose OpenAI-compatible APIs, which keeps the application provider-agnostic.

## Selection criteria used

- Multilingual performance
- Open deployment path
- Compatibility with OpenAI-style APIs
- Suitability for draft-only staff assistance
- Operational fit for a small internal GPU deployment

## Source notes

These choices are based on official materials reviewed on March 3, 2026:

- Qwen3 introduces dense and MoE families and positions the line for multilingual, agentic, and reasoning-capable use cases: <https://qwenlm.github.io/blog/qwen3/>
- Qwen3-Embedding adds multilingual retrieval models and rerankers: <https://qwenlm.github.io/blog/qwen3-embedding/>
- Qwen3Guard publishes a dedicated guardrail model family: <https://qwenlm.github.io/blog/qwen3guard/>
- Mistral documents `Mistral Small 3.2` and the rest of its model catalog here: <https://docs.mistral.ai/getting-started/models/models_overview/>
- PaddleOCR documents OCR and document parsing components here: <https://www.paddleocr.ai/latest/en/index.html>
- vLLM documents OpenAI-compatible serving here: <https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html>
- Ollama documents OpenAI compatibility here: <https://docs.ollama.com/openai>

## Decision

If only one stack is approved now, use:

```text
Chat/drafting:     Qwen/Qwen3-14B
Embeddings:        Qwen/Qwen3-Embedding-4B
Guardrails:        Qwen/Qwen3Guard-4B
OCR/layout:        PaddleOCR-VL + PP-StructureV3
Dev runtime:       Ollama
Prod runtime:      vLLM
```

# Hardware Sizing

Reviewed on March 3, 2026.

## Important note

The sizing numbers below are engineering estimates, not vendor guarantees. They are inferred from model families, parameter counts, quantization practice, and normal inference headroom. Final sizing should be validated with your target concurrency and context length before purchase.

## Recommended tiers

### Tier 1: Local development

Use when:

- Developers are prototyping prompts and UI
- No production traffic
- Small drafts only

Recommended:

- Apple Silicon with 32 GB to 64 GB unified memory, or
- 1 x consumer GPU with 16 GB to 24 GB VRAM

Model fit:

- `Qwen/Qwen3-8B` in 4-bit
- Small OCR tests only
- `mock` provider when no local model runtime is available

Runtime:

- Ollama

### Tier 2: Pilot deployment

Use when:

- A few staff members use newcomer drafts and email assistance
- Traffic is interactive but still low
- Human review remains mandatory

Recommended:

- 1 x 48 GB GPU

Examples:

- NVIDIA L40S 48 GB
- RTX 6000 Ada 48 GB

Model fit:

- `Qwen/Qwen3-14B` in 4-bit or 8-bit
- `Qwen/Qwen3-Embedding-4B` on the same host if load is low

Runtime:

- vLLM

Why this tier:

- It gives enough headroom for the 14B class while leaving room for batching, prompt overhead, and moderate context windows.

### Tier 3: Production internal service

Use when:

- Multiple staff workflows are live
- Search, drafting, and OCR jobs may overlap
- You need better latency and isolation

Recommended:

- 2 x 48 GB GPUs, or
- 1 x 80 GB GPU plus CPU workers for OCR

Examples:

- 2 x L40S 48 GB
- 1 x H100 80 GB
- 1 x A100 80 GB

Model fit:

- `Qwen/Qwen3-14B` for interactive drafting
- Separate embedding or OCR workers
- Optional upgrade path to larger models after real traffic data exists

Runtime:

- vLLM for chat/drafting
- background workers for OCR and indexing

## OCR sizing

PaddleOCR's own performance tables show GPU and CPU deployment ranges that are practical for document extraction workloads. For this repo, the simplest approach is:

- Keep OCR out of the synchronous API path
- Run OCR jobs in a worker process
- Start with CPU if volume is low
- Move OCR to a separate GPU worker only when document volume justifies it

## Memory heuristics

Use these working estimates when planning:

- 8B model, 4-bit: roughly 12 GB to 16 GB comfortable serving budget
- 14B model, 4-bit: roughly 20 GB to 24 GB comfortable serving budget
- 14B model, safer interactive headroom with concurrency: 48 GB class GPU
- Embeddings and OCR are easier to operate when separated from the main chat model under real load

These numbers include more than raw weights. They assume room for runtime overhead, KV cache, batching, and operational safety.

## Buying advice

If only one server is approved first:

1. Buy a single 48 GB GPU box.
2. Use it for `Qwen/Qwen3-14B` plus low-volume embeddings.
3. Keep OCR asynchronous and CPU-first.
4. Add a second GPU only after you have actual traffic and latency data.

That is the best balance between cost, capability, and operational simplicity for this system.

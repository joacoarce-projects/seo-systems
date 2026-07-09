---
name: strategic-brain
description: Produce the quincenal strategic brief for a client (Cerebro Estratégico v1, D044). Reads the client's existing outputs (deep-audit, keyword bank, refresh queue, onsite-audit, attribution log) and synthesizes a single strategic brief: síntesis del estado, oportunidades priorizadas, blind spots, roadmap 30/60/90, y métricas a vigilar. Single-pass synthesis, no new data pulls. Use when the user says "brief estratégico cliente X", "cerebro X", "que hacemos con X", or on the quincenal cadence.
allowed-tools: Read, Write, Edit, Bash
---

# Strategic Brain (Cerebro Estratégico v1, quincenal)

Synthesize everything the system already knows about a client into one strategic brief. This is the "visión general + hacia dónde vamos" layer (D044). It does NOT pull new data; it reads the outputs the other skills produced and turns them into a decision-ready brief.

## When to invoke

- "brief estratégico para X" / "cerebro X" / "síntesis de X"
- "¿qué hacemos con X?" / "¿hacia dónde va X?"
- The quincenal cadence (lunes 07:00 CL, when the cron exists).

## Workflow (source of truth)

**Read `seo-systems/prompts/strategic-brain.md` first, on every invocation.** It has the synthesis method, the brief template, and the priority rules.

## Client resolution

All input under `clientes/<slug>/`. Read whatever exists (skip gracefully what does not):
- `_config.json` (arquetipo, mode, camino)
- `state/deep-audit.json`, `state/onsite-audit.json`, `state/keyword-bank.json`, `state/refresh-queue.json`, `state/refresh-candidates.json`
- `output/deep-audit-*.md`, `output/onsite-audit.md`
- `cliente-log.md` (attribution)

Write the brief to `clientes/<slug>/output/brief-<YYYY-MM-DD>.md`.

## Hard rules

- **Read `prompts/strategic-brain.md` before writing.**
- Synthesis only. Do NOT invent findings not present in the source files. If a source is missing, note the gap ("sin deep-audit todavía") instead of guessing.
- Respect the archetype: for servicio-local, prioritize GBP + comuna coverage + concentración de relevancia (docs/09, D046-D049); for contenido-aeo, prioritize the 7-step flow + on-page checklist (docs/07).
- Apply "arreglar antes de agregar" (D023): technical issues score >7 and canibalización BLOCK new content in the roadmap.
- Report, do not validate. No qualitative verdicts without Joaquín's OK.
- Never use em dashes.

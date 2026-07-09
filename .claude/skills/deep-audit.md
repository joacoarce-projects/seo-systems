---
name: deep-audit
description: Run an end-to-end deep SEO audit of a client site. Detects the site archetype (servicio-local transaccional vs contenido-aeo), then runs GSC triage, ranked-keyword extraction (DataForSEO), backlink profile, structural pattern detection (Firecrawl), and benchmark vs top-3. For local sites it also checks GBP / local pack / comuna coverage. Produces a diagnosis report + JSON. Use when the user says "audita en profundidad", "deep audit cliente X", "por que rankea/cae este sitio", or wants the full picture, not just technical health.
allowed-tools: Read, Write, Edit, Bash, mcp__gsc__list_properties, mcp__gsc__get_search_analytics, mcp__gsc__get_search_by_page_query, mcp__dfs-mcp__dataforseo_labs_google_ranked_keywords, mcp__dfs-mcp__backlinks_summary, mcp__dfs-mcp__dataforseo_labs_google_domain_rank_overview, mcp__dfs-mcp__serp_organic_live_advanced, mcp__dfs-mcp__business_data_business_listings_search, mcp__firecrawl__firecrawl_scrape, mcp__firecrawl__firecrawl_map
---

# Deep Audit (auditoría end-to-end, on-demand)

Full-picture SEO audit of a client site: WHY it ranks (or why it declines), across GSC, ranked keywords, backlinks, structure, and SERP benchmark. This is NOT the technical-only `onsite-audit` (that one is Lighthouse + on-page health). This one explains the ranking engine and branches by archetype.

## When to invoke

- "audita en profundidad cliente X" / "deep audit X"
- "por que rankea este sitio" / "por que esta cayendo"
- "quiero entender el motor de posicionamiento de X"
- Any request for a complete audit, not just page speed / technical health.

## Workflow (source of truth)

**Read `seo-systems/prompts/deep-audit.md` first, on every invocation. Do not skim.** It contains the full step-by-step methodology, the archetype-detection heuristic, the token-management rules for the huge DataForSEO responses, and the report format.

## Client resolution

The user names a client ("audita cliente X"). All input/output is under `clientes/<slug>/`:
- Read `clientes/<slug>/_config.json` (site_url, mode, camino, arquetipo if set)
- Read `clientes/<slug>/context/` for services / money pages
- Write report to `clientes/<slug>/output/deep-audit-<YYYY-MM-DD>.md`
- Write structured findings to `clientes/<slug>/state/deep-audit.json`
- If detected, write `arquetipo` back into `_config.json`

If the site is not a registered client (ad-hoc audit of an external URL), run read-only and write the report to `clientes/_adhoc/<domain>-<date>.md`, no config write.

## Archetype branch (the whole point)

Detect archetype FIRST, then run the matching depth:
- **servicio-local** (intención transaccional: "a domicilio", "24h", "[servicio] [comuna]", "cerca de mi"; SERP con local_pack): also audit GBP, local pack presence, NAP consistency, comuna coverage. Benchmark against `docs/09-local-service-playbook.md`, NOT the 950-word floor.
- **contenido-aeo** (informacional / YMYL; SERP con AI Overview / featured snippet): benchmark against `docs/06-audit-protocol.md` M0-M6 + `docs/07-onpage-money-page-checklist.md` (floor 950 aplica).
- **hibrido**: run both lenses, label each money page by its own intent.

## Hard rules

- **Read `prompts/deep-audit.md` before any work.**
- Never invent metrics. Real GSC / DataForSEO / Firecrawl data only. If a source returns null, say null.
- DataForSEO `dataforseo_labs_google_ranked_keywords` returns huge payloads that get saved to a tool-results file. Do NOT try to read the full JSON into context. Extract compact rows with a Node one-liner (jq is NOT installed on this machine). See the prompt for the exact snippet.
- location_name "Chile", language_code "es" for CL clients.
- Separate what you MEASURED (numbers, positions, counts) from any hypothesis. Never declare "validado" or a qualitative verdict without Joaquín's OK.
- Never use em dashes in any generated text.

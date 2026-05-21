"""
Procesa el output del keyword-researcher para la seed "casas prefabricadas" (CL).

Inputs:
  - Tool result snapshots de related_keywords y keyword_ideas (DataForSEO).
  - state/{post,page}-sitemap.xml ya descargados.
  - state/keyword-bank.json y state/content-queue.json (estado actual).

Outputs:
  - state/keyword-bank.json (apend con dedup)
  - state/content-queue.json (apend top P1, max 5)
  - output/keywords/<fecha>-<seed-slug>.csv
"""
import json
import re
import datetime as dt
import unicodedata
import os
import sys
import csv

ROOT = r"C:\Users\joaquin\Desktop\RocketPulse\proyectos\L6-seo\seo-systems"
TOOL_RESULTS = r"C:\Users\joaquin\.claude\projects\C--Users-joaquin-Desktop-RocketPulse-proyectos-L6-seo-seo-systems\46be20b9-0add-4bb9-81fc-1a57ec0f8644\tool-results"

RELATED_FILE = os.path.join(TOOL_RESULTS, "mcp-dfs-mcp-dataforseo_labs_google_related_keywords-1779394053425.txt")
IDEAS_FILE = os.path.join(TOOL_RESULTS, "mcp-dfs-mcp-dataforseo_labs_google_keyword_ideas-1779394052686.txt")

BANK_PATH = os.path.join(ROOT, "state", "keyword-bank.json")
QUEUE_PATH = os.path.join(ROOT, "state", "content-queue.json")
SITEMAP_POST = os.path.join(ROOT, "state", "post-sitemap.xml")
SITEMAP_PAGE = os.path.join(ROOT, "state", "page-sitemap.xml")

OUT_DIR = os.path.join(ROOT, "output", "keywords")
os.makedirs(OUT_DIR, exist_ok=True)

TODAY = dt.date.today().isoformat()
SEED = "casas prefabricadas"
SEED_SLUG = "casas-prefabricadas"

# Marcas competidoras conocidas que aparecen embebidas en queries del SERP.
# No las pusheamos como targets porque son de marca de terceros.
COMPETITOR_BRAND_TOKENS = {
    "casas chile",  # cubre 'casas chile', 'casas chile spa', 'casas chile spa modelos y precios'
    "don robe",
    "el tepual",
    "labranza",
    "culipran",
    "avenida las industrias",
}

# Tokens ancla de relevancia. Una keyword DEBE contener al menos uno de estos
# (post-strip-accents, lowercase) para considerarse in-scope para casasprefab.
RELEVANCE_ANCHOR_TOKENS = {
    "prefabric",  # casas prefabricadas, prefab, prefabricación
    "modular",
    "tiny house",
    "container",
    "cabana",  # cabaña sin tilde tras strip_accents
    "metalcom",
    "sip",
    "llave en mano",
    "subsidio",
    "minvu",
    "permiso",  # permisos casa, permiso edificación
    "cotiza",  # cotizar, cotización
}

# Special-case: head terms del nicho que mapean directo a /
HOME_HEAD_TERMS = {
    "casas prefabricadas",
    "casas prefabricadas chile",
}


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def slugify(s):
    s = strip_accents(s.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:80]


def load_sitemap_urls():
    urls = []
    for f in (SITEMAP_POST, SITEMAP_PAGE):
        if os.path.exists(f):
            txt = open(f, encoding="utf-8").read()
            urls += re.findall(r"<loc>(.*?)</loc>", txt)
    # extraer slug por url
    out = []
    for u in urls:
        path = u.replace("https://casasprefabricadaschile.cl", "").strip("/")
        out.append({"url": u, "slug": path or "_home_", "tokens": set(slugify(path).split("-"))})
    return out


def coverage_check(keyword, sitemap):
    """Devuelve URL si la página existente cubre el intent de la keyword."""
    kw_low = strip_accents(keyword.lower()).strip()

    # Special-case head terms del nicho → home
    if kw_low in {strip_accents(t.lower()) for t in HOME_HEAD_TERMS}:
        for entry in sitemap:
            if entry["slug"] == "_home_":
                return entry["url"]

    kw_tokens = set(slugify(keyword).split("-"))
    # Tokens irrelevantes para match (genéricos del nicho)
    stop = {
        "casas", "casa", "chile", "de", "en", "y", "la", "el", "los", "las",
        "para", "con", "una", "prefabricadas", "prefabricada", "prefabricado",
        "prefab", "precios", "precio", "modelos", "modelo", "valor", "valores",
        "fotos", "foto", "y",
    }
    sig_kw_tokens = kw_tokens - stop
    if not sig_kw_tokens:
        return None  # solo tokens stop, no podemos matchear con confianza

    best = None
    best_overlap = 0
    for entry in sitemap:
        if entry["slug"] == "_home_":
            continue  # home solo para head terms (manejado arriba)
        url_tokens = entry["tokens"] - stop
        if not url_tokens:
            continue
        overlap = len(sig_kw_tokens & url_tokens)
        # Requiere overlap ≥ 1 Y que ese token represente al menos 50% de los tokens significativos de la URL
        if overlap > best_overlap and overlap >= 1 and overlap >= max(1, len(url_tokens) // 2):
            best_overlap = overlap
            best = entry["url"]
    return best


def extract_related(path):
    d = json.load(open(path, encoding="utf-8"))
    out = []
    for item in d.get("items", []):
        kd_obj = item.get("keyword_data", {})
        ki = kd_obj.get("keyword_info", {}) or {}
        kp = kd_obj.get("keyword_properties") or {}
        si = kd_obj.get("search_intent_info") or {}
        out.append({
            "keyword": kd_obj.get("keyword", "").strip(),
            "volume": ki.get("search_volume"),
            "cpc": ki.get("cpc"),
            "competition": ki.get("competition_level"),
            "kd": kp.get("keyword_difficulty"),
            "intent": si.get("main_intent"),
            "source": "related_keywords",
        })
    return out


def extract_ideas(path):
    d = json.load(open(path, encoding="utf-8"))
    out = []
    for item in d.get("items", []):
        ki = item.get("keyword_info", {}) or {}
        kp = item.get("keyword_properties") or {}
        si = item.get("search_intent_info") or {}
        out.append({
            "keyword": item.get("keyword", "").strip(),
            "volume": ki.get("search_volume"),
            "cpc": ki.get("cpc"),
            "competition": ki.get("competition_level"),
            "kd": kp.get("keyword_difficulty"),
            "intent": si.get("main_intent"),
            "source": "keyword_ideas",
        })
    return out


def is_out_of_scope(kw):
    """In-scope solo si contiene al menos un anchor de relevancia."""
    kw_low = strip_accents(kw.lower())
    for anchor in RELEVANCE_ANCHOR_TOKENS:
        if anchor in kw_low:
            return False
    return True  # default OOS (regla dura: si no tiene anchor, fuera)


def is_brand_competitor(kw):
    kw_low = strip_accents(kw.lower())
    for brand in COMPETITOR_BRAND_TOKENS:
        if strip_accents(brand) in kw_low:
            return True
    return False


def score_priority(kw_obj):
    """1=highest, 2=mid, 3=park. Skip si returns None."""
    vol = kw_obj.get("volume") or 0
    kd = kw_obj.get("kd")
    intent = kw_obj.get("intent")
    covered = kw_obj.get("covered_by")

    if vol == 0:
        return None
    if kd is not None and kd > 70:
        return None

    # Si está cubierto, drop a 3 (track pero no queue)
    if covered:
        return 3

    # Priority 1: vol >=100, kd <=35 (o null), intent commercial/transactional/informational
    if vol >= 500 and (kd is None or kd <= 35):
        return 1
    if vol >= 100 and (kd is None or kd <= 35):
        return 2
    return 3


def main():
    sitemap = load_sitemap_urls()
    print(f"[sitemap] {len(sitemap)} URLs cargadas")

    related = extract_related(RELATED_FILE)
    ideas = extract_ideas(IDEAS_FILE)
    print(f"[fan-out] related_keywords: {len(related)}  keyword_ideas: {len(ideas)}")

    # Dedup por keyword (case-insensitive, trimmed). Prefer related (más relevante).
    seen = {}
    for k in related + ideas:
        key = k["keyword"].lower().strip()
        if not key:
            continue
        if key in seen:
            continue
        seen[key] = k
    print(f"[dedup-fanout] keywords únicas: {len(seen)}")

    # Filter
    rows = []
    dropped_oos = 0
    dropped_brand = 0
    for kw_low, k in seen.items():
        if is_out_of_scope(k["keyword"]):
            dropped_oos += 1
            continue
        if is_brand_competitor(k["keyword"]):
            dropped_brand += 1
            continue
        rows.append(k)
    print(f"[filter] out-of-scope: {dropped_oos}  brand-competitor: {dropped_brand}")
    print(f"[filter] surviving: {len(rows)}")

    # Coverage check
    for r in rows:
        r["covered_by"] = coverage_check(r["keyword"], sitemap)

    covered = sum(1 for r in rows if r["covered_by"])
    print(f"[coverage] {covered} keywords ya cubiertas por URLs existentes")

    # Score + classify
    for r in rows:
        r["priority"] = score_priority(r)
    rows = [r for r in rows if r["priority"] is not None]

    # Load existing bank + queue
    bank = json.load(open(BANK_PATH, encoding="utf-8"))
    queue = json.load(open(QUEUE_PATH, encoding="utf-8"))

    existing_kw = {k["keyword"].lower().strip() for k in bank.get("keywords", [])}
    existing_queue_kw = {i["primary_keyword"].lower().strip() for i in queue.get("items", [])}

    new_bank_items = 0
    for r in rows:
        kw_low = r["keyword"].lower().strip()
        if kw_low in existing_kw:
            continue
        bank["keywords"].append({
            "keyword": r["keyword"],
            "seed": SEED,
            "intent": r["intent"],
            "volume": r["volume"],
            "kd": r["kd"],
            "cpc": r["cpc"],
            "competition": r["competition"],
            "priority": r["priority"],
            "fan_out_parent": SEED,
            "covered_by": r["covered_by"],
            "discovered": TODAY,
            "source": r["source"],
        })
        existing_kw.add(kw_low)
        new_bank_items += 1

    # Update seeds_researched
    seeds = bank.get("seeds_researched", [])
    seed_entry = next((s for s in seeds if s["seed"].lower().strip() == SEED), None)
    if seed_entry:
        seed_entry["last_researched"] = TODAY
    else:
        seeds.append({"seed": SEED, "last_researched": TODAY})
    bank["seeds_researched"] = seeds
    bank["last_updated"] = TODAY

    # Pick top P1 (uncovered) for queue, max 5
    p1_uncovered = [r for r in rows if r["priority"] == 1 and not r["covered_by"]]
    p1_uncovered.sort(key=lambda r: -(r["volume"] or 0))

    queued = 0
    for r in p1_uncovered[:5]:
        kw_low = r["keyword"].lower().strip()
        if kw_low in existing_queue_kw:
            continue
        slug = slugify(r["keyword"])
        item_id = f"{TODAY}-{slug}"
        # build fan_out_cluster: pick 4-8 supporting variations from same parent
        siblings = [s["keyword"] for s in rows
                    if s["keyword"].lower().strip() != kw_low
                    and any(tok in s["keyword"].lower() for tok in r["keyword"].lower().split() if len(tok) >= 4)]
        fan_out = siblings[:6]
        queue["items"].append({
            "id": item_id,
            "status": "queued",
            "queued_at": f"{TODAY}T00:00:00Z",
            "written_at": None,
            "post_url": None,
            "primary_keyword": r["keyword"],
            "intent": r["intent"],
            "volume": r["volume"],
            "kd": r["kd"],
            "fan_out_cluster": fan_out,
            "suggested_slug": slug,
            "suggested_title": r["keyword"].capitalize(),
            "target_word_count": 1800,
            "internal_link_targets": [],
            "external_authority_candidates": [],
            "notes": f"Auto-queued by keyword-researcher run {TODAY}. Seed: {SEED}.",
        })
        existing_queue_kw.add(kw_low)
        queued += 1

    json.dump(bank, open(BANK_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(queue, open(QUEUE_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # CSV
    csv_path = os.path.join(OUT_DIR, f"{TODAY}-{SEED_SLUG}.csv")
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["keyword", "intent", "volume", "kd", "cpc", "competition", "priority", "fan_out_parent", "covered_by", "source"])
        intent_order = {"transactional": 0, "commercial": 1, "informational": 2, "navigational": 3}
        rows_sorted = sorted(rows, key=lambda r: (intent_order.get(r.get("intent") or "informational", 9), r["priority"], -(r["volume"] or 0)))
        for r in rows_sorted:
            w.writerow([r["keyword"], r["intent"], r["volume"], r["kd"], r["cpc"], r["competition"], r["priority"], SEED, r["covered_by"] or "", r["source"]])

    # Run report
    print()
    print(f"# Keyword Research — {SEED} — {TODAY}")
    print()
    print(f"## Summary")
    print(f"- Seed: {SEED}")
    print(f"- Fan-out variations evaluated: {len(seen)}")
    print(f"- Surviving after filter: {len(rows)}")
    print(f"- Already covered: {covered}")
    print(f"- Added to bank: {new_bank_items}")
    print(f"- Queued for content writer: {queued}")
    print(f"- CSV: output/keywords/{TODAY}-{SEED_SLUG}.csv")
    print()
    print("## Top P1 queued (uncovered, ordered by volume)")
    print("| Keyword | Volume | KD | Intent |")
    print("|---|---|---|---|")
    for r in p1_uncovered[:5]:
        print(f"| {r['keyword']} | {r['volume']} | {r['kd']} | {r['intent']} |")
    print()
    print("## Intent split (todas, post filter)")
    intent_counts = {}
    for r in rows:
        intent_counts[r["intent"] or "unknown"] = intent_counts.get(r["intent"] or "unknown", 0) + 1
    for i, c in sorted(intent_counts.items(), key=lambda x: -x[1]):
        print(f"- {i}: {c}")
    print()
    print("## Notes")
    print("- related_keywords entregó 40 keywords todas relevantes (todas 'casas prefabricadas + qualifier').")
    print("- keyword_ideas con order_by=volume_desc trajo basura semántica (huesos de la mano, llave francesa, harry potter). Confirmado problema en `prompts/keyword-researcher.md`: usar default relevance,desc o filtrar por token relevante. La única keyword útil de ideas ya estaba en related.")
    print("- ChatGPT scraper entregó entidades para fan-out semántico: SIP, container, modulares, llave en mano, NCh 433, aislamiento térmico, permisos municipales — esto alimenta cluster planning (Fase 4) más que keyword list directo.")
    print("- KD nulo en muchas long-tail (DataForSEO no calcula KD para queries de bajo volumen). Tratadas como elegibles, no como blockers.")
    print()


if __name__ == "__main__":
    main()

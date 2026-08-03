#!/usr/bin/env python3
"""Lint a Content Writer markdown post against the hard quality rules.

Exits 0 if the post passes every rule. Exits 1 if any rule fails, with a
human-readable list of failures printed to stdout.

Rules checked:
  1. Zero em-dashes (—)
  2. Zero phrases from context/brand-guidelines.md "Banned words and phrases"
  3. No excluded competitor names from brand-guidelines.md
  4. Every markdown link has anchor text of 1-3 words (excluding numbers/symbols)
  5. H2 capsule ratio is between 60% and 70% (capsules end with "?")
  6. Word count within +/- 15% of target_word_count from front-matter
  7. Three Kings: primary_keyword in title, first paragraph, AND >=2 H2s

Reglas es-CL + AEO (doctrina L6, D044/D045/D048/D053):
  8. Palabras AI banned de prompts-es-cl/01-style-guide-base.md
  9. Cero hedging ("podría", "tal vez", "quizás", "es posible que", ...)
 10. Direct Answer Block: parrafo de 30-70 palabras dentro de las primeras 150
 11. Fecha "Actualizado el DD/MM/AAAA" visible (solo money pages, docs/07 2-bis)
 12. Cifra de precio en el title (money page transaccional, docs/07 sec. 2 / D053)
 13. Seccion de comparacion vs alternativas (money pages, docs/11 sec. 2.2)
 14. Floor de extension por arquetipo (spoke 1500-2500 · money-aeo >=950 ·
     money-local sin floor, D045 + D048)
 15. Front-matter con archetype / governing_doc / editorial_review

El linter NO reemplaza el editorial review humano de
prompts-es-cl/02-editorial-review-checklist.md. Los checks 11 (primer parrafo
escrito por el humano) y 12 (AI detector) no son automatizables.

The Content Writer's coordinator calls this AFTER the post is saved.
On failure, the coordinator marks the queue item status='needs_review'.

Usage:
  lint-post.py <markdown-path>
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAND = None  # lazy-loaded
ESCL = None  # lazy-loaded

# Hedging del "### Evitar" de prompts-es-cl/01. Se mantiene aca porque esa
# seccion es prosa y parsearla seria fragil.
HEDGING = [
    "podría ser que",
    "es posible que",
    "en algunos casos",
    "puede que",
    "tal vez",
    "quizás",
    "quizá",
    "podría",
    "podrían",
]

# Fallback si no se encuentra prompts-es-cl/01 (p.ej. seo-systems clonado solo).
AI_BANNED_FALLBACK = [
    "cabe mencionar que", "cabe destacar que", "es importante mencionar",
    "es importante señalar", "sin lugar a dudas", "en el dinámico mundo de",
    "en la era digital", "como mencionamos anteriormente", "como vimos antes",
    "profundizar en", "ahondar en", "en este artículo veremos",
    "delve into", "delve", "pivotal", "showcasing", "grappling",
    "it's worth noting", "in today's world", "in today's landscape",
]


# Stopwords en/es-CL: se descartan al calcular el "head" de la keyword.
STOPWORDS = {
    "how", "to", "for", "in", "the", "a", "an", "of", "your", "best", "what", "is",
    "de", "del", "en", "el", "la", "los", "las", "un", "una", "y", "o", "por",
    "para", "con", "que", "cuanto", "cual", "cuales", "como", "donde", "mi",
    "mejor", "mejores", "es", "son",
}


def find_l6_root() -> Path | None:
    """Localiza la raiz de L6-seo (la que contiene prompts-es-cl/ y docs/)."""
    for base in [ROOT, *ROOT.parents]:
        if (base / "prompts-es-cl" / "01-style-guide-base.md").exists():
            return base
    return None


def load_escl_rules() -> dict:
    """Extrae la lista de palabras AI banned de prompts-es-cl/01."""
    global ESCL
    if ESCL is not None:
        return ESCL
    l6 = find_l6_root()
    if l6 is None:
        ESCL = {"ai_banned": list(AI_BANNED_FALLBACK), "source": None}
        return ESCL
    path = l6 / "prompts-es-cl" / "01-style-guide-base.md"
    text = path.read_text(encoding="utf-8")
    banned: list[str] = []
    in_section = False
    in_fence = False
    for line in text.splitlines():
        if line.startswith("### "):
            in_section = "palabras ai banned" in line.lower()
            continue
        if not in_section:
            continue
        if line.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence and line.lstrip().startswith("- "):
            for quoted in re.findall(r'"([^"]+)"', line):
                phrase = quoted.strip().rstrip(".").strip()
                if not phrase:
                    continue
                # "in today's world/landscape" -> dos variantes
                if "/" in phrase:
                    head, tail = phrase.rsplit("/", 1)
                    banned.append(head.strip())
                    prefix = head.strip().rsplit(" ", 1)[0]
                    banned.append(f"{prefix} {tail.strip()}".strip())
                else:
                    banned.append(phrase)
    ESCL = {
        "ai_banned": banned or list(AI_BANNED_FALLBACK),
        "source": str(path) if banned else None,
    }
    return ESCL


def deaccent(s: str) -> str:
    """Quita tildes para que 'quizas' matchee 'quizás' y viceversa."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def phrase_regex(phrase: str) -> re.Pattern:
    """Regex tolerante: sin tildes, espacios flexibles, \\b solo donde hay letra."""
    p = deaccent(phrase.strip())
    core = re.escape(p).replace(r"\ ", r"\s+")
    left = r"\b" if p[:1].isalnum() else ""
    right = r"\b" if p[-1:].isalnum() else ""
    return re.compile(left + core + right, re.IGNORECASE)


def load_brand_rules() -> dict:
    """Parse banned-words and competitor names from brand-guidelines.md."""
    global BRAND
    if BRAND is not None:
        return BRAND
    candidates = [
        ROOT.parent / "context" / "brand-guidelines.md",
        ROOT.parent.parent / "context" / "brand-guidelines.md",
        ROOT / "context" / "brand-guidelines.md",
    ]
    path = next((c for c in candidates if c.exists()), None)
    if path is None:
        BRAND = {"banned": [], "competitors": []}
        return BRAND
    text = path.read_text(encoding="utf-8")
    banned, competitors = [], []
    section = None
    for line in text.splitlines():
        if line.startswith("## "):
            h = line.lower()
            if "banned" in h:
                section = "banned"
            elif "competitor" in h and "must not" in h.lower() or "competitor" in h and "not appear" in h.lower():
                section = "competitors"
            else:
                section = None
        elif line.lstrip().startswith("- ") and section:
            entry = line.lstrip("- ").strip().strip('"').strip("'")
            entry = entry.split(":", 1)[0].strip()
            entry = entry.split("(", 1)[0].strip()
            entry = entry.split("/", 1)[0].strip()
            if entry and not entry.lower().startswith("however"):
                if section == "banned":
                    banned.append(entry)
                elif section == "competitors":
                    competitors.extend([c.strip() for c in entry.split(",")])
    BRAND = {"banned": banned, "competitors": [c for c in competitors if c]}
    return BRAND


def split_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    fm = {}
    for line in parts[1].splitlines():
        if ":" in line and not line.lstrip().startswith("-"):
            k, v = line.split(":", 1)
            # Descarta comentarios inline: 'spoke   # spoke | money-aeo | ...'
            v = re.sub(r"\s+#.*$", "", v)
            fm[k.strip()] = v.strip().strip('"')
    return fm, parts[2]


def count_anchor_words(anchor: str) -> int:
    # Hyphenated terms count as one word (AI-specific is 1, not 2)
    cleaned = re.sub(r"[^\w\s\-]", " ", anchor)
    return len([w for w in cleaned.split() if not w.isdigit() and len(w) > 0])


def keyword_head(primary: str) -> str:
    """Return the most distinctive 2-word head of a primary keyword.

    "how to rank in ai overviews" -> "ai overviews"
    "best ai seo tool" -> "ai seo tool" (last 2)
    """
    words = [w for w in deaccent(primary).lower().split() if w not in STOPWORDS]
    if len(words) >= 2:
        return " ".join(words[-2:])
    return deaccent(primary).lower().strip()


def head_matches(head: str, text: str) -> bool:
    """El head matchea aunque haya hasta 2 palabras de relleno entre sus tokens.

    Es el "match parcial" que pide docs/07 sec. 3: 'cerrajero nunoa' debe dar
    por bueno 'Cerrajero en Nunoa'. La adyacencia estricta forzaria exact-match,
    que es justo el anti-patron.
    """
    tokens = [re.escape(t) for t in head.split() if t]
    if not tokens:
        return False
    gap = r"\W+(?:\w+\W+){0,2}"
    return re.search(gap.join(tokens), deaccent(text).lower()) is not None


def content_paragraphs(body: str) -> list[str]:
    """Parrafos de prosa: sin headings, listas, tablas, citas ni fences."""
    out = []
    for chunk in body.strip().split("\n\n"):
        c = chunk.strip()
        if not c:
            continue
        if c.startswith(("#", "-", "*", "|", ">", "```", "1.")):
            continue
        out.append(c)
    return out


def is_money(archetype: str) -> bool:
    return archetype.startswith("money")


def lint(path: Path) -> list[str]:
    failures: list[str] = []
    text = path.read_text(encoding="utf-8")
    fm, body = split_front_matter(text)
    rules = load_brand_rules()

    # Rule 1: em-dashes
    em = body.count("—")
    if em:
        failures.append(f"em-dashes found: {em} (must be 0)")

    # Rule 2: banned phrases
    body_lc = body.lower()
    for phrase in rules["banned"]:
        p = phrase.strip().strip('"').lower()
        if not p:
            continue
        if re.search(r"\b" + re.escape(p).replace(r"\ ", r"\s+") + r"\b", body_lc):
            failures.append(f"banned phrase: {phrase!r}")

    # Rule 3: excluded competitor names
    for comp in rules["competitors"]:
        if not comp:
            continue
        if re.search(r"\b" + re.escape(comp.lower()) + r"\b", body_lc):
            failures.append(f"excluded competitor mentioned: {comp!r}")

    # Rule 4: anchor text length 1-3 words
    links = re.findall(r"\[([^\]]+)\]\((https?://[^)]+)\)", body)
    long_anchors = []
    for anchor, _url in links:
        n = count_anchor_words(anchor)
        if n > 3:
            long_anchors.append(f"{n} words: {anchor!r}")
    if long_anchors:
        failures.append(
            f"anchors over 3 words: {len(long_anchors)} of {len(links)} links\n  "
            + "\n  ".join(long_anchors)
        )

    # Rule 5: H2 capsule ratio (capsules phrased as questions)
    h2s = re.findall(r"^## (.+)$", body, flags=re.MULTILINE)
    h2s = [h for h in h2s if h.strip().upper() != "TL;DR"]
    if h2s:
        capsules = sum(1 for h in h2s if h.strip().endswith("?"))
        ratio = capsules / len(h2s)
        if not (0.55 <= ratio <= 0.75):
            failures.append(
                f"H2 capsule ratio {ratio:.0%} ({capsules}/{len(h2s)}); target 60-70%"
            )

    # Rule 6: word count within +/-15% of target
    try:
        target = int(fm.get("target_word_count", "0"))
        actual = int(fm.get("word_count", str(len(body.split()))))
        if target:
            delta = abs(actual - target) / target
            if delta > 0.15:
                failures.append(
                    f"word count {actual} is {delta:.0%} off target {target} (max 15%)"
                )
    except (ValueError, TypeError):
        pass

    # Rule 7: Three Kings extended
    # es-CL: se compara sin tildes, para que "Ñuñoa" matchee "nunoa" en la KW.
    primary = deaccent(fm.get("primary_keyword", "")).lower().strip()
    if primary:
        title = deaccent(fm.get("title", "")).lower()
        first_para = ""
        for chunk in body.strip().split("\n\n"):
            chunk = chunk.strip()
            if not chunk or chunk.startswith(("#", "-", "|")):
                continue
            # El sello "Actualizado el DD/MM/AAAA" (regla 11) no es el primer parrafo
            if re.fullmatch(r"\*{0,2}actualizad[oa][^\n]{0,40}", deaccent(chunk).strip().lower()):
                continue
            first_para = deaccent(chunk).lower()
            break
        head = keyword_head(primary)
        h2_hits = sum(1 for h in h2s if head_matches(head, h))
        # Title and first-paragraph checks: full phrase OR keyword head must appear
        title_match = primary in title or head_matches(head, title)
        first_match = primary in first_para or head_matches(head, first_para)
        if not title_match:
            failures.append(f"Three Kings: keyword head {head!r} missing from title")
        if not first_match:
            failures.append(f"Three Kings: keyword head {head!r} missing from first paragraph")
        if h2_hits < 2:
            failures.append(
                f"Three Kings: keyword head {head!r} in only {h2_hits} H2 (need >=2)"
            )

    # ------------------------------------------------------------------
    # Reglas es-CL + AEO (doctrina L6)
    # ------------------------------------------------------------------
    escl = load_escl_rules()
    archetype = fm.get("archetype", "").strip().lower()
    intent = fm.get("intent", "").strip().lower()

    body_da = deaccent(body)

    # Rule 8: palabras AI banned de prompts-es-cl/01
    hits = sorted({p for p in escl["ai_banned"] if phrase_regex(p).search(body_da)})
    if hits:
        failures.append(
            f"palabras AI banned (prompts-es-cl/01): {len(hits)}\n  "
            + "\n  ".join(repr(h) for h in hits)
        )

    # Rule 9: hedging
    hedges = sorted({h for h in HEDGING if phrase_regex(h).search(body_da)})
    if hedges:
        failures.append(
            "hedging (docs/11 sec. 2.2 lo mide como perdida de citacion): "
            + ", ".join(repr(h) for h in hedges)
        )

    # Rule 10: Direct Answer Block dentro de las primeras 150 palabras
    offset = 0
    dab_found = False
    for para in content_paragraphs(body):
        n = len(para.split())
        if offset > 150:
            break
        if 30 <= n <= 70:
            dab_found = True
            break
        offset += n
    if not dab_found:
        failures.append(
            "sin Direct Answer Block detectable: ningun parrafo de 30-70 palabras "
            "dentro de las primeras 150 (irrenunciable 2026 #3, docs/07 sec. 4)"
        )

    # Rules 11-13: solo money pages
    if is_money(archetype):
        # Rule 11: fecha de actualizacion visible (docs/07 2-bis)
        if not re.search(r"actualizad[oa]\s+(el\s+)?\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", body, re.IGNORECASE):
            failures.append(
                "falta 'Actualizado el DD/MM/AAAA' visible en el cuerpo "
                "(docs/07 2-bis; dateModified en schema no basta)"
            )

        # Rule 12: cifra de precio en el title (D053)
        transactional = archetype == "money-local" or any(
            k in intent for k in ("transaction", "commercial", "transaccional", "comercial")
        )
        if transactional:
            title_raw = fm.get("title", "")
            if not re.search(r"[$€]\s?\d|\d[\d.,]*\s?(uf|utm|clp|pesos)\b", title_raw, re.IGNORECASE):
                failures.append(
                    f"sin cifra de precio en el title (D053, docs/07 sec. 2): {title_raw!r}"
                )

        # Rule 13: comparacion explicita vs alternativas (docs/11 sec. 2.2)
        headings = re.findall(r"^#{2,3} (.+)$", body, flags=re.MULTILINE)
        if not any(re.search(r"\bvs\.?\b|compar|alternativ|diferencia", h, re.IGNORECASE) for h in headings):
            failures.append(
                "sin seccion de comparacion vs alternativas "
                "(diferenciador secundario docs/11 sec. 2.2: su ausencia pierde la citacion)"
            )

    # Rule 14: floor de extension por arquetipo
    actual_wc = len(body.split())
    try:
        actual_wc = int(fm.get("word_count", actual_wc))
    except (ValueError, TypeError):
        pass
    if archetype == "spoke" and not (1500 <= actual_wc <= 2500):
        failures.append(
            f"spoke fuera de rango: {actual_wc} palabras (prompts-es-cl/01: 1.500-2.500)"
        )
    elif archetype == "money-aeo" and actual_wc < 950:
        failures.append(
            f"money-aeo bajo el floor: {actual_wc} palabras (floor 950, D045)"
        )
    # money-local: sin floor por diseno (D048)

    # Rule 15: front-matter de doctrina
    if archetype not in {"spoke", "money-aeo", "money-local"}:
        failures.append(
            f"front-matter 'archetype' ausente o invalido: {archetype!r} "
            "(spoke | money-aeo | money-local)"
        )
    if not fm.get("governing_doc", "").strip():
        failures.append("front-matter 'governing_doc' ausente")
    review = fm.get("editorial_review", "").strip().lower()
    if review not in {"pending", "passed"}:
        failures.append(
            f"front-matter 'editorial_review' ausente o invalido: {review!r} (pending | passed)"
        )

    return failures


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: lint-post.py <markdown-path>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    if not path.exists():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        return 2

    failures = lint(path)
    if failures:
        print(f"LINT FAIL ({len(failures)} issue{'s' if len(failures)!=1 else ''}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("LINT OK")
    print(
        "  NOTA: el lint no valida la pieza. Falta el editorial review humano "
        "(prompts-es-cl/02), incluidos el primer parrafo escrito por el humano "
        "y el AI detector gate."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

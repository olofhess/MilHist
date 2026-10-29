import csv
import re

# ==========================================
# FILES
# ==========================================

POLITICAL_ENTITY_FILE = "PoliticalEntity.csv"
PARTICIPATION_FILE = "Participation.csv"

OUTPUT_ENTITY_FILE = "PoliticalEntity_cleaned.csv"
OUTPUT_PARTICIPATION_FILE = "Participation_cleaned.csv"

# ==========================================
# ALIAS MAP
# ==========================================

ALIASES = {

    # common alternative IDs

    "PE_RUSSIA": "PE_RUSSIAN_EMPIRE",
    "PE_BRITAIN": "PE_UNITED_KINGDOM",
    "PE_ROME": "PE_ROMAN_REPUBLIC",
    "PE_OTTOMAN": "PE_OTTOMAN_EMPIRE",

    "PE_DEN": "PE_KINGDOM_OF_DENMARK",
    "PE_POL": "PE_POLAND_LITHUANIA",
    "PE_SPA": "PE_KINGDOM_OF_SPAIN",
    "PE_NLD": "PE_DUTCH_REPUBLIC",

    "NLD": "PE_DUTCH_REPUBLIC",

    "PE_USSR": "PE_SOVIET_UNION",

    "PE_ITALY": "PE_ITALY_KINGDOM",

    "PE_ALLIES": "PE_ALLIED_POWERS",
    "PE_UNION": "PE_ALLIED_POWERS",

    "PE_DUTCH": "PE_DUTCH_REPUBLIC",

    "PE_ENG": "PE_KINGDOM_OF_ENGLAND",
    "PE_ENGLAND": "PE_KINGDOM_OF_ENGLAND",

    "PE_FIN": "PE_FINLAND",

    "PE_AUS": "PE_AUSTRALIA",

    "PE_CAN": "PE_CANADA",

    "PE_CHN": "PE_CHINA",

    "PE_PRK": "PE_NORTH_KOREA",

    "PE_KOR": "PE_SOUTH_KOREA",

    "PE_HAB": "PE_AUSTRIA",

    "PE_OPT": "PE_OTTOMAN_EMPIRE",

    "PE_SWI": "PE_SWISS_CONFEDERATION",

    "PE_VEN": "PE_VENICE",

    "PE_SAV": "PE_SAVOY",

    "PE_PAP": "PE_PAPAL_STATES",

    "PE_MIL": "PE_MILAN",

    "PE_NAP": "PE_NAPLES",

    "PE_FLO": "PE_FLORENCE",

    "PE_CASTILE": "PE_CROWN_OF_CASTILE",

    "PE_PTOLEMAIC": "PE_PERSIA",

    "PE_BRA": "PE_BRAZIL",

    "PE_IRQ": "PE_OTTOMAN_EMPIRE"
}

# ==========================================
# LOAD CSV
# ==========================================

def load_csv(path):

    rows = []

    with open(path, "r", encoding="utf-8") as f:

        reader = csv.DictReader(f, delimiter=";")

        for row in reader:
            rows.append(row)

    return rows

# ==========================================
# SAVE CSV
# ==========================================

def save_csv(path, rows, fieldnames):

    with open(path, "w", encoding="utf-8", newline="") as f:

        writer = csv.DictWriter(
            f,
            fieldnames=fieldnames,
            delimiter=";",
            extrasaction="ignore"
        )

        writer.writeheader()

        for row in rows:

            clean_row = {}

            for field in fieldnames:
                clean_row[field] = row.get(field, "")

            writer.writerow(clean_row)

# ==========================================
# CANONICAL ID
# ==========================================

def canonical_name(name):

    n = name.upper().strip()

    # remove brackets
    n = re.sub(r"\(.*?\)", "", n)

    replacements = [

        "KINGDOM OF ",
        "EMPIRE OF ",
        "REPUBLIC OF ",
        "COMMONWEALTH OF ",

        "KINGDOM ",
        "EMPIRE ",
        "REPUBLIC ",

        "NAPOLEONIC ",
        "THIRD ",

        "DUCHY OF ",
        "STATE OF "
    ]

    for r in replacements:
        n = n.replace(r, "")

    n = n.replace("-", " ")
    n = n.replace("/", " ")

    n = re.sub(r"[^A-Z0-9 ]", "", n)

    n = "_".join(n.split())

    return f"PE_{n}"

# ==========================================
# LOAD DATA
# ==========================================

entities = load_csv(POLITICAL_ENTITY_FILE)
participations = load_csv(PARTICIPATION_FILE)

# ==========================================
# CLEAN ENTITIES
# ==========================================

canonical_map = {}

clean_entities = []

seen_ids = set()

for row in entities:

    old_id = (row.get("id") or "").strip()

    if not old_id:
        continue

    name = (row.get("name") or "").strip()

    if not name:
        continue

    canonical_id = canonical_name(name)

    canonical_map[old_id] = canonical_id

    if canonical_id in ALIASES:
        canonical_id = ALIASES[canonical_id]

    # keep first occurrence only

    if canonical_id not in seen_ids:

        seen_ids.add(canonical_id)

        clean_row = {

            "id": canonical_id,
            "name": name,
            "type": (row.get("type") or "").strip(),
            "notes": (row.get("notes") or "").strip()
        }

        clean_entities.append(clean_row)

# ==========================================
# UPDATE PARTICIPATION
# ==========================================

updated_participations = []

missing_entities = set()

for row in participations:

    old_entity = (
        row.get("politicalEntityId") or ""
    ).strip()

    # skip empty/broken rows

    if not old_entity:
        continue

    # alias conversion first

    if old_entity in ALIASES:
        old_entity = ALIASES[old_entity]

    # canonical conversion

    if old_entity in canonical_map:
        row["politicalEntityId"] = canonical_map[old_entity]

    else:
        row["politicalEntityId"] = old_entity

    updated_participations.append(row)

    # verify final ID exists

    final_id = row["politicalEntityId"]

    valid_ids = {
        e["id"] for e in clean_entities
    }

    if final_id not in valid_ids:
        missing_entities.add(final_id)

# ==========================================
# SAVE FILES
# ==========================================

save_csv(
    OUTPUT_ENTITY_FILE,
    clean_entities,
    ["id", "name", "type", "notes"]
)

save_csv(
    OUTPUT_PARTICIPATION_FILE,
    updated_participations,
    [
        "id",
        "eventId",
        "politicalEntityId",
        "personId",
        "role",
        "troops",
        "losses"
    ]
)

# ==========================================
# REPORT
# ==========================================

print()
print("====================================")
print("POLITICAL ENTITY CLEANUP COMPLETE")
print("====================================")
print()

print(f"Original entities : {len(entities)}")
print(f"Cleaned entities  : {len(clean_entities)}")
print(f"Participations    : {len(updated_participations)}")

print()

if missing_entities:

    print("UNRESOLVED ENTITY REFERENCES:")
    print()

    for m in sorted(missing_entities):
        print(m)

else:

    print("All Participation references resolved.")

print()
print(f"Saved: {OUTPUT_ENTITY_FILE}")
print(f"Saved: {OUTPUT_PARTICIPATION_FILE}")
print()
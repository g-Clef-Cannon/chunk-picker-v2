"""
Fetch shop sell multipliers from OSRS Wiki for all shops in chunkpicker data.
Uses StoreTableHead template: sellmultiplier=1300 means 130% of base value.
"""
import json, urllib.request, urllib.parse, time, re

with open('chunkpicker-chunkinfo-export.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

shop_names = sorted(data['shopItems'].keys())
print(f"Total shops: {len(shop_names)}")

HEADERS = {
    'User-Agent': 'ChunkPickerMod/1.0 (shop markup fetcher)',
    'Accept': 'application/json'
}

def fetch_batch(titles):
    titles_str = '|'.join(titles)
    url = (
        'https://oldschool.runescape.wiki/api.php?'
        'action=query&titles=' + urllib.parse.quote(titles_str, safe='') +
        '&prop=revisions&rvprop=content&rvslots=main&format=json&redirects=1'
    )
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))

def extract_sell_multiplier(wikitext):
    if not wikitext:
        return None
    m = re.search(r'sellmultiplier\s*=\s*([0-9]+)', wikitext, re.IGNORECASE)
    if m:
        return int(m.group(1)) / 1000.0
    return None

# Build wiki title -> shop name mapping
# Shop names in data may have trailing periods and #variants
wiki_to_shop = {}
wiki_titles_all = []
for shop in shop_names:
    # Strip trailing period and any #variant for wiki lookup
    base = shop.rstrip('.')
    if '#' in base:
        base = base.split('#')[0]
    wiki_to_shop[base.lower()] = shop
    wiki_titles_all.append(base)

# Deduplicate wiki titles while preserving mapping
seen = set()
wiki_titles_dedup = []
for t in wiki_titles_all:
    if t.lower() not in seen:
        seen.add(t.lower())
        wiki_titles_dedup.append(t)

print(f"Unique wiki titles to fetch: {len(wiki_titles_dedup)}")

markups = {}
not_found = []
no_markup = []

BATCH_SIZE = 50
total_batches = (len(wiki_titles_dedup) + BATCH_SIZE - 1) // BATCH_SIZE

for i in range(0, len(wiki_titles_dedup), BATCH_SIZE):
    batch = wiki_titles_dedup[i:i+BATCH_SIZE]
    batch_num = i // BATCH_SIZE + 1
    print(f"Batch {batch_num}/{total_batches} ({len(batch)} titles)...")
    
    try:
        result = fetch_batch(batch)
        pages = result.get('query', {}).get('pages', {})
        
        # Build reverse mappings from API response
        norm_map = {}  # normalized_to -> original_from
        for n in result.get('query', {}).get('normalized', []):
            norm_map[n['to'].lower()] = n['from'].lower()
        redir_map = {}
        for r in result.get('query', {}).get('redirects', []):
            redir_map[r['to'].lower()] = r['from'].lower()
        
        found_in_batch = set()
        
        for page_id, page in pages.items():
            if int(page_id) < 0:
                continue
            
            title = page.get('title', '')
            wt = ''
            revs = page.get('revisions', [])
            if revs:
                wt = revs[0].get('slots', {}).get('main', {}).get('*', '')
            
            mult = extract_sell_multiplier(wt)
            
            # Trace back: wiki title -> (redirect from) -> (normalized from) -> our original query title
            title_lc = title.lower()
            
            # Try to find which original shop this corresponds to
            candidates = [title_lc]
            if title_lc in redir_map:
                candidates.append(redir_map[title_lc])
            for c in list(candidates):
                if c in norm_map:
                    candidates.append(norm_map[c])
            
            matched = None
            for c in candidates:
                if c in wiki_to_shop:
                    matched = wiki_to_shop[c]
                    break
                # Try with trailing period stripped
                if c.rstrip('.') in wiki_to_shop:
                    matched = wiki_to_shop[c.rstrip('.')]
                    break
            
            if not matched:
                # Brute force: try matching against batch items
                for b in batch:
                    if b.lower() == title_lc or b.lower() == title_lc.rstrip('.'):
                        matched = wiki_to_shop.get(b.lower())
                        break
            
            if matched:
                found_in_batch.add(matched)
                if mult is not None:
                    markups[matched] = mult
                    # Also assign to #variant versions if any
                    for shop in shop_names:
                        if shop.rstrip('.').split('#')[0].lower() == matched.rstrip('.').split('#')[0].lower():
                            markups[shop] = mult
                else:
                    no_markup.append(matched)
        
        for b in batch:
            shop = wiki_to_shop.get(b.lower())
            if shop and shop not in found_in_batch and shop not in markups:
                not_found.append(shop)
                
    except Exception as e:
        print(f"  Error: {e}")
    
    time.sleep(0.5)

print(f"\nResults: {len(markups)} with markup, {len(no_markup)} no markup, {len(not_found)} not found")

from collections import Counter
markup_dist = Counter(round(v, 2) for v in markups.values())
print(f"Markup distribution: {dict(sorted(markup_dist.items()))}")

# For shops with no markup found, default to 1.3 (general store, conservative)
default_markup = 1.3
all_shops_without = [s for s in shop_names if s not in markups]
print(f"\n{len(all_shops_without)} shops will use default markup of {default_markup}")
if all_shops_without[:10]:
    print(f"Sample: {all_shops_without[:10]}")

with open('scripts/shop_markups.json', 'w') as f:
    json.dump(markups, f, indent=2, sort_keys=True)

# Generate compact JS: only non-default markups (default is 1.3)
non_default = {k: v for k, v in markups.items() if abs(v - default_markup) > 0.001}
lines = ['// Shop sell multipliers (shops not listed default to 1.3)', 'const shopMarkups = {']
for shop in sorted(non_default.keys()):
    escaped = shop.replace("'", "\\'")
    lines.append(f"    '{escaped}': {non_default[shop]},")
lines.append('};')

with open('scripts/shopMarkups.js', 'w') as f:
    f.write('\n'.join(lines))

print(f"\nSaved {len(markups)} markups to shop_markups.json")
print(f"Saved {len(non_default)} non-default markups to shopMarkups.js")

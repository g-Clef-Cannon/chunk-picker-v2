"""
Fetch shop markup percentages from OSRS Wiki for all shops in chunkpicker data.
Each shop page has a "Sells at: X%" in its infobox.
Then combine with base item prices to produce actual shop prices.
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
    """Fetch wikitext for a batch of up to 50 titles."""
    titles_str = '|'.join(t.replace(' ', '_') for t in titles)
    url = (
        'https://oldschool.runescape.wiki/api.php?'
        f'action=query&titles={urllib.parse.quote(titles_str)}'
        '&prop=revisions&rvprop=content&rvslots=main&format=json'
    )
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))

def extract_sell_percentage(wikitext):
    """Extract sell multiplier from StoreTableHead template (e.g. sellmultiplier=1300 -> 1.3)."""
    if not wikitext:
        return None
    m = re.search(r'sellmultiplier\s*=\s*([0-9]+)', wikitext, re.IGNORECASE)
    if m:
        return int(m.group(1)) / 1000.0
    return None

markups = {}
not_found = []
no_markup = []

BATCH_SIZE = 50
total_batches = (len(shop_names) + BATCH_SIZE - 1) // BATCH_SIZE

for i in range(0, len(shop_names), BATCH_SIZE):
    batch = shop_names[i:i+BATCH_SIZE]
    batch_num = i // BATCH_SIZE + 1
    print(f"Batch {batch_num}/{total_batches} ({len(batch)} shops)...")
    
    # Strip trailing periods from shop names for wiki lookup
    wiki_titles = []
    title_to_shop = {}
    for shop in batch:
        wiki_name = shop.rstrip('.')
        wiki_titles.append(wiki_name)
        title_to_shop[wiki_name.lower().replace(' ', '_')] = shop
        title_to_shop[wiki_name.lower()] = shop
    
    try:
        result = fetch_batch(wiki_titles)
        pages = result.get('query', {}).get('pages', {})
        
        # Build normalized title mappings
        normalized = {}
        for n in result.get('query', {}).get('normalized', []):
            normalized[n['to'].lower()] = n['from'].lower()
        redirects = {}
        for r in result.get('query', {}).get('redirects', []):
            redirects[r['to'].lower()] = r['from'].lower()
        
        found_shops = set()
        for page_id, page in pages.items():
            if int(page_id) < 0:
                continue
            
            title = page.get('title', '')
            wikitext = ''
            revs = page.get('revisions', [])
            if revs:
                slots = revs[0].get('slots', {})
                wikitext = slots.get('main', {}).get('*', '')
            
            sell_pct = extract_sell_percentage(wikitext)
            
            # Map back to original shop name
            title_lower = title.lower().replace(' ', '_')
            title_lower2 = title.lower()
            
            matched_shop = None
            # Direct match
            if title_lower in title_to_shop:
                matched_shop = title_to_shop[title_lower]
            elif title_lower2 in title_to_shop:
                matched_shop = title_to_shop[title_lower2]
            else:
                # Try via redirects/normalized
                orig = redirects.get(title_lower2) or normalized.get(title_lower2)
                if orig:
                    orig_key = orig.replace(' ', '_')
                    matched_shop = title_to_shop.get(orig_key) or title_to_shop.get(orig)
            
            if not matched_shop:
                # Brute force match
                for shop in batch:
                    if shop.rstrip('.').lower() == title.lower():
                        matched_shop = shop
                        break
            
            if matched_shop:
                if sell_pct is not None:
                    markups[matched_shop] = sell_pct
                else:
                    no_markup.append(matched_shop)
                found_shops.add(matched_shop)
        
        for shop in batch:
            if shop not in found_shops and shop not in markups:
                not_found.append(shop)
                
    except Exception as e:
        print(f"  Error: {e}")
        for shop in batch:
            if shop not in markups:
                not_found.append(shop)
    
    time.sleep(0.5)

print(f"\nResults: {len(markups)} with markup, {len(no_markup)} no markup field, {len(not_found)} not found")

# Analyze markup distribution
from collections import Counter
markup_dist = Counter(round(v, 2) for v in markups.values())
print(f"Markup distribution: {dict(sorted(markup_dist.items()))}")

if not_found[:20]:
    print(f"Sample not found: {not_found[:20]}")
if no_markup[:20]:
    print(f"Sample no markup: {no_markup[:20]}")

# Save results
with open('scripts/shop_markups.json', 'w') as f:
    json.dump(markups, f, indent=2, sort_keys=True)

print(f"\nSaved to scripts/shop_markups.json")

"""
Fetch store prices for all shop items in chunkpicker data from OSRS Wiki API.
Uses MediaWiki API batch queries (50 titles per request).
"""
import json, urllib.request, urllib.parse, time, re, sys

with open('chunkpicker-chunkinfo-export.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

shop_items_set = set()
for shop_name, items in data['shopItems'].items():
    for item_name in items:
        shop_items_set.add(item_name)

print(f"Total unique shop items: {len(shop_items_set)}")
shop_items = sorted(shop_items_set)

HEADERS = {
    'User-Agent': 'ChunkPickerMod/1.0 (shop price fetcher)',
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

def extract_store_price(wikitext):
    """Extract store price from item infobox wikitext."""
    if not wikitext:
        return None
    # Match |store = 32000 or |store=32000 patterns
    m = re.search(r'\|\s*store\s*=\s*([0-9,]+)', wikitext, re.IGNORECASE)
    if m:
        return int(m.group(1).replace(',', ''))
    # Try |value = pattern as fallback
    m = re.search(r'\|\s*value\s*=\s*([0-9,]+)', wikitext, re.IGNORECASE)
    if m:
        return int(m.group(1).replace(',', ''))
    return None

prices = {}
not_found = []
no_price = []

BATCH_SIZE = 50
total_batches = (len(shop_items) + BATCH_SIZE - 1) // BATCH_SIZE

for i in range(0, len(shop_items), BATCH_SIZE):
    batch = shop_items[i:i+BATCH_SIZE]
    batch_num = i // BATCH_SIZE + 1
    print(f"Batch {batch_num}/{total_batches} ({len(batch)} items)...")
    
    try:
        result = fetch_batch(batch)
        pages = result.get('query', {}).get('pages', {})
        
        # Build title->page mapping (wiki normalizes titles)
        normalized = {}
        for n in result.get('query', {}).get('normalized', []):
            normalized[n['to']] = n['from']
        
        # Also build redirect mapping
        redirects = {}
        for r in result.get('query', {}).get('redirects', []):
            redirects[r['to']] = r['from']
        
        found_titles = set()
        for page_id, page in pages.items():
            title = page.get('title', '')
            if int(page_id) < 0:  # Missing page
                continue
            
            wikitext = ''
            revs = page.get('revisions', [])
            if revs:
                slots = revs[0].get('slots', {})
                wikitext = slots.get('main', {}).get('*', '')
            
            price = extract_store_price(wikitext)
            
            # Map back to original item name
            orig_title = title.replace('_', ' ')
            # Check normalized mapping
            if title in normalized:
                orig_title = normalized[title].replace('_', ' ')
            if title in redirects:
                orig_title = redirects[title].replace('_', ' ')
            
            # Match against batch items (case-insensitive)
            for item in batch:
                if item.lower() == orig_title.lower() or item.replace(' ', '_').lower() == title.replace(' ', '_').lower():
                    if price is not None:
                        prices[item] = price
                    else:
                        no_price.append(item)
                    found_titles.add(item)
                    break
        
        for item in batch:
            if item not in found_titles and item not in prices:
                not_found.append(item)
                
    except Exception as e:
        print(f"  Error: {e}")
        for item in batch:
            if item not in prices:
                not_found.append(item)
    
    time.sleep(0.5)  # Rate limit

print(f"\nResults: {len(prices)} priced, {len(no_price)} no price field, {len(not_found)} not found")

if not_found[:20]:
    print(f"Sample not found: {not_found[:20]}")
if no_price[:20]:
    print(f"Sample no price: {no_price[:20]}")

# Save results
with open('scripts/shop_prices.json', 'w') as f:
    json.dump(prices, f, indent=2, sort_keys=True)

# Generate JS format
lines = ['const shopPrices = {']
for item in sorted(prices.keys()):
    escaped = item.replace("'", "\\'")
    lines.append(f"    '{escaped}': {prices[item]},")
lines.append('};')

with open('scripts/shopPrices.js', 'w') as f:
    f.write('\n'.join(lines))

print(f"\nSaved {len(prices)} prices to scripts/shop_prices.json and scripts/shopPrices.js")

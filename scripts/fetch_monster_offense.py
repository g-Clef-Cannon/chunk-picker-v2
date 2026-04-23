"""
Fetch monster offensive stats (attack level, attack bonus, max hit, attack speed)
from the OSRS Wiki API. Merges with existing monster_stats.json defensive data.
Outputs updated JSON with fields: hp, def, def_bonus, att, abonus, maxhit, aspeed.
"""
import urllib.request, urllib.parse, json, time, re, sys

with open(r'C:\Users\user\Chunk-Picker-Mod\scripts\monster_names.json') as f:
    monster_names = json.load(f)

with open(r'C:\Users\user\Chunk-Picker-Mod\scripts\monster_stats.json') as f:
    existing_stats = json.load(f)

def clean_wiki_name(name):
    base = name.split('#')[0]
    return base

def parse_int_value(val_str):
    """Parse an integer from a wiki field value, handling common junk."""
    val_str = val_str.strip().split(',')[0].split('<')[0].split('[')[0].split('(')[0].split('{')[0].strip()
    val_str = re.sub(r'[^0-9\-]', '', val_str)
    if not val_str or val_str == '-':
        return None
    try:
        return int(val_str)
    except ValueError:
        return None

def parse_max_hit(val_str):
    """Parse max hit — can be like '8', '8 (Melee)', '4-8', comma-separated, etc."""
    val_str = val_str.strip()
    # Remove references/templates
    val_str = re.sub(r'<[^>]+>', '', val_str)
    val_str = re.sub(r'\{\{[^}]+\}\}', '', val_str)
    val_str = re.sub(r'\[\[[^\]]+\]\]', '', val_str)
    # Try to find first number
    m = re.search(r'(\d+)', val_str)
    if m:
        return int(m.group(1))
    return None

def parse_infobox_offense(content, variant_hint=None):
    """Parse monster infobox for offensive stats."""
    result = {'att': None, 'abonus': None, 'maxhit': None, 'aspeed': None}
    
    variant_idx = ''
    if variant_hint:
        hint_lower = variant_hint.lower()
        for line in content.split('\n'):
            m = re.match(r'\|(version|name)(\d+)\s*=\s*(.+)', line.strip())
            if m:
                idx = m.group(2)
                val = m.group(3).strip()
                if hint_lower in val.lower() or val.lower() in hint_lower:
                    variant_idx = idx
                    break
    
    field_map = {
        'att': 'att',
        'attbns': 'abonus', 
        'max hit': 'maxhit',
        'attack speed': 'aspeed',
    }
    
    for line in content.split('\n'):
        line = line.strip()
        for wiki_field, our_key in field_map.items():
            # Try variant-specific match first
            if variant_idx:
                pattern_variant = r'\|' + re.escape(wiki_field) + re.escape(variant_idx) + r'\s*=\s*(.+)'
                m = re.match(pattern_variant, line)
                if m:
                    if our_key == 'maxhit':
                        result[our_key] = parse_max_hit(m.group(1))
                    else:
                        result[our_key] = parse_int_value(m.group(1))
            
            # Fallback to base (no index)
            pattern_base = r'\|' + re.escape(wiki_field) + r'\s*=\s*(.+)'
            m = re.match(pattern_base, line)
            if m and result[our_key] is None:
                if our_key == 'maxhit':
                    result[our_key] = parse_max_hit(m.group(1))
                else:
                    result[our_key] = parse_int_value(m.group(1))
            
            # Fallback to version 1 (e.g., |att1 = ...) when no base and no variant hint
            if result[our_key] is None and not variant_idx:
                pattern_v1 = r'\|' + re.escape(wiki_field) + r'1\s*=\s*(.+)'
                m = re.match(pattern_v1, line)
                if m:
                    if our_key == 'maxhit':
                        result[our_key] = parse_max_hit(m.group(1))
                    else:
                        result[our_key] = parse_int_value(m.group(1))
    
    return result

def fetch_batch(titles):
    titles_str = '|'.join(titles)
    url = 'https://oldschool.runescape.wiki/api.php?' + urllib.parse.urlencode({
        'action': 'query',
        'titles': titles_str,
        'prop': 'revisions',
        'rvprop': 'content',
        'rvslots': 'main',
        'format': 'json'
    })
    req = urllib.request.Request(url, headers={'User-Agent': 'ChunkPickerMod/1.0 (monster offense fetch)'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())

# Build mapping
wiki_to_ours = {}
for name in monster_names:
    wiki_name = clean_wiki_name(name)
    if wiki_name not in wiki_to_ours:
        wiki_to_ours[wiki_name] = []
    wiki_to_ours[wiki_name].append(name)

unique_wiki_names = list(wiki_to_ours.keys())
print(f'Unique wiki page names to fetch: {len(unique_wiki_names)}', file=sys.stderr)

# Fetch in batches
all_content = {}
batch_size = 50
for i in range(0, len(unique_wiki_names), batch_size):
    batch = unique_wiki_names[i:i+batch_size]
    try:
        data = fetch_batch(batch)
        pages = data.get('query', {}).get('pages', {})
        for pid, page in pages.items():
            title = page.get('title', '')
            revs = page.get('revisions', [])
            if revs:
                content = revs[0].get('slots', {}).get('main', {}).get('*', '')
                all_content[title] = content
        
        normalized = {n['from']: n['to'] for n in data.get('query', {}).get('normalized', [])}
        redirects = {r['from']: r['to'] for r in data.get('query', {}).get('redirects', [])}
        
        for orig_title in batch:
            resolved = normalized.get(orig_title, orig_title)
            resolved = redirects.get(resolved, resolved)
            if resolved in all_content and orig_title not in all_content:
                all_content[orig_title] = all_content[resolved]
                
    except Exception as e:
        print(f'Error fetching batch {i}: {e}', file=sys.stderr)
    
    if i % 200 == 0:
        print(f'  Fetched {min(i+batch_size, len(unique_wiki_names))}/{len(unique_wiki_names)}...', file=sys.stderr)
    time.sleep(0.5)

# Parse offensive stats and merge with existing
merged_stats = dict(existing_stats)  # start with existing defensive data
offense_count = 0
missing = []

for name in monster_names:
    wiki_name = clean_wiki_name(name)
    variant_hint = name.split('#')[1] if '#' in name else None
    
    content = all_content.get(wiki_name, '')
    if not content:
        missing.append(name)
        continue
    
    offense = parse_infobox_offense(content, variant_hint)
    
    if name not in merged_stats:
        merged_stats[name] = {}
    
    if offense['att'] is not None:
        merged_stats[name]['att'] = offense['att']
    if offense['abonus'] is not None:
        merged_stats[name]['abonus'] = offense['abonus']
    if offense['maxhit'] is not None:
        merged_stats[name]['maxhit'] = offense['maxhit']
    if offense['aspeed'] is not None:
        merged_stats[name]['aspeed'] = offense['aspeed']
    
    if any(v is not None for v in offense.values()):
        offense_count += 1

print(f'\nResults:', file=sys.stderr)
print(f'  Monsters with offense data: {offense_count}/{len(monster_names)}', file=sys.stderr)
print(f'  Missing pages: {len(missing)}', file=sys.stderr)

# Count specific fields
att_count = sum(1 for m in merged_stats.values() if 'att' in m)
maxhit_count = sum(1 for m in merged_stats.values() if 'maxhit' in m)
aspeed_count = sum(1 for m in merged_stats.values() if 'aspeed' in m)
print(f'  Has att: {att_count}, maxhit: {maxhit_count}, aspeed: {aspeed_count}', file=sys.stderr)

# Show a few examples
examples = ['Lesser demon', 'Greater demon', 'Dwarf', 'Soldier (Shayzien)', 'Black demon', 'Lizardman shaman']
for ex in examples:
    if ex in merged_stats:
        print(f'  {ex}: {merged_stats[ex]}', file=sys.stderr)

# Save merged results
with open(r'C:\Users\user\Chunk-Picker-Mod\scripts\monster_stats.json', 'w') as f:
    json.dump(merged_stats, f, indent=2, sort_keys=True)

print(f'\nSaved to scripts/monster_stats.json', file=sys.stderr)

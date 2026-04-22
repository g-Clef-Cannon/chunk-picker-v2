"""
Fetch monster stats (HP, def level, def bonuses) from the OSRS Wiki API.
Outputs a JSON mapping monster_name -> {hp, def, dstab, dslash, dcrush}.
Handles variant names like "Zombie#Level 13" and "(Location)" suffixes.
"""
import urllib.request, urllib.parse, json, time, re, sys

with open(r'C:\Users\user\Chunk-Picker-Mod\scripts\monster_names.json') as f:
    monster_names = json.load(f)

def clean_wiki_name(name):
    """Convert our monster name format to wiki page title."""
    # Remove variant suffixes like #Level 13, #Wilderness Slayer Cave, etc.
    base = name.split('#')[0]
    # Some have (Location) - keep those as wiki uses them
    return base

def parse_infobox(content, variant_hint=None):
    """Parse monster infobox for HP, def level, and def bonuses."""
    result = {'hp': None, 'def': None, 'dstab': None, 'dslash': None, 'dcrush': None}
    
    # Determine which variant index to look for
    variant_idx = ''
    if variant_hint:
        # Try to find the version number for this variant
        hint_lower = variant_hint.lower()
        # Look for version headers like |version1 = Bearded, |name1 = Level 130
        for line in content.split('\n'):
            m = re.match(r'\|(version|name)(\d+)\s*=\s*(.+)', line.strip())
            if m:
                idx = m.group(2)
                val = m.group(3).strip()
                if hint_lower in val.lower() or val.lower() in hint_lower:
                    variant_idx = idx
                    break
    
    for line in content.split('\n'):
        line = line.strip()
        for field in ['hitpoints', 'def', 'dstab', 'dslash', 'dcrush']:
            # Match exact variant or base
            pattern_variant = r'\|' + field + re.escape(variant_idx) + r'\s*=\s*(.+)'
            pattern_base = r'\|' + field + r'\s*=\s*(.+)'
            
            if variant_idx:
                m = re.match(pattern_variant, line)
                if m:
                    try:
                        key = 'hp' if field == 'hitpoints' else field
                        result[key] = int(m.group(1).strip().split(',')[0].split('<')[0].split('[')[0].split('(')[0].strip())
                    except (ValueError, IndexError):
                        pass
            
            # Fallback to base (no index)
            m = re.match(pattern_base, line)
            if m and result.get('hp' if field == 'hitpoints' else field) is None:
                try:
                    key = 'hp' if field == 'hitpoints' else field
                    result[key] = int(m.group(1).strip().split(',')[0].split('<')[0].split('[')[0].split('(')[0].strip())
                except (ValueError, IndexError):
                    pass
    
    return result

def fetch_batch(titles):
    """Fetch wiki content for up to 50 pages at once."""
    titles_str = '|'.join(titles)
    url = 'https://oldschool.runescape.wiki/api.php?' + urllib.parse.urlencode({
        'action': 'query',
        'titles': titles_str,
        'prop': 'revisions',
        'rvprop': 'content',
        'rvslots': 'main',
        'format': 'json'
    })
    req = urllib.request.Request(url, headers={'User-Agent': 'ChunkPickerMod/1.0 (monster stats fetch)'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())

# Build mapping of wiki title -> list of our monster names
wiki_to_ours = {}
for name in monster_names:
    wiki_name = clean_wiki_name(name)
    if wiki_name not in wiki_to_ours:
        wiki_to_ours[wiki_name] = []
    wiki_to_ours[wiki_name].append(name)

unique_wiki_names = list(wiki_to_ours.keys())
print(f'Unique wiki page names to fetch: {len(unique_wiki_names)}', file=sys.stderr)

# Fetch in batches of 50 (wiki API limit)
all_content = {}  # wiki_title -> page_content
batch_size = 50
for i in range(0, len(unique_wiki_names), batch_size):
    batch = unique_wiki_names[i:i+batch_size]
    try:
        data = fetch_batch(batch)
        pages = data.get('query', {}).get('pages', {})
        # Build title -> content map
        for pid, page in pages.items():
            title = page.get('title', '')
            revs = page.get('revisions', [])
            if revs:
                content = revs[0].get('slots', {}).get('main', {}).get('*', '')
                all_content[title] = content
        
        # Also handle redirects/normalized titles
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
    time.sleep(0.5)  # Rate limit

# Parse stats for each of our monster names
monster_stats = {}
missing = []
for name in monster_names:
    wiki_name = clean_wiki_name(name)
    variant_hint = name.split('#')[1] if '#' in name else None
    
    content = all_content.get(wiki_name, '')
    if not content:
        missing.append(name)
        continue
    
    stats = parse_infobox(content, variant_hint)
    if stats['hp'] is not None:
        entry = {'hp': stats['hp']}
        if stats['def'] is not None:
            entry['def'] = stats['def']
        # Average melee defence bonus
        bonuses = [v for v in [stats['dstab'], stats['dslash'], stats['dcrush']] if v is not None]
        if bonuses:
            entry['def_bonus'] = round(sum(bonuses) / len(bonuses))
        monster_stats[name] = entry

print(f'\nResults:', file=sys.stderr)
print(f'  Parsed: {len(monster_stats)}/{len(monster_names)}', file=sys.stderr)
print(f'  Missing pages: {len(missing)}', file=sys.stderr)
if missing:
    print(f'  First 20 missing: {missing[:20]}', file=sys.stderr)

# Save results
with open(r'C:\Users\user\Chunk-Picker-Mod\scripts\monster_stats.json', 'w') as f:
    json.dump(monster_stats, f, indent=2, sort_keys=True)

print(f'Saved to scripts/monster_stats.json', file=sys.stderr)

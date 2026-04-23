"""
Generate monsterStats JS object from monster_stats.json.
Includes both defensive and offensive fields.
Field mapping:
  hp -> hp, def -> def, def_bonus -> db, att -> al, abonus -> ab, maxhit -> mh, aspeed -> as
"""
import json

with open(r'C:\Users\user\Chunk-Picker-Mod\scripts\monster_stats.json') as f:
    stats = json.load(f)

lines = ['const monsterStats = {']
for name in sorted(stats.keys()):
    s = stats[name]
    parts = []
    if 'hp' in s and s['hp'] is not None:
        parts.append(f"hp:{s['hp']}")
    if 'def' in s and s['def'] is not None:
        parts.append(f"def:{s['def']}")
    if 'def_bonus' in s and s['def_bonus'] is not None and s['def_bonus'] != 0:
        parts.append(f"db:{s['def_bonus']}")
    # Offensive stats
    if 'att' in s and s['att'] is not None:
        parts.append(f"al:{s['att']}")
    if 'abonus' in s and s['abonus'] is not None and s['abonus'] != 0:
        parts.append(f"ab:{s['abonus']}")
    if 'maxhit' in s and s['maxhit'] is not None:
        parts.append(f"mh:{s['maxhit']}")
    if 'aspeed' in s and s['aspeed'] is not None and s['aspeed'] != 4:
        # Only include attack speed if non-default (4)
        parts.append(f"as:{s['aspeed']}")
    
    if not parts:
        continue
    
    escaped = name.replace('"', '\\"')
    lines.append(f'    "{escaped}": {{{",".join(parts)}}},')

lines.append('};')

with open(r'C:\Users\user\Chunk-Picker-Mod\scripts\monsterStats_v2.js', 'w') as f:
    f.write('\n'.join(lines) + '\n')

print(f'Generated {len(lines)-2} entries')

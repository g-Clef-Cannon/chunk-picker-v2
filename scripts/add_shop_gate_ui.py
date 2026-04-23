"""
Add Shop Cost Gate UI rendering to index.js alongside BiS Monster Power Gate.
"""
import re

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update all 3 filter conditions to also exclude 'Shop Cost Gate Amount'
old_filter = "rule !== 'BiS Monster Power Gate Amount')"
new_filter = "rule !== 'BiS Monster Power Gate Amount' && rule !== 'Shop Cost Gate Amount')"
count = content.count(old_filter)
print(f'Filter replacements: {count}')
content = content.replace(old_filter, new_filter)

# 2. Find all lines with BiS Monster Power Gate rendering to understand structure
lines = content.split('\n')
for i, line in enumerate(lines):
    if "BiS Monster Power Gate'" in line and ('ruleObj' in line or 'append' in line or 'subRuleHtml' in line):
        # Get the type of rendering
        if 'ruleObj' in line:
            rtype = 'ruleObj'
        elif 'subRuleHtml' in line:
            rtype = 'subRuleHtml' 
        else:
            rtype = 'append'
        print(f'Line {i+1} ({rtype}): ...{line.strip()[:100]}...')

# 3. Build Shop Cost Gate rendering HTML by copying BiS Monster Power Gate pattern
# For each BiS Monster Power Gate rendering block, add a Shop Cost Gate one after it

# Strategy: replace each "} else if (rule === 'BiS Monster Power Gate')" top-level block
# with the same block + a Shop Cost Gate block

# TOP-LEVEL (ruleObj pattern - search section):
# Find: } else if (rule === 'BiS Monster Power Gate') {\n                        ruleObj = ...;\n                    }
# The ruleObj line for BiS is unique, let's target it

# Actually, the simplest approach: for each occurrence of the BiS Monster Power Gate else-if,
# insert a Shop Cost Gate else-if right after.

# Pattern for search section (ruleObj):
old_search_top = "} else if (rule === 'BiS Monster Power Gate') {\n                        ruleObj = "
count_search = content.count(old_search_top)
print(f'\nSearch section top-level blocks: {count_search}')

# For mobile/desktop sections (append pattern):
old_mobile_top = "} else if (rule === 'BiS Monster Power Gate') {\n                            $(`.panel-"
count_mobile = content.count(old_mobile_top)
print(f'Mobile/Desktop section top-level blocks: {count_mobile}')

# For subrule blocks:
old_sub = "} else if (subRule === 'BiS Monster Power Gate') {\n"
count_sub = content.count(old_sub)
print(f'Subrule blocks: {count_sub}')

# Now do the replacements.
# For each BiS block, we need to find the END of its statement and insert Shop Cost Gate after.

# Let's find the exact lines and work with line numbers
new_lines = []
i = 0
shop_gate_count = 0
while i < len(lines):
    line = lines[i]
    
    # Top-level search section (ruleObj = `...`)
    if "} else if (rule === 'BiS Monster Power Gate') {" in line and i + 1 < len(lines) and 'ruleObj' in lines[i+1]:
        new_lines.append(line)
        new_lines.append(lines[i+1])
        # Create Shop Cost Gate version by replacing key strings
        shop_line = line.replace("BiS Monster Power Gate", "Shop Cost Gate")
        shop_ruleobj = lines[i+1].replace("BiS Monster Power Gate Amount", "Shop Cost Gate Amount").replace("monster-gate-input", "shop-cost-gate-input")
        new_lines.append(shop_line)
        new_lines.append(shop_ruleobj)
        shop_gate_count += 1
        i += 2
        continue
    
    # Top-level mobile/desktop sections (append)
    if "} else if (rule === 'BiS Monster Power Gate') {" in line and i + 1 < len(lines) and 'append' in lines[i+1]:
        new_lines.append(line)
        new_lines.append(lines[i+1])
        shop_line = line.replace("BiS Monster Power Gate", "Shop Cost Gate")
        shop_append = lines[i+1].replace("BiS Monster Power Gate Amount", "Shop Cost Gate Amount").replace("monster-gate-input", "shop-cost-gate-input")
        new_lines.append(shop_line)
        new_lines.append(shop_append)
        shop_gate_count += 1
        i += 2
        continue
    
    # Subrule blocks
    if "} else if (subRule === 'BiS Monster Power Gate') {" in line and i + 1 < len(lines):
        new_lines.append(line)
        new_lines.append(lines[i+1])
        shop_line = line.replace("BiS Monster Power Gate", "Shop Cost Gate")
        shop_sub = lines[i+1].replace("BiS Monster Power Gate Amount", "Shop Cost Gate Amount").replace("monster-gate-input", "shop-cost-gate-input").replace("BiS Monster Power Gate", "Shop Cost Gate")
        new_lines.append(shop_line)
        new_lines.append(shop_sub)
        shop_gate_count += 1
        i += 2
        continue
    
    new_lines.append(line)
    i += 1

content = '\n'.join(new_lines)
print(f'\nShop Cost Gate blocks added: {shop_gate_count}')

# 4. Add shopCostGateHours to both postMessage calls
# Find bisMonsterGateHours in postMessage and add shopCostGateHours after
old_pm = "bisMonsterGateHours: parseInt(rules['BiS Monster Power Gate Amount']),"
new_pm = old_pm + "\n            shopCostGateHours: parseInt(rules['Shop Cost Gate Amount']),"
count_pm = content.count(old_pm)
print(f'postMessage replacements: {count_pm}')
content = content.replace(old_pm, new_pm)

# 5. Add checkOffRules handler for Shop Cost Gate Amount
# Find the BiS Monster Power Gate Amount handler and add Shop Cost Gate Amount after
old_check = """} else if (rule === 'BiS Monster Power Gate Amount') {"""
idx = content.find(old_check)
if idx >= 0:
    # Find the closing } of this else-if block
    # Pattern: } else if (...) { ... }
    # Find the next } after the opening {
    brace_start = content.index('{', idx + len('} else if ('))
    depth = 1
    j = brace_start + 1
    while depth > 0 and j < len(content):
        if content[j] == '{':
            depth += 1
        elif content[j] == '}':
            depth -= 1
        j += 1
    # j now points to after the closing }
    # Extract the block
    block = content[idx:j]
    print(f'\nFound checkOffRules block at {idx}: ...{block[:80]}...')
    
    # Create Shop Cost Gate version
    shop_block = block.replace("BiS Monster Power Gate Amount", "Shop Cost Gate Amount").replace("monster-gate-input", "shop-cost-gate-input").replace("bisMonsterGateAmount", "shopCostGateAmount")
    # Insert after the current block
    content = content[:j] + ' else ' + shop_block[len('} else '):] + content[j:]
    print('Added Shop Cost Gate Amount checkOffRules handler')

with open('index.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('\nDone! All changes written to index.js')

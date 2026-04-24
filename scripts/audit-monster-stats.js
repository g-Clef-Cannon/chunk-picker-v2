/**
 * audit-monster-stats.js
 * 
 * Compares monsterStats entries in worker.js against the OSRS Wiki API.
 * Fetches wiki pages for all used monsters, parses infoboxes, and flags
 * significant discrepancies. Rate-limited to 1 request per second.
 * 
 * Usage: node scripts/audit-monster-stats.js [--fix] [--filter=name]
 *   --fix     Output corrected monsterStats lines for flagged entries
 *   --filter  Only audit monsters matching the given substring
 * 
 * Output: Prints a report of discrepancies to stdout.
 * Also writes scripts/audit-results.json with full comparison data.
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const RATE_LIMIT_MS = 1200; // 1.2 seconds between requests
const HP_THRESHOLD = 0.15;  // 15% HP difference = flag
const ROOT = path.join(__dirname, '..');

// --- Parse CLI args ---
const args = process.argv.slice(2);
const doFix = args.includes('--fix');
const filterArg = args.find(a => a.startsWith('--filter='));
const filterStr = filterArg ? filterArg.split('=')[1].toLowerCase() : null;

// --- Parse monsterStats from worker.js ---
function parseMonsterStats() {
    const src = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
    const lines = src.split('\n');
    const entries = {};
    // monsterStats starts at "const monsterStats = {" and ends at "};"
    let inBlock = false;
    for (const line of lines) {
        if (line.includes('const monsterStats = {')) { inBlock = true; continue; }
        if (inBlock && line.trim() === '};') break;
        if (!inBlock) continue;
        
        const m = line.match(/^\s*"([^"]+)":\s*\{([^}]+)\}/);
        if (!m) continue;
        const name = m[1];
        const statsStr = m[2];
        const stats = {};
        statsStr.split(',').forEach(part => {
            const [k, v] = part.split(':');
            if (k && v) stats[k.trim()] = parseInt(v.trim());
        });
        entries[name] = stats;
    }
    return entries;
}

// --- Parse chunk data to find used monsters ---
function getUsedMonsters() {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'chunkpicker-chunkinfo-export.json'), 'utf8'));
    const used = new Set();
    const chunks = data.chunks || {};
    Object.keys(chunks).forEach(c => {
        const ch = chunks[c];
        if (ch.Sections) {
            Object.keys(ch.Sections).forEach(s => {
                if (ch.Sections[s].Monster) {
                    Object.keys(ch.Sections[s].Monster).forEach(m => used.add(m));
                }
            });
        }
    });
    return used;
}

// --- Fetch wiki page source ---
function fetchWikiSource(pageName) {
    return new Promise((resolve, reject) => {
        const encoded = encodeURIComponent(pageName.replace(/ /g, '_'));
        const url = `https://oldschool.runescape.wiki/w/${encoded}?action=raw`;
        const options = {
            headers: { 'User-Agent': 'ChunkPickerAudit/1.0 (monster stats audit)' }
        };
        https.get(url, options, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                // Follow redirect
                const loc = res.headers.location;
                https.get(loc, options, (res2) => {
                    let body = '';
                    res2.on('data', d => body += d);
                    res2.on('end', () => resolve(body));
                    res2.on('error', reject);
                }).on('error', reject);
                return;
            }
            if (res.statusCode !== 200) {
                resolve(null);
                return;
            }
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => resolve(body));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// --- Parse infobox fields from wikitext ---
function parseInfobox(wikitext, variantHint) {
    if (!wikitext) return null;
    
    // Find variant index if needed
    let variantIdx = '';
    if (variantHint) {
        const hintLower = variantHint.toLowerCase();
        const lines = wikitext.split('\n');
        for (const line of lines) {
            const m = line.match(/\|(version|name)(\d+)\s*=\s*(.+)/);
            if (m) {
                const idx = m[2];
                const val = m[3].trim().toLowerCase();
                if (val.includes(hintLower) || hintLower.includes(val)) {
                    variantIdx = idx;
                    break;
                }
            }
        }
        // If no match found for variant, try more flexible matching
        if (!variantIdx && variantHint.match(/level\s*\d+/i)) {
            const levelNum = variantHint.match(/\d+/)[0];
            const lines2 = wikitext.split('\n');
            for (const line of lines2) {
                const m = line.match(/\|(version|name|combat)(\d+)\s*=\s*(.+)/);
                if (m && m[3].includes(levelNum)) {
                    variantIdx = m[2];
                    break;
                }
            }
        }
    }
    
    const result = {};
    const fieldMap = {
        'hitpoints': 'hp',
        'def': 'def',
        'att': 'att',
        'attbns': 'ab',
        'strbns': 'sb',
        'max hit': 'mh',
        'attack speed': 'as',
        'attack style': 'style',
        'dstab': 'dstab',
        'dslash': 'dslash',
        'dcrush': 'dcrush'
    };
    
    for (const line of wikitext.split('\n')) {
        const trimmed = line.trim();
        for (const [wikiField, ourField] of Object.entries(fieldMap)) {
            if (result.hasOwnProperty(ourField)) continue;
            
            // Build pattern list: variant-specific first, then base, then variant 1 fallback
            const patterns = [];
            if (variantIdx) {
                patterns.push(new RegExp(`^\\|${wikiField}${variantIdx}\\s*=\\s*(.+)`));
            }
            patterns.push(new RegExp(`^\\|${wikiField}\\s*=\\s*(.+)`));
            // Fallback: if no variant hint, also try variant 1 (weakest is usually first)
            if (!variantIdx) {
                patterns.push(new RegExp(`^\\|${wikiField}1\\s*=\\s*(.+)`));
            }
            
            for (const pattern of patterns) {
                const m = trimmed.match(pattern);
                if (m) {
                    let val = m[1].trim();
                    // Clean wiki markup
                    val = val.replace(/<[^>]+>/g, '').replace(/\{\{[^}]+\}\}/g, '').replace(/\[\[[^\]]+\]\]/g, '');
                    if (ourField === 'style') {
                        result[ourField] = val;
                    } else {
                        // Parse first integer
                        const numMatch = val.match(/-?\d+/);
                        if (numMatch) result[ourField] = parseInt(numMatch[0]);
                    }
                    break;
                }
            }
        }
    }
    
    // Compute def_bonus as min of dstab/dslash/dcrush (crush is usually lowest)
    if (result.dcrush != null) {
        result.db = result.dcrush;
    } else if (result.dslash != null) {
        result.db = Math.min(result.dstab || 0, result.dslash || 0, result.dcrush || 0);
    }
    
    return Object.keys(result).length > 0 ? result : null;
}

// --- Convert monster name to wiki page name and variant hint ---
function getWikiInfo(name) {
    let pageName = name;
    let variantHint = null;
    
    if (name.includes('#')) {
        pageName = name.split('#')[0];
        variantHint = name.split('#')[1];
    }
    
    return { pageName, variantHint };
}

// --- Sleep helper ---
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Main ---
async function main() {
    console.log('=== MonsterStats Audit ===\n');
    
    const monsterStats = parseMonsterStats();
    const usedMonsters = getUsedMonsters();
    
    console.log(`Parsed ${Object.keys(monsterStats).length} monsterStats entries`);
    console.log(`Found ${usedMonsters.size} monsters used in chunk data`);
    
    // Build list of monsters to audit: used in chunks AND in monsterStats
    let toAudit = [...usedMonsters].filter(m => monsterStats[m]).sort();
    
    if (filterStr) {
        toAudit = toAudit.filter(m => m.toLowerCase().includes(filterStr));
        console.log(`Filtered to ${toAudit.length} monsters matching "${filterStr}"`);
    }
    
    console.log(`Auditing ${toAudit.length} monsters...\n`);
    
    const results = [];
    const discrepancies = [];
    let fetchCount = 0;
    
    // Cache wiki fetches by page name (multiple variants share a page)
    const wikiCache = {};
    
    for (let i = 0; i < toAudit.length; i++) {
        const name = toAudit[i];
        const our = monsterStats[name];
        const { pageName, variantHint } = getWikiInfo(name);
        
        process.stdout.write(`[${i+1}/${toAudit.length}] ${name}...`);
        
        let wikitext;
        if (wikiCache[pageName] !== undefined) {
            wikitext = wikiCache[pageName];
        } else {
            await sleep(RATE_LIMIT_MS);
            try {
                wikitext = await fetchWikiSource(pageName);
                fetchCount++;
            } catch (e) {
                wikitext = null;
                console.log(` FETCH ERROR: ${e.message}`);
            }
            wikiCache[pageName] = wikitext;
        }
        
        if (!wikitext) {
            console.log(' NOT FOUND');
            results.push({ name, status: 'not_found', our });
            continue;
        }
        
        const wiki = parseInfobox(wikitext, variantHint);
        if (!wiki) {
            console.log(' PARSE ERROR');
            results.push({ name, status: 'parse_error', our });
            continue;
        }
        
        const entry = { name, status: 'ok', our, wiki, issues: [] };
        
        // Compare HP
        if (wiki.hp != null && our.hp != null) {
            const diff = Math.abs(wiki.hp - our.hp);
            const pct = diff / Math.max(wiki.hp, 1);
            if (pct > HP_THRESHOLD) {
                entry.issues.push(`HP: ours=${our.hp} wiki=${wiki.hp} (${(pct*100).toFixed(0)}% diff)`);
            }
        }
        
        // Compare DEF level
        if (wiki.def != null && our.def != null) {
            const diff = Math.abs(wiki.def - our.def);
            const pct = diff / Math.max(wiki.def, 1);
            if (pct > 0.2) {
                entry.issues.push(`DEF: ours=${our.def} wiki=${wiki.def} (${(pct*100).toFixed(0)}% diff)`);
            }
        }
        
        // Compare ATK level (al in our stats, att in wiki)
        if (wiki.att != null && our.al != null) {
            const diff = Math.abs(wiki.att - our.al);
            const pct = diff / Math.max(wiki.att, 1);
            if (pct > 0.2) {
                entry.issues.push(`ATK: ours=${our.al} wiki=${wiki.att} (${(pct*100).toFixed(0)}% diff)`);
            }
        }
        
        // Compare max hit
        if (wiki.mh != null && our.mh != null) {
            if (Math.abs(wiki.mh - our.mh) > 2) {
                entry.issues.push(`MAX_HIT: ours=${our.mh} wiki=${wiki.mh}`);
            }
        }
        
        if (entry.issues.length > 0) {
            entry.status = 'DISCREPANCY';
            discrepancies.push(entry);
            console.log(` ⚠ ${entry.issues.join('; ')}`);
        } else {
            console.log(' ✓');
        }
        
        results.push(entry);
    }
    
    // --- Report ---
    console.log('\n' + '='.repeat(60));
    console.log(`AUDIT COMPLETE: ${fetchCount} wiki fetches, ${results.length} monsters checked`);
    console.log(`Discrepancies found: ${discrepancies.length}`);
    console.log('='.repeat(60) + '\n');
    
    if (discrepancies.length > 0) {
        console.log('FLAGGED ENTRIES:');
        for (const d of discrepancies) {
            console.log(`  ${d.name}:`);
            for (const issue of d.issues) {
                console.log(`    - ${issue}`);
            }
            if (doFix && d.wiki) {
                // Generate corrected stats line
                const parts = [];
                const hp = d.wiki.hp ?? d.our.hp;
                const def = d.wiki.def ?? d.our.def;
                const db = d.wiki.db ?? d.our.db;
                const al = d.wiki.att ?? d.our.al;
                const ab = d.wiki.ab ?? d.our.ab;
                const mh = d.wiki.mh ?? d.our.mh;
                const as = d.wiki.as ?? d.our.as;
                const uf = d.our.uf;
                
                if (hp != null) parts.push(`hp:${hp}`);
                if (def != null) parts.push(`def:${def}`);
                if (db != null && db !== 0) parts.push(`db:${db}`);
                if (al != null) parts.push(`al:${al}`);
                if (ab != null && ab !== 0) parts.push(`ab:${ab}`);
                if (mh != null) parts.push(`mh:${mh}`);
                if (as != null && as !== 4) parts.push(`as:${as}`);
                if (uf) parts.push(`uf:1`);
                
                console.log(`    FIX: "${d.name}": {${parts.join(',')}},`);
            }
        }
    }
    
    // Also report missing monsters
    const missing = [...usedMonsters].filter(m => !monsterStats[m]).sort();
    if (missing.length > 0) {
        console.log(`\nMISSING FROM monsterStats (${missing.length} monsters in chunks with no stats):`);
        for (const m of missing) {
            console.log(`  - ${m}`);
        }
    }
    
    // Write full results
    const outPath = path.join(__dirname, 'audit-results.json');
    fs.writeFileSync(outPath, JSON.stringify({ discrepancies, missing, totalChecked: results.length, totalFetches: fetchCount }, null, 2));
    console.log(`\nFull results written to ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });

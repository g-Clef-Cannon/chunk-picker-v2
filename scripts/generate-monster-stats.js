const fs = require('fs');
const https = require('https');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHUNK_INFO_PATH = path.join(ROOT, 'chunkpicker-chunkinfo-export.json');
const MONSTER_NAMES_PATH = path.join(__dirname, 'monster_names.json');
const OVERRIDES_PATH = path.join(__dirname, 'monster_stat_overrides.json');
const RICH_JSON_PATH = path.join(__dirname, 'monster_stats_full.json');
const BROWSER_DATA_PATH = path.join(ROOT, 'monster-stats-data.js');

const INFLECTED_FIELDS = {
    combat: { key: 'combat', type: 'number' },
    hitpoints: { key: 'hitpoints', type: 'number' },
    att: { key: 'attack', type: 'number' },
    str: { key: 'strength', type: 'number' },
    def: { key: 'defence', type: 'number' },
    mage: { key: 'magic', type: 'number' },
    range: { key: 'ranged', type: 'number' },
    attbns: { key: 'attack_bonus', type: 'number' },
    strbns: { key: 'strength_bonus', type: 'number' },
    amagic: { key: 'magic_attack_bonus', type: 'number' },
    mbns: { key: 'magic_strength_bonus', type: 'number' },
    arange: { key: 'ranged_attack_bonus', type: 'number' },
    rngbns: { key: 'ranged_strength_bonus', type: 'number' },
    dstab: { key: 'defence_stab', type: 'number' },
    dslash: { key: 'defence_slash', type: 'number' },
    dcrush: { key: 'defence_crush', type: 'number' },
    dmagic: { key: 'defence_magic', type: 'number' },
    drange: { key: 'defence_ranged', type: 'number' },
    dlight: { key: 'defence_light', type: 'number' },
    dstandard: { key: 'defence_standard', type: 'number' },
    dheavy: { key: 'defence_heavy', type: 'number' },
    'max hit': { key: 'max_hit', type: 'maxhit' },
    'attack speed': { key: 'attack_speed', type: 'number' },
    'attack style': { key: 'attack_style', type: 'text' },
    weakness: { key: 'weakness', type: 'text' },
    weaknesses: { key: 'weakness', type: 'text' },
    'elemental weakness': { key: 'weakness', type: 'text' },
    elementalweaknesstype: { key: 'elemental_weakness_type', type: 'text' },
    elementalweaknesspercent: { key: 'elemental_weakness_percent', type: 'number' },
    attributes: { key: 'attributes', type: 'text' },
    immunepoison: { key: 'immune_poison', type: 'text' },
    immunevenom: { key: 'immune_venom', type: 'text' }
};

const FIELD_NAMES = Object.keys(INFLECTED_FIELDS).sort((a, b) => b.length - a.length);

const readJson = function(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const getChunkMonsterNames = function(chunkInfo) {
    const monsters = new Set();
    Object.values(chunkInfo.chunks || {}).forEach((chunk) => {
        Object.values(chunk.Sections || {}).forEach((section) => {
            Object.keys(section.Monster || {}).forEach((monster) => monsters.add(monster));
        });
    });
    return monsters;
};

const splitMonsterName = function(name) {
    const split = name.split('#');
    return {
        pageName: split[0],
        variantHint: split.length > 1 ? split.slice(1).join('#') : ''
    };
};

const normalizeTitle = function(title) {
    return title.replace(/ /g, '_');
};

const cleanWikiText = function(value) {
    if (value == null) return '';
    let text = value.toString();
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    text = text.replace(/<ref[\s\S]*?<\/ref>/gi, '');
    text = text.replace(/<ref[^>]*\/>/gi, '');
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2');
    text = text.replace(/\[\[([^\]]+)\]\]/g, '$1');
    text = text.replace(/\{\{Weakness\|([^}|]+)[^}]*\}\}/gi, '$1');
    text = text.replace(/\{\{([^}|]+)\|([^}|]+)(?:\|[^}]*)?\}\}/g, '$2');
    text = text.replace(/\{\{([^}]+)\}\}/g, '$1');
    text = text.replace(/'''/g, '');
    text = text.replace(/''/g, '');
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
};

const parseNumber = function(value) {
    const text = cleanWikiText(value).replace(/,/g, '');
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    return Number(match[0]);
};

const parseMaxHit = function(value) {
    const text = cleanWikiText(value).replace(/,/g, '');
    const numbers = text.match(/\d+/g);
    if (!numbers || numbers.length === 0) return null;
    return Math.max(...numbers.map((num) => parseInt(num, 10)));
};

const extractInfoboxFields = function(wikitext) {
    const fields = {};
    if (!wikitext) return fields;
    wikitext.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        const match = trimmed.match(/^\|([^=]+?)\s*=\s*(.*)$/);
        if (!match) return;
        fields[match[1].trim().toLowerCase()] = match[2].trim();
    });
    return fields;
};

const getVariantIndex = function(fields, variantHint) {
    if (!variantHint) return '';
    const hint = variantHint.toLowerCase();
    const levelMatch = hint.match(/\d+/);
    let best = '';
    Object.keys(fields).forEach((fieldName) => {
        const match = fieldName.match(/^(version|name|combat)(\d+)$/);
        if (!match || best) return;
        const value = cleanWikiText(fields[fieldName]).toLowerCase();
        if (!value) return;
        if (value.includes(hint) || hint.includes(value)) {
            best = match[2];
            return;
        }
        if (levelMatch && value.match(new RegExp('\\b' + levelMatch[0] + '\\b'))) {
            best = match[2];
        }
    });
    if (!best && (hint.includes('lower') || hint.includes('higher'))) {
        const combats = Object.keys(fields)
            .map((fieldName) => {
                const match = fieldName.match(/^combat(\d+)$/);
                if (!match) return null;
                const combat = parseNumber(fields[fieldName]);
                return combat == null ? null : { index: match[1], combat };
            })
            .filter(Boolean)
            .sort((a, b) => a.combat - b.combat);
        if (combats.length > 0) {
            best = hint.includes('lower') ? combats[0].index : combats[combats.length - 1].index;
        }
    }
    return best;
};

const getFieldValue = function(fields, fieldName, variantIndex) {
    if (variantIndex && fields[fieldName + variantIndex] != null) return fields[fieldName + variantIndex];
    if (fields[fieldName] != null) return fields[fieldName];
    if (!variantIndex && fields[fieldName + '1'] != null) return fields[fieldName + '1'];
    return undefined;
};

const parseMonsterStats = function(name, wikitext, aliasTarget) {
    const aliasInfo = splitMonsterName(aliasTarget || name);
    const fields = extractInfoboxFields(wikitext);
    const variantIndex = getVariantIndex(fields, aliasInfo.variantHint);
    const stats = {
        wiki_name: aliasInfo.pageName
    };
    if (aliasInfo.variantHint) {
        stats.variant = aliasInfo.variantHint;
    }
    FIELD_NAMES.forEach((fieldName) => {
        const field = INFLECTED_FIELDS[fieldName];
        const rawValue = getFieldValue(fields, fieldName, variantIndex);
        if (rawValue == null || rawValue === '') return;
        let parsed;
        if (field.type === 'number') parsed = parseNumber(rawValue);
        else if (field.type === 'maxhit') parsed = parseMaxHit(rawValue);
        else parsed = cleanWikiText(rawValue);
        if (parsed == null || parsed === '') return;
        stats[field.key] = parsed;
    });
    if (!stats.weakness && stats.elemental_weakness_type) {
        stats.weakness = stats.elemental_weakness_type + (stats.elemental_weakness_percent != null ? ' (' + stats.elemental_weakness_percent + '%)' : '');
    }
    addDerivedStats(stats);
    return stats;
};

const addDerivedStats = function(stats) {
    const defence = stats.defence;
    const rollFields = {
        stab: 'defence_stab',
        slash: 'defence_slash',
        crush: 'defence_crush',
        magic: 'defence_magic',
        ranged: 'defence_ranged',
        light: 'defence_light',
        standard: 'defence_standard',
        heavy: 'defence_heavy'
    };
    const rolls = {};
    Object.entries(rollFields).forEach(([style, field]) => {
        if (defence == null || stats[field] == null) return;
        rolls[style] = Math.round((defence + 9) * (stats[field] + 64));
    });
    if (Object.keys(rolls).length > 0) {
        stats.defence_rolls = rolls;
        const weakest = Object.entries(rolls).sort((a, b) => a[1] - b[1])[0];
        stats.weakest_defence_style = weakest[0];
        stats.weakest_defence_roll = weakest[1];
    }
};

const fetchWikiBatch = function(titles) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            action: 'query',
            titles: titles.join('|'),
            prop: 'revisions',
            rvprop: 'content',
            rvslots: 'main',
            redirects: '1',
            format: 'json'
        });
        const req = https.get({
            hostname: 'oldschool.runescape.wiki',
            path: '/api.php?' + params.toString(),
            headers: {
                'User-Agent': 'ChunkPickerMod/1.0 (monster stats generation)'
            }
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error('Wiki API returned HTTP ' + res.statusCode));
                    return;
                }
                resolve(JSON.parse(body));
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy(new Error('Wiki API request timed out'));
        });
    });
};

const sleep = function(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

const fetchWikiContent = async function(pageNames) {
    const uniquePages = Array.from(new Set(pageNames)).sort();
    const contents = {};
    const batchSize = 50;
    for (let index = 0; index < uniquePages.length; index += batchSize) {
        const batch = uniquePages.slice(index, index + batchSize);
        const data = await fetchWikiBatch(batch);
        const pages = data.query && data.query.pages ? data.query.pages : {};
        const normalized = {};
        (data.query && data.query.normalized || []).forEach((entry) => {
            normalized[entry.from] = entry.to;
        });
        const redirects = {};
        (data.query && data.query.redirects || []).forEach((entry) => {
            redirects[entry.from] = entry.to;
        });
        const titleContent = {};
        Object.values(pages).forEach((page) => {
            const revision = page.revisions && page.revisions[0];
            const content = revision && revision.slots && revision.slots.main ? revision.slots.main['*'] : '';
            if (page.title && content) {
                titleContent[page.title] = content;
            }
        });
        batch.forEach((originalTitle) => {
            let resolved = normalized[originalTitle] || originalTitle;
            resolved = redirects[resolved] || resolved;
            contents[originalTitle] = titleContent[resolved] || titleContent[originalTitle] || '';
        });
        console.error('Fetched ' + Math.min(index + batch.length, uniquePages.length) + '/' + uniquePages.length + ' wiki pages');
        await sleep(250);
    }
    return contents;
};

const writeBrowserData = function(stats) {
    const body = 'window.monsterStatsData = ' + JSON.stringify(stats, null, 2) + ';\n';
    fs.writeFileSync(BROWSER_DATA_PATH, body);
};

const main = async function() {
    const chunkInfo = readJson(CHUNK_INFO_PATH, {});
    const chunkMonsters = getChunkMonsterNames(chunkInfo);
    const configuredNames = new Set(readJson(MONSTER_NAMES_PATH, []));
    chunkMonsters.forEach((name) => configuredNames.add(name));
    const overrides = readJson(OVERRIDES_PATH, { aliases: {}, stats: {} });
    const aliases = overrides.aliases || {};
    const manualStats = overrides.stats || {};
    const names = Array.from(configuredNames).sort();
    const pageNames = names.map((name) => splitMonsterName(aliases[name] || name).pageName);
    const contentByPage = await fetchWikiContent(pageNames);
    const stats = {};
    const missing = [];
    names.forEach((name) => {
        const aliasTarget = aliases[name] || name;
        const pageName = splitMonsterName(aliasTarget).pageName;
        const wikitext = contentByPage[pageName] || '';
        const parsed = parseMonsterStats(name, wikitext, aliasTarget);
        const merged = Object.assign({}, parsed, manualStats[name] || {});
        addDerivedStats(merged);
        if (Object.keys(merged).filter((key) => key !== 'wiki_name' && key !== 'variant').length === 0) {
            missing.push(name);
            return;
        }
        if (aliases[name]) {
            merged.alias_of = aliasTarget;
        }
        stats[name] = merged;
    });
    fs.writeFileSync(RICH_JSON_PATH, JSON.stringify(stats, null, 2) + '\n');
    writeBrowserData(stats);
    const chunkMissing = Array.from(chunkMonsters).filter((name) => !stats[name]).sort();
    console.error('Generated rich monster stats: ' + Object.keys(stats).length + '/' + names.length);
    console.error('Missing configured monsters: ' + missing.length);
    console.error('Missing chunk monsters: ' + chunkMissing.length);
    if (chunkMissing.length > 0) {
        console.error('First missing chunk monsters: ' + chunkMissing.slice(0, 25).join(', '));
    }
};

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

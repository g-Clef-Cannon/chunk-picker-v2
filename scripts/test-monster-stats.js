const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHUNK_INFO_PATH = path.join(ROOT, 'chunkpicker-chunkinfo-export.json');
const RICH_STATS_PATH = path.join(__dirname, 'monster_stats_full.json');
const BROWSER_STATS_PATH = path.join(ROOT, 'monster-stats-data.js');

const readJson = function(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const readBrowserStats = function() {
    const content = fs.readFileSync(BROWSER_STATS_PATH, 'utf8');
    const prefix = 'window.monsterStatsData = ';
    if (!content.startsWith(prefix)) {
        throw new Error('monster-stats-data.js does not assign window.monsterStatsData');
    }
    return JSON.parse(content.slice(prefix.length).replace(/;\s*$/, ''));
};

const getChunkMonsterNames = function(chunkInfo) {
    const monsters = new Set();
    Object.values(chunkInfo.chunks || {}).forEach((chunk) => {
        Object.values(chunk.Sections || {}).forEach((section) => {
            Object.keys(section.Monster || {}).forEach((monster) => monsters.add(monster));
        });
    });
    return Array.from(monsters).sort();
};

const assert = function(condition, message) {
    if (!condition) throw new Error(message);
};

const assertDefenceRoll = function(stats, monsterName, style, bonusField) {
    assert(stats[monsterName], monsterName + ' is missing stats');
    const monster = stats[monsterName];
    assert(monster.defence != null, monsterName + ' is missing defence');
    assert(monster[bonusField] != null, monsterName + ' is missing ' + bonusField);
    assert(monster.defence_rolls && monster.defence_rolls[style] != null, monsterName + ' is missing ' + style + ' roll');
    const expected = Math.round((monster.defence + 9) * (monster[bonusField] + 64));
    assert(monster.defence_rolls[style] === expected, monsterName + ' has incorrect ' + style + ' roll');
};

const chunkInfo = readJson(CHUNK_INFO_PATH);
const richStats = readJson(RICH_STATS_PATH);
const browserStats = readBrowserStats();
const chunkMonsters = getChunkMonsterNames(chunkInfo);
const missingRich = chunkMonsters.filter((monster) => !richStats[monster]);
const missingBrowser = chunkMonsters.filter((monster) => !browserStats[monster]);

assert(missingRich.length === 0, 'Missing rich stats for chunk monsters: ' + missingRich.join(', '));
assert(missingBrowser.length === 0, 'Missing browser stats for chunk monsters: ' + missingBrowser.join(', '));

assert(browserStats['Bee swarm'].hitpoints === 1, 'Bee swarm override was not applied');
assert(browserStats['Bee swarm'].weakness === 'Guaranteed max hit', 'Bee swarm weakness override was not applied');
assert(browserStats['Forester'].hitpoints === 20, 'Forester override was not applied');
assert(browserStats['Fire giant'].weakness === 'Water (100%)', 'Fire giant elemental weakness was not parsed');
assertDefenceRoll(browserStats, 'Green dragon', 'stab', 'defence_stab');
assertDefenceRoll(browserStats, 'Green dragon', 'standard', 'defence_standard');

console.log('Monster stats validation passed: ' + chunkMonsters.length + ' chunk monsters represented.');

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const hiscoreUtils = require(path.join(__dirname, '..', 'hiscore-utils.js'));

console.log('=== Hiscore Lookup Test Suite ===\n');

assert.strictEqual(hiscoreUtils.normalizeCharacterName('  Lynx   Titan  '), 'Lynx Titan');
assert.ok(hiscoreUtils.isValidCharacterName('Lynx Titan'));
assert.ok(hiscoreUtils.isValidCharacterName('Lynx_Titan'));
assert.ok(!hiscoreUtils.isValidCharacterName('ThisNameIsTooLong'));
assert.ok(!hiscoreUtils.isValidCharacterName('bad-name'));
assert.strictEqual(
    hiscoreUtils.buildHiscoreUrl('Lynx Titan'),
    hiscoreUtils.HISCORE_ENDPOINT + 'Lynx_Titan'
);

const levels = hiscoreUtils.parseHiscoreSkillLevels({
    name: 'Fixture',
    skills: [
        { id: 0, name: 'Overall', rank: 1, level: 2278, xp: 4600000000 },
        { id: 1, name: 'Attack', rank: 2, level: 99, xp: 13034431 },
        { id: 2, name: 'Defence', rank: 3, level: 98, xp: 12000000 },
        { id: 21, name: 'Runecraft', rank: 4, level: 77, xp: 1475581 },
        { id: 24, name: 'Sailing', rank: -1, level: 1, xp: 0 },
        { id: 25, name: 'Ignored', rank: -1, level: -1, xp: -1 }
    ]
});

assert.deepStrictEqual(levels, {
    Attack: 99,
    Defence: 98,
    Runecraft: 77,
    Sailing: 1
});

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(
    indexHtml.indexOf('hiscore-utils.js') > -1 && indexHtml.indexOf('hiscore-utils.js') < indexHtml.indexOf('index.js'),
    'hiscore-utils.js should load before index.js'
);

const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
assert.ok(indexSource.includes('hiscoreCharacterName'), 'index.js should persist the hiscore character name');
assert.ok(indexSource.includes('queueHiscoreRefresh()'), 'index.js should requery hiscores after data operations');

console.log('All hiscore lookup tests passed.');

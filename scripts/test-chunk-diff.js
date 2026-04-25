/**
 * Test: What changes when chunk 6457 is unlocked?
 * Runs the worker twice (without and with 6457) and diffs the results.
 */

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// ── Constants (from index.js) ────────────────────────────────────────────────

const skillNames = [
    "Slayer","Thieving","Attack","Defence","Strength","Hitpoints","Ranged",
    "Prayer","Magic","Farming","Herblore","Hunter","Cooking","Woodcutting",
    "Firemaking","Fletching","Fishing","Mining","Runecraft","Sailing",
    "Smithing","Crafting","Agility","Construction","Combat"
];
const combatSkills = ['Attack','Strength','Defence','Hitpoints','Ranged','Magic','Prayer'];
const f2pSkills = [
    'Attack','Strength','Defence','Ranged','Prayer','Magic','Runecraft',
    'Hitpoints','Crafting','Mining','Smithing','Fishing','Cooking',
    'Firemaking','Woodcutting'
];
const maybePrimary = ["Normal Farming","Sulphurous Fertiliser","Shortcut","InsidePOH Primary"];
const processingSkill = {
    "Slayer":false,"Thieving":false,"Attack":false,"Defence":false,
    "Strength":false,"Hitpoints":false,"Ranged":false,"Prayer":false,
    "Runecraft":true,"Sailing":false,"Magic":true,"Farming":false,
    "Herblore":true,"Hunter":false,"Cooking":true,"Woodcutting":false,
    "Firemaking":true,"Fletching":true,"Fishing":false,"Mining":false,
    "Smithing":true,"Crafting":true,"Agility":false,"Construction":true,
    "Combat":false,"Quest":false,"Diary":false,"Nonskill":false,
    "Extra":false,"BiS":false
};
const universalPrimary = {
    "Slayer":["Primary[+]"],"Thieving":["Primary[+]"],
    "Attack":["Monster[+]"],"Defence":["Monster[+]"],
    "Strength":["Monster[+]"],"Hitpoints":["Monster[+]"],
    "Ranged":["Ranged[+]"],"Prayer":["Primary[+]","Bones[+]"],
    "Runecraft":["Primary[+]"],"Sailing":["Primary[+]"],
    "Magic":["Primary[+]"],"Farming":["Primary[+]"],
    "Herblore":["Primary[+]"],"Hunter":["Primary[+]"],
    "Cooking":["Primary[+]"],"Woodcutting":["Primary[+]"],
    "Firemaking":["Primary[+]"],"Fletching":["Primary[+]"],
    "Fishing":["Primary[+]"],"Mining":["Primary[+]"],
    "Smithing":["Primary[+]"],"Crafting":["Primary[+]"],
    "Agility":["Primary[+]"],"Construction":["Primary[+]"],
    "Combat":["Combat[+]"]
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch(e) { reject(new Error('JSON parse failed: ' + e.message)); }
            });
        }).on('error', reject);
    });
}

function computeHighestCurrent(completedChallenges, chunkInfo) {
    let highest = {};
    if (!completedChallenges) return highest;
    Object.keys(completedChallenges).forEach(skill => {
        let maxLevel = 0;
        let maxName = '';
        Object.keys(completedChallenges[skill]).forEach(taskId => {
            if (chunkInfo.challenges[skill]) {
                Object.keys(chunkInfo.challenges[skill]).forEach(name => {
                    const task = chunkInfo.challenges[skill][name];
                    if (task.TaskId === taskId || ('t_' + task.TaskId) === taskId) {
                        const lv = parseInt(task.Level) || 0;
                        if (lv > maxLevel) { maxLevel = lv; maxName = name; }
                    }
                });
            }
        });
        if (maxName) highest[skill] = maxName;
    });
    return highest;
}

function decodeFirebaseObject(obj, tasksMapReverse) {
    if (!obj || typeof obj !== 'object') return obj;
    let out = {};
    Object.keys(obj).forEach(key => {
        let newKey = key;
        if (newKey.startsWith('t_') && tasksMapReverse[newKey]) {
            newKey = tasksMapReverse[newKey];
        }
        if (newKey.includes('*fb*_')) newKey = newKey.split('*fb*_')[1];
        newKey = decodeURIComponent(newKey.replace(/-_-20/g, '%20').replace(/-_-/g, '%'));
        let val = obj[key];
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            out[newKey] = decodeFirebaseObject(val, tasksMapReverse);
        } else if (typeof val === 'string' && val.startsWith('t_') && tasksMapReverse[val]) {
            out[newKey] = tasksMapReverse[val];
        } else {
            out[newKey] = val;
        }
    });
    return out;
}

// Run worker with a given set of unlocked chunks, return result
function runWorker(workerCode, lodashCode, workerData) {
    let workerResult = null;
    const sandbox = {
        importScripts: function() {},
        postMessage: function(data) { workerResult = data; },
        self: {},
        console: {
            log: function() {},
            warn: console.warn,
            error: console.error
        },
        setTimeout, clearTimeout, Math, JSON, Object, Array, String, Number,
        Boolean, RegExp, Date, Error, TypeError, RangeError, Map, Set, Promise,
        parseInt, parseFloat, isNaN, isFinite,
        undefined, NaN, Infinity,
        encodeURIComponent, decodeURIComponent
    };
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;

    const context = vm.createContext(sandbox);
    vm.runInContext(lodashCode, context, { filename: 'lodash.min.js' });
    vm.runInContext(workerCode, context, { filename: 'worker.js', timeout: 30000 });

    const onmessageFn = vm.runInContext('onmessage', context);
    onmessageFn({ data: workerData });
    return workerResult;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('=== Chunk 6457 Diff Test ===\n');

    const chunkInfo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'chunkpicker-chunkinfo-export.json'), 'utf8'));
    const fb = await fetchJSON('https://chunkpicker.firebaseio.com/maps/iwil.json');
    if (!fb || !fb.rules) { console.error('FAIL: no Firebase data'); process.exit(1); }

    const tasksMap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tasksMap.json'), 'utf8'));
    const tasksMapReverse = {};
    Object.entries(tasksMap).forEach(([name, id]) => { tasksMapReverse[id] = name; });

    const ci = fb.chunkinfo || {};
    const rules = { ...fb.rules };
    const codeItems = chunkInfo.codeItems || {};
    const completedChallenges = decodeFirebaseObject(ci.completedChallenges || {}, tasksMapReverse);
    const backlog = decodeFirebaseObject(ci.backlog || {}, tasksMapReverse);
    const checkedChallenges = decodeFirebaseObject(ci.checkedChallenges || {}, tasksMapReverse);
    const altChallenges = decodeFirebaseObject(ci.altChallenges || {}, tasksMapReverse);
    const manualEquipment = decodeFirebaseObject(ci.manualEquipment || {}, tasksMapReverse);
    const highestCurrent = computeHighestCurrent(ci.completedChallenges || {}, chunkInfo);

    const lodashCode = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'lodash', 'lodash.min.js'), 'utf8');
    let workerCode = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
    workerCode = workerCode.replace(/^importScripts\(.*?\);?\s*$/m, '');

    const allChunks = fb.chunks && fb.chunks.unlocked ? fb.chunks.unlocked : {};

    // Build chunks WITHOUT 6457
    const chunksBefore = { ...allChunks };
    delete chunksBefore['6457'];

    function buildWorkerData(chunks) {
        return {
            type: 'current',
            chunks, rules, chunkInfo, skillNames, processingSkill, maybePrimary, combatSkills,
            monstersPlus: codeItems.monstersPlus || {},
            objectsPlus: codeItems.objectsPlus || {},
            chunksPlus: codeItems.chunksPlus || {},
            itemsPlus: codeItems.itemsPlus || {},
            mixPlus: codeItems.mixPlus || {},
            npcsPlus: codeItems.npcsPlus || {},
            tasksPlus: codeItems.tasksPlus || {},
            tools: codeItems.tools || {},
            elementalRunes: codeItems.elementalRunes || {},
            manualTasks: ci.manualTasks || {},
            completedChallenges, backlog,
            rareDropNum: "1/" + (rules['Rare Drop Amount'] || '128'),
            universalPrimary,
            elementalStaves: codeItems.elementalStaves || {},
            rangedItems: codeItems.rangedItems || {},
            boneItems: codeItems.boneItems || {},
            highestCurrent,
            dropTables: codeItems.dropTables || {},
            possibleAreas: ci.possibleAreas || {},
            randomLoot: {},
            magicTools: codeItems.magicTools || {},
            bossLogs: codeItems.bossLogs || {},
            bossMonsters: codeItems.bossMonsters || {},
            minigameShops: codeItems.minigameShops || {},
            manualEquipment, checkedChallenges,
            backloggedSources: ci.backloggedSources || {},
            altChallenges,
            manualMonsters: ci.manualMonsters || {},
            slayerLocked: ci.slayerLocked || {},
            passiveSkill: ci.passiveSkill || {},
            f2pSkills,
            assignedXpRewards: ci.assignedXpRewards || {},
            isDiary2Tier: false,
            manualAreas: ci.manualAreas || {},
            secondaryPrimaryNum: "1/" + (rules['Secondary Primary Amount'] || '2'),
            toolGatingThreshold: parseInt(rules['Strict Tool Gating Amount'] || '100') / 100,
            skillTaskCap: rules['Skill Task Cap'] || 'off',
            skillTaskCapAmount: parseInt(rules['Skill Task Cap Amount'] || '50'),
            bisMonsterGateHours: parseInt(rules['BiS Monster Power Gate Amount'] || '4'),
            shopCostGateHours: parseInt(rules['Shop Cost Gate Amount'] || '4'),
            constructionLocked: ci.constructionLocked || {},
            isOnlyManualAreas: false,
            manualSections: ci.manualSections || {},
            optOutSections: (fb.settings && fb.settings.optOutSections) || {},
            optOutSectionsWater: (fb.settings && fb.settings.optOutSectionsWater) || {},
            maxSkill: ci.maxSkill || {},
            userTasks: fb.userTasks || {},
            manualPrimary: fb.manualPrimary || {},
            updateLevel: 'maintenance-mode'
        };
    }

    // Run WITHOUT 6457
    console.log('Running worker WITHOUT chunk 6457...');
    const resultBefore = runWorker(workerCode, lodashCode, buildWorkerData(chunksBefore));

    // Run WITH 6457
    console.log('Running worker WITH chunk 6457...');
    const resultAfter = runWorker(workerCode, lodashCode, buildWorkerData(allChunks));

    if (!resultBefore || !resultAfter) {
        console.error('FAIL: Worker did not produce results');
        process.exit(1);
    }

    // Compare globalValids per skill
    const vBefore = resultBefore.globalValids || {};
    const vAfter = resultAfter.globalValids || {};

    const allSkills = new Set([...Object.keys(vBefore), ...Object.keys(vAfter)]);

    console.log('\n=== Tasks ADDED by unlocking 6457 ===\n');
    let totalAdded = 0;
    for (const skill of [...allSkills].sort()) {
        const before = new Set(Object.keys(vBefore[skill] || {}));
        const after = new Set(Object.keys(vAfter[skill] || {}));
        const added = [...after].filter(t => !before.has(t));
        if (added.length > 0) {
            console.log(`  ${skill} (+${added.length}):`);
            added.forEach(t => {
                const lv = vAfter[skill][t];
                console.log(`    lv${lv}: ${t}`);
            });
            totalAdded += added.length;
        }
    }
    if (totalAdded === 0) console.log('  (none)');

    console.log('\n=== Tasks REMOVED by unlocking 6457 ===\n');
    let totalRemoved = 0;
    for (const skill of [...allSkills].sort()) {
        const before = new Set(Object.keys(vBefore[skill] || {}));
        const after = new Set(Object.keys(vAfter[skill] || {}));
        const removed = [...before].filter(t => !after.has(t));
        if (removed.length > 0) {
            console.log(`  ${skill} (-${removed.length}):`);
            removed.forEach(t => {
                const lv = vBefore[skill][t];
                console.log(`    lv${lv}: ${t}`);
            });
            totalRemoved += removed.length;
        }
    }
    if (totalRemoved === 0) console.log('  (none)');

    // Specifically check Defence willow shield
    const defBefore = vBefore['Defence'] || {};
    const defAfter = vAfter['Defence'] || {};
    const willowKey = Object.keys(defAfter).find(k => k.toLowerCase().includes('willow shield'));
    const willowInBefore = Object.keys(defBefore).find(k => k.toLowerCase().includes('willow shield'));

    console.log('\n=== Willow Shield Defence Task ===');
    console.log('  Present BEFORE 6457:', willowInBefore ? 'YES - ' + willowInBefore : 'NO');
    console.log('  Present AFTER 6457:', willowKey ? 'YES - ' + willowKey : 'NO');

    console.log('\n=== Summary ===');
    console.log(`  Tasks added: ${totalAdded}`);
    console.log(`  Tasks removed: ${totalRemoved}`);
    console.log('  Done.');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

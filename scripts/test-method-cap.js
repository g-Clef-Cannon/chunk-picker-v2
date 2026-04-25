/**
 * Test: Method-Based Cap should prevent fried onions (lv42 Cooking) from appearing
 * when the user's highest Cooking primary method is level 20 (nettle tea → cap=30).
 *
 * Loads real Firebase data for map "iwil" and runs the worker calc in Node.js.
 */

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// ── Hardcoded constants (from index.js) ──────────────────────────────────────

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

// Decode Firebase task IDs to task names (mimics frontend decodeObject)
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

// ── Main test ────────────────────────────────────────────────────────────────

async function runTests() {
    console.log('=== Method-Based Cap Test Suite ===\n');

    // 1. Load static chunkInfo
    console.log('Loading chunkInfo...');
    const chunkInfoPath = path.join(__dirname, '..', 'chunkpicker-chunkinfo-export.json');
    const chunkInfo = JSON.parse(fs.readFileSync(chunkInfoPath, 'utf8'));

    // 2. Fetch Firebase data
    console.log('Fetching Firebase data for map "iwil"...');
    const fb = await fetchJSON('https://chunkpicker.firebaseio.com/maps/iwil.json');
    if (!fb || !fb.rules) {
        console.error('FAIL: Could not fetch Firebase data');
        process.exit(1);
    }

    const ci = fb.chunkinfo || {};
    const rules = fb.rules;

    // Force Method-Based Cap on for this test
    rules['Method-Based Cap'] = true;

    // 3. Build tasksMap reverse lookup (task ID → task name)
    const tasksMapPath = path.join(__dirname, '..', 'tasksMap.json');
    const tasksMap = JSON.parse(fs.readFileSync(tasksMapPath, 'utf8'));
    const tasksMapReverse = {};
    Object.entries(tasksMap).forEach(([name, id]) => { tasksMapReverse[id] = name; });

    // 4. Extract codeItems
    const codeItems = chunkInfo.codeItems || {};

    // 5. Build unlocked chunks list (must use 'unlocked', not 'selected')
    const chunks = fb.chunks && fb.chunks.unlocked ? fb.chunks.unlocked : {};

    // 6. Decode Firebase data (task IDs → task names, like frontend decodeObject)
    const completedChallenges = decodeFirebaseObject(ci.completedChallenges || {}, tasksMapReverse);
    const backlog = decodeFirebaseObject(ci.backlog || {}, tasksMapReverse);
    const checkedChallenges = decodeFirebaseObject(ci.checkedChallenges || {}, tasksMapReverse);
    const altChallenges = decodeFirebaseObject(ci.altChallenges || {}, tasksMapReverse);
    const manualEquipment = decodeFirebaseObject(ci.manualEquipment || {}, tasksMapReverse);
    const highestCurrent = computeHighestCurrent(ci.completedChallenges || {}, chunkInfo);

    // 6. Build randomLoot (simplified — empty object is fine for cap testing)
    const randomLoot = {};

    // 7. Construct worker message
    const workerData = {
        type: 'current',
        chunks,
        rules,
        chunkInfo,
        skillNames,
        processingSkill,
        maybePrimary,
        combatSkills,
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
        completedChallenges,
        backlog,
        rareDropNum: "1/" + (rules['Rare Drop Amount'] || '128'),
        universalPrimary,
        elementalStaves: codeItems.elementalStaves || {},
        rangedItems: codeItems.rangedItems || {},
        boneItems: codeItems.boneItems || {},
        highestCurrent,
        dropTables: codeItems.dropTables || {},
        possibleAreas: ci.possibleAreas || {},
        randomLoot,
        magicTools: codeItems.magicTools || {},
        bossLogs: codeItems.bossLogs || {},
        bossMonsters: codeItems.bossMonsters || {},
        minigameShops: codeItems.minigameShops || {},
        manualEquipment,
        checkedChallenges,
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

    // 8. Load lodash for the worker
    console.log('Loading lodash...');
    const lodashPath = path.join(__dirname, '..', 'node_modules', 'lodash', 'lodash.min.js');
    let lodashCode;
    if (fs.existsSync(lodashPath)) {
        lodashCode = fs.readFileSync(lodashPath, 'utf8');
    } else {
        // Try to download it
        console.log('Lodash not found locally, downloading...');
        lodashCode = await new Promise((resolve, reject) => {
            https.get('https://cdn.jsdelivr.net/npm/lodash@4.17.20/lodash.min.js', (res) => {
                let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
            }).on('error', reject);
        });
    }

    // 9. Load worker source
    console.log('Loading worker.js...');
    const workerPath = path.join(__dirname, '..', 'worker.js');
    let workerCode = fs.readFileSync(workerPath, 'utf8');
    // Remove the importScripts line (we load lodash separately)
    workerCode = workerCode.replace(/^importScripts\(.*?\);?\s*$/m, '');

    // 10. Create sandbox and run worker
    console.log('Setting up worker sandbox...');

    let workerResult = null;
    let workerError = null;

    const sandbox = {
        // Web Worker API stubs
        importScripts: function() {},
        postMessage: function(data) {
            workerResult = data;
        },
        self: {},
        console: {
            log: function(...args) {
                const msg = args.join(' ');
                // Only print debug lines relevant to our test
                if (msg.includes('[DEBUG-BRING]') || msg.includes('[DEBUG-FINAL]') || msg.includes('[DEBUG-MCAP]') || msg.includes('[DEBUG-LOOP]')) {
                    console.log('  [WORKER]', msg);
                }
            },
            warn: console.warn,
            error: console.error
        },
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        Math: Math,
        JSON: JSON,
        Object: Object,
        Array: Array,
        String: String,
        Number: Number,
        Boolean: Boolean,
        RegExp: RegExp,
        Date: Date,
        Error: Error,
        TypeError: TypeError,
        RangeError: RangeError,
        Map: Map,
        Set: Set,
        Promise: Promise,
        parseInt: parseInt,
        parseFloat: parseFloat,
        isNaN: isNaN,
        isFinite: isFinite,
        undefined: undefined,
        NaN: NaN,
        Infinity: Infinity,
        encodeURIComponent: encodeURIComponent,
        decodeURIComponent: decodeURIComponent
    };
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;

    const context = vm.createContext(sandbox);

    // Load lodash into context
    vm.runInContext(lodashCode, context, { filename: 'lodash.min.js' });

    // Load worker code into context
    try {
        vm.runInContext(workerCode, context, { filename: 'worker.js', timeout: 10000 });
    } catch(e) {
        console.error('Error loading worker.js:', e.message);
        process.exit(1);
    }

    // 11. Trigger onmessage
    console.log('Triggering worker calculation...\n');
    try {
        const onmessageFn = vm.runInContext('onmessage', context);
        onmessageFn({ data: workerData });
    } catch(e) {
        workerError = e;
        console.error('Worker error:', e.message);
        if (e.stack) {
            // Show relevant part of stack
            const lines = e.stack.split('\n').slice(0, 5);
            lines.forEach(l => console.error('  ', l));
        }
    }

    // 12. Run assertions
    console.log('\n=== Test Results ===\n');
    let passed = 0;
    let failed = 0;

    function assert(name, condition, detail) {
        if (condition) {
            console.log(`  PASS: ${name}`);
            passed++;
        } else {
            console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`);
            failed++;
        }
    }

    // Check worker completed
    assert('Worker completed without error', !workerError && workerResult !== null,
        workerError ? workerError.message : 'No result returned');

    if (workerResult && workerResult.type !== 'error') {
        const gv = workerResult.globalValids || {};
        const challenges = workerResult.tempChallengeArrSaved || {};

        // Test 1: fried onions should NOT be in globalValids for Cooking
        const cookingValids = gv['Cooking'] || {};
        const friedOnionsInValids = Object.keys(cookingValids).some(name =>
            (name.toLowerCase().includes('fried onion') || name.toLowerCase().includes('cooked onion'))
            && !name.startsWith('Train to')
        );
        assert('Fried onions NOT in globalValids (Cooking)',
            !friedOnionsInValids,
            friedOnionsInValids ? 'Found: ' + Object.keys(cookingValids).filter(n =>
                n.toLowerCase().includes('onion')).join(', ') : '');

        // Test 2: No Cooking task above level 30 in globalValids (cap=30)
        const cookingAboveCap = Object.entries(cookingValids)
            .filter(([name, level]) => parseInt(level) > 30);
        assert('No Cooking tasks above cap (30) in globalValids',
            cookingAboveCap.length === 0,
            cookingAboveCap.length > 0 ?
                'Found ' + cookingAboveCap.length + ' tasks: ' +
                cookingAboveCap.map(([n,l]) => n.substring(0,30) + ' (lv' + l + ')').join(', ') : '');

        // Test 3: Check the active Cooking challenge is within cap
        const cookingChallenge = challenges['Cooking'];
        console.log('\n  INFO: tempChallengeArrSaved.Cooking =', JSON.stringify(cookingChallenge));
        if (cookingChallenge) {
            // tempChallengeArrSaved[skill] is a task name string (not an object)
            const taskName = typeof cookingChallenge === 'string' ? cookingChallenge : '';
            const taskData = taskName && chunkInfo.challenges.Cooking && chunkInfo.challenges.Cooking[taskName];
            const cookLevel = taskData ? parseInt(taskData.Level) : 0;
            assert('Active Cooking challenge within cap (≤30)',
                cookLevel <= 30,
                'Active: "' + taskName + '" level=' + cookLevel);
            assert('Active Cooking challenge is NOT fried onions (the actual task)',
                !taskName.toLowerCase().includes('fried onion') || taskName.startsWith('Train to'),
                'Got: ' + taskName);
        } else {
            assert('Active Cooking challenge within cap (≤30)', true, 'No cooking challenge assigned');
            assert('Active Cooking challenge is NOT fried onions', true, 'No cooking challenge');
        }

        // Test 4: Print Cooking valids for inspection
        const cookCount = Object.keys(cookingValids).length;
        console.log(`\n  INFO: ${cookCount} Cooking tasks in globalValids`);
        if (cookCount > 0 && cookCount <= 20) {
            Object.entries(cookingValids)
                .sort((a,b) => parseInt(b[1]) - parseInt(a[1]))
                .forEach(([name, level]) => {
                    console.log(`    lv${level}: ${name}`);
                });
        } else if (cookCount > 20) {
            // Just show top 10
            Object.entries(cookingValids)
                .sort((a,b) => parseInt(b[1]) - parseInt(a[1]))
                .slice(0, 10)
                .forEach(([name, level]) => {
                    console.log(`    lv${level}: ${name}`);
                });
            console.log(`    ... and ${cookCount - 10} more`);
        }

        // Test 5: Check the specific task ID t_1080 (fried onions)
        const t1080inValids = cookingValids.hasOwnProperty('Cook ~|fried onions|~') ||
            Object.keys(cookingValids).some(n => n.includes('fried onion') && !n.includes('Train to'));
        assert('Task t_1080 (fried onions) NOT in Cooking valids', !t1080inValids,
            t1080inValids ? 'Still present!' : '');

        // Test 6: Synthetic training task should exist in Cooking valids
        const syntheticTask = Object.keys(cookingValids).find(n => n.startsWith('Train to efficient cap towards'));
        assert('Synthetic training task exists in Cooking valids',
            !!syntheticTask,
            syntheticTask ? 'Found: ' + syntheticTask : 'No synthetic task found');

        // Test 7: Synthetic task references a skipped task above the cap
        assert('Synthetic task references a capped task',
            syntheticTask && syntheticTask.includes('~|'),
            syntheticTask ? 'Task: ' + syntheticTask : 'No synthetic task');

        // Test 8: Synthetic task level equals the cap
        const syntheticLevel = syntheticTask ? parseInt(cookingValids[syntheticTask]) : 0;
        assert('Synthetic task level equals cap (30)',
            syntheticLevel === 30,
            'Level: ' + syntheticLevel);

        // Test 9: Monster gate weapon should NOT be Steel sword (gated drop)
        const gateWeapon = workerResult.gatePlayerWeaponName || 'Unarmed';
        console.log('\n  INFO: Gate weapon = ' + gateWeapon);
        assert('Gate weapon is NOT Steel sword (gated drop)',
            gateWeapon !== 'Steel sword',
            'Got: ' + gateWeapon);
        assert('Gate weapon is Adamant pickaxe (completed BiS)',
            gateWeapon === 'Adamant pickaxe',
            'Got: ' + gateWeapon);

        // Test 10: Gate armour should come from completed BiS only and be > 0
        const gateArmour = workerResult.gatePlayerArmourDef;
        console.log('  INFO: Gate armour def = ' + gateArmour);
        assert('Gate armour def from completed BiS (>= 0)',
            typeof gateArmour === 'number' && gateArmour >= 0,
            'Got: ' + gateArmour);

        // Test 11: Willow shield should NOT be in Defence tasks (Fletching lv42 > method cap 30)
        const defValids = workerResult.globalValids['Defence'] || {};
        const hasWillowShield = Object.keys(defValids).some(k => k.toLowerCase().includes('willow shield'));
        console.log('  INFO: Willow shield in Defence tasks: ' + hasWillowShield);
        assert('Willow shield NOT in Defence (requires capped Fletching lv42)',
            !hasWillowShield,
            'Willow shield is present but should be blocked by method cap');

        // Test 12: Caged monster drops (dark wizard in 6457) should NOT be in items without Telegrab
        const items = workerResult.baseChunkData && workerResult.baseChunkData['items'] || {};
        const staffSources = items['Staff'] || {};
        const blackRobeSources = items['Black robe'] || {};
        const staffFromDarkWiz = staffSources['Dark wizard#Higher level'] || staffSources['Dark wizard#Lower level'];
        const robeFromDarkWiz = blackRobeSources['Dark wizard#Higher level'] || blackRobeSources['Dark wizard#Lower level'];
        console.log('\n  INFO: Staff from dark wizard: ' + (staffFromDarkWiz || 'none'));
        console.log('  INFO: Black robe from dark wizard: ' + (robeFromDarkWiz || 'none'));
        assert('Caged dark wizard drops blocked without Telegrab',
            !staffFromDarkWiz && !robeFromDarkWiz,
            'Staff: ' + (staffFromDarkWiz || 'none') + ', Black robe: ' + (robeFromDarkWiz || 'none'));

    } else if (workerResult && workerResult.type === 'error') {
        console.log('  Worker returned error:', workerResult.err);
        failed++;
    }

    console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});

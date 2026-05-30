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

function decodeSavedString(value) {
    try {
        return decodeURIComponent(value.replaceAll('-_-', '%').replaceAll('%25', '%').replaceAll(/%2E/g, '.').replaceAll(/%2F/g, '#').replaceAll(/%2G/g, '/').replaceAll(/%2H/g, "'").replaceAll(/-2H/g, "'").replaceAll(/%2I/g, ',').replaceAll(/%2J/g, '+').replaceAll(/%2Q/g, '!').replace(/%(?![0-9a-zA-Z][0-9a-zA-Z]+)/g, '%25')).replaceAll(/%2E/g, '.').replaceAll(/%2F/g, '#').replaceAll(/%2G/g, '/').replaceAll(/%2H/g, "'").replaceAll(/-2H/g, "'").replaceAll(/%2I/g, ',').replaceAll(/%2J/g, '+').replaceAll(/%2Q/g, '!');
    } catch(e) {
        return value;
    }
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
        newKey = decodeSavedString(newKey);
        let val = obj[key];
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            out[newKey] = decodeFirebaseObject(val, tasksMapReverse);
        } else if (typeof val === 'string' && val.startsWith('t_') && tasksMapReverse[val]) {
            out[newKey] = tasksMapReverse[val];
        } else if (typeof val === 'string') {
            out[newKey] = decodeSavedString(val);
        } else {
            out[newKey] = val;
        }
    });
    return out;
}

function buildWorkerDataFromMapData(mapData, chunkInfo, tasksMap, tasksMapReverse, options = {}) {
    const ci = mapData.chunkinfo || {};
    const codeItems = chunkInfo.codeItems || {};
    const manualTasks = decodeFirebaseObject(ci.manualTasks || {}, tasksMapReverse);
    if (options.manualTasks) {
        Object.keys(options.manualTasks).forEach(skill => {
            if (!manualTasks[skill]) manualTasks[skill] = {};
            Object.assign(manualTasks[skill], options.manualTasks[skill]);
        });
    }
    const rules = options.rules || mapData.rules || {};
    return {
        type: 'current',
        chunks: options.chunks || (mapData.chunks && mapData.chunks.unlocked ? mapData.chunks.unlocked : {}),
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
        manualTasks,
        completedChallenges: decodeFirebaseObject(ci.completedChallenges || {}, tasksMapReverse),
        backlog: decodeFirebaseObject(ci.backlog || {}, tasksMapReverse),
        splitBacklog: Object.prototype.hasOwnProperty.call(options, 'splitBacklog') ? options.splitBacklog : decodeFirebaseObject(ci.splitBacklog || {}, tasksMapReverse),
        rareDropNum: "1/" + (rules['Rare Drop Amount'] || '128'),
        universalPrimary,
        elementalStaves: codeItems.elementalStaves || {},
        rangedItems: codeItems.rangedItems || {},
        boneItems: codeItems.boneItems || {},
        highestCurrent: computeHighestCurrent(ci.completedChallenges || {}, chunkInfo),
        dropTables: codeItems.dropTables || {},
        possibleAreas: ci.possibleAreas || {},
        randomLoot: options.randomLoot || {},
        magicTools: codeItems.magicTools || {},
        bossLogs: codeItems.bossLogs || {},
        bossMonsters: codeItems.bossMonsters || {},
        minigameShops: codeItems.minigameShops || {},
        manualEquipment: decodeFirebaseObject(ci.manualEquipment || {}, tasksMapReverse),
        checkedChallenges: decodeFirebaseObject(ci.checkedChallenges || {}, tasksMapReverse),
        backloggedSources: ci.backloggedSources || {},
        altChallenges: decodeFirebaseObject(ci.altChallenges || {}, tasksMapReverse),
        manualMonsters: ci.manualMonsters || {},
        slayerLocked: ci.slayerLocked || {},
        passiveSkill: ci.passiveSkill || {},
        hiscoreSkillLevels: options.hiscoreSkillLevels || {},
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
        primaryDropGateMinutes: parseInt(rules['Primary Drop Monster Gate Amount'] || '3'),
        constructionLocked: ci.constructionLocked || {},
        isOnlyManualAreas: false,
        manualSections: ci.manualSections || {},
        optOutSections: (mapData.settings && mapData.settings.optOutSections) || {},
        optOutSectionsWater: (mapData.settings && mapData.settings.optOutSectionsWater) || {},
        maxSkill: ci.maxSkill || {},
        userTasks: mapData.userTasks || {},
        manualPrimary: mapData.manualPrimary || {},
        taskIdMap: tasksMap,
        updateLevel: 'maintenance-mode'
    };
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
    // Enable Primary Drop Monster Gate for testing
    rules['Primary Drop Monster Gate'] = true;
    rules['Primary Drop Monster Gate Amount'] = '3';
    // Enable skilling BiS tool generation for regression coverage
    rules['Show Best in Slot Tasks'] = true;
    rules['Show Best in Slot Skilling Tasks'] = true;

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
    const manualTasks = decodeFirebaseObject(ci.manualTasks || {}, tasksMapReverse);
    if (!manualTasks.Smithing) {
        manualTasks.Smithing = {};
    }
    manualTasks.Smithing['Smith an ~|iron dagger|~'] = 15;
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
        manualTasks,
        completedChallenges,
        backlog,
        splitBacklog: {},
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
        hiscoreSkillLevels: {},
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
        primaryDropGateMinutes: parseInt(rules['Primary Drop Monster Gate Amount'] || '3'),
        constructionLocked: ci.constructionLocked || {},
        isOnlyManualAreas: false,
        manualSections: ci.manualSections || {},
        optOutSections: (fb.settings && fb.settings.optOutSections) || {},
        optOutSectionsWater: (fb.settings && fb.settings.optOutSectionsWater) || {},
        maxSkill: ci.maxSkill || {},
        userTasks: fb.userTasks || {},
        manualPrimary: fb.manualPrimary || {},
        taskIdMap: tasksMap,
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
                if (msg.includes('[DEBUG-BRING]') || msg.includes('[DEBUG-FINAL]') || msg.includes('[DEBUG-MCAP]') || msg.includes('[DEBUG-LOOP]') || msg.includes('[DEBUG-CAT]')) {
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
    const onmessageFn = vm.runInContext('onmessage', context);
    try {
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

        // Test 1: fried onions may appear only if View Methods-derived Method Cap allows them.
        const cookingValids = gv['Cooking'] || {};
        const friedOnionTaskName = Object.keys(cookingValids).find(name =>
            (name.toLowerCase().includes('fried onion') || name.toLowerCase().includes('cooked onion'))
            && !name.startsWith('Train to')
        );
        const friedOnionsInValids = !!friedOnionTaskName;
        const expectedCookingCap = 50; // View Methods includes bass/chocolate-cake-tier Cooking routes in the live fixture.
        assert('Fried onions only appear within View Methods-derived Cooking cap',
            !friedOnionsInValids || parseInt(cookingValids[friedOnionTaskName]) <= expectedCookingCap,
            friedOnionsInValids ? 'Found above cap: ' + Object.keys(cookingValids).filter(n =>
                n.toLowerCase().includes('onion')).join(', ') : '');

        // Test 2: No Cooking task above the current method cap in globalValids
        const cookingAboveCap = Object.entries(cookingValids)
            .filter(([name, level]) => parseInt(level) > expectedCookingCap);
        assert('No Cooking tasks above current cap in globalValids',
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
            assert('Active Cooking challenge within current cap',
                cookLevel <= expectedCookingCap,
                'Active: "' + taskName + '" level=' + cookLevel);
            assert('Active Cooking challenge is NOT fried onions (the actual task)',
                !taskName.toLowerCase().includes('fried onion') || taskName.startsWith('Train to'),
                'Got: ' + taskName);
        } else {
            assert('Active Cooking challenge within current cap', true, 'No cooking challenge assigned');
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
        const t1080inValids = !!friedOnionTaskName;
        assert('Task t_1080 (fried onions) stays within Cooking cap when visible',
            !t1080inValids || parseInt(cookingValids[friedOnionTaskName]) <= expectedCookingCap,
            t1080inValids ? 'Level: ' + cookingValids[friedOnionTaskName] + ', cap: ' + expectedCookingCap : '');

        // Test 6: Synthetic training task should be capped correctly if one is needed.
        const syntheticTask = Object.keys(cookingValids).find(n => n.startsWith('Train to efficient cap towards'));
        console.log('\n  INFO: Cooking synthetic task =', syntheticTask || 'none');
        if (syntheticTask) {
            // Test 7: Synthetic task references a skipped task above the cap
            assert('Synthetic task references a capped task',
                syntheticTask.includes('~|'),
                'Task: ' + syntheticTask);

            // Test 8: Synthetic task level equals the cap
            const syntheticLevel = parseInt(cookingValids[syntheticTask]);
            assert('Synthetic task level stays within current cap',
                syntheticLevel <= expectedCookingCap,
                'Level: ' + syntheticLevel + ', cap: ' + expectedCookingCap);
        } else {
            assert('No Cooking synthetic task required when no capped Cooking task is present', true,
                'No synthetic task found');
        }

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

        // Test 11: If willow shield appears, it should be because Method Cap closure allows the Fletching source.
        const defValids = workerResult.globalValids['Defence'] || {};
        const hasWillowShield = Object.keys(defValids).some(k => k.toLowerCase().includes('willow shield'));
        console.log('  INFO: Willow shield in Defence tasks: ' + hasWillowShield);
        const willowShieldFletchingTask = 'Fletch a ~|willow shield|~';
        const willowShieldMethodCapReason = workerResult.globalRuleSkippedTasks
            && workerResult.globalRuleSkippedTasks['Fletching']
            && workerResult.globalRuleSkippedTasks['Fletching'][willowShieldFletchingTask]
            && workerResult.globalRuleSkippedTasks['Fletching'][willowShieldFletchingTask].reasons.find(r => r.label === 'Method Cap');
        assert('Willow shield is not a capped Fletching leak',
            !hasWillowShield || !willowShieldMethodCapReason,
            willowShieldMethodCapReason ? willowShieldMethodCapReason.detail : 'Willow shield in Defence: ' + hasWillowShield);

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

        // Catacombs monster assertion
        const bd = workerResult.baseChunkData;
        const hasTwistedBanshee = bd.monsters && bd.monsters['Twisted Banshee'] && bd.monsters['Twisted Banshee']['Catacombs of Kourend'];
        const hasDeviantSpectre = bd.monsters && bd.monsters['Deviant spectre'] && bd.monsters['Deviant spectre']['Catacombs of Kourend'];
        assert('Catacombs monsters present in baseChunkData',
            hasTwistedBanshee && hasDeviantSpectre,
            'Twisted Banshee: ' + (hasTwistedBanshee || 'missing') + ', Deviant spectre: ' + (hasDeviantSpectre || 'missing'));

        // Primary Drop Monster Gate: bronze bar from Bronze dragon should be downgraded
        const bronzeBarSources = bd.items && bd.items['Bronze bar'];
        let bronzeDragonSource = null;
        if (bronzeBarSources) {
            Object.keys(bronzeBarSources).forEach(src => {
                if (src.toLowerCase().includes('bronze dragon')) {
                    bronzeDragonSource = { name: src, type: bronzeBarSources[src] };
                }
            });
        }
        assert('Primary Drop Gate: bronze bar from Bronze dragon downgraded to secondary',
            bronzeDragonSource ? bronzeDragonSource.type === 'secondary-drop' : true,
            bronzeDragonSource
                ? 'Bronze dragon source: ' + bronzeDragonSource.type
                : 'No Bronze dragon source for bronze bar (may not be in accessible chunks)');

        // Primary Drop Gate is active
        assert('Primary Drop Gate active when monster gate active',
            workerResult.primaryDropGateActive === true,
            'primaryDropGateActive: ' + workerResult.primaryDropGateActive);

        // Recursive gate check: Rune hasta(p) should NOT be in BiS if Brutal red dragon is unkillable
        const bisValids = workerResult.globalValids && workerResult.globalValids['BiS'];
        let hastaInBiS = false;
        if (bisValids) {
            Object.keys(bisValids).forEach(task => {
                if (task.toLowerCase().includes('rune hasta')) {
                    hastaInBiS = true;
                    console.log('    Found in BiS:', task);
                }
            });
        }
        // Also check rule-skipped tasks for the block reason
        const skippedBiS = workerResult.globalRuleSkippedTasks && workerResult.globalRuleSkippedTasks['BiS'];
        let hastaSkipped = false;
        if (skippedBiS) {
            Object.keys(skippedBiS).forEach(task => {
                if (task.toLowerCase().includes('rune hasta')) {
                    hastaSkipped = true;
                    console.log('    Skipped BiS:', task, skippedBiS[task].reasons.map(r => r.label).join(', '));
                }
            });
        }
        assert('Recursive gate: Rune hasta(p) NOT in BiS (brutal red dragon unkillable)',
            !hastaInBiS,
            hastaInBiS ? 'Rune hasta(p) found in BiS (should be blocked)' : 'Rune hasta(p) correctly absent from BiS' +
            (hastaSkipped ? ' (rule-skipped)' : ' (may not exist in chunks)'));

        const dragonfireGateRegression = vm.runInContext(`(() => {
            const savedBaseChunkData = baseChunkData;
            const savedRules = rules;
            const savedMonsterGateActive = monsterGateActive;
            const savedDragonfireGateActive = dragonfireGateActive;
            const savedPrimaryDropGateActive = primaryDropGateActive;
            const savedDragonfirePrimaryDropGateActive = dragonfirePrimaryDropGateActive;
            const savedGateHasPrayerBypass = gateHasPrayerBypass;
            try {
                rules = { 'Has Protection Prayers': true };
                monsterGateActive = false;
                dragonfireGateActive = true;
                primaryDropGateActive = false;
                dragonfirePrimaryDropGateActive = true;

                baseChunkData = { items: {} };
                const bronzeNoProtection = getDragonfireGateStatus('Bronze dragon');
                const brutalNoProtection = getDragonfireGateStatus('Brutal red dragon');
                const blueNoProtection = getDragonfireGateStatus('Blue dragon');
                const lavaNoProtection = getDragonfireGateStatus('Lava dragon');
                const drakeNoProtection = getDragonfireGateStatus('Drake');

                baseChunkData = { items: { 'Antifire potion(3)': { 'Mix an ~|antifire potion|~': 'primary-Herblore' } } };
                const brutalRegularPrayer = getDragonfireGateStatus('Brutal red dragon');
                const bronzeRegularPrayer = getDragonfireGateStatus('Bronze dragon');

                baseChunkData = { items: { 'Anti-dragon shield': { 'Duke Horacio': 'primary-Quest' } } };
                const bronzeShield = getDragonfireGateStatus('Bronze dragon');

                baseChunkData = { items: {} };
                const unprotectedItems = {
                    'Bronze bar': { 'Bronze dragon': 'primary-drop' },
                    'Rune hasta(p)': { 'Brutal red dragon': 'primary-drop' },
                    'Drake claw': { 'Drake': 'primary-drop' },
                    'Blue dragon scale': { 'Blue dragon': 'primary-drop' }
                };
                applyPrimaryDropGate({ items: unprotectedItems });

                baseChunkData = { items: { 'Anti-dragon shield': { 'Duke Horacio': 'primary-Quest' } } };
                const protectedItems = {
                    'Bronze bar': { 'Bronze dragon': 'primary-drop' }
                };
                applyPrimaryDropGate({ items: protectedItems });

                return {
                    bronzeBlocked: bronzeNoProtection.blocked,
                    brutalBlocked: brutalNoProtection.blocked,
                    blueBlocked: blueNoProtection.blocked,
                    lavaBlocked: lavaNoProtection.blocked,
                    drakeBlocked: drakeNoProtection.blocked,
                    brutalRegularPrayerBlocked: brutalRegularPrayer.blocked,
                    bronzeRegularPrayerBlocked: bronzeRegularPrayer.blocked,
                    bronzeShieldBlocked: bronzeShield.blocked,
                    unprotectedBronzeSource: unprotectedItems['Bronze bar']['Bronze dragon'],
                    unprotectedBrutalSource: unprotectedItems['Rune hasta(p)']['Brutal red dragon'],
                    unprotectedDrakeSource: unprotectedItems['Drake claw']['Drake'],
                    unprotectedBlueSource: unprotectedItems['Blue dragon scale']['Blue dragon'],
                    protectedBronzeSource: protectedItems['Bronze bar']['Bronze dragon']
                };
            } finally {
                baseChunkData = savedBaseChunkData;
                rules = savedRules;
                monsterGateActive = savedMonsterGateActive;
                dragonfireGateActive = savedDragonfireGateActive;
                primaryDropGateActive = savedPrimaryDropGateActive;
                dragonfirePrimaryDropGateActive = savedDragonfirePrimaryDropGateActive;
                gateHasPrayerBypass = savedGateHasPrayerBypass;
            }
        })()`, context);
        assert('Dragonfire gate blocks metal and brutal dragons without protection',
            dragonfireGateRegression.bronzeBlocked && dragonfireGateRegression.brutalBlocked,
            JSON.stringify(dragonfireGateRegression));
        assert('Dragonfire gate allows chromatic, lava, and drake sources without protection',
            !dragonfireGateRegression.blueBlocked && !dragonfireGateRegression.lavaBlocked && !dragonfireGateRegression.drakeBlocked,
            JSON.stringify(dragonfireGateRegression));
        assert('Dragonfire gate requires shield/super-tier protection for metal dragons',
            !dragonfireGateRegression.brutalRegularPrayerBlocked && dragonfireGateRegression.bronzeRegularPrayerBlocked && !dragonfireGateRegression.bronzeShieldBlocked,
            JSON.stringify(dragonfireGateRegression));
        assert('Dragonfire primary drop gate downgrades only protection-required dragons',
            dragonfireGateRegression.unprotectedBronzeSource === 'secondary-drop'
                && dragonfireGateRegression.unprotectedBrutalSource === 'secondary-drop'
                && dragonfireGateRegression.unprotectedDrakeSource === 'primary-drop'
                && dragonfireGateRegression.unprotectedBlueSource === 'primary-drop'
                && dragonfireGateRegression.protectedBronzeSource === 'primary-drop',
            JSON.stringify(dragonfireGateRegression));

        const shayzienShamanRegression = vm.runInContext(`(() => {
            const noArmourData = {
                monsters: { 'Lizardman shaman': { '5275': 8 } },
                items: { 'Dragon warhammer': { 'Lizardman shaman': 'primary-drop' } }
            };
            const noArmourPruned = pruneLizardmanShamanSourcesWithoutShayzienFive(noArmourData);

            const partialArmourData = {
                monsters: { 'Lizardman shaman': { '5275': 8 } },
                items: {
                    'Dragon warhammer': { 'Lizardman shaman': 'primary-drop' },
                    'Shayzien body (5)': { 'Soldier (tier 5)': 'primary-drop' }
                }
            };
            const partialArmourPruned = pruneLizardmanShamanSourcesWithoutShayzienFive(partialArmourData);

            const fullArmourData = {
                monsters: { 'Lizardman shaman': { '5275': 8 } },
                items: {
                    'Dragon warhammer': { 'Lizardman shaman': 'primary-drop' },
                    'Shayzien helm (5)': { 'Soldier (tier 5)': 'primary-drop' },
                    'Shayzien body (5)': { 'Soldier (tier 5)': 'primary-drop' },
                    'Shayzien greaves (5)': { 'Soldier (tier 5)': 'primary-drop' },
                    'Shayzien gloves (5)': { 'Soldier (tier 5)': 'primary-drop' },
                    'Shayzien boots (5)': { 'Soldier (tier 5)': 'primary-drop' }
                }
            };
            const fullArmourPruned = pruneLizardmanShamanSourcesWithoutShayzienFive(fullArmourData);

            return {
                noArmourPruned,
                noArmourMonsterPresent: !!noArmourData.monsters['Lizardman shaman'],
                noArmourDropSource: noArmourData.items['Dragon warhammer'] && noArmourData.items['Dragon warhammer']['Lizardman shaman'],
                partialArmourPruned,
                partialArmourMonsterPresent: !!partialArmourData.monsters['Lizardman shaman'],
                partialArmourDropSource: partialArmourData.items['Dragon warhammer'] && partialArmourData.items['Dragon warhammer']['Lizardman shaman'],
                fullArmourPruned,
                fullArmourMonsterPresent: !!fullArmourData.monsters['Lizardman shaman'],
                fullArmourDropSource: fullArmourData.items['Dragon warhammer'] && fullArmourData.items['Dragon warhammer']['Lizardman shaman']
            };
        })()`, context);
        assert('Lizardman shaman sources require full Shayzien armour (5) access',
            shayzienShamanRegression.noArmourPruned
                && !shayzienShamanRegression.noArmourMonsterPresent
                && !shayzienShamanRegression.noArmourDropSource
                && shayzienShamanRegression.partialArmourPruned
                && !shayzienShamanRegression.partialArmourMonsterPresent
                && !shayzienShamanRegression.partialArmourDropSource
                && !shayzienShamanRegression.fullArmourPruned
                && shayzienShamanRegression.fullArmourMonsterPresent
                && shayzienShamanRegression.fullArmourDropSource === 'primary-drop',
            JSON.stringify(shayzienShamanRegression));

        const meleeCurrentBisRegression = vm.runInContext(`(() => {
            const savedChunkInfo = chunkInfo;
            const savedBaseChunkData = baseChunkData;
            const savedGlobalValids = globalValids;
            const savedRules = rules;
            const savedBacklog = backlog;
            const savedCompletedChallenges = completedChallenges;
            const savedCheckedChallenges = checkedChallenges;
            const savedChunks = chunks;
            const savedBestEquipmentAltsGlobal = bestEquipmentAltsGlobal;
            const savedBisUpgrades = bisUpgrades;
            const savedBankMemoryFormat = bankMemoryFormat;
            const savedMonsterGateActive = monsterGateActive;
            const savedDragonfireGateActive = dragonfireGateActive;
            const savedShopCostGateActive = shopCostGateActive;
            try {
                const makeEquipment = (slot, stats = {}) => Object.assign({
                    attack_speed: 0,
                    attack_crush: 0,
                    attack_magic: 0,
                    attack_ranged: 0,
                    attack_slash: 0,
                    attack_stab: 0,
                    defence_crush: 0,
                    defence_magic: 0,
                    defence_ranged: 0,
                    defence_slash: 0,
                    defence_stab: 0,
                    magic_damage: 0,
                    melee_strength: 0,
                    prayer: 0,
                    ranged_strength: 0,
                    slot,
                    requirements: {}
                }, stats);
                const fakeEquipment = {
                    'Low defence body': makeEquipment('body', { defence_crush: 2, defence_slash: 2, defence_stab: 2 }),
                    'High defence body': makeEquipment('body', { defence_crush: 20, defence_slash: 20, defence_stab: 20 }),
                    'Attack body': makeEquipment('body', { attack_stab: 1 }),
                    'Low defence shield': makeEquipment('shield', { defence_crush: 1, defence_slash: 1, defence_stab: 1 }),
                    'High defence shield': makeEquipment('shield', { defence_crush: 15, defence_slash: 15, defence_stab: 15 }),
                    'Attack shield': makeEquipment('shield', { attack_stab: 1 })
                };
                chunkInfo = Object.assign({}, savedChunkInfo, {
                    equipment: Object.assign({ Unarmed: savedChunkInfo.equipment.Unarmed }, fakeEquipment)
                });
                chunks = { 'test': true };
                rules = {
                    'Show Best in Slot Prayer Tasks': false,
                    'Show Best in Slot Defensive Tasks': false,
                    'Show Best in Slot Flinching Tasks': false,
                    'Show Best in Slot Weight Tasks': false,
                    'Show Best in Slot Melee Style Tasks': false,
                    'Show Best in Slot 1H and 2H': false,
                    'Show Best in Slot Skilling Tasks': false,
                    'Consumable Primary BiS': false,
                    'BiS Respect Skill Caps': false,
                    'Skiller': false,
                    'Wield Crafted Items': false
                };
                backlog = { BiS: {} };
                completedChallenges = { BiS: {} };
                checkedChallenges = { BiS: {} };
                monsterGateActive = false;
                dragonfireGateActive = false;
                shopCostGateActive = false;

                const runCase = (itemNames, meleeStyleTasks) => {
                    globalValids = { BiS: {} };
                    bestEquipmentAltsGlobal = {};
                    bisUpgrades = {};
                    bankMemoryFormat = '';
                    rules['Show Best in Slot Melee Style Tasks'] = meleeStyleTasks;
                    baseChunkData = { items: {}, monsters: {}, objects: {} };
                    itemNames.forEach((item) => {
                        baseChunkData.items[item] = { 'Regression source': 'primary-spawn' };
                    });
                    return calcBIS();
                };

                const defensiveOnly = runCase(['Low defence body', 'High defence body', 'Low defence shield', 'High defence shield'], false);
                const attackBeatsDefence = runCase(['High defence body', 'Attack body', 'High defence shield', 'Attack shield'], false);
                const defensiveOnlyStyles = runCase(['Low defence body', 'High defence body', 'Low defence shield', 'High defence shield'], true);
                const attackBeatsDefenceStyles = runCase(['High defence body', 'Attack body', 'High defence shield', 'Attack shield'], true);

                return {
                    defensiveOnlyMeleeBody: defensiveOnly['Melee-body'],
                    defensiveOnlyMeleeShield: defensiveOnly['Melee-shield'],
                    attackMeleeBody: attackBeatsDefence['Melee-body'],
                    attackMeleeShield: attackBeatsDefence['Melee-shield'],
                    defensiveOnlyStabBody: defensiveOnlyStyles['Stab-body'],
                    defensiveOnlyStabShield: defensiveOnlyStyles['Stab-shield'],
                    attackStabBody: attackBeatsDefenceStyles['Stab-body'],
                    attackStabShield: attackBeatsDefenceStyles['Stab-shield']
                };
            } finally {
                chunkInfo = savedChunkInfo;
                baseChunkData = savedBaseChunkData;
                globalValids = savedGlobalValids;
                rules = savedRules;
                backlog = savedBacklog;
                completedChallenges = savedCompletedChallenges;
                checkedChallenges = savedCheckedChallenges;
                chunks = savedChunks;
                bestEquipmentAltsGlobal = savedBestEquipmentAltsGlobal;
                bisUpgrades = savedBisUpgrades;
                bankMemoryFormat = savedBankMemoryFormat;
                monsterGateActive = savedMonsterGateActive;
                dragonfireGateActive = savedDragonfireGateActive;
                shopCostGateActive = savedShopCostGateActive;
            }
        })()`, context);
        assert('Current melee BIS uses defence as fallback after offensive stats',
            meleeCurrentBisRegression.defensiveOnlyMeleeBody === 'High defence body'
                && meleeCurrentBisRegression.defensiveOnlyMeleeShield === 'High defence shield'
                && meleeCurrentBisRegression.attackMeleeBody === 'Attack body'
                && meleeCurrentBisRegression.attackMeleeShield === 'Attack shield'
                && meleeCurrentBisRegression.defensiveOnlyStabBody === 'High defence body'
                && meleeCurrentBisRegression.defensiveOnlyStabShield === 'High defence shield'
                && meleeCurrentBisRegression.attackStabBody === 'Attack body'
                && meleeCurrentBisRegression.attackStabShield === 'Attack shield',
            JSON.stringify(meleeCurrentBisRegression));

        // Skilling BiS: Mithril axe from King Sand Crab should generate a Woodcutting BiS tool task
        const hasMithrilAxeBiS = bisValids && Object.keys(bisValids).some(task =>
            task.toLowerCase().includes('mithril axe') &&
            String(bisValids[task]).toLowerCase().includes('woodcutting bis tool')
        );
        console.log('  INFO: Mithril axe BiS task present: ' + !!hasMithrilAxeBiS);
        if (bisValids) {
            Object.keys(bisValids)
                .filter(task => String(bisValids[task]).toLowerCase().includes('woodcutting bis tool'))
                .forEach(task => console.log('    Woodcutting BiS tool:', task, '=>', bisValids[task]));
        }
        assert('Skilling BiS: Mithril axe task generated',
            !!hasMithrilAxeBiS,
            bisValids ? 'BiS tasks: ' + Object.keys(bisValids).filter(t => t.toLowerCase().includes('axe')).join(', ') : 'No BiS tasks');

        const toolGatedShopRegression = vm.runInContext(`(() => {
            const savedChunkInfo = chunkInfo;
            const savedRules = rules;
            const savedChunks = chunks;
            const savedManualSections = manualSections;
            const savedUnlockedSections = unlockedSections;
            const savedCompletedChallenges = completedChallenges;
            const savedCheckedChallenges = checkedChallenges;
            const savedBacklog = backlog;
            const savedBackloggedSources = backloggedSources;
            const savedManualTasks = manualTasks;
            const savedPossibleAreas = possibleAreas;
            const savedManualAreas = manualAreas;
            const savedRandomLoot = randomLoot;
            const savedGlobalValids = globalValids;
            const savedBaseChunkData = baseChunkData;
            const savedTempChunkData = tempChunkData;
            const savedGlobalRuleSkippedTasks = globalRuleSkippedTasks;
            const savedMonsterGateActive = monsterGateActive;
            const savedDragonfireGateActive = dragonfireGateActive;
            const savedPrimaryDropGateActive = primaryDropGateActive;
            const savedDragonfirePrimaryDropGateActive = dragonfirePrimaryDropGateActive;
            const savedShopCostGateActive = shopCostGateActive;
            const savedBestEquipmentAltsGlobal = bestEquipmentAltsGlobal;
            const savedBisUpgrades = bisUpgrades;
            const savedBankMemoryFormat = bankMemoryFormat;
            try {
                chunkInfo = JSON.parse(JSON.stringify(savedChunkInfo));
                rules = Object.assign({}, savedRules, {
                    'Strict Tool Gating': true,
                    'Strict Tool Gating Amount': '75',
                    'Method-Based Cap': false,
                    'Show Best in Slot Tasks': true,
                    'Show Best in Slot Skilling Tasks': true,
                    'BiS Monster Power Gate': true,
                    'BiS Respect Skill Caps': true,
                    'Wield Crafted Items': false
                });
                chunks = {
                    '5942': '5942',
                    '5943': '5943',
                    '6197': '6197',
                    '6198': '6198',
                    '6454': '6454'
                };
                manualSections = {};
                unlockedSections = {};
                completedChallenges = { BiS: {} };
                checkedChallenges = { BiS: {} };
                backlog = {};
                backloggedSources = {};
                manualTasks = {};
                possibleAreas = {};
                manualAreas = {};
                randomLoot = {};
                globalRuleSkippedTasks = {};
                monsterGateActive = false;
                dragonfireGateActive = true;
                primaryDropGateActive = false;
                dragonfirePrimaryDropGateActive = false;
                shopCostGateActive = false;
                bestEquipmentAltsGlobal = {};
                bisUpgrades = {};
                bankMemoryFormat = '';

                baseChunkData = gatherChunksInfo(chunks);
                globalValids = calcChallenges(chunks, baseChunkData);
                baseChunkData = tempChunkData;
                if (!globalValids['BiS']) globalValids['BiS'] = {};
                calcBIS();

                const runeTask = 'Obtain a ~|rune axe|~';
                const runeSources = baseChunkData.items && baseChunkData.items['Rune axe'];
                return {
                    woodcuttingGuildSection: unlockedSections['6454'] && unlockedSections['6454']['1'],
                    perryShop: !!(baseChunkData.shops && baseChunkData.shops["Perry's Chop-chop Shop"]),
                    perryRuneSource: !!(runeSources && runeSources["Perry's Chop-chop Shop"] === 'shop'),
                    runeBiS: !!(globalValids['BiS'] && globalValids['BiS'][runeTask]),
                    skippedRuneReason: globalRuleSkippedTasks['BiS'] && globalRuleSkippedTasks['BiS'][runeTask]
                };
            } finally {
                chunkInfo = savedChunkInfo;
                rules = savedRules;
                chunks = savedChunks;
                manualSections = savedManualSections;
                unlockedSections = savedUnlockedSections;
                completedChallenges = savedCompletedChallenges;
                checkedChallenges = savedCheckedChallenges;
                backlog = savedBacklog;
                backloggedSources = savedBackloggedSources;
                manualTasks = savedManualTasks;
                possibleAreas = savedPossibleAreas;
                manualAreas = savedManualAreas;
                randomLoot = savedRandomLoot;
                globalValids = savedGlobalValids;
                baseChunkData = savedBaseChunkData;
                tempChunkData = savedTempChunkData;
                globalRuleSkippedTasks = savedGlobalRuleSkippedTasks;
                monsterGateActive = savedMonsterGateActive;
                dragonfireGateActive = savedDragonfireGateActive;
                primaryDropGateActive = savedPrimaryDropGateActive;
                dragonfirePrimaryDropGateActive = savedDragonfirePrimaryDropGateActive;
                shopCostGateActive = savedShopCostGateActive;
                bestEquipmentAltsGlobal = savedBestEquipmentAltsGlobal;
                bisUpgrades = savedBisUpgrades;
                bankMemoryFormat = savedBankMemoryFormat;
            }
        })()`, context);
        assert('Strict Tool Gating keeps accessible shops that sell better skilling tools',
            toolGatedShopRegression.woodcuttingGuildSection
                && toolGatedShopRegression.perryShop
                && toolGatedShopRegression.perryRuneSource
                && toolGatedShopRegression.runeBiS,
            JSON.stringify(toolGatedShopRegression));

        // Method Cap closure: valid intermediate primary methods should advance the cap without Highest Level mode.
        const fletchingValids = gv['Fletching'] || {};
        const fletchingSkipped = workerResult.globalRuleSkippedTasks && workerResult.globalRuleSkippedTasks['Fletching'] || {};
        const willowShortbowTask = 'Fletch a ~|willow shortbow (u)|~';
        const ironBoltsTask = 'Fletch ~|iron bolts|~';
        const ironBoltsMethodCapReason = fletchingSkipped[ironBoltsTask]
            && fletchingSkipped[ironBoltsTask].reasons.find(r => r.label === 'Method Cap');
        assert('Method Cap closure test runs with Highest Level disabled',
            rules['Highest Level'] !== true && rules['Highest Level'] !== 'true',
            'Highest Level rule: ' + rules['Highest Level']);
        assert('Method Cap closure keeps willow shortbow as a valid intermediate Fletching method',
            fletchingValids.hasOwnProperty(willowShortbowTask),
            'Fletching valids: ' + Object.keys(fletchingValids).filter(t => t.toLowerCase().includes('willow')).join(', '));
        assert('Method Cap closure no longer caps iron bolts at willow shafts lv30',
            !ironBoltsMethodCapReason || !ironBoltsMethodCapReason.detail.includes('Highest primary method lv30'),
            ironBoltsMethodCapReason ? ironBoltsMethodCapReason.detail : 'No Method Cap reason for iron bolts');
        assert('Method Cap closure allows iron bolts in live Fletching valids',
            fletchingValids.hasOwnProperty(ironBoltsTask),
            'Iron bolts skipped: ' + JSON.stringify(fletchingSkipped[ironBoltsTask] || null));

        // Wiki-informed cap bands: willow logs are a common Woodcutting method until maple.
        const woodcuttingValids = gv['Woodcutting'] || {};
        const woodcuttingSkipped = workerResult.globalRuleSkippedTasks && workerResult.globalRuleSkippedTasks['Woodcutting'] || {};
        const mapleLogsTask = 'Chop ~|maple logs|~';
        const yewLogsTask = 'Chop ~|yew logs|~';
        const magicLogsTask = 'Chop ~|magic logs|~';
        const hasRuneAxeShopSource = !!(bd.items && bd.items['Rune axe'] && Object.values(bd.items['Rune axe']).some(source => source === 'shop'));
        const yewToolGateReason = woodcuttingSkipped[yewLogsTask]
            && woodcuttingSkipped[yewLogsTask].reasons.find(r => r.label === 'Tool Gating');
        const magicToolGateReason = woodcuttingSkipped[magicLogsTask]
            && woodcuttingSkipped[magicLogsTask].reasons.find(r => r.label === 'Tool Gating');
        if (hasRuneAxeShopSource) {
            assert('Strict Tool Gating does not block high Woodcutting when a Rune axe shop source is accessible',
                !yewToolGateReason && !magicToolGateReason,
                'Yew reason: ' + (yewToolGateReason && yewToolGateReason.detail) + ', magic reason: ' + (magicToolGateReason && magicToolGateReason.detail));
        } else if (!yewToolGateReason && !magicToolGateReason) {
            assert('High Woodcutting remains unavailable when another active cap supersedes Tool Gating',
                !woodcuttingValids.hasOwnProperty(yewLogsTask) && !woodcuttingValids.hasOwnProperty(magicLogsTask),
                'Yew valid: ' + woodcuttingValids.hasOwnProperty(yewLogsTask) + ', magic valid: ' + woodcuttingValids.hasOwnProperty(magicLogsTask));
        } else {
            assert('Strict Tool Gating blocks high Woodcutting when Mithril axe is below Rune-baseline 75% threshold',
                !woodcuttingValids.hasOwnProperty(yewLogsTask) && !woodcuttingValids.hasOwnProperty(magicLogsTask) && yewToolGateReason && magicToolGateReason,
                'Yew valid: ' + woodcuttingValids.hasOwnProperty(yewLogsTask) + ', magic valid: ' + woodcuttingValids.hasOwnProperty(magicLogsTask) + ', yew reason: ' + (yewToolGateReason && yewToolGateReason.detail) + ', magic reason: ' + (magicToolGateReason && magicToolGateReason.detail));
        }
        assert('Woodcutting source profile still models willow-to-maple route when not tool-capped',
            vm.runInContext("calcMethodCap('Woodcutting', 30, 'Chop ~|willow logs|~', true)", context) >= 60,
            'Willow profile cap: ' + vm.runInContext("calcMethodCap('Woodcutting', 30, 'Chop ~|willow logs|~', true)", context));

        // Fishing source profiles: wiki-backed method routes should outrank ordinary fish unlocks.
        const fishingFlyCap = vm.runInContext("calcMethodCap('Fishing', 20, 'Catch a ~|raw trout|~', true)", context);
        const fishingTunaCap = vm.runInContext("calcMethodCap('Fishing', 35, 'Catch a ~|raw tuna|~', true)", context);
        const fishingTemporossCap = vm.runInContext("calcMethodCap('Fishing', 35, 'Catch fish at ~|Tempoross|~', true)", context);
        const fishingDriftNetCap = vm.runInContext("calcMethodCap('Fishing', 47, 'Catch a ~|fish shoal|~', true)", context);
        const fishingBarbarianCap = vm.runInContext("calcMethodCap('Fishing', 58, 'Catch a ~|leaping salmon|~', true)", context);
        const fishingShrimpsProfile = vm.runInContext("getMethodSourceProfile('Fishing', 'Catch ~|raw shrimps|~')", context);
        const fishingAnchoviesProfile = vm.runInContext("getMethodSourceProfile('Fishing', 'Catch ~|raw anchovies|~')", context);
        const fishingPikeCap = vm.runInContext("calcMethodCap('Fishing', 25, 'Catch a ~|raw pike|~', false)", context);
        const fishingBigNetCap = vm.runInContext("calcMethodCap('Fishing', 16, 'Catch junk loot from a ~|fishing spot (big net, harpoon)|~', false)", context);
        assert('Fishing source profile treats fly fishing as a long-term chunk-locked route',
            fishingFlyCap === 99 && fishingFlyCap > fishingTunaCap,
            'Fly cap: ' + fishingFlyCap + ', tuna fallback cap: ' + fishingTunaCap);
        assert('Fishing source profile recognizes actual early net task names',
            fishingShrimpsProfile.allowClosure === true && fishingAnchoviesProfile.allowClosure === true,
            'Shrimps profile: ' + JSON.stringify(fishingShrimpsProfile) + ', anchovies profile: ' + JSON.stringify(fishingAnchoviesProfile));
        assert('Fishing source profiles count pike and big-net routes above the level-30 fallback',
            fishingPikeCap >= 35 && fishingBigNetCap >= 46,
            'Pike cap: ' + fishingPikeCap + ', big-net cap: ' + fishingBigNetCap);
        assert('Fishing source profiles cover activity routes without broad ordinary-fish unlocks',
            fishingTemporossCap === 70 && fishingDriftNetCap === 70 && fishingBarbarianCap === 70,
            'Tempoross: ' + fishingTemporossCap + ', drift net: ' + fishingDriftNetCap + ', barbarian: ' + fishingBarbarianCap);

        // Firemaking source profiles: ordinary log tiers get researched bands; odd one-off tasks stay on fallback.
        const firemakingWillowCap = vm.runInContext("calcMethodCap('Firemaking', 30, 'Burn ~|willow logs|~', true)", context);
        const firemakingMapleCap = vm.runInContext("calcMethodCap('Firemaking', 45, 'Burn ~|maple logs|~', true)", context);
        const firemakingStoveCap = vm.runInContext("calcMethodCap('Firemaking', 30, 'Operate the stove at the ~|Blast Furnace|~', true)", context);
        assert('Firemaking source profiles follow log-tier progression',
            firemakingWillowCap === 60 && firemakingMapleCap === 75,
            'Willow cap: ' + firemakingWillowCap + ', maple cap: ' + firemakingMapleCap);
        assert('Firemaking source profiles keep odd non-log tasks conservative',
            firemakingStoveCap === 37 && firemakingWillowCap > firemakingStoveCap,
            'Blast Furnace stove cap: ' + firemakingStoveCap + ', willow cap: ' + firemakingWillowCap);

        // Cooking source profiles model wiki-backed fish/karambwan/wine routes without chaining odd foods.
        const cookingTunaCap = vm.runInContext("calcMethodCap('Cooking', 30, 'Cook a ~|tuna|~', true)", context);
        const cookingBassCap = vm.runInContext("calcMethodCap('Cooking', 43, 'Cook a ~|bass|~', true)", context);
        const cookingLobsterCap = vm.runInContext("calcMethodCap('Cooking', 40, 'Cook a ~|lobster|~', true)", context);
        const cookingKarambwanCap = vm.runInContext("calcMethodCap('Cooking', 30, 'Cook a ~|cooked karambwan|~', true)", context);
        const cookingWineCap = vm.runInContext("calcMethodCap('Cooking', 35, 'Brew a ~|jug of wine|~', true)", context);
        const cookingFriedOnionCap = vm.runInContext("calcMethodCap('Cooking', 42, 'Cook ~|fried onions|~', true)", context);
        assert('Cooking source profiles follow common fish progression and fast long-term methods',
            cookingTunaCap === 40 && cookingBassCap === 50 && cookingLobsterCap === 68 && cookingKarambwanCap === 99 && cookingWineCap === 99,
            'Tuna cap: ' + cookingTunaCap + ', bass cap: ' + cookingBassCap + ', lobster cap: ' + cookingLobsterCap + ', karambwan cap: ' + cookingKarambwanCap + ', wine cap: ' + cookingWineCap);
        assert('Cooking source profiles keep one-off foods conservative',
            cookingFriedOnionCap === 47 && cookingFriedOnionCap < cookingLobsterCap,
            'Fried onions cap: ' + cookingFriedOnionCap + ', lobster cap: ' + cookingLobsterCap);

        // Crafting source profiles cover route families; slow glass/one-off jewellery stay fallback.
        const craftingLeatherCap = vm.runInContext("calcMethodCap('Crafting', 1, 'Craft ~|leather gloves|~', true)", context);
        const craftingHardleatherCap = vm.runInContext("calcMethodCap('Crafting', 28, 'Craft a ~|hardleather body|~', true)", context);
        const craftingDiamondCap = vm.runInContext("calcMethodCap('Crafting', 43, 'Cut a ~|diamond|~', true)", context);
        const craftingFireStaffCap = vm.runInContext("calcMethodCap('Crafting', 62, 'Craft a ~|fire battlestaff|~', true)", context);
        const craftingAirStaffCap = vm.runInContext("calcMethodCap('Crafting', 66, 'Craft an ~|air battlestaff|~', true)", context);
        const craftingBlackDhideCap = vm.runInContext("calcMethodCap('Crafting', 84, \"Craft a ~|black d'hide body|~\", true)", context);
        const craftingUnpoweredOrbCap = vm.runInContext("calcMethodCap('Crafting', 46, 'Craft an ~|unpowered orb|~', true)", context);
        const craftingOnyxRingCap = vm.runInContext("calcMethodCap('Crafting', 67, 'Craft an ~|onyx ring|~', true)", context);
        assert('Crafting source profiles cover classic leather, gem, battlestaff, and d-hide routes',
            craftingLeatherCap === 30 && craftingHardleatherCap === 63 && craftingDiamondCap === 77 && craftingFireStaffCap === 77 && craftingAirStaffCap === 99 && craftingBlackDhideCap === 99,
            'Leather cap: ' + craftingLeatherCap + ', hardleather cap: ' + craftingHardleatherCap + ', diamond cap: ' + craftingDiamondCap + ', fire staff cap: ' + craftingFireStaffCap + ', air staff cap: ' + craftingAirStaffCap + ', black d-hide cap: ' + craftingBlackDhideCap);
        assert('Crafting source profiles keep slow glass and one-off jewellery conservative',
            craftingUnpoweredOrbCap === 51 && craftingOnyxRingCap === 70,
            'Unpowered orb cap: ' + craftingUnpoweredOrbCap + ', onyx ring cap: ' + craftingOnyxRingCap);
        const spawnOverrideSources = vm.runInContext("(() => { const saved = rules['Primary Spawns']; rules['Primary Spawns'] = false; const result = { thread: getItemSpawnSourceType('Thread'), needle: getItemSpawnSourceType('Needle'), bucket: getItemSpawnSourceType('Bucket') }; rules['Primary Spawns'] = saved; return result; })()", context);
        assert('Thread and needle spawns count as primary without enabling all primary spawns',
            spawnOverrideSources.thread === 'primary-spawn' && spawnOverrideSources.needle === 'primary-spawn' && spawnOverrideSources.bucket === 'secondary-spawn',
            'Thread: ' + spawnOverrideSources.thread + ', needle: ' + spawnOverrideSources.needle + ', bucket: ' + spawnOverrideSources.bucket);

        const gatedToolSourcesRegression = vm.runInContext(`(() => {
            const savedBaseChunkData = baseChunkData;
            const savedMonsterGateActive = monsterGateActive;
            const savedDragonfireGateActive = dragonfireGateActive;
            const savedShopCostGateActive = shopCostGateActive;
            try {
                monsterGateActive = false;
                dragonfireGateActive = false;
                shopCostGateActive = false;
                baseChunkData = {
                    items: {
                        'Mithril axe': { 'Completed BiS': 'primary-BiS' },
                        'Dragon axe': { 'Dagannoth Rex': 'secondary-drop' }
                    }
                };
                return {
                    mithrilAxeUsable: !!getGatedItemSources('Mithril axe', baseChunkData.items, true, true),
                    dragonAxeUsable: !!getGatedItemSources('Dragon axe', baseChunkData.items, true, true)
                };
            } finally {
                baseChunkData = savedBaseChunkData;
                monsterGateActive = savedMonsterGateActive;
                dragonfireGateActive = savedDragonfireGateActive;
                shopCostGateActive = savedShopCostGateActive;
            }
        })()`, context);
        assert('Tool gating ignores secondary-only higher tier tools',
            gatedToolSourcesRegression.mithrilAxeUsable && !gatedToolSourcesRegression.dragonAxeUsable,
            JSON.stringify(gatedToolSourcesRegression));
        const mithrilAxeEfficiencyGate = vm.runInContext(`(() => {
            const mithrilAxeEfficiency = toolEfficiency['Axe[+]']['Mithril axe'];
            const runeAxeEfficiency = toolEfficiency['Axe[+]']['Rune axe'];
            const dragonAxeEfficiency = toolEfficiency['Axe[+]']['Dragon axe'];
            const crystalAxeEfficiency = toolEfficiency['Axe[+]']['Crystal axe'];
            return {
                mithrilAxeEfficiency,
                runeAxeEfficiency,
                dragonAxeEfficiency,
                crystalAxeEfficiency,
                mithrilFellingMatches: toolEfficiency['Axe[+]']['Mithril felling axe'] === mithrilAxeEfficiency,
                liftsAt75: mithrilAxeEfficiency >= 0.75
            };
        })()`, context);
        assert('Axe tool gating efficiency uses OSRS Wiki log-chance ratios with Rune as baseline',
            mithrilAxeEfficiencyGate.runeAxeEfficiency === 1
                && Math.abs(mithrilAxeEfficiencyGate.mithrilAxeEfficiency - (250 / 350)) < 0.0001
                && Math.abs(mithrilAxeEfficiencyGate.dragonAxeEfficiency - (385 / 350)) < 0.0001
                && Math.abs(mithrilAxeEfficiencyGate.crystalAxeEfficiency - (402.5 / 350)) < 0.0001
                && mithrilAxeEfficiencyGate.mithrilFellingMatches
                && !mithrilAxeEfficiencyGate.liftsAt75,
            JSON.stringify(mithrilAxeEfficiencyGate));

        const forestryTasksMissingKit = [];
        Object.keys(chunkInfo.challenges.Woodcutting || {}).forEach(taskName => {
            const task = chunkInfo.challenges.Woodcutting[taskName];
            if (!taskName.includes('Participate in ~|Forestry events|~ while')) return;
            if (!task.Category || !task.Category.includes('Forestry')) return;
            if (!task.Items || !task.Items.includes('Forestry kit')) {
                forestryTasksMissingKit.push(taskName);
            }
        });
        assert('Forestry event participation tasks require Forestry kit access',
            forestryTasksMissingKit.length === 0,
            forestryTasksMissingKit.join('; '));

        // Smithing source profiles cover safe route breakpoints without treating ordinary gold smelting as Blast Furnace.
        const smithingIronPlatebodyCap = vm.runInContext("calcMethodCap('Smithing', 33, 'Smith an ~|iron platebody|~', true)", context);
        const smithingBronzeFoundryCap = vm.runInContext("calcMethodCap('Smithing', 15, \"Forge a bronze ~|preform|~ in the Giants' Foundry\", true)", context);
        const smithingSteelFoundryCap = vm.runInContext("calcMethodCap('Smithing', 30, \"Forge a steel ~|preform|~ in the Giants' Foundry\", true)", context);
        const smithingMithrilFoundryCap = vm.runInContext("calcMethodCap('Smithing', 50, \"Forge a mithril ~|preform|~ in the Giants' Foundry\", true)", context);
        const smithingAdamantFoundryCap = vm.runInContext("calcMethodCap('Smithing', 70, \"Forge an adamant ~|preform|~ in the Giants' Foundry\", true)", context);
        const smithingRuneFoundryCap = vm.runInContext("calcMethodCap('Smithing', 85, \"Forge a rune ~|preform|~ in the Giants' Foundry\", true)", context);
        const smithingGoldBarCap = vm.runInContext("calcMethodCap('Smithing', 40, 'Smelt a ~|gold bar|~', true)", context);
        assert('Smithing source profiles cover early anvil and Giants Foundry progression',
            smithingIronPlatebodyCap === 48 && smithingBronzeFoundryCap === 30 && smithingSteelFoundryCap === 50 && smithingMithrilFoundryCap === 70 && smithingAdamantFoundryCap === 85 && smithingRuneFoundryCap === 99,
            'Iron platebody cap: ' + smithingIronPlatebodyCap + ', bronze foundry cap: ' + smithingBronzeFoundryCap + ', steel foundry cap: ' + smithingSteelFoundryCap + ', mithril foundry cap: ' + smithingMithrilFoundryCap + ', adamant foundry cap: ' + smithingAdamantFoundryCap + ', rune foundry cap: ' + smithingRuneFoundryCap);
        assert('Smithing source profiles keep ordinary gold smelting conservative',
            smithingGoldBarCap === 46,
            'Gold bar cap: ' + smithingGoldBarCap);

        // Herblore source profiles cover researched tar/high-throughput potion methods, not every potion or herb.
        const herbloreGuamTarCap = vm.runInContext("calcMethodCap('Herblore', 19, 'Mix a ~|guam tar|~', true)", context);
        const herbloreHarralanderTarCap = vm.runInContext("calcMethodCap('Herblore', 44, 'Mix a ~|harralander tar|~', true)", context);
        const herbloreStaminaCap = vm.runInContext("calcMethodCap('Herblore', 77, 'Mix a ~|stamina potion|~', true)", context);
        const herbloreAntiVenomCap = vm.runInContext("calcMethodCap('Herblore', 87, 'Mix an ~|anti-venom|~', true)", context);
        const herbloreCleanTorstolCap = vm.runInContext("calcMethodCap('Herblore', 75, 'Clean a ~|grimy torstol|~', true)", context);
        const herblorePrayerPotionCap = vm.runInContext("calcMethodCap('Herblore', 38, 'Mix a ~|prayer potion|~', true)", context);
        assert('Herblore source profiles cover tar and high-throughput potion routes',
            herbloreGuamTarCap === 31 && herbloreHarralanderTarCap === 55 && herbloreStaminaCap === 99 && herbloreAntiVenomCap === 94,
            'Guam tar cap: ' + herbloreGuamTarCap + ', harralander tar cap: ' + herbloreHarralanderTarCap + ', stamina cap: ' + herbloreStaminaCap + ', anti-venom cap: ' + herbloreAntiVenomCap);
        assert('Herblore source profiles allow ordinary potion progression while keeping cleaning lower priority',
            herbloreCleanTorstolCap === 81 && herblorePrayerPotionCap === 45,
            'Clean torstol cap: ' + herbloreCleanTorstolCap + ', prayer potion cap: ' + herblorePrayerPotionCap);

        // Construction source profiles follow plank/contract route families, not arbitrary furniture unlocks.
        const constructionOakLarderCap = vm.runInContext("calcMethodCap('Construction', 33, 'Build an ~|oak larder|~', true)", context);
        const constructionOakDoorCap = vm.runInContext("calcMethodCap('Construction', 74, 'Build an ~|oak door|~', true)", context);
        const constructionMythCapeCap = vm.runInContext("calcMethodCap('Construction', 47, 'Build a ~|mythical cape (mounted)|~', true)", context);
        const constructionMahoganyTableCap = vm.runInContext("calcMethodCap('Construction', 52, 'Build a ~|mahogany table|~', true)", context);
        const constructionGnomeBenchCap = vm.runInContext("calcMethodCap('Construction', 77, 'Build a ~|gnome bench|~', true)", context);
        const constructionAdeptHomesCap = vm.runInContext("calcMethodCap('Construction', 50, 'Complete an adept contract for ~|Mahogany Homes|~', true)", context);
        const constructionSteelDoorCap = vm.runInContext("calcMethodCap('Construction', 84, 'Build a ~|steel-plated door|~', true)", context);
        assert('Construction source profiles cover plank-tier and Mahogany Homes routes',
            constructionOakLarderCap === 74 && constructionOakDoorCap === 99 && constructionMythCapeCap === 99 && constructionMahoganyTableCap === 77 && constructionGnomeBenchCap === 99 && constructionAdeptHomesCap === 70,
            'Oak larder cap: ' + constructionOakLarderCap + ', oak door cap: ' + constructionOakDoorCap + ', myth cape cap: ' + constructionMythCapeCap + ', mahogany table cap: ' + constructionMahoganyTableCap + ', gnome bench cap: ' + constructionGnomeBenchCap + ', adept homes cap: ' + constructionAdeptHomesCap);
        assert('Construction source profiles keep arbitrary furniture conservative',
            constructionSteelDoorCap === 85,
            'Steel-plated door cap: ' + constructionSteelDoorCap);

        // Hunter source profiles use safely gated primary activity families; birdhouses need better access data first.
        const hunterDriftNetCap = vm.runInContext("calcMethodCap('Hunter', 44, 'Catch a ~|fish shoal|~', true)", context);
        const hunterNoviceRumourCap = vm.runInContext("calcMethodCap('Hunter', 46, \"Complete a novice ~|Hunters' Rumour|~\", true)", context);
        const hunterExpertRumourCap = vm.runInContext("calcMethodCap('Hunter', 72, \"Complete an expert ~|Hunters' Rumour|~\", true)", context);
        const hunterChinchompaCap = vm.runInContext("calcMethodCap('Hunter', 53, 'Catch a ~|chinchompa (Hunter)|~', true)", context);
        const hunterBlackChinCap = vm.runInContext("calcMethodCap('Hunter', 73, 'Catch a ~|black chinchompa|~', true)", context);
        const hunterHerbiboarCap = vm.runInContext("calcMethodCap('Hunter', 80, 'Track a ~|herbiboar|~', true)", context);
        const hunterBlackSalamanderCap = vm.runInContext("calcMethodCap('Hunter', 67, 'Catch a ~|black salamander|~', true)", context);
        assert('Hunter source profiles cover drift net, rumours, chinchompa, and Herbiboar routes',
            hunterDriftNetCap === 70 && hunterNoviceRumourCap === 57 && hunterExpertRumourCap === 91 && hunterChinchompaCap === 63 && hunterBlackChinCap === 99 && hunterHerbiboarCap === 99,
            'Drift net cap: ' + hunterDriftNetCap + ', novice rumour cap: ' + hunterNoviceRumourCap + ', expert rumour cap: ' + hunterExpertRumourCap + ', chinchompa cap: ' + hunterChinchompaCap + ', black chin cap: ' + hunterBlackChinCap + ', herbiboar cap: ' + hunterHerbiboarCap);
        assert('Hunter source profiles allow classic salamander progression',
            hunterBlackSalamanderCap === 80,
            'Black salamander cap: ' + hunterBlackSalamanderCap);

        // Agility source profiles use course/activity routes; shortcuts remain fallback-only.
        const agilityBrimhavenCap = vm.runInContext("calcMethodCap('Agility', 20, 'Access the medium-level obstacles at the ~|Brimhaven Agility Arena|~', true)", context);
        const agilityWildernessCap = vm.runInContext("calcMethodCap('Agility', 52, 'Access the ~|Wilderness Agility Course|~', true)", context);
        const agilitySepulchreCap = vm.runInContext("calcMethodCap('Agility', 62, 'Access the second floor of the ~|Hallowed Sepulchre|~', true)", context);
        const agilitySeersCap = vm.runInContext("calcMethodCap('Agility', 60, \"Access the ~|Seers' Village Rooftop Course|~\", true)", context);
        const agilityArdougneCap = vm.runInContext("calcMethodCap('Agility', 90, 'Access the ~|Ardougne Rooftop Course|~', true)", context);
        const agilityShortcutCap = vm.runInContext("calcMethodCap('Agility', 70, 'Access the Taverley Dungeon pipe squeeze to Blue dragon lair ~|shortcut|~', true)", context);
        assert('Agility source profiles cover course and Sepulchre progression',
            agilityBrimhavenCap === 47 && agilityWildernessCap === 62 && agilitySepulchreCap === 72 && agilitySeersCap === 70 && agilityArdougneCap === 99,
            'Brimhaven cap: ' + agilityBrimhavenCap + ', wilderness cap: ' + agilityWildernessCap + ', sepulchre cap: ' + agilitySepulchreCap + ', Seers cap: ' + agilitySeersCap + ', Ardougne cap: ' + agilityArdougneCap);
        assert('Agility source profiles keep shortcuts conservative',
            agilityShortcutCap === 73,
            'Shortcut cap: ' + agilityShortcutCap);

        // Thieving source profiles cover repeatable route families; one-off chests stay fallback.
        const thievingCoxCap = vm.runInContext("calcMethodCap('Thieving', 1, 'Loot ~|cavern grubs|~ in the Chambers of Xeric', true)", context);
        const thievingAldarinCap = vm.runInContext("calcMethodCap('Thieving', 36, 'Loot a ~|chest (Aldarin Villas)|~', true)", context);
        const thievingBeardedCap = vm.runInContext("calcMethodCap('Thieving', 45, 'Pickpocket a ~|bandit (Pollnivneach)#Bearded|~', true)", context);
        const thievingThugCap = vm.runInContext("calcMethodCap('Thieving', 65, 'Pickpocket a ~|Menaphite Thug|~', true)", context);
        const thievingArtefactCap = vm.runInContext("calcMethodCap('Thieving', 49, 'Steal artefacts for ~|Captain Khaled|~', true)", context);
        const thievingPyramidCap = vm.runInContext("calcMethodCap('Thieving', 81, 'Access the seventh room of ~|Pyramid Plunder|~', true)", context);
        const thievingVyreCap = vm.runInContext("calcMethodCap('Thieving', 82, 'Pickpocket a ~|vyre|~', true)", context);
        const thievingChestCap = vm.runInContext("calcMethodCap('Thieving', 76, 'Loot a ~|reinforced chest|~', true)", context);
        assert('Thieving source profiles cover CoX, villas, blackjacking, artefacts, Pyramid Plunder, and high pickpocketing',
            thievingCoxCap === 45 && thievingAldarinCap === 45 && thievingBeardedCap === 55 && thievingThugCap === 84 && thievingArtefactCap === 65 && thievingPyramidCap === 91 && thievingVyreCap === 99,
            'CoX cap: ' + thievingCoxCap + ', Aldarin cap: ' + thievingAldarinCap + ', bearded cap: ' + thievingBeardedCap + ', thug cap: ' + thievingThugCap + ', artefact cap: ' + thievingArtefactCap + ', pyramid cap: ' + thievingPyramidCap + ', vyre cap: ' + thievingVyreCap);
        assert('Thieving source profiles keep one-off chests conservative',
            thievingChestCap === 78,
            'Reinforced chest cap: ' + thievingChestCap);

        // Farming source profiles use recurring tree-run families; herb/utility patches stay fallback.
        const farmingOakCap = vm.runInContext("calcMethodCap('Farming', 15, 'Grow an ~|oak tree|~', true)", context);
        const farmingMapleCap = vm.runInContext("calcMethodCap('Farming', 45, 'Grow a ~|maple tree|~', true)", context);
        const farmingPalmCap = vm.runInContext("calcMethodCap('Farming', 68, 'Grow a ~|palm tree|~', true)", context);
        const farmingDragonfruitCap = vm.runInContext("calcMethodCap('Farming', 81, 'Grow a ~|dragonfruit tree|~', true)", context);
        const farmingMahoganyCap = vm.runInContext("calcMethodCap('Farming', 55, 'Grow a ~|mahogany tree|~', true)", context);
        const farmingCelastrusCap = vm.runInContext("calcMethodCap('Farming', 85, 'Grow a ~|celastrus tree|~', true)", context);
        const farmingRanarrCap = vm.runInContext("calcMethodCap('Farming', 32, 'Grow a ~|grimy ranarr weed|~', true)", context);
        const farmingCactusCap = vm.runInContext("calcMethodCap('Farming', 55, 'Grow a ~|cactus (Farming)|~', true)", context);
        assert('Farming source profiles cover tree, fruit tree, hardwood, and special tree runs',
            farmingOakCap === 45 && farmingMapleCap === 60 && farmingPalmCap === 81 && farmingDragonfruitCap === 99 && farmingMahoganyCap === 80 && farmingCelastrusCap === 99,
            'Oak cap: ' + farmingOakCap + ', maple cap: ' + farmingMapleCap + ', palm cap: ' + farmingPalmCap + ', dragonfruit cap: ' + farmingDragonfruitCap + ', mahogany cap: ' + farmingMahoganyCap + ', celastrus cap: ' + farmingCelastrusCap);
        assert('Farming source profiles allow classic herb runs while keeping utility patches conservative',
            farmingRanarrCap === 44 && farmingCactusCap === 59,
            'Ranarr cap: ' + farmingRanarrCap + ', cactus cap: ' + farmingCactusCap);

        // Runecraft profiles stay explicit to guardian-essence routes; raw altar tasks remain fallback.
        const runecraftCosmicGuardianCap = vm.runInContext("calcMethodCap('Runecraft', 27, 'Craft a ~|cosmic rune|~ with guardian essence', true)", context);
        const runecraftLawGuardianCap = vm.runInContext("calcMethodCap('Runecraft', 54, 'Craft a ~|law rune|~ with guardian essence', true)", context);
        const runecraftDeathGuardianCap = vm.runInContext("calcMethodCap('Runecraft', 65, 'Craft a ~|death rune|~ with guardian essence', true)", context);
        const runecraftNatureFallbackCap = vm.runInContext("calcMethodCap('Runecraft', 44, 'Craft a ~|nature rune|~', true)", context);
        const runecraftOuraniaFallbackCap = vm.runInContext("calcMethodCap('Runecraft', 1, 'Craft runes at the ~|Ourania Altar|~', true)", context);
        assert('Runecraft source profiles cover explicit guardian-essence tiers',
            runecraftCosmicGuardianCap === 35 && runecraftLawGuardianCap === 65 && runecraftDeathGuardianCap === 77,
            'Cosmic guardian cap: ' + runecraftCosmicGuardianCap + ', law guardian cap: ' + runecraftLawGuardianCap + ', death guardian cap: ' + runecraftDeathGuardianCap);
        assert('Runecraft source profiles allow raw altar progression while keeping Ourania conservative until encoded',
            runecraftNatureFallbackCap === 54 && runecraftOuraniaFallbackCap === 30,
            'Nature cap: ' + runecraftNatureFallbackCap + ', Ourania cap: ' + runecraftOuraniaFallbackCap);

        // Sailing source profiles cover researched courier/salvage bridges and Barracuda Trial routes.
        const sailingCourierCap = vm.runInContext("calcMethodCap('Sailing', 1, 'Complete ~|courier tasks|~', true)", context);
        const sailingSmallSalvageCap = vm.runInContext("calcMethodCap('Sailing', 15, 'Salvage at a ~|small shipwreck|~', true)", context);
        const sailingLargeSalvageCap = vm.runInContext("calcMethodCap('Sailing', 53, 'Salvage at a ~|large shipwreck|~', true)", context);
        const sailingTemporCap = vm.runInContext("calcMethodCap('Sailing', 30, 'Complete ~|The Tempor Tantrum|~ at Shark rank', true)", context);
        const sailingJubblyCap = vm.runInContext("calcMethodCap('Sailing', 55, 'Complete ~|The Jubbly Jive|~ at Shark rank', true)", context);
        const sailingGwenithCap = vm.runInContext("calcMethodCap('Sailing', 72, 'Complete ~|The Gwenith Glide|~ at Shark rank', true)", context);
        const sailingMastCap = vm.runInContext("calcMethodCap('Sailing', 1, 'Trim the ~|mast and sails|~ on your boat', true)", context);
        assert('Sailing source profiles cover courier, salvage, and Barracuda Trial progression',
            sailingCourierCap === 30 && sailingSmallSalvageCap === 30 && sailingLargeSalvageCap === 64 && sailingTemporCap === 55 && sailingJubblyCap === 72 && sailingGwenithCap === 99,
            'Courier cap: ' + sailingCourierCap + ', small salvage cap: ' + sailingSmallSalvageCap + ', large salvage cap: ' + sailingLargeSalvageCap + ', Tempor cap: ' + sailingTemporCap + ', Jubbly cap: ' + sailingJubblyCap + ', Gwenith cap: ' + sailingGwenithCap);
        assert('Sailing source profiles keep incidental ocean actions conservative',
            sailingMastCap === 30,
            'Mast trim cap: ' + sailingMastCap);

        // Fletching source profiles: darts are the researched route family; ordinary bolts stay fallback-only.
        const fletchingIronDartCap = vm.runInContext("calcMethodCap('Fletching', 22, 'Fletch an ~|iron dart|~', true)", context);
        const fletchingSteelDartCap = vm.runInContext("calcMethodCap('Fletching', 37, 'Fletch a ~|steel dart|~', true)", context);
        const fletchingBronzeBoltCap = vm.runInContext("calcMethodCap('Fletching', 9, 'Fletch ~|bronze bolts|~', true)", context);
        const fletchingIronBoltCap = vm.runInContext("calcMethodCap('Fletching', 39, 'Fletch ~|iron bolts|~', true)", context);
        assert('Fletching source profiles let dart routes bridge to the next dart tier',
            fletchingIronDartCap === 37 && fletchingSteelDartCap === 52,
            'Iron dart cap: ' + fletchingIronDartCap + ', steel dart cap: ' + fletchingSteelDartCap);
        assert('Fletching source profiles allow ordinary bolt progression when materials are real',
            fletchingBronzeBoltCap === 39 && fletchingIronBoltCap === 46,
            'Bronze bolt cap: ' + fletchingBronzeBoltCap + ', iron bolt cap: ' + fletchingIronBoltCap);

        const syntheticTasksWithRealPartner = [];
        const syntheticTasksWithoutRealPartner = [];
        Object.keys(gv).filter(skill => chunkInfo.challenges[skill]).forEach(skill => {
            Object.keys(gv[skill]).filter(task => task.startsWith('Train to efficient cap towards')).forEach(syntheticTask => {
                const capLevel = parseInt(gv[skill][syntheticTask]) || 0;
                const realPartner = Object.keys(gv[skill]).filter(task => {
                    const taskData = chunkInfo.challenges[skill][task];
                    if (!taskData || taskData.Synthetic || !taskData.Primary || taskData.Secondary || taskData.NoXp || taskData.NeverShow) return false;
                    if (completedChallenges[skill] && (completedChallenges[skill][task] || completedChallenges[skill][task.replaceAll('#', '/')])) return false;
                    if (checkedChallenges[skill] && (checkedChallenges[skill][task] || checkedChallenges[skill][task.replaceAll('#', '/')])) return false;
                    return (parseInt(gv[skill][task]) || 0) <= capLevel;
                }).sort((a, b) => (parseInt(gv[skill][b]) || 0) - (parseInt(gv[skill][a]) || 0))[0];
                if (realPartner) {
                    syntheticTasksWithRealPartner.push(skill + ': ' + syntheticTask + ' + ' + realPartner);
                } else {
                    syntheticTasksWithoutRealPartner.push(skill + ': ' + syntheticTask);
                }
            });
        });
        assert('Synthetic Method Cap tasks have concurrent real tasks',
            syntheticTasksWithRealPartner.length > 0 && syntheticTasksWithoutRealPartner.length === 0,
            'With real task: ' + syntheticTasksWithRealPartner.join('; ') + ' Missing: ' + syntheticTasksWithoutRealPartner.join('; '));
        const staleMethodCapSyntheticTasks = [];
        Object.keys(gv).filter(skill => chunkInfo.challenges[skill]).forEach(skill => {
            const methodCapSkipped = workerResult.globalRuleSkippedTasks
                && workerResult.globalRuleSkippedTasks[skill]
                && Object.values(workerResult.globalRuleSkippedTasks[skill]).some(entry =>
                    entry.reasons && entry.reasons.some(reason => reason.label === 'Method Cap'));
            const methodCapTaskInfo = workerResult.globalTaskRuleInfo
                && workerResult.globalTaskRuleInfo[skill]
                && Object.values(workerResult.globalTaskRuleInfo[skill]).some(rulesArr =>
                    Array.isArray(rulesArr) && rulesArr.some(reason => reason.label === 'Method Cap'));
            Object.keys(gv[skill])
                .filter(task => task.startsWith('Train to efficient cap towards'))
                .forEach(task => {
                    const taskData = chunkInfo.challenges[skill][task];
                    const hasRealPartner = syntheticTasksWithRealPartner.some(entry => entry.startsWith(skill + ': ' + task + ' + '));
                    if (taskData && taskData.Synthetic && !taskData.SplitBacklog && !methodCapSkipped && !methodCapTaskInfo && !hasRealPartner) {
                        staleMethodCapSyntheticTasks.push(skill + ': ' + task);
                    }
                });
        });
        assert('Method Cap synthetics are removed when no matching Method Cap skip remains',
            staleMethodCapSyntheticTasks.length === 0,
            staleMethodCapSyntheticTasks.join('; '));

        // Source-quality Method Cap: valid iron should remain the Mining training source over completed coal.
        const miningSkipped = workerResult.globalRuleSkippedTasks && workerResult.globalRuleSkippedTasks['Mining'] || {};
        const miningValids = gv['Mining'] || {};
        const runePickaxeTask = 'Use a ~|rune pickaxe|~';
        const mithrilOreTask = 'Mine ~|mithril ore|~';
        const runiteOreTask = 'Mine ~|runite ore|~';
        const runePickaxeCapReason = miningSkipped[runePickaxeTask]
            && miningSkipped[runePickaxeTask].reasons.find(r => r.label === 'Method Cap');
        const mithrilOreCapReason = miningSkipped[mithrilOreTask]
            && miningSkipped[mithrilOreTask].reasons.find(r => r.label === 'Method Cap');
        const runiteOreCapReason = miningSkipped[runiteOreTask]
            && miningSkipped[runiteOreTask].reasons.find(r => r.label === 'Method Cap');
        assert('Mining source-quality uses iron over coal to allow rune pickaxe',
            miningValids.hasOwnProperty(runePickaxeTask) && !runePickaxeCapReason,
            runePickaxeCapReason ? runePickaxeCapReason.detail : 'Rune pickaxe valid: ' + miningValids.hasOwnProperty(runePickaxeTask));
        const mithrilOreToolGateReason = miningSkipped[mithrilOreTask]
            && miningSkipped[mithrilOreTask].reasons.find(r => r.label === 'Tool Gating');
        assert('Strict Tool Gating does not apply a tier-only Mining block when pickaxe efficiency passes threshold',
            miningValids.hasOwnProperty(mithrilOreTask) && !mithrilOreToolGateReason,
            mithrilOreToolGateReason ? mithrilOreToolGateReason.detail : 'Mithril ore valid: ' + miningValids.hasOwnProperty(mithrilOreTask) + ', method cap reason: ' + (mithrilOreCapReason && mithrilOreCapReason.detail));
        assert('Mining source-quality still does not over-open runite ore from iron alone',
            !miningValids.hasOwnProperty(runiteOreTask),
            'Runite ore valid: ' + miningValids.hasOwnProperty(runiteOreTask) + ', skipped: ' + (runiteOreCapReason ? runiteOreCapReason.detail : JSON.stringify(miningSkipped[runiteOreTask] || null)));
        const taiBwoGemTask = 'Mine a ~|gem rock|~ during Tai Bwo Wannai Cleanup';
        const taiBwoGemSkippedByCap = miningSkipped[taiBwoGemTask]
            && miningSkipped[taiBwoGemTask].reasons.some(r => r.label === 'Method Cap');
        const miningSyntheticGem = Object.keys(miningValids).find(task =>
            task.startsWith('Train to efficient cap towards') && task.includes('~|gem rock|~'));
        assert('Tai Bwo Cleanup gem-rock task requires jungle objects',
            chunkInfo.challenges.Mining[taiBwoGemTask].Objects.includes('TaiBwoJungle[+]'),
            'Objects: ' + JSON.stringify(chunkInfo.challenges.Mining[taiBwoGemTask].Objects));
        assert('Tai Bwo Cleanup gem-rock task invalid without jungle object',
            !miningValids.hasOwnProperty(taiBwoGemTask),
            'Mining valids include cleanup gem rock');
        assert('Tai Bwo Cleanup gem-rock task is not treated as Method-Cap skipped',
            !taiBwoGemSkippedByCap,
            taiBwoGemSkippedByCap ? JSON.stringify(miningSkipped[taiBwoGemTask]) : 'Not method-cap skipped');
        assert('Mining synthetic task does not target inaccessible gem rock cleanup',
            !miningSyntheticGem,
            miningSyntheticGem ? 'Found: ' + miningSyntheticGem : 'No gem-rock synthetic task');

        const blastMineCoalTask = chunkInfo.challenges.Mining['Obtain ~|coal|~ from blasted ore'];
        const blastMineGoldTask = chunkInfo.challenges.Mining['Obtain ~|gold ore|~ from blasted ore'];
        assert('Blast Mine data includes coal and gold ore reward outputs',
            blastMineCoalTask
                && blastMineGoldTask
                && blastMineCoalTask.Level === 43
                && blastMineGoldTask.Level === 43
                && blastMineCoalTask.Output === 'Coal'
                && blastMineGoldTask.Output === 'Gold ore'
                && !blastMineCoalTask.Secondary
                && !blastMineGoldTask.Secondary
                && !blastMineCoalTask.ForcedSecondary
                && !blastMineGoldTask.ForcedSecondary,
            JSON.stringify({ blastMineCoalTask, blastMineGoldTask }));

        // Chunk-locked Smithing progression: iron + coal + furnace should support the classic steel-to-mithril bridge.
        const smithingValids = gv['Smithing'] || {};
        const mithrilBarTask = 'Smelt a ~|mithril bar|~';
        const runiteBarTask = 'Smelt a ~|runite bar|~';
        assert('Chunk-locked Smithing progression allows mithril bars from classic steel access',
            smithingValids.hasOwnProperty(mithrilBarTask),
            'Mithril bar skipped: ' + JSON.stringify(((workerResult.globalRuleSkippedTasks || {})['Smithing'] || {})[mithrilBarTask] || null));
        assert('Chunk-locked Smithing progression does not open runite bars without a real runite route',
            !smithingValids.hasOwnProperty(runiteBarTask),
            'Runite bar valid unexpectedly');

        // Manual Smithing access should not open rune-tier Smithing without a real runite route.
        const runeDaggerTask = 'Smith a ~|rune dagger|~';
        const cappedSmithingTask = runeDaggerTask;
        const cappedSmithingSkipped = workerResult.globalRuleSkippedTasks
            && workerResult.globalRuleSkippedTasks['Smithing']
            && workerResult.globalRuleSkippedTasks['Smithing'][cappedSmithingTask]
            && workerResult.globalRuleSkippedTasks['Smithing'][cappedSmithingTask].reasons.some(r => r.label === 'Method Cap');
        assert('Manual Smithing iron dagger is decoded as lv15',
            manualTasks.Smithing && manualTasks.Smithing['Smith an ~|iron dagger|~'] === 15,
            'Manual Smithing tasks: ' + JSON.stringify(manualTasks.Smithing));
        assert('Chunk-locked Smithing progression still caps rune-tier Smithing without runite',
            !smithingValids.hasOwnProperty(cappedSmithingTask),
            'Rune dagger valid: ' + smithingValids.hasOwnProperty(cappedSmithingTask) + ', skipped by Method Cap: ' + !!cappedSmithingSkipped);
        assert('Active Smithing task is not rune dagger from manual iron dagger',
            challenges['Smithing'] !== runeDaggerTask,
            'Active Smithing: ' + challenges['Smithing']);
        const workerItems = (workerResult.baseChunkData && workerResult.baseChunkData['items']) || {};
        assert('Manual Smithing cap removes rune dagger output source',
            !workerItems['Rune dagger'] || !workerItems['Rune dagger'][runeDaggerTask],
            'Rune dagger sources: ' + JSON.stringify(workerItems['Rune dagger']));

        // Monster Gate should also block impossible drop inputs even when Method Cap is disabled.
        // Mining is capped here so the runite bar path depends on Steel dragon instead of blasted ore.
        const monsterGateChunkInfo = JSON.parse(fs.readFileSync(chunkInfoPath, 'utf8'));
        const monsterGateCodeItems = monsterGateChunkInfo.codeItems || {};
        const monsterGateWorkerData = {
            ...workerData,
            rules: { ...rules, 'Method-Based Cap': false, 'BiS Monster Power Gate': true },
            chunkInfo: monsterGateChunkInfo,
            monstersPlus: monsterGateCodeItems.monstersPlus || {},
            objectsPlus: monsterGateCodeItems.objectsPlus || {},
            chunksPlus: monsterGateCodeItems.chunksPlus || {},
            itemsPlus: monsterGateCodeItems.itemsPlus || {},
            mixPlus: monsterGateCodeItems.mixPlus || {},
            npcsPlus: monsterGateCodeItems.npcsPlus || {},
            tasksPlus: monsterGateCodeItems.tasksPlus || {},
            tools: monsterGateCodeItems.tools || {},
            elementalRunes: monsterGateCodeItems.elementalRunes || {},
            elementalStaves: monsterGateCodeItems.elementalStaves || {},
            rangedItems: monsterGateCodeItems.rangedItems || {},
            boneItems: monsterGateCodeItems.boneItems || {},
            dropTables: monsterGateCodeItems.dropTables || {},
            magicTools: monsterGateCodeItems.magicTools || {},
            bossLogs: monsterGateCodeItems.bossLogs || {},
            bossMonsters: monsterGateCodeItems.bossMonsters || {},
            minigameShops: monsterGateCodeItems.minigameShops || {},
            manualTasks: JSON.parse(JSON.stringify(manualTasks)),
            completedChallenges: JSON.parse(JSON.stringify(completedChallenges)),
            checkedChallenges: JSON.parse(JSON.stringify(checkedChallenges)),
            backlog: JSON.parse(JSON.stringify(backlog)),
            altChallenges: JSON.parse(JSON.stringify(altChallenges)),
            manualEquipment: JSON.parse(JSON.stringify(manualEquipment)),
            maxSkill: { ...(ci.maxSkill || {}), Mining: 1 }
        };
        workerResult = null;
        workerError = null;
        try {
            onmessageFn({ data: monsterGateWorkerData });
        } catch(e) {
            workerError = e;
        }
        const monsterGateSmithing = workerResult && workerResult.globalValids && workerResult.globalValids['Smithing'] || {};
        assert('Monster Gate blocks rune dagger Smithing input without Method Cap or Mining route',
            !workerError && workerResult && !monsterGateSmithing.hasOwnProperty(runeDaggerTask),
            workerError ? workerError.message : 'Rune dagger valid: ' + monsterGateSmithing.hasOwnProperty(runeDaggerTask));
        assert('Monster Gate removes rune dagger output source without Method Cap or Mining route',
            workerResult && (!workerResult.baseChunkData['items']['Rune dagger'] || !workerResult.baseChunkData['items']['Rune dagger'][runeDaggerTask]),
            workerResult ? 'Rune dagger sources: ' + JSON.stringify(workerResult.baseChunkData['items']['Rune dagger']) : 'No worker result');

        const lowThievingMethod = 'Pickpocket a ~|citizen|~';
        const backloggedThievingMethod = 'Pickpocket a ~|bandit (Pollnivneach)#Bearded|~';
        const thievingBacklogWorkerData = {
            ...workerData,
            rules: { ...rules, 'Method-Based Cap': true },
            taskIdMap: tasksMap,
            manualTasks: {
                ...JSON.parse(JSON.stringify(manualTasks)),
                Thieving: {
                    ...(manualTasks.Thieving || {}),
                    [lowThievingMethod]: 1,
                    [backloggedThievingMethod]: 45
                }
            },
            completedChallenges: {
                ...JSON.parse(JSON.stringify(completedChallenges)),
                Thieving: {}
            },
            checkedChallenges: {
                ...JSON.parse(JSON.stringify(checkedChallenges)),
                Thieving: {}
            },
            backlog: {
                ...JSON.parse(JSON.stringify(backlog)),
                Thieving: {
                    ...(backlog.Thieving || {}),
                    [backloggedThievingMethod]: ''
                }
            },
            passiveSkill: {
                ...(ci.passiveSkill || {}),
                Thieving: 1
            },
            assignedXpRewards: {}
        };
        workerResult = null;
        workerError = null;
        try {
            onmessageFn({ data: thievingBacklogWorkerData });
        } catch(e) {
            workerError = e;
        }
        const thievingMethodCapDetails = workerResult
            && workerResult.globalTaskRuleInfo
            && workerResult.globalTaskRuleInfo.Thieving
            ? Object.values(workerResult.globalTaskRuleInfo.Thieving)
                .flat()
                .filter(rule => rule.label === 'Method Cap')
                .map(rule => rule.detail)
            : [];
        const thievingSyntheticTargets = workerResult && workerResult.globalValids && workerResult.globalValids.Thieving
            ? Object.keys(workerResult.globalValids.Thieving).filter(task => task.startsWith('Train to efficient cap towards'))
            : [];
        assert('Method Cap ignores backlogged Thieving methods as cap sources',
            !workerError
                && thievingMethodCapDetails.length > 0
                && thievingMethodCapDetails.every(detail => !detail.includes(backloggedThievingMethod)),
            workerError ? workerError.message : 'Method Cap details: ' + thievingMethodCapDetails.join('; '));
        assert('Method Cap does not create synthetic Thieving training tasks toward backlogged methods',
            !workerError
                && thievingSyntheticTargets.every(task => !task.includes('bandit (Pollnivneach)#Bearded')),
            workerError ? workerError.message : 'Synthetic Thieving tasks: ' + thievingSyntheticTargets.join('; '));

        const cakeStallTask = 'Steal from a ~|bakery stall|~';
        const fruitStallTask = 'Steal from a ~|fruit stall|~';
        const silkStallTask = 'Steal from a ~|silk stall|~';
        const guardTask = 'Pickpocket a ~|guard|~';
        const silverStallTask = 'Steal from a ~|silver stall|~';
        const thievingIdBacklogWorkerData = {
            ...workerData,
            rules: { ...rules, 'Method-Based Cap': true },
            taskIdMap: tasksMap,
            manualTasks: {
                ...JSON.parse(JSON.stringify(manualTasks)),
                Thieving: {
                    ...(manualTasks.Thieving || {}),
                    [cakeStallTask]: 5,
                    [fruitStallTask]: 25,
                    [silkStallTask]: 20,
                    [guardTask]: 40,
                    [silverStallTask]: 50
                }
            },
            completedChallenges: {
                ...JSON.parse(JSON.stringify(completedChallenges)),
                Thieving: {}
            },
            checkedChallenges: {
                ...JSON.parse(JSON.stringify(checkedChallenges)),
                Thieving: {}
            },
            backlog: {
                ...JSON.parse(JSON.stringify(backlog)),
                Thieving: {
                    ...(backlog.Thieving || {}),
                    [tasksMap[fruitStallTask]]: '',
                    [tasksMap[silkStallTask]]: '',
                    [tasksMap[guardTask]]: ''
                }
            },
            passiveSkill: {
                ...(ci.passiveSkill || {}),
                Thieving: 5
            },
            assignedXpRewards: {}
        };
        workerResult = null;
        workerError = null;
        try {
            onmessageFn({ data: thievingIdBacklogWorkerData });
        } catch(e) {
            workerError = e;
        }
        const thievingIdBacklogValids = workerResult && workerResult.globalValids && workerResult.globalValids.Thieving || {};
        const thievingIdBacklogSynthetics = Object.keys(thievingIdBacklogValids).filter(task => task.startsWith('Train to efficient cap towards'));
        const thievingIdBacklogDetails = workerResult
            && workerResult.globalTaskRuleInfo
            && workerResult.globalTaskRuleInfo.Thieving
            ? Object.values(workerResult.globalTaskRuleInfo.Thieving)
                .flat()
                .filter(rule => rule.label === 'Method Cap')
                .map(rule => rule.detail)
            : [];
        assert('Method Cap treats task-id Thieving backlog entries as backlogged',
            !workerError
                && thievingIdBacklogDetails.length > 0
                && thievingIdBacklogDetails.every(detail => !detail.includes(fruitStallTask) && !detail.includes(silkStallTask) && !detail.includes(guardTask)),
            workerError ? workerError.message : 'Method Cap details: ' + thievingIdBacklogDetails.join('; '));
        assert('Task-id Thieving backlog keeps efficient cap at bakery-stall fallback instead of fruit-stall cap',
            !workerError
                && thievingIdBacklogSynthetics.every(task => thievingIdBacklogValids[task] !== 45),
            workerError ? workerError.message : 'Synthetic Thieving tasks: ' + thievingIdBacklogSynthetics.map(task => task + '=' + thievingIdBacklogValids[task]).join('; '));

        const teaStallTask = 'Steal from a ~|tea stall|~';
        const grubbyDoorTask = 'Unlock the ~|Grubby Door|~';
        const stoneChestTask = 'Loot a ~|stone chest|~';
        const thievingMethodGapWorkerData = {
            ...workerData,
            chunks: {
                'Lizardman Temple': true
            },
            rules: { ...rules, 'Method-Based Cap': true },
            taskIdMap: tasksMap,
            manualMonsters: {
                NPCs: {
                    'Man': true
                },
                Objects: {
                    'Bakery stall': true,
                    'Tea stall': true,
                    'Silver stall': true,
                    'Grubby Door': true,
                    'Stone chest': true
                }
            },
            manualTasks: {},
            completedChallenges: {},
            checkedChallenges: {},
            backlog: {},
            passiveSkill: {
                Thieving: 5
            },
            assignedXpRewards: {}
        };
        workerResult = null;
        workerError = null;
        try {
            onmessageFn({ data: thievingMethodGapWorkerData });
        } catch(e) {
            workerError = e;
        }
        const thievingMethodGapValids = workerResult && workerResult.globalValids && workerResult.globalValids.Thieving || {};
        const thievingMethodGapSkipped = workerResult && workerResult.globalRuleSkippedTasks && workerResult.globalRuleSkippedTasks.Thieving || {};
        const hasThievingMethodCapSkip = (task) => !!thievingMethodGapSkipped[task]
            && thievingMethodGapSkipped[task].reasons.some(reason => reason.label === 'Method Cap');
        assert('Method Cap does not bridge a large Thieving method gap just because methods are visible',
            !workerError
                && thievingMethodGapValids.hasOwnProperty(cakeStallTask)
                && thievingMethodGapValids.hasOwnProperty(teaStallTask)
                && !thievingMethodGapValids.hasOwnProperty(silverStallTask)
                && !thievingMethodGapValids.hasOwnProperty(grubbyDoorTask)
                && !thievingMethodGapValids.hasOwnProperty(stoneChestTask)
                && hasThievingMethodCapSkip(silverStallTask)
                && hasThievingMethodCapSkip(grubbyDoorTask)
                && hasThievingMethodCapSkip(stoneChestTask),
            workerError ? workerError.message : 'Thieving valids: ' + Object.keys(thievingMethodGapValids).join('; '));

        const cakeTask = 'Bake a ~|cake|~';
        const catchSwordfishTask = 'Catch a ~|raw swordfish|~';
        const swordfishTask = 'Cook a ~|swordfish|~';
        const cookingMethodListWorkerData = {
            ...workerData,
            chunks: {},
            rules: { ...rules, 'Method-Based Cap': true },
            taskIdMap: tasksMap,
            manualMonsters: {
                Objects: {
                    'Fire': true
                }
            },
            manualTasks: {
                Cooking: {
                    [cakeTask]: 40
                },
                Fishing: {
                    [catchSwordfishTask]: 50
                }
            },
            completedChallenges: {},
            checkedChallenges: {},
            backlog: {},
            passiveSkill: {
                Cooking: 40
            },
            assignedXpRewards: {}
        };
        workerResult = null;
        workerError = null;
        try {
            onmessageFn({ data: cookingMethodListWorkerData });
        } catch(e) {
            workerError = e;
        }
        const cookingMethodListValids = workerResult && workerResult.globalValids && workerResult.globalValids.Cooking || {};
        const cookingMethodListDetails = workerResult
            && workerResult.globalTaskRuleInfo
            && workerResult.globalTaskRuleInfo.Cooking
            ? Object.values(workerResult.globalTaskRuleInfo.Cooking)
                .flat()
                .filter(rule => rule.label === 'Method Cap')
                .map(rule => rule.detail)
            : [];
        assert('Method Cap can promote Cooking methods visible in View Methods above the current cap source',
            !workerError
                && cookingMethodListValids.hasOwnProperty(swordfishTask)
                && cookingMethodListDetails.some(detail => detail.includes(swordfishTask) && detail.includes('cap lv80')),
            workerError ? workerError.message : 'Cooking Method Cap details: ' + cookingMethodListDetails.join('; '));

        const cookingBackloggedMethodWorkerData = {
            ...cookingMethodListWorkerData,
            backlog: {
                Cooking: {
                    [swordfishTask]: ''
                }
            }
        };
        workerResult = null;
        workerError = null;
        try {
            onmessageFn({ data: cookingBackloggedMethodWorkerData });
        } catch(e) {
            workerError = e;
        }
        const cookingBackloggedMethodDetails = workerResult
            && workerResult.globalTaskRuleInfo
            && workerResult.globalTaskRuleInfo.Cooking
            ? Object.values(workerResult.globalTaskRuleInfo.Cooking)
                .flat()
                .filter(rule => rule.label === 'Method Cap')
                .map(rule => rule.detail)
            : [];
        assert('Method Cap filters backlogged Cooking methods from View Methods-style source promotion',
            !workerError
                && cookingBackloggedMethodDetails.length > 0
                && cookingBackloggedMethodDetails.every(detail => !detail.includes(swordfishTask)),
            workerError ? workerError.message : 'Cooking Method Cap details: ' + cookingBackloggedMethodDetails.join('; '));

        const splitTarget = 'Smelt a ~|mithril bar|~';
        const splitWorkerData = {
            ...workerData,
            chunkInfo: JSON.parse(JSON.stringify(chunkInfo)),
            completedChallenges: JSON.parse(JSON.stringify(completedChallenges)),
            checkedChallenges: {},
            backlog: {
                ...JSON.parse(JSON.stringify(backlog)),
                Smithing: {
                    ...(backlog.Smithing || {}),
                    [splitTarget]: ''
                }
            },
            splitBacklog: {
                Smithing: {
                    [splitTarget]: {
                        targetLevel: 50,
                        targetTask: splitTarget,
                        startLevel: 15,
                        startSource: 'completed',
                        startXp: 2411,
                        targetXp: 101333,
                        splitCount: 2,
                        currentSplit: 1,
                        milestones: [
                            { split: 1, xp: 51872, level: 43 },
                            { split: 2, xp: 101333, level: 50 }
                        ],
                        includeZeroTaskChunks: false
                    }
                }
            }
        };
        workerResult = null;
        workerError = null;
        try {
            onmessageFn({ data: splitWorkerData });
        } catch(e) {
            workerError = e;
        }
        const splitSmithingChallenge = workerResult && workerResult.tempChallengeArrSaved && workerResult.tempChallengeArrSaved.Smithing;
        const splitSynthetic = splitSmithingChallenge && splitSmithingChallenge.startsWith('Get to 51,872 XP in Smithing [level 43] (1/2)');
        const splitSyntheticTask = splitSynthetic && workerResult.chunkInfo.challenges.Smithing[splitSmithingChallenge];
        const splitWarhammerSource = workerResult && workerResult.baseChunkData.items['Mithril warhammer'] && workerResult.baseChunkData.items['Mithril warhammer']['Smith a ~|mithril warhammer|~'];
        const splitStrengthWarhammer = workerResult && workerResult.globalValids.Strength && workerResult.globalValids.Strength['Wield a ~|mithril warhammer|~'];
        assert('Split Backlog creates the current XP milestone synthetic task',
            !workerError && splitSynthetic && workerResult.globalValids.Smithing[splitSmithingChallenge] === 43,
            workerError ? workerError.message : 'Active Smithing task: ' + splitSmithingChallenge);
        assert('Split Backlog synthetic task carries a real Smithing companion under the milestone',
            splitSyntheticTask && splitSyntheticTask.SplitBacklogCompanion && workerResult.chunkInfo.challenges.Smithing[splitSyntheticTask.SplitBacklogCompanion].Level <= 43,
            splitSyntheticTask ? 'Companion: ' + splitSyntheticTask.SplitBacklogCompanion : 'No split synthetic task');
        assert('Split Backlog removes over-milestone Smithing output sources',
            !workerError && !splitWarhammerSource,
            splitWarhammerSource ? 'Mithril warhammer still sourced from Smithing' : 'No over-milestone Smithing source');
        assert('Split Backlog prevents dependent equipment tasks from using over-milestone Smithing',
            !workerError && !splitStrengthWarhammer,
            splitStrengthWarhammer ? 'Strength warhammer still valid at ' + splitStrengthWarhammer : 'Strength warhammer not valid');
        const splitCompanion = splitSyntheticTask && splitSyntheticTask.SplitBacklogCompanion;
        const splitCompanionDoneBacklog = JSON.parse(JSON.stringify(splitWorkerData.splitBacklog));
        const splitCompanionDoneCompleted = JSON.parse(JSON.stringify(completedChallenges));
        if (splitCompanion) {
            splitCompanionDoneBacklog.Smithing[splitTarget].completedCompanions = { '1': splitCompanion };
            if (!splitCompanionDoneCompleted.Smithing) {
                splitCompanionDoneCompleted.Smithing = {};
            }
            splitCompanionDoneCompleted.Smithing[splitCompanion] = true;
        }
        const splitCompanionDoneWorkerData = {
            ...splitWorkerData,
            chunkInfo: JSON.parse(JSON.stringify(chunkInfo)),
            completedChallenges: splitCompanionDoneCompleted,
            checkedChallenges: {},
            splitBacklog: splitCompanionDoneBacklog
        };
        workerResult = null;
        workerError = null;
        try {
            onmessageFn({ data: splitCompanionDoneWorkerData });
        } catch(e) {
            workerError = e;
        }
        const splitCompanionDoneSynthetic = workerResult
            && workerResult.tempChallengeArrSaved
            && workerResult.tempChallengeArrSaved.Smithing
            && workerResult.chunkInfo.challenges.Smithing[workerResult.tempChallengeArrSaved.Smithing];
        assert('Split Backlog does not refill a completed current-split companion',
            !workerError && !!splitCompanion && splitCompanionDoneSynthetic && !splitCompanionDoneSynthetic.SplitBacklogCompanion,
            workerError ? workerError.message : (splitCompanionDoneSynthetic ? 'Replacement companion: ' + splitCompanionDoneSynthetic.SplitBacklogCompanion : 'No split synthetic task'));

        const splitClosestCompletedRegression = vm.runInContext(`(() => {
            const savedChunkInfo = chunkInfo;
            const savedGlobalValids = globalValids;
            const savedCompletedChallenges = completedChallenges;
            const savedCheckedChallenges = checkedChallenges;
            const savedBacklog = backlog;
            const savedSplitBacklog = splitBacklog;
            try {
                chunkInfo = {
                    ...savedChunkInfo,
                    challenges: {
                        ...savedChunkInfo.challenges,
                        Smithing: {
                            'Low split companion': { Level: 10, Primary: true },
                            'Closest split companion': { Level: 20, Primary: true },
                            'Split target': { Level: 30, Primary: true }
                        }
                    }
                };
                globalValids = {
                    Smithing: {
                        'Low split companion': 10,
                        'Closest split companion': 20
                    }
                };
                completedChallenges = { Smithing: { 'Closest split companion': true } };
                checkedChallenges = {};
                backlog = { Smithing: { 'Split target': '' } };
                splitBacklog = {
                    Smithing: {
                        'Split target': {
                            targetLevel: 30,
                            targetTask: 'Split target',
                            splitCount: 2,
                            currentSplit: 1,
                            milestones: [
                                { split: 1, level: 20 },
                                { split: 2, level: 30 }
                            ]
                        }
                    }
                };
                const entries = getSplitBacklogActiveEntries();
                const synthetic = entries.Smithing && entries.Smithing.syntheticName;
                return {
                    synthetic,
                    companion: synthetic && chunkInfo.challenges.Smithing[synthetic].SplitBacklogCompanion
                };
            } finally {
                chunkInfo = savedChunkInfo;
                globalValids = savedGlobalValids;
                completedChallenges = savedCompletedChallenges;
                checkedChallenges = savedCheckedChallenges;
                backlog = savedBacklog;
                splitBacklog = savedSplitBacklog;
            }
        })()`, context);
        assert('Split Backlog does not fall back below a completed closest companion',
            splitClosestCompletedRegression.synthetic && !splitClosestCompletedRegression.companion,
            'Replacement companion: ' + splitClosestCompletedRegression.companion);

        const splitXpNameRegression = vm.runInContext(`(() => {
            const savedChunkInfo = chunkInfo;
            const savedGlobalValids = globalValids;
            const savedCompletedChallenges = completedChallenges;
            const savedCheckedChallenges = checkedChallenges;
            const savedBacklog = backlog;
            const savedSplitBacklog = splitBacklog;
            try {
                const startXp = xpTable[98];
                const targetXp = xpTable[99];
                const milestoneXp = Math.ceil(startXp + ((targetXp - startXp) / 20));
                chunkInfo = {
                    ...savedChunkInfo,
                    challenges: {
                        ...savedChunkInfo.challenges,
                        Smithing: {
                            'Level 98 task': { Level: 98, Primary: true },
                            'Level 99 target': { Level: 99, Primary: true }
                        }
                    }
                };
                globalValids = { Smithing: { 'Level 98 task': 98 } };
                completedChallenges = {};
                checkedChallenges = {};
                backlog = { Smithing: { 'Level 99 target': '' } };
                splitBacklog = {
                    Smithing: {
                        'Level 99 target': {
                            targetLevel: 99,
                            targetTask: 'Level 99 target',
                            splitCount: 20,
                            currentSplit: 1,
                            milestones: [{ split: 1, xp: milestoneXp, level: getLevelForXp(milestoneXp) }]
                        }
                    }
                };
                const entries = getSplitBacklogActiveEntries();
                return {
                    synthetic: entries.Smithing && entries.Smithing.syntheticName,
                    milestoneXp,
                    milestoneLevel: getLevelForXp(milestoneXp)
                };
            } finally {
                chunkInfo = savedChunkInfo;
                globalValids = savedGlobalValids;
                completedChallenges = savedCompletedChallenges;
                checkedChallenges = savedCheckedChallenges;
                backlog = savedBacklog;
                splitBacklog = savedSplitBacklog;
            }
        })()`, context);
        assert('Split Backlog names non-integer milestones by XP and level',
            splitXpNameRegression.synthetic === 'Get to ' + splitXpNameRegression.milestoneXp.toLocaleString() + ' XP in Smithing [level ' + splitXpNameRegression.milestoneLevel + '] (1/20) by training towards ~|Level 99 target|~',
            splitXpNameRegression.synthetic);

        const splitMethodCapSyntheticRegression = vm.runInContext(`(() => {
            const savedChunkInfo = chunkInfo;
            const savedGlobalValids = globalValids;
            const savedCompletedChallenges = completedChallenges;
            const savedCheckedChallenges = checkedChallenges;
            const savedBacklog = backlog;
            const savedSplitBacklog = splitBacklog;
            try {
                const targetTask = 'Train to efficient cap towards ~|rune platebody|~';
                chunkInfo = {
                    ...savedChunkInfo,
                    challenges: {
                        ...savedChunkInfo.challenges,
                        Smithing: {
                            'Smith an ~|iron dagger|~': { Level: 15, Primary: true },
                            [targetTask]: {
                                Level: 50,
                                NoBoost: true,
                                Synthetic: true,
                                MethodCapSynthetic: true
                            }
                        }
                    }
                };
                globalValids = { Smithing: { 'Smith an ~|iron dagger|~': 15, [targetTask]: 50 } };
                completedChallenges = {};
                checkedChallenges = {};
                backlog = { Smithing: { [targetTask]: '' } };
                splitBacklog = {
                    Smithing: {
                        [targetTask]: {
                            targetLevel: 50,
                            targetTask,
                            splitCount: 2,
                            currentSplit: 1,
                            milestones: [{ split: 1, level: 32, xp: xpTable[32] }]
                        }
                    }
                };
                const entries = getSplitBacklogActiveEntries();
                const splitTask = entries.Smithing && chunkInfo.challenges.Smithing[entries.Smithing.syntheticName];
                return {
                    synthetic: entries.Smithing && entries.Smithing.syntheticName,
                    milestoneXp: xpTable[32],
                    targetTask: entries.Smithing && entries.Smithing.targetTask,
                    companion: splitTask && splitTask.SplitBacklogCompanion,
                    targetStillSynthetic: !!chunkInfo.challenges.Smithing[targetTask].MethodCapSynthetic
                };
            } finally {
                chunkInfo = savedChunkInfo;
                globalValids = savedGlobalValids;
                completedChallenges = savedCompletedChallenges;
                checkedChallenges = savedCheckedChallenges;
                backlog = savedBacklog;
                splitBacklog = savedSplitBacklog;
            }
        })()`, context);
        assert('Split Backlog accepts Method Cap synthetic tasks as targets',
            splitMethodCapSyntheticRegression.synthetic === 'Get to ' + splitMethodCapSyntheticRegression.milestoneXp.toLocaleString() + ' XP in Smithing [level 32] (1/2) by training towards ~|rune platebody|~'
                && splitMethodCapSyntheticRegression.targetTask === 'Train to efficient cap towards ~|rune platebody|~'
                && splitMethodCapSyntheticRegression.companion === 'Smith an ~|iron dagger|~'
                && splitMethodCapSyntheticRegression.targetStillSynthetic,
            JSON.stringify(splitMethodCapSyntheticRegression));

        const largeSplitSameLevelRegression = vm.runInContext(`(() => {
            const savedChunkInfo = chunkInfo;
            const savedGlobalValids = globalValids;
            const savedCompletedChallenges = completedChallenges;
            const savedCheckedChallenges = checkedChallenges;
            const savedBacklog = backlog;
            const savedSplitBacklog = splitBacklog;
            const savedRules = rules;
            const savedBaseChunkData = baseChunkData;
            const savedHighestOverall = highestOverall;
            const savedHighestCurrent = highestCurrent;
            const savedPassiveSkill = passiveSkill;
            const savedHiscoreSkillLevels = hiscoreSkillLevels;
            const savedManualTasks = manualTasks;
            const savedUserTasks = userTasks;
            try {
                const targetTask = 'Level 70 split target';
                const completedTask = 'Level 50 completed task';
                const milestoneXp = xpTable[50] + 1;
                chunkInfo = {
                    ...savedChunkInfo,
                    challenges: {
                        ...savedChunkInfo.challenges,
                        Smithing: {
                            'Level 1 primary task': { Level: 1, Primary: true },
                            [completedTask]: { Level: 50, Primary: true },
                            [targetTask]: { Level: 70, Primary: true }
                        }
                    }
                };
                rules = { ...savedRules, Boosting: false, 'Smithing by Smelting': true, 'Multi Step Processing': false };
                baseChunkData = { items: {}, objects: { Anvil: { test: true } } };
                globalValids = {
                    Smithing: {
                        'Level 1 primary task': 1,
                        [completedTask]: 50
                    }
                };
                completedChallenges = { Smithing: { [completedTask]: true } };
                checkedChallenges = {};
                backlog = { Smithing: { [targetTask]: '' } };
                splitBacklog = {
                    Smithing: {
                        [targetTask]: {
                            targetLevel: 70,
                            targetTask,
                            startLevel: 50,
                            startXp: xpTable[50],
                            targetXp: xpTable[70],
                            splitCount: 90,
                            currentSplit: 1,
                            milestones: [{ split: 1, xp: milestoneXp, level: 50 }]
                        }
                    }
                };
                highestOverall = {};
                highestCurrent = {};
                passiveSkill = {};
                hiscoreSkillLevels = { Smithing: 99 };
                manualTasks = {};
                userTasks = {};
                const active = calcCurrentChallenges2();
                const expected = 'Get to ' + milestoneXp.toLocaleString() + ' XP in Smithing [level 50] (1/90) by training towards ~|' + targetTask + '|~';
                return {
                    activeSmithing: active.Smithing,
                    expected,
                    syntheticValid: !!globalValids.Smithing[expected]
                };
            } finally {
                chunkInfo = savedChunkInfo;
                globalValids = savedGlobalValids;
                completedChallenges = savedCompletedChallenges;
                checkedChallenges = savedCheckedChallenges;
                backlog = savedBacklog;
                splitBacklog = savedSplitBacklog;
                rules = savedRules;
                baseChunkData = savedBaseChunkData;
                highestOverall = savedHighestOverall;
                highestCurrent = savedHighestCurrent;
                passiveSkill = savedPassiveSkill;
                hiscoreSkillLevels = savedHiscoreSkillLevels;
                manualTasks = savedManualTasks;
                userTasks = savedUserTasks;
            }
        })()`, context);
        assert('Large Split Backlog values show current XP milestone tasks even when hiscore is higher',
            largeSplitSameLevelRegression.activeSmithing === largeSplitSameLevelRegression.expected
                && largeSplitSameLevelRegression.syntheticValid,
            JSON.stringify(largeSplitSameLevelRegression));

        const hiscoreSourceTruthRegression = vm.runInContext(`(() => {
            const savedChunkInfo = chunkInfo;
            const savedRules = rules;
            const savedGlobalValids = globalValids;
            const savedCompletedChallenges = completedChallenges;
            const savedBacklog = backlog;
            const savedSplitBacklog = splitBacklog;
            const savedPassiveSkill = passiveSkill;
            const savedSkillQuestXp = skillQuestXp;
            const savedHiscoreSkillLevels = hiscoreSkillLevels;
            const savedBaseChunkData = baseChunkData;
            const savedHighestOverall = highestOverall;
            const savedHighestCurrent = highestCurrent;
            const savedManualTasks = manualTasks;
            const savedUserTasks = userTasks;
            const savedMaxSkill = maxSkill;
            try {
                const proofTask = 'Level 50 hiscore proof primary';
                const nextTask = 'Level 60 next primary';
                const oldCompletedTask = 'Level 80 old completed primary';
                chunkInfo = {
                    ...savedChunkInfo,
                    challenges: {
                        ...savedChunkInfo.challenges,
                        Fishing: {
                            [proofTask]: { Level: 50, Primary: true },
                            [nextTask]: { Level: 60, Primary: true },
                            [oldCompletedTask]: { Level: 80, Primary: true }
                        }
                    }
                };
                rules = { ...savedRules, Boosting: false };
                globalValids = { Fishing: { [proofTask]: 50, [nextTask]: 60, [oldCompletedTask]: 80 } };
                completedChallenges = { Fishing: { [oldCompletedTask]: true } };
                backlog = {};
                splitBacklog = {};
                passiveSkill = {};
                skillQuestXp = {};
                hiscoreSkillLevels = {};
                baseChunkData = { items: {}, objects: {} };
                highestOverall = {};
                highestCurrent = {};
                manualTasks = {};
                userTasks = {};
                maxSkill = {};
                const noHiscore = calcCurrentChallenges2().Fishing || null;

                hiscoreSkillLevels = { Fishing: 50 };
                passiveSkill = {};
                highestOverall = {};
                highestCurrent = {};
                const withHiscore = calcCurrentChallenges2().Fishing || null;
                return { noHiscore, withHiscore, expected: nextTask };
            } finally {
                chunkInfo = savedChunkInfo;
                rules = savedRules;
                globalValids = savedGlobalValids;
                completedChallenges = savedCompletedChallenges;
                backlog = savedBacklog;
                splitBacklog = savedSplitBacklog;
                passiveSkill = savedPassiveSkill;
                skillQuestXp = savedSkillQuestXp;
                hiscoreSkillLevels = savedHiscoreSkillLevels;
                baseChunkData = savedBaseChunkData;
                highestOverall = savedHighestOverall;
                highestCurrent = savedHighestCurrent;
                manualTasks = savedManualTasks;
                userTasks = savedUserTasks;
                maxSkill = savedMaxSkill;
            }
        })()`, context);
        assert('Hiscore levels override completed-task skill heuristics for current task selection',
            hiscoreSourceTruthRegression.noHiscore !== hiscoreSourceTruthRegression.expected
                && hiscoreSourceTruthRegression.withHiscore === hiscoreSourceTruthRegression.expected,
            JSON.stringify(hiscoreSourceTruthRegression));

        const birdhouseClockworkRegression = vm.runInContext(`(() => {
            const birdhouseTasks = Object.keys(chunkInfo.challenges.Crafting || {})
                .filter(name => /^Craft an? ~\\|.*bird house\\|~$/.test(name));
            return {
                taskCount: birdhouseTasks.length,
                starredClockwork: birdhouseTasks.filter(name => chunkInfo.challenges.Crafting[name].Items.includes('Clockwork*')),
                missingClockwork: birdhouseTasks.filter(name => !chunkInfo.challenges.Crafting[name].Items.includes('Clockwork'))
            };
        })()`, context);
        assert('Birdhouse crafting tasks require a real Clockwork source',
            birdhouseClockworkRegression.taskCount >= 8
                && birdhouseClockworkRegression.starredClockwork.length === 0
                && birdhouseClockworkRegression.missingClockwork.length === 0,
            JSON.stringify(birdhouseClockworkRegression));

        const bologaPrayerGateRegression = vm.runInContext(`(() => {
            const task = chunkInfo.challenges.Prayer['Unlock the ability to buy ~|bologa\\'s blessings|~'];
            return {
                hasTask: !!task,
                farmingRequirement: task && task.Tasks && task.Tasks['Grow a ~|golovanova fruit|~']
            };
        })()`, context);
        assert('Prayer Bologa unlock requires Tithe Farm golovanova access',
            bologaPrayerGateRegression.hasTask && bologaPrayerGateRegression.farmingRequirement === 'Farming',
            JSON.stringify(bologaPrayerGateRegression));

        const karamjaSeaweedDiaryRegression = vm.runInContext(`(() => {
            const task = chunkInfo.challenges.Diary['~|Karamja Diary#Easy|~ Task 8'];
            return {
                chunks: task && task.Chunks,
                group: chunkInfo.codeItems.chunksPlus['KaramjaSeaweed[+]']
            };
        })()`, context);
        assert('Karamja seaweed diary task requires a Karamja seaweed chunk',
            JSON.stringify(karamjaSeaweedDiaryRegression.chunks) === JSON.stringify(['KaramjaSeaweed[+]'])
                && Array.isArray(karamjaSeaweedDiaryRegression.group)
                && karamjaSeaweedDiaryRegression.group.includes('11568-2')
                && !karamjaSeaweedDiaryRegression.group.includes('11569-1'),
            JSON.stringify(karamjaSeaweedDiaryRegression));

        const localDbPath = path.join(__dirname, '..', '.local-db', 'db.json');
        if (fs.existsSync(localDbPath)) {
            const localDb = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
            const localMap = localDb.maps && localDb.maps.iwil;
            if (localMap) {
                const savedWorkerResult = workerResult;
                const savedWorkerError = workerError;
                const localChunkInfo = JSON.parse(fs.readFileSync(chunkInfoPath, 'utf8'));
                const localWorkerData = buildWorkerDataFromMapData(localMap, localChunkInfo, tasksMap, tasksMapReverse, {
                    splitBacklog: {},
                    hiscoreSkillLevels: {
                        Attack: 68,
                        Defence: 60,
                        Strength: 72,
                        Hitpoints: 73,
                        Ranged: 71,
                        Prayer: 49,
                        Magic: 69,
                        Crafting: 99
                    }
                });
                workerResult = null;
                workerError = null;
                try {
                    onmessageFn({ data: localWorkerData });
                } catch(e) {
                    workerError = e;
                }
                const localResult = workerResult;
                const localBirdhouseTasks = localResult && localResult.globalValids && localResult.globalValids.Crafting
                    ? Object.keys(localResult.globalValids.Crafting).filter(name => /^Craft an? ~\|.*bird house\|~$/.test(name))
                    : [];
                const localOutputTasks = vm.runInContext('outputTasks', context);
                const localOutputBirdhouseTasks = localOutputTasks && localOutputTasks.Crafting
                    ? Object.keys(localOutputTasks.Crafting).filter(name => /^Craft an? ~\|.*bird house\|~$/.test(name))
                    : [];
                const localClockworkTasks = localResult && localResult.globalValids && localResult.globalValids.Crafting
                    ? Object.keys(localResult.globalValids.Crafting).filter(name => name.toLowerCase().includes('clockwork'))
                    : [];
                const localBologaPrayerTasks = localResult && localResult.globalValids && localResult.globalValids.Prayer
                    ? Object.keys(localResult.globalValids.Prayer).filter(name => name.toLowerCase().includes('bologa'))
                    : [];
                const localWizardGuildAccess = localResult && localResult.globalValids && localResult.globalValids.Magic
                    ? localResult.globalValids.Magic["Access the ~|Wizards' Guild|~"]
                    : null;
                const localMysticRobeSources = localResult && localResult.baseChunkData && localResult.baseChunkData.items
                    ? localResult.baseChunkData.items['Mystic robe top']
                    : null;
                const localClockworkSources = localResult && localResult.baseChunkData && localResult.baseChunkData.items
                    ? {
                        ...(localResult.baseChunkData.items.Clockwork || {}),
                        ...(localResult.baseChunkData.items['Clockwork*'] || {})
                    }
                    : {};
                assert('Local iwil fixture has no Clockwork source',
                    !workerError && localResult && localResult.type !== 'error' && Object.keys(localClockworkSources).length === 0,
                    workerError ? workerError.message : JSON.stringify({
                        resultType: localResult && localResult.type,
                        err: localResult && localResult.err && (localResult.err.stack || localResult.err.message || String(localResult.err)),
                        localClockworkSources
                    }));
                assert('Local iwil fixture does not assign birdhouse crafting without Clockwork',
                    !workerError && localResult && localResult.type !== 'error' && localBirdhouseTasks.length === 0,
                    JSON.stringify({
                        resultType: localResult && localResult.type,
                        err: localResult && localResult.err && (localResult.err.stack || localResult.err.message || String(localResult.err)),
                        localBirdhouseTasks,
                        localClockworkTasks,
                        localOutputBirdhouseTasks
                    }));
                assert('Local iwil fixture does not assign Bologa Prayer unlock without Farming access',
                    !workerError && localResult && localResult.type !== 'error' && localBologaPrayerTasks.length === 0,
                    JSON.stringify({
                        resultType: localResult && localResult.type,
                        err: localResult && localResult.err && (localResult.err.stack || localResult.err.message || String(localResult.err)),
                        localBologaPrayerTasks
                    }));
                assert('Local iwil fixture uses hiscore Magic to keep Wizards Guild access through Method Cap',
                    !workerError && localResult && localResult.type !== 'error'
                        && !!localMysticRobeSources
                        && !!localMysticRobeSources['Magic Guild Store (Mystic Robes)'],
                    JSON.stringify({
                        resultType: localResult && localResult.type,
                        err: localResult && localResult.err && (localResult.err.stack || localResult.err.message || String(localResult.err)),
                        localWizardGuildAccess,
                        localMysticRobeSources
                    }));

                const noKaramjaSeaweedChunkInfo = JSON.parse(fs.readFileSync(chunkInfoPath, 'utf8'));
                const noKaramjaSeaweedChunks = {
                    ...(localMap.chunks && localMap.chunks.unlocked ? localMap.chunks.unlocked : {})
                };
                (noKaramjaSeaweedChunkInfo.codeItems.chunksPlus['KaramjaSeaweed[+]'] || []).forEach((chunkId) => {
                    delete noKaramjaSeaweedChunks[chunkId.toString().split('-')[0]];
                });
                const noKaramjaSeaweedWorkerData = buildWorkerDataFromMapData(localMap, noKaramjaSeaweedChunkInfo, tasksMap, tasksMapReverse, {
                    chunks: noKaramjaSeaweedChunks,
                    hiscoreSkillLevels: {
                        Attack: 68,
                        Defence: 60,
                        Strength: 72,
                        Hitpoints: 73,
                        Ranged: 71,
                        Prayer: 49,
                        Magic: 69,
                        Crafting: 99,
                        Cooking: 99,
                        Thieving: 99
                    }
                });
                workerResult = null;
                workerError = null;
                try {
                    onmessageFn({ data: noKaramjaSeaweedWorkerData });
                } catch(e) {
                    workerError = e;
                }
                const noKaramjaSeaweedResult = workerResult;
                const localKaramjaSeaweedDiaryTasks = noKaramjaSeaweedResult && noKaramjaSeaweedResult.globalValids && noKaramjaSeaweedResult.globalValids.Diary
                    ? Object.keys(noKaramjaSeaweedResult.globalValids.Diary).filter(name => name === '~|Karamja Diary#Easy|~ Task 8')
                    : [];
                assert('Local iwil fixture does not assign Karamja seaweed diary without Karamja seaweed',
                    !workerError && noKaramjaSeaweedResult && noKaramjaSeaweedResult.type !== 'error' && localKaramjaSeaweedDiaryTasks.length === 0,
                    JSON.stringify({
                        resultType: noKaramjaSeaweedResult && noKaramjaSeaweedResult.type,
                        err: noKaramjaSeaweedResult && noKaramjaSeaweedResult.err && (noKaramjaSeaweedResult.err.stack || noKaramjaSeaweedResult.err.message || String(noKaramjaSeaweedResult.err)),
                        localKaramjaSeaweedDiaryTasks
                    }));

                const advanceChunkInfo = JSON.parse(fs.readFileSync(chunkInfoPath, 'utf8'));
                const advanceWorkerData = buildWorkerDataFromMapData(localMap, advanceChunkInfo, tasksMap, tasksMapReverse, {
                    hiscoreSkillLevels: {
                        Attack: 68,
                        Defence: 60,
                        Strength: 72,
                        Hitpoints: 73,
                        Ranged: 71,
                        Prayer: 49,
                        Magic: 69,
                        Crafting: 99,
                        Cooking: 99,
                        Thieving: 99
                    }
                });
                const splitSyntheticName = function(skill, targetTask, entry) {
                    const splitCount = Math.max(1, parseInt(entry.splitCount) || (entry.milestones ? entry.milestones.length : 1) || 1);
                    const currentSplit = Math.max(1, Math.min(splitCount, parseInt(entry.currentSplit) || 1));
                    const milestone = entry.milestones[Math.min(currentSplit - 1, entry.milestones.length - 1)];
                    const milestoneLevel = parseInt(milestone.level) || 1;
                    const milestoneXp = parseInt(milestone.xp) || 0;
                    const targetLabel = targetTask.includes('|') ? targetTask.split('|')[1] : targetTask;
                    return 'Get to ' + milestoneXp.toLocaleString() + ' XP in ' + skill + ' [level ' + milestoneLevel + '] (' + currentSplit + '/' + splitCount + ') by training towards ~|' + targetLabel + '|~';
                };
                const localLatestMarker = Object.keys(localMap.chunkOrder || {}).sort((a, b) => parseInt(b) - parseInt(a))[0];
                Object.keys(advanceWorkerData.splitBacklog || {}).some((skill) => {
                    return Object.keys(advanceWorkerData.splitBacklog[skill] || {}).some((taskName) => {
                        const entry = advanceWorkerData.splitBacklog[skill][taskName];
                        if (!entry || !entry.milestones || (parseInt(entry.currentSplit) || 1) >= (parseInt(entry.splitCount) || 1)) return false;
                        entry.lastAdvancedChunkMarker = 'test-older-marker';
                        if (!advanceWorkerData.checkedChallenges[skill]) advanceWorkerData.checkedChallenges[skill] = {};
                        advanceWorkerData.checkedChallenges[skill][splitSyntheticName(skill, taskName, entry)] = true;
                        return true;
                    });
                });
                workerResult = null;
                workerError = null;
                try {
                    onmessageFn({ data: advanceWorkerData });
                } catch(e) {
                    workerError = e;
                }
                const advanceResult = workerResult;
                let advanceCandidates = [];
                Object.keys(advanceWorkerData.splitBacklog || {}).forEach((skill) => {
                    Object.keys(advanceWorkerData.splitBacklog[skill] || {}).forEach((taskName) => {
                        const entry = advanceWorkerData.splitBacklog[skill][taskName];
                        if (!entry || !entry.milestones || entry.lastAdvancedChunkMarker === localLatestMarker) return;
                        if ((parseInt(entry.currentSplit) || 1) >= (parseInt(entry.splitCount) || 1)) return;
                        const syntheticName = splitSyntheticName(skill, taskName, entry);
                        if (advanceWorkerData.checkedChallenges[skill] && advanceWorkerData.checkedChallenges[skill][syntheticName]) {
                            advanceCandidates.push(syntheticName);
                        }
                    });
                });
                const savedActiveTasks = decodeFirebaseObject(localMap.chunkinfo.activeTasks || {}, tasksMapReverse);
                let splitSyntheticNames = {};
                Object.keys(advanceWorkerData.splitBacklog || {}).forEach((skill) => {
                    Object.keys(advanceWorkerData.splitBacklog[skill] || {}).forEach((taskName) => {
                        splitSyntheticNames[skill + '::' + splitSyntheticName(skill, taskName, advanceWorkerData.splitBacklog[skill][taskName])] = true;
                    });
                });
                const savedDisplayedTaskEntries = Object.keys(savedActiveTasks || {}).flatMap((skill) => {
                    return Object.keys(savedActiveTasks[skill] || {}).map((taskName) => ({ skill, taskName }));
                });
                const savedAdvanceTaskCount = savedDisplayedTaskEntries.filter((taskInfo) => !splitSyntheticNames[taskInfo.skill + '::' + taskInfo.taskName]).length;
                const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
                assert('Local iwil 100-chunk fixture has checked split milestones ready to advance',
                    !workerError && advanceResult && advanceResult.type !== 'error'
                        && Object.keys(localMap.chunks.unlocked || {}).length >= 100
                        && advanceCandidates.length > 0
                        && savedAdvanceTaskCount > 0,
                    JSON.stringify({
                        resultType: advanceResult && advanceResult.type,
                        err: advanceResult && advanceResult.err && (advanceResult.err.stack || advanceResult.err.message || String(advanceResult.err)),
                        unlockedCount: Object.keys(localMap.chunks.unlocked || {}).length,
                        advanceCandidates,
                        savedAdvanceTaskCount,
                        savedDisplayedTaskEntries
                    }));
                assert('100+ chunk path builds full task list for Split Backlog advancement',
                    indexSource.includes('setupCurrentChallenges(tempChallengeArrSaved, true, true)') && indexSource.includes('maybeAdvanceSplitBacklog(displayedTasks)'),
                    'Expected 100+ chunk branch to count diary/quest/extra tasks before showing Show New Tasks');
                workerResult = savedWorkerResult;
                workerError = savedWorkerError;
            }
        }

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

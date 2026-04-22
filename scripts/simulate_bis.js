// Simulate BiS Monster Power Gate for IWIL chunk data
const fs = require('fs');

const chunkInfo = JSON.parse(fs.readFileSync('chunkpicker-chunkinfo-export.json', 'utf8'));
const monsterStatsRaw = JSON.parse(fs.readFileSync('scripts/monster_stats.json', 'utf8'));

// Convert monster stats to {hp, def, db} format
const monsterStats = {};
Object.keys(monsterStatsRaw).forEach(name => {
    let s = monsterStatsRaw[name];
    monsterStats[name] = { hp: s.hp || 10, def: s.def || 1, db: s.def_bonus || 0 };
});

// IWIL data
const unlockedChunks = ['5690', '5946', '5947'];
const completedEquipment = {}; // nothing completed

// Build baseChunkData items from unlocked chunks
const baseItems = {};
unlockedChunks.forEach(chunkId => {
    let chunk = chunkInfo.chunks[chunkId];
    if (!chunk) return;
    
    // Monsters in chunk -> drops -> items
    if (chunk.monsters) {
        chunk.monsters.forEach(monster => {
            if (chunkInfo.drops[monster]) {
                Object.keys(chunkInfo.drops[monster]).forEach(item => {
                    // Check if it's equipment
                    if (chunkInfo.equipment[item]) {
                        if (!baseItems[item]) baseItems[item] = {};
                        baseItems[item][monster] = 'primary-drop';
                    }
                });
            }
        });
    }
    
    // Spawns
    if (chunk.spawns) {
        chunk.spawns.forEach(item => {
            if (chunkInfo.equipment[item]) {
                if (!baseItems[item]) baseItems[item] = {};
                baseItems[item]['Spawn'] = 'primary-spawn';
            }
        });
    }
    
    // Skills -> crafted items
    if (chunk.challenges) {
        Object.keys(chunk.challenges).forEach(skill => {
            Object.keys(chunk.challenges[skill]).forEach(task => {
                // Check if task produces equipment
                // This is simplified - real logic is more complex
            });
        });
    }
});

// Also check drop tables
Object.keys(chunkInfo.drops).forEach(monster => {
    // Check if this monster is in our chunks
    let inChunk = false;
    unlockedChunks.forEach(chunkId => {
        let chunk = chunkInfo.chunks[chunkId];
        if (chunk && chunk.monsters && chunk.monsters.includes(monster)) {
            inChunk = true;
        }
    });
    if (!inChunk) return;
    
    Object.keys(chunkInfo.drops[monster]).forEach(dropKey => {
        let dropData = chunkInfo.drops[monster][dropKey];
        // Direct drops
        if (chunkInfo.equipment[dropKey]) {
            if (!baseItems[dropKey]) baseItems[dropKey] = {};
            baseItems[dropKey][monster] = 'primary-drop';
        }
    });
});

// Build drop rates
const dropRatesGlobal = {};
unlockedChunks.forEach(chunkId => {
    let chunk = chunkInfo.chunks[chunkId];
    if (!chunk || !chunk.monsters) return;
    chunk.monsters.forEach(monster => {
        if (!chunkInfo.drops[monster]) return;
        Object.keys(chunkInfo.drops[monster]).forEach(item => {
            let dropData = chunkInfo.drops[monster][item];
            Object.keys(dropData).forEach(qty => {
                let rate = dropData[qty];
                if (!dropRatesGlobal[monster]) dropRatesGlobal[monster] = {};
                dropRatesGlobal[monster][item] = rate;
            });
        });
    });
});

// Add Unarmed
baseItems['Unarmed'] = {'Built-in': 'secondary-Nonskill'};

// DPS estimation function (same as worker.js)
function estimateKillTime(atkLevel, strLevel, weaponAtk, weaponStr, weaponSpeed, monsterHp, monsterDef, monsterDefBonus) {
    let effectiveStr = strLevel + 9;
    let effectiveAtk = atkLevel + 9;
    let maxHit = Math.floor((effectiveStr * (weaponStr + 64) + 320) / 640);
    if (maxHit < 1) maxHit = 1;
    let attackRoll = effectiveAtk * (weaponAtk + 64);
    let defenceRoll = (monsterDef + 9) * (monsterDefBonus + 64);
    let accuracy;
    if (attackRoll > defenceRoll) {
        accuracy = 1 - (defenceRoll + 2) / (2 * (attackRoll + 1));
    } else {
        accuracy = attackRoll / (2 * (defenceRoll + 1));
    }
    if (accuracy < 0.01) accuracy = 0.01;
    let avgDmgPerHit = (maxHit / 2) * accuracy;
    let hitsNeeded = monsterHp / avgDmgPerHit;
    let secondsPerKill = hitsNeeded * weaponSpeed * 0.6;
    return secondsPerKill;
}

// Score equipment (simplified melee DPS scoring)
function scoreEquip(equip) {
    let e = chunkInfo.equipment[equip];
    if (!e) return 0;
    let bestAtk = Math.max(e.attack_stab || 0, e.attack_slash || 0, e.attack_crush || 0);
    let str = e.melee_strength || 0;
    let speed = e.attack_speed || 4;
    if (e.slot !== 'weapon' && e.slot !== '2h') {
        return bestAtk + str; // armor scoring
    }
    return (bestAtk + str + 64) / speed;
}

// Simulate with and without gate
console.log('=== IWIL BiS Simulation ===');
console.log('Unlocked chunks:', unlockedChunks.join(', '));
console.log('Available equipment items:', Object.keys(baseItems).length);
console.log('');

// Estimate player combat stats (no completed weapons = bare fists)
let playerAtkLevel = 1;
let playerStrLevel = 1;
let playerWeaponAtk = 0;
let playerWeaponStr = 0;
let playerWeaponSpeed = 4;

// From possible weapon requirements
Object.keys(baseItems).forEach(eq => {
    let e = chunkInfo.equipment[eq];
    if (!e) return;
    if (e.slot !== 'weapon' && e.slot !== '2h') return;
    let reqs = e.requirements || {};
    if (reqs['Attack'] && reqs['Attack'] > playerAtkLevel) playerAtkLevel = reqs['Attack'];
    if (reqs['Strength'] && reqs['Strength'] > playerStrLevel) playerStrLevel = reqs['Strength'];
});

console.log('Player estimated combat: Atk=' + playerAtkLevel + ' Str=' + playerStrLevel);
console.log('Player weapon bonuses (from obtained): Atk=' + playerWeaponAtk + ' Str=' + playerWeaponStr + ' Speed=' + playerWeaponSpeed);
console.log('(No completed weapons, using fists)');
console.log('');

// Check each equipment item
const results = [];

Object.keys(baseItems).forEach(equip => {
    let e = chunkInfo.equipment[equip];
    if (!e) return;
    
    // Check requirements (simplified: just check if has Attack/Strength reqs)
    let reqs = e.requirements || {};
    
    // Check each source
    let sources = baseItems[equip];
    let hasDropSource = false;
    let dropDetails = [];
    let hasNonDropSource = false;
    
    Object.keys(sources).forEach(source => {
        let sourceVal = sources[source];
        if (!sourceVal.includes('drop')) {
            hasNonDropSource = true;
        } else {
            hasDropSource = true;
            let ms = monsterStats[source] || { hp: 10, def: 1, db: 0 };
            let killTime = estimateKillTime(playerAtkLevel, playerStrLevel, playerWeaponAtk, playerWeaponStr, playerWeaponSpeed, ms.hp, ms.def, ms.db);
            
            let avgKills = 128;
            if (dropRatesGlobal[source] && dropRatesGlobal[source][equip]) {
                let rate = dropRatesGlobal[source][equip];
                if (rate === 'Always') {
                    avgKills = 1;
                } else {
                    let parts = rate.split('/');
                    if (parts.length === 2) {
                        avgKills = Math.ceil(parseFloat(parts[1]) / parseFloat(parts[0]));
                    }
                }
            }
            
            let totalHours = (killTime * avgKills) / 3600;
            dropDetails.push({
                monster: source,
                hp: ms.hp,
                def: ms.def,
                defBonus: ms.db,
                killTimeSec: killTime.toFixed(1),
                dropRate: dropRatesGlobal[source] && dropRatesGlobal[source][equip] || 'unknown',
                avgKills: avgKills,
                totalHours: totalHours.toFixed(2),
                passesGate5: totalHours <= 5,
                passesGate10: totalHours <= 10
            });
        }
    });
    
    let gateResult5 = hasNonDropSource || dropDetails.some(d => d.passesGate5);
    let gateResult10 = hasNonDropSource || dropDetails.some(d => d.passesGate10);
    
    results.push({
        item: equip,
        slot: e.slot,
        score: scoreEquip(equip).toFixed(2),
        reqs: JSON.stringify(reqs),
        hasNonDropSource,
        dropDetails,
        passesGate5: gateResult5,
        passesGate10: gateResult10,
        wouldBeBlocked5: hasDropSource && !gateResult5,
        wouldBeBlocked10: hasDropSource && !gateResult10
    });
});

// Sort by slot then score
results.sort((a, b) => a.slot.localeCompare(b.slot) || parseFloat(b.score) - parseFloat(a.score));

console.log('--- ALL Available Equipment (without gate) ---');
results.forEach(r => {
    if (r.item === 'Unarmed') return;
    let blockIcon5 = r.wouldBeBlocked5 ? ' [BLOCKED@5hr]' : '';
    let blockIcon10 = r.wouldBeBlocked10 ? ' [BLOCKED@10hr]' : '';
    console.log(`  ${r.item} (${r.slot}, score:${r.score}, reqs:${r.reqs})`);
    r.dropDetails.forEach(d => {
        console.log(`    -> ${d.monster}: HP=${d.hp} Def=${d.def} DefBonus=${d.defBonus} | kill=${d.killTimeSec}s | rate=${d.dropRate} (${d.avgKills} kills) | ${d.totalHours}hrs${d.passesGate5 ? ' ✓' : ' ✗'}${blockIcon5}${blockIcon10}`);
    });
    if (r.hasNonDropSource) console.log('    -> Has non-drop source (craft/spawn) - always passes gate');
});

console.log('');
console.log('--- SUMMARY ---');
let blocked5 = results.filter(r => r.wouldBeBlocked5);
let blocked10 = results.filter(r => r.wouldBeBlocked10);
let total = results.filter(r => r.item !== 'Unarmed');

console.log(`Total equipment items: ${total.length}`);
console.log(`Blocked at 5hr threshold: ${blocked5.length} items`);
blocked5.forEach(r => console.log(`  - ${r.item} (${r.slot})`));
console.log(`Blocked at 10hr threshold: ${blocked10.length} items`);
blocked10.forEach(r => console.log(`  - ${r.item} (${r.slot})`));
console.log(`Passes at 5hr: ${total.length - blocked5.length} items`);
console.log(`Passes at 10hr: ${total.length - blocked10.length} items`);

const ci = JSON.parse(require('fs').readFileSync('chunkpicker-chunkinfo-export.json','utf8'));
const ms = JSON.parse(require('fs').readFileSync('scripts/monster_stats.json','utf8'));

function estimateKillTime(aL,sL,wA,wS,wSp,mHp,mDef,mDB) {
    let eStr = sL + 9, eAtk = aL + 9;
    let maxHit = Math.floor((eStr * (wS + 64) + 320) / 640);
    if (maxHit < 1) maxHit = 1;
    let aRoll = eAtk * (wA + 64);
    let dRoll = (mDef + 9) * (mDB + 64);
    let acc = aRoll > dRoll ? 1 - (dRoll + 2)/(2*(aRoll + 1)) : aRoll/(2*(dRoll + 1));
    if (acc < 0.01) acc = 0.01;
    let avgDmg = (maxHit / 2) * acc;
    return (mHp / avgDmg) * wSp * 0.6;
}

// Player: no obtained weapons (fists), level estimated from POSSIBLE weapons
let playerAtkLevel = 60; // from DWH requirement
let playerStrLevel = 1;  // no str reqs
let playerWeaponAtk = 0; // fists (nothing obtained)
let playerWeaponStr = 0;
let playerWeaponSpeed = 4;

console.log('=== BiS Monster Power Gate Simulation (IWIL) ===');
console.log('Player est combat: Atk=' + playerAtkLevel + ' Str=' + playerStrLevel);
console.log('Player weapon: Fists (Atk=0, Str=0, Speed=4)');
console.log('Threshold: 5 hours');
console.log('');

// All monster drops from the chunks
let items = {
    'Rune kiteshield': {'Sergeant (Shayzien)': '1/512'},
    'Rune scimitar': {'Sergeant (Shayzien)': '1/512'},
    'Iron bolts': {'Sergeant (Shayzien)': '10/128', 'Soldier (Shayzien)': '10/128'},
    'Steel arrow': {'Sergeant (Shayzien)': '4/128', 'Soldier (Shayzien)': '4/128'},
    'Bronze arrow': {'Sergeant (Shayzien)': '3/128', 'Soldier (Shayzien)': '3/128'},
    'Iron dagger': {'Sergeant (Shayzien)': '6/128', 'Soldier (Shayzien)': '6/128'},
    'Rune med helm': {'Lizardman shaman': '9/250'},
    'Earth battlestaff': {'Lizardman shaman': '8.5/250'},
    'Mystic earth staff': {'Lizardman shaman': '8.5/250'},
    'Rune warhammer': {'Lizardman shaman': '8/250'},
    'Rune chainbody': {'Lizardman shaman': '6/250'},
    "Red d'hide vambraces": {'Lizardman shaman': '5/250'},
    "Xeric's talisman (inert)": {'Lizardman shaman': '1/250', 'Lizardman#Level 53': '1/250', 'Lizardman#Level 62': '1/250'},
    'Dragon warhammer': {'Lizardman shaman': '1/3000'},
    'Iron arrow': {'Skeleton#Armed': '2/128'},
    'Iron med helm': {'Skeleton#Armed': '6/128'},
    'Iron sword': {'Skeleton#Armed': '4/128'},
    'Iron axe': {'Skeleton#Armed': '2/128'},
    'Iron scimitar': {'Skeleton#Armed': '1/128'},
    'Bronze pickaxe': {'Dwarf': '13/128'},
    'Bronze med helm': {'Dwarf': '4/128'},
    'Bronze battleaxe': {'Dwarf': '2/128'},
    'Iron battleaxe': {'Dwarf': '1/128'},
    'Bronze bolts': {'Dwarf': '7/128'}
};

let results = [];

Object.keys(items).forEach(item => {
    let sources = items[item];
    let bestHours = Infinity;
    let details = [];
    
    Object.keys(sources).forEach(monster => {
        let mstats = ms[monster] || {hp:10,def:1,def_bonus:0};
        let hp = mstats.hp||10, def = mstats.def||1, db = mstats.def_bonus||0;
        let killSec = estimateKillTime(playerAtkLevel, playerStrLevel, playerWeaponAtk, playerWeaponStr, playerWeaponSpeed, hp, def, db);
        
        let rate = sources[monster];
        let avgKills;
        if (rate === 'Always') { avgKills = 1; }
        else {
            let parts = rate.split('/');
            avgKills = Math.ceil(parseFloat(parts[1]) / parseFloat(parts[0]));
        }
        
        let hours = (killSec * avgKills) / 3600;
        if (hours < bestHours) bestHours = hours;
        details.push({monster, hp, def, db, killSec: killSec.toFixed(1), rate, avgKills, hours: hours.toFixed(2)});
    });
    
    let passes5 = bestHours <= 5;
    results.push({item, bestHours, passes5, details});
});

results.sort((a,b) => (a.passes5===b.passes5 ? a.bestHours - b.bestHours : a.passes5 ? -1 : 1));

console.log('--- PASSES GATE (<=5hr) ---');
results.filter(r=>r.passes5).forEach(r => {
    console.log('  OK ' + r.item + ' (best: ' + r.bestHours.toFixed(2) + 'hr)');
    r.details.forEach(d => {
        console.log('     ' + d.monster + ': HP=' + d.hp + ' Def=' + d.def + '+' + d.db + ' | kill=' + d.killSec + 's | rate=' + d.rate + ' (' + d.avgKills + ' kills) = ' + d.hours + 'hr');
    });
});

console.log('');
console.log('--- BLOCKED BY GATE (>5hr) ---');
results.filter(r=>!r.passes5).forEach(r => {
    console.log('  XX ' + r.item + ' (best: ' + r.bestHours.toFixed(2) + 'hr)');
    r.details.forEach(d => {
        console.log('     ' + d.monster + ': HP=' + d.hp + ' Def=' + d.def + '+' + d.db + ' | kill=' + d.killSec + 's | rate=' + d.rate + ' (' + d.avgKills + ' kills) = ' + d.hours + 'hr');
    });
});

console.log('');
console.log('Summary: ' + results.filter(r=>r.passes5).length + ' pass / ' + results.filter(r=>!r.passes5).length + ' blocked out of ' + results.length + ' items');

/**
 * Simulate Shop Cost Gate for user's IWIL chunks
 * Chunks: 5690, 5946, 5947, 5434, 5692
 */
const data = require('../chunkpicker-chunkinfo-export.json');
const shopPrices = require('./shop_prices.json');
const shopMarkups = require('./shop_markups.json');

const userChunks = ['5690', '5946', '5947', '5434', '5692'];

// Gather monsters and their coin drops
const monsters = new Set();
const shopItems = {};
userChunks.forEach(cid => {
    const c = data.chunks[cid] || data.chunks['*fb*_' + cid];
    if (!c || !c.Sections) return;
    Object.values(c.Sections).forEach(sec => {
        if (sec.Monster) Object.keys(sec.Monster).forEach(m => monsters.add(m));
        if (sec.Shop) {
            Object.keys(sec.Shop).forEach(shopName => {
                const items = data.shopItems[shopName];
                if (items) {
                    Object.keys(items).forEach(item => {
                        if (!shopItems[item]) shopItems[item] = [];
                        shopItems[item].push(shopName);
                    });
                }
            });
        }
    });
});

console.log('Monsters in chunks:', [...monsters]);
console.log('\nShop items available:', Object.keys(shopItems).length);

// Estimate coins/hour from each monster
// Player: bronze tier, atk=1, str=1, no weapon bonuses
const atkLevel = 1, strLevel = 1, weaponAtk = 0, weaponStr = 0, weaponSpeed = 4;

const monsterStats = {
    'Giant rat': {hp:5, def:2, db:0},
    'Sergeant (Shayzien)': {hp:40, def:25, db:0},
    'Soldier (Shayzien)': {hp:25, def:10, db:0},
    'Rat': {hp:1, def:1, db:0},
    'Spider': {hp:1, def:1, db:0},
    'Lizardman shaman': {hp:150, def:130, db:0},
    'Skeleton#Armed': {hp:22, def:10, db:0},
    'Skeleton#Plain': {hp:22, def:10, db:0},
    'Bat': {hp:5, def:1, db:0},
    'Dwarf': {hp:10, def:5, db:0},
    'Giant bat': {hp:27, def:10, db:0},
    'Lizardman#Level 53': {hp:55, def:50, db:0},
    'Lizardman#Level 62': {hp:65, def:55, db:0},
};

function estimateKillTime(atkLvl, strLvl, wAtk, wStr, wSpd, mHp, mDef, mDb) {
    let effectiveStr = strLvl + 9;
    let effectiveAtk = atkLvl + 9;
    let maxHit = Math.floor((effectiveStr * (wStr + 64) + 320) / 640);
    if (maxHit < 1) maxHit = 1;
    let attackRoll = effectiveAtk * (wAtk + 64);
    let defenceRoll = (mDef + 9) * (mDb + 64);
    let accuracy = attackRoll > defenceRoll 
        ? 1 - (defenceRoll + 2) / (2 * (attackRoll + 1))
        : attackRoll / (2 * (defenceRoll + 1));
    if (accuracy < 0.01) accuracy = 0.01;
    let avgDmg = (maxHit / 2) * accuracy;
    let hits = mHp / avgDmg;
    return hits * wSpd * 0.6;
}

console.log('\n--- Coins per hour from monsters ---');
let bestCoinsPerHour = 0;
let bestMonster = '';

monsters.forEach(m => {
    const coinDrops = data.drops[m] && data.drops[m]['Coins'];
    if (!coinDrops) return;
    
    const ms = monsterStats[m] || {hp:10, def:1, db:0};
    const killTime = estimateKillTime(atkLevel, strLevel, weaponAtk, weaponStr, weaponSpeed, ms.hp, ms.def, ms.db);
    
    let expectedCoins = 0;
    Object.entries(coinDrops).forEach(([amountStr, rate]) => {
        let amt;
        if (amountStr.includes('-')) {
            const parts = amountStr.replace(/[^0-9\-]/g, '').split('-');
            amt = (parseInt(parts[0]) + parseInt(parts[1])) / 2;
        } else {
            amt = parseInt(amountStr.replace(/[^0-9]/g, '')) || 0;
        }
        let prob;
        if (rate === 'Always') {
            prob = 1;
        } else {
            const rParts = rate.split('/');
            prob = parseFloat(rParts[0].replace('~', '')) / parseFloat(rParts[1].replace('~', ''));
        }
        expectedCoins += amt * prob;
    });
    
    const killsPerHour = 3600 / killTime;
    const coinsPerHour = killsPerHour * expectedCoins;
    
    console.log(`  ${m}: ${expectedCoins.toFixed(1)} coins/kill, ${killTime.toFixed(1)}s/kill, ${coinsPerHour.toFixed(0)} coins/hr`);
    
    if (coinsPerHour > bestCoinsPerHour) {
        bestCoinsPerHour = coinsPerHour;
        bestMonster = m;
    }
});

console.log(`\nBest: ${bestMonster} at ${bestCoinsPerHour.toFixed(0)} coins/hr`);

// Check shop items with cost gate
console.log('\n--- Shop item affordability ---');
const thresholds = [5, 10, 25, 50];

Object.entries(shopItems).sort((a,b) => {
    const pa = shopPrices[a[0]] || 0;
    const pb = shopPrices[b[0]] || 0;
    return pb - pa;
}).forEach(([item, shops]) => {
    const basePrice = shopPrices[item];
    if (!basePrice) return;
    
    let lowestPrice = Infinity;
    let shopUsed = '';
    shops.forEach(shop => {
        const markup = shopMarkups[shop] || 1.3;
        const price = Math.floor(basePrice * markup);
        if (price < lowestPrice) {
            lowestPrice = price;
            shopUsed = shop;
        }
    });
    
    const hours = lowestPrice / bestCoinsPerHour;
    const passesAt = thresholds.map(t => hours <= t ? '✓' : '✗');
    console.log(`  ${item}: ${lowestPrice} gp (${shopUsed}) = ${hours.toFixed(1)}hr [5h:${passesAt[0]} 10h:${passesAt[1]} 25h:${passesAt[2]} 50h:${passesAt[3]}]`);
});

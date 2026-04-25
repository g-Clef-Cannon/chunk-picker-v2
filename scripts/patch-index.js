const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');
const hasCRLF = code.includes('\r\n');
if (hasCRLF) code = code.replace(/\r\n/g, '\n');  // normalize

// ── 1. Rule defaults ──
code = code.replace(
    '"Shop Cost Gate Amount": "5",',
    '"Shop Cost Gate Amount": "5",\n    "Primary Drop Monster Gate": false,\n    "Primary Drop Monster Gate Amount": "3",'
);

// ── 2. Description ──
code = code.replace(
    '"Shop Cost Gate": "Skip tasks requiring shop items too expensive for current coin income. Block if coin farming time exceeds X-hours hours",',
    '"Shop Cost Gate": "Skip tasks requiring shop items too expensive for current coin income. Block if coin farming time exceeds X-hours hours",\n    "Primary Drop Monster Gate": "Downgrade drops from monsters too difficult to farm regularly to secondary. Downgrade if time-per-item exceeds X-minutes minutes",'
);

// ── 3. Category ──
code = code.replace(
    '        "Shop Cost Gate": true\n    },\n    "Construction"',
    '        "Shop Cost Gate": true,\n        "Primary Drop Monster Gate": true\n    },\n    "Construction"'
);

// ── 4. Worker data (location 1) ──
code = code.replace(
    "            shopCostGateHours: parseInt(rules['Shop Cost Gate Amount']),\n            constructionLocked,",
    "            shopCostGateHours: parseInt(rules['Shop Cost Gate Amount']),\n            primaryDropGateMinutes: parseInt(rules['Primary Drop Monster Gate Amount']),\n            constructionLocked,"
);

// ── 4b. Worker data (location 2) ──
code = code.replace(
    "            shopCostGateHours: parseInt(rules['Shop Cost Gate Amount']),\n        constructionLocked,",
    "            shopCostGateHours: parseInt(rules['Shop Cost Gate Amount']),\n            primaryDropGateMinutes: parseInt(rules['Primary Drop Monster Gate Amount']),\n        constructionLocked,"
);

// ── 5. Filter exclusions (3 locations) ──
code = code.replace(
    /rule !== 'Shop Cost Gate Amount'\)/g,
    "rule !== 'Shop Cost Gate Amount' && rule !== 'Primary Drop Monster Gate Amount')"
);

// ── 6. Main rule rendering (3 blocks) ──
// Block 1: ruleObj = pattern (condition on one line, template on next)
// Block 2 & 3: .append() pattern (condition on one line, append on next)
// All follow: `} else if (rule === 'Shop Cost Gate')` ... `} else {`

// Use a counter to do all 3 
let mainCount = 0;
code = code.replace(
    /(\} else if \(rule === 'Shop Cost Gate'\) \{\n[^\n]+shop-cost-gate-input[^\n]+\n)(\s+\} else \{)/g,
    (m, shopBlock, elseBlock) => {
        mainCount++;
        const dropBlock = shopBlock
            .replace("rule === 'Shop Cost Gate'", "rule === 'Primary Drop Monster Gate'")
            .replace(/shop-cost-gate-input/g, 'primary-drop-gate-input')
            .replace(/min='1' max='5000'/g, "min='1' max='60'")
            .replace(/Shop Cost Gate Amount/g, 'Primary Drop Monster Gate Amount')
            .replace(/X-hours/g, 'X-minutes');
        return shopBlock + dropBlock + elseBlock;
    }
);

// ── 7. Sub-rule rendering (3 blocks) ──
let subCount = 0;
code = code.replace(
    /(\} else if \(subRule === 'Shop Cost Gate'\) \{\n[^\n]+shop-cost-gate-input[^\n]+\n)/g,
    (m, shopBlock) => {
        subCount++;
        const dropBlock = shopBlock
            .replace("subRule === 'Shop Cost Gate'", "subRule === 'Primary Drop Monster Gate'")
            .replace(/shop-cost-gate-input/g, 'primary-drop-gate-input')
            .replace(/min='1' max='5000'/g, "min='1' max='60'")
            .replace(/Shop Cost Gate Amount/g, 'Primary Drop Monster Gate Amount')
            .replace(/X-hours/g, 'X-minutes');
        return shopBlock + dropBlock;
    }
);

// ── 8. Validation ──
code = code.replace(
    /rules\[rule\] = \$\(extraFilter \+ '\.shop-cost-gate-input'\)\.val\(\);\n(\s+\} else \{)\n(\s+rules\[rule\])/,
    `rules[rule] = $(extraFilter + '.shop-cost-gate-input').val();
        } else if (rule === 'Primary Drop Monster Gate Amount') {
            if ($(extraFilter + '.primary-drop-gate-input').val() < 1 || !$(extraFilter + '.primary-drop-gate-input').val()) {
                $(extraFilter + '.primary-drop-gate-input').val(1);
            }
            if ($(extraFilter + '.primary-drop-gate-input').val() > 60) {
                $(extraFilter + '.primary-drop-gate-input').val(60);
            }
            rules[rule] = $(extraFilter + '.primary-drop-gate-input').val();
$1\n$2`
);

// ── Verify ──
const checks = {
    'Rule defaults': code.includes('"Primary Drop Monster Gate": false') && code.includes('"Primary Drop Monster Gate Amount": "3"'),
    'Description': code.includes('X-minutes minutes'),
    'Category': code.includes('"Primary Drop Monster Gate": true'),
    'Worker data': (code.match(/primaryDropGateMinutes/g) || []).length,
    'Filter exclusions': (code.match(/Primary Drop Monster Gate Amount'\)/g) || []).length,
    'Main rule blocks': mainCount,
    'Sub rule blocks': subCount,
    'Input class count': (code.match(/primary-drop-gate-input/g) || []).length,
    'Validation': code.includes("rule === 'Primary Drop Monster Gate Amount'"),
};
const allGood = Object.entries(checks).every(([k, v]) => {
    console.log(`  ${k}: ${v}`);
    return v && v !== 0;
});
if (!allGood) {
    console.log('\nWARNING: Some checks failed!');
    process.exit(1);
}
if (hasCRLF) code = code.replace(/\n/g, '\r\n');  // restore
fs.writeFileSync('index.js', code);
console.log('\nindex.js patched successfully.');




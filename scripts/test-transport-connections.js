const assert = require('assert');
const path = require('path');
const fs = require('fs');

const transportConnectionData = require(path.join(__dirname, '..', 'transport-connections.js'));
const chunkInfo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'chunkpicker-chunkinfo-export.json'), 'utf8'));
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

function normalizeChunkId(chunkId) {
    return chunkId === undefined || chunkId === null ? '' : chunkId.toString();
}

function getDirectTransportDestinationIds(chunkId) {
    const sourceId = normalizeChunkId(chunkId);
    const destinationIds = [];
    if (transportConnectionData.routes && transportConnectionData.routes[sourceId]) {
        Object.keys(transportConnectionData.routes[sourceId]).forEach((destinationId) => {
            destinationIds.push(normalizeChunkId(destinationId));
        });
    }
    return Array.from(new Set(destinationIds));
}

function hasReciprocalTransportConnection(sourceId, destinationId) {
    return getDirectTransportDestinationIds(destinationId).includes(sourceId);
}

function assertTransportChunkExists(chunkId) {
    assert.ok(chunkInfo.chunks[chunkId], `Transport chunk ${chunkId} does not exist in chunk info`);
    assert.ok(chunkInfo.walkableChunks.includes(chunkId), `Transport chunk ${chunkId} is not walkable`);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function selectedOrderFromChunks(chunks) {
    return Object.keys(chunks.selected || {}).sort((a, b) => chunks.selected[a] - chunks.selected[b]);
}

function canMarkChunkRollable(chunks, chunkId, rules = {}, requireWalkable = false) {
    const normalizedChunkId = normalizeChunkId(chunkId);
    return normalizedChunkId !== ''
        && !(chunks.unlocked || {}).hasOwnProperty(normalizedChunkId)
        && !(chunks.selected || {}).hasOwnProperty(normalizedChunkId)
        && !(chunks.potential || {}).hasOwnProperty(normalizedChunkId)
        && !(chunks.blacklisted || {}).hasOwnProperty(normalizedChunkId)
        && (!requireWalkable || (chunkInfo.walkableChunks.includes(normalizedChunkId) && (!rules.F2P || chunkInfo.walkableChunksF2P.includes(normalizedChunkId))));
}

function markChunkRollable(chunks, selectedOrder, chunkId, rules = {}, requireWalkable = false) {
    const normalizedChunkId = normalizeChunkId(chunkId);
    if (!canMarkChunkRollable(chunks, normalizedChunkId, rules, requireWalkable)) {
        return false;
    }
    if (!chunks.selected) {
        chunks.selected = {};
    }
    selectedOrder.push(normalizedChunkId);
    chunks.selected[normalizedChunkId] = selectedOrder.indexOf(normalizedChunkId) + 1;
    return true;
}

function selectAllTransportationForMock(chunks, selectedOrder, rules = {}) {
    let added = 0;
    Object.keys(chunks.unlocked || {}).forEach((sourceId) => {
        getDirectTransportDestinationIds(sourceId).forEach((destinationId) => {
            if (hasReciprocalTransportConnection(sourceId, destinationId) && markChunkRollable(chunks, selectedOrder, destinationId, rules, true)) {
                added++;
            }
        });
    });
    return added;
}

function persistSelectedJson(chunks, selectedOrder) {
    const selectedJson = {};
    Object.keys(chunks.selected || {}).forEach((chunkId) => {
        selectedJson[chunkId] = selectedOrder.indexOf(chunkId) + 1;
    });
    return selectedJson;
}

function simulatePostRollTransportationPersistence(map, rolledChunkId) {
    const chunks = clone(map.chunks);
    const selectedOrder = selectedOrderFromChunks(chunks);
    delete chunks.selected[rolledChunkId];
    selectedOrder.splice(selectedOrder.indexOf(rolledChunkId), 1);
    chunks.unlocked[rolledChunkId] = rolledChunkId;
    selectAllTransportationForMock(chunks, selectedOrder, map.rules);
    return persistSelectedJson(chunks, selectedOrder);
}

console.log('=== Transport Connection Test Suite ===\n');

Object.keys(transportConnectionData.routes || {}).forEach((sourceId) => {
    assertTransportChunkExists(sourceId);
    Object.keys(transportConnectionData.routes[sourceId]).forEach((destinationId) => {
        assertTransportChunkExists(destinationId);
        assert.ok(hasReciprocalTransportConnection(sourceId, destinationId), `${sourceId} -> ${destinationId} is missing a reciprocal route`);
    });
});

assert.ok(!transportConnectionData.networks, 'Transport data should use explicit routes, not generated networks');

assert.ok(getDirectTransportDestinationIds('7225').includes('12082'), 'Port Piscarilius should have a direct Veos boat to Port Sarim');
[
    '11058', // Brimhaven
    '11061', // Catherby
    '10284', // Corsair Cove
    '11825', // Musa Point
    '10545'  // Port Khazard
].forEach((destinationId) => {
    assert.ok(getDirectTransportDestinationIds('7225').includes(destinationId), `Port Piscarilius should have a curated charter route to ${destinationId}`);
    assert.ok(hasReciprocalTransportConnection('7225', destinationId), `Port Piscarilius charter route to ${destinationId} should be reciprocal`);
});
assert.ok(!getDirectTransportDestinationIds('7225').includes('12081'), 'Port Piscarilius should not use the generated charter route to Port Sarim');
assert.ok(!getDirectTransportDestinationIds('7225').includes('5941'), 'Port Piscarilius should not use one-way Land\'s End travel without reciprocal data');
assert.ok(getDirectTransportDestinationIds('12081').includes('11058'), 'Port Sarim charter should reach Brimhaven');
assert.ok(getDirectTransportDestinationIds('11058').includes('12081'), 'Brimhaven charter should reach Port Sarim');
assert.ok(getDirectTransportDestinationIds('13105').includes('12588'), 'Al Kharid ferry should reach Ruins of Unkah');
assert.ok(getDirectTransportDestinationIds('12588').includes('13105'), 'Ruins of Unkah ferry should reach Al Kharid');
assert.ok(!getDirectTransportDestinationIds('7225').includes('7225'), 'Transport routes should not include the source chunk as a destination');

const iwilPostPiscariliusMock = {
    rules: { F2P: false },
    chunks: {
        unlocked: {
            '7225': '7225',
            '12082': '12082'
        },
        selected: {
            '12083': 1,
            '12081': 2,
            '11826': 3,
            '11825': 4,
            '11316': 5,
            '10537': 6,
            '6967': 7,
            '5941': 8
        },
        potential: {},
        blacklisted: {}
    }
};
const persistedSelectedAfterRoll = simulatePostRollTransportationPersistence(iwilPostPiscariliusMock, '6967');
[
    '11058', // Brimhaven
    '11061', // Catherby
    '10284', // Corsair Cove
    '10545'  // Port Khazard
].forEach((destinationId) => {
    assert.ok(persistedSelectedAfterRoll.hasOwnProperty(destinationId), `Post-roll whole-map transportation should persist Port Piscarilius charter destination ${destinationId}`);
});
assert.ok(persistedSelectedAfterRoll.hasOwnProperty('11825'), 'Post-roll transportation should preserve already-selected Musa Point');
assert.ok(!persistedSelectedAfterRoll.hasOwnProperty('6967'), 'Rolled chunk should move out of selected chunks in the mock');
assert.ok(/if \(postRollRollableChunksAdded > 0\) {\s*setData\(\);\s*}/.test(indexSource), 'Post-roll rollable chunks added after task calculation should be persisted');

const sailingOnlyOrRequirementGatedCharterChunks = [
    '5678', // Aldarin
    '6961', // Civitas illa Fortis
    '7723', // Deepfin Point
    '11823', // Karamja Shipyard
    '14637', // Mos Le'Harmless
    '14646', // Port Phasmatys
    '7475', // Port Roberts
    '8496', // Port Tyras
    '8500', // Prifddinas
    '5934', // Sunset Coast
    '12078', // The Pandemonium
    '12581' // The Summer Shore
];
Object.keys(transportConnectionData.routes).forEach((sourceId) => {
    assert.ok(!sailingOnlyOrRequirementGatedCharterChunks.includes(sourceId), `${sourceId} should not be a transport source yet`);
    getDirectTransportDestinationIds(sourceId).forEach((destinationId) => {
        assert.ok(!sailingOnlyOrRequirementGatedCharterChunks.includes(destinationId), `${destinationId} should not be a transport destination yet`);
    });
});

console.log('All transport connection tests passed.');

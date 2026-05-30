(function(root) {
    const HISCORE_ENDPOINT = 'https://oldschool.runescape.wiki/cors/m=hiscore_oldschool/index_lite.json?player=';
    const OSRS_HISCORE_SKILLS = [
        'Overall',
        'Attack',
        'Defence',
        'Strength',
        'Hitpoints',
        'Ranged',
        'Prayer',
        'Magic',
        'Cooking',
        'Woodcutting',
        'Fletching',
        'Fishing',
        'Firemaking',
        'Crafting',
        'Smithing',
        'Mining',
        'Herblore',
        'Agility',
        'Thieving',
        'Slayer',
        'Farming',
        'Runecraft',
        'Hunter',
        'Construction',
        'Sailing'
    ];

    function normalizeCharacterName(name) {
        return (name || '').toString().trim().replace(/\s+/g, ' ');
    }

    function isValidCharacterName(name) {
        const normalizedName = normalizeCharacterName(name);
        return normalizedName === '' || (normalizedName.length <= 12 && /^[a-zA-Z0-9 _]+$/.test(normalizedName));
    }

    function buildHiscoreUrl(name) {
        return HISCORE_ENDPOINT + encodeURIComponent(normalizeCharacterName(name).replace(/\s+/g, '_'));
    }

    function parseHiscoreSkillLevels(data) {
        if (!data || !Array.isArray(data.skills)) {
            throw new Error('Hiscore response did not include a skills array');
        }

        return data.skills.reduce((levels, skill, index) => {
            const skillName = skill.name || OSRS_HISCORE_SKILLS[index];
            const level = parseInt(skill.level, 10);
            if (skillName && skillName !== 'Overall' && Number.isFinite(level) && level >= 0) {
                levels[skillName] = level;
            }
            return levels;
        }, {});
    }

    const api = {
        HISCORE_ENDPOINT,
        OSRS_HISCORE_SKILLS,
        normalizeCharacterName,
        isValidCharacterName,
        buildHiscoreUrl,
        parseHiscoreSkillLevels
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.HiscoreUtils = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);

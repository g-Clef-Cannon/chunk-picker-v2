const tooltipTexts = {
    'questCapTooltip': `<b>Max skill levels required by quests:</b><br />Firemaking: 75, Magic: 75, Mining: 72, Thieving: 72, Woodcutting: 71, Crafting: 70, Ranged: 70, Hunter: 70, Herblore: 70, Construction: 70, Agility: 70, Smithing: 70, Cooking: 70, Strength: 70, Hitpoints: 70, Farming: 70, Slayer: 69, Defence: 65, Fishing: 65, Fletching: 60, Runecraft: 60, Attack: 50, Prayer: 50, Sailing: 45`,
    'diaryCapTooltip': `<b>Max skill levels required by diaries:</b><br />Magic: 96, Fishing: 96, Cooking: 95, Fletching: 95, Slayer: 95, Thieving: 91, Farming: 91, Smithing: 91, Runecraft: 91, Agility: 90, Herblore: 90, Woodcutting: 90, Firemaking: 85, Crafting: 85, Mining: 85, Prayer: 85, Construction: 78, Sailing: 78, Strength: 76, Ranged: 70, Defence: 70, Hitpoints: 70, Hunter: 69, Attack: 42`,
    'neighborsTooltip': `When a chunk is rolled, after tasks finish calculating, all actually accessible chunks that neighbour one of your unlocked chunks will be marked as rollable. This method takes into account Chunk Sections and other pathing, and will only mark chunks as rollable if you can directly enter them from an unlocked chunk.<br /><br />This method by itself will not mark any chunks that are accessible by means other than walking from your unlocked chunks (teleports, ships, canoes, etc.)`,
    'transportationTooltip': `When a chunk is rolled, direct two-way boat, ferry, and curated charter destinations from your unlocked chunks can be marked as rollable. Sailing-only and requirement-gated charter destinations are excluded unless they have a separately verified boat route. This does not chain through newly rollable destination chunks; a destination must be rolled before its own transportation routes are considered.`,
    'questsColorTooltip': `<div>Quests in <span style="color:green">green</span> indicate a quest that you can complete within your chunks.</div><hr /><div>Quests in <span style="color:yellow">yellow</span> indicate a quest that can be started, but not completed within your chunks.</div><hr /><div>Quests in <span style="color:grey">grey</span> indicate a quest that cannot be started yet.</div>`,
    'diariesColorTooltip': `<div>Diary tiers in <span style="color:green">green</span> indicate a diary that you can complete within your chunks.</div><hr /><div>Diary tiers in <span style="color:yellow">yellow</span> indicate a diary that can be started, but not completed within your chunks.</div><hr /><div>Diary tiers in <span style="color:grey">grey</span> indicate a diary that cannot be started yet.</div>`,
    'slayerColorTooltip': `<div>Slayer Tasks in <span style="color:green">green</span> indicate a task that can be both assigned to you and is completable within your chunks.</div><hr /><div>Slayer Tasks in <span style="color:yellow">yellow</span> indicate a task that can be assigned to you, but isn't completable within your chunks.</div><hr /><div>Slayer Tasks in <span style="color:grey">grey</span> indicate a task that cannot be assigned to you yet.</div>`,
    'questHelpTooltip': `Quests in <b>bold</b> indicate the quest is started in this chunk.`,
    'searchTermsTooltips': `~food, ~boost, ~tool, ~warm, ~light, ~boss, ~saradomin, ~zamorak, ~bandos, ~armadyl, ~zaros, ~agility, ~construction, ~cooking, ~crafting, ~farming, ~firemaking, ~fishing, ~fletching, ~herblore, ~hunter, ~mining, ~prayer, ~runecraft, ~sailing, ~slayer, ~smithing, ~thieving, ~woodcutting, ~items, ~monsters, ~npcs, ~objects, ~shops`,
    'sectionHelpTooltip': `<i><b>What are Chunk Sections?</b></i> Chunk Sections are the little pieces that make up a whole chunk, for when a chunk is not fully continous. When a fence or river cuts through a chunk and prevents you from being able to access parts of it, that's a Chunk Section. Indicating what parts of a chunk you have access to helps the Chunk Task calculation be as accurate as it can be, not giving you tasks for things in your chunk you can't access.<br /><br />The website automatically figures out what parts of all your chunks you have access to, but sometimes it will get stuck and ask you to indicate what parts of a chunk you can access. <b>It is not necessary for you to manually do this for every chunk, only if the website asks you for help or if you need to correct something it got wrong.</b><br /><br />The recommended way to use Chunk Sections is to mark any sections you can access in a chunk when the website prompts you to, and to otherwise leave other sections set to 'Automatic'.`,
    'multiStepProcessingRuleTooltip': `Turning this rule on will enable the ability for items that are a product of processing via a skill task to count as a trigger for a further processing skill task, either in the same skill or a different skill.<br /><br />For example, having this rule on allows for situations like smelting iron ore into an iron bar, and then smithing it into a smithed product. Another example would be cutting an uncut gem with Crafting, and then chiselling the gem into bolt tips with Fletching.`,
    'wieldCraftedItemsOverrideRuleTooltip': `Turning this rule on will enable situations where higher processing skill levels than otherwise necessary could be required due to an equipable output product. <i>Note that if the Highest Processing rule is enabled, turning this rule on would be redundant and is not necessary.</i><br /><br />For example, with this rule enabled, if you would typically only be required to get 70 Smithing to smith an adamant dagger, but a smithed adamant platebody would be BiS for you, you'd be required to get 88 Smithing instead for the platebody.`,
    'slayerOverlayTooltip': `This overlay will show a list of chunks that your currently locked Slayer task <i>could</i> be completed in. If you are not Slayer Locked (in the Activity Info window), no overlays will be shown.<br /><br />Note that monster locations not on the overworld map will be marked on the most applicable overworld chunk instead (for example, monsters in Zanaris will be marked via the Lumbridge East Swamp chunk). In addition, the 'Within unlocked chunks only' filter does not affect this overlay.`,
    'slayerLockingTooltip': `<i><b>What is Slayer Locking?</b></i> When receiving a slayer task from a slayer master, if you're unable to complete the task within your unlocked chunks, you are now Slayer Locked.<br /><br />This interface allows you to select if you have gotten Slayer Locked, and provide your currently reached Slayer level and what task you got locked by, so that the Chunk Picker can account for you being locked.<br /><br />Your Slayer Lock will be automatically removed once you unlock a way to complete your locked task, or can be manually unlocked at any time.`
};

let showTooltip = function(content, id, position, width) {
    let target = $(`#${id}.tooltip-base-el`);
    let tooltip = $('.custom-tooltiptext');
    if (tooltipTexts.hasOwnProperty(content)) {
        content = tooltipTexts[content];
    }
    tooltip.html(content).css('width', width);
    let topPos = target.offset().top + (target.outerHeight() / 2);
    let leftPos = target.offset().left + (target.outerWidth() / 2);
    if (position === 'right') {
        topPos -= (tooltip.outerHeight() / 2);
        leftPos += ((target.outerWidth() / 2) + 10);
    } else if (position === 'left') {
        topPos -= (tooltip.outerHeight() / 2);
        leftPos -= (tooltip.outerWidth() + (target.outerWidth() / 2) + 10);
    } else if (position === 'top') {
        topPos -= (tooltip.outerHeight() + (target.outerHeight() / 2) + 10);
        leftPos -= (tooltip.outerWidth() / 2);
    } else if (position === 'bottom') {
        topPos += ((target.outerHeight() / 2) + 10);
        leftPos -= (tooltip.outerWidth() / 2);
    }
    let originalPos = true;
    if (topPos < 0) {
        topPos = 0;
        originalPos = false;
    }
    if (leftPos < 0) {
        leftPos = 0;
        originalPos = false;
    }
    if (topPos + tooltip.outerHeight() > $(window).height()) {
        topPos = $(window).height() - tooltip.outerHeight();
        originalPos = false;
    }
    if (leftPos + tooltip.outerWidth() > $(window).width()) {
        leftPos = $(window).width() - tooltip.outerWidth();
        originalPos = false;
    }
    tooltip.css({ 'visibility': 'visible', 'top': topPos, 'left': leftPos }).removeClass('left-tooltip right-tooltip top-tooltip bottom-tooltip')
    originalPos && tooltip.addClass(`${position}-tooltip`);
}

let hideTooltip = function() {
    $('.custom-tooltiptext').css('visibility', 'hidden');
}

window.tooltip = {
    generate(content, baseEl, id, position = 'top', width = '220px') {
        return `<span id="${id}" class="tooltip-base-el" onmouseover="showTooltip('${content}', '${id}', '${position}', '${width}')" onmouseout="hideTooltip()" onclick="return">${baseEl}</span>`;
    }
};

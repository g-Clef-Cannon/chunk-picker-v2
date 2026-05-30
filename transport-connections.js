var transportConnectionData = {
    routes: {
        "7225": {
            "12082": { method: "boat", name: "Veos boat to Port Sarim", source: "https://oldschool.runescape.wiki/w/Veos" },
            "11058": { method: "charter", name: "Charter ship to Brimhaven", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11061": { method: "charter", name: "Charter ship to Catherby", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "10284": { method: "charter", name: "Charter ship to Corsair Cove", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11825": { method: "charter", name: "Charter ship to Musa Point", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "10545": { method: "charter", name: "Charter ship to Port Khazard", source: "https://oldschool.runescape.wiki/w/Charter_ship" }
        },
        "12082": {
            "7225": { method: "boat", name: "Veos boat to Port Piscarilius", source: "https://oldschool.runescape.wiki/w/Veos" },
            "10537": { method: "boat", name: "Pest Control boat", source: "https://oldschool.runescape.wiki/w/Ship" },
            "11316": { method: "boat", name: "Entrana ship", source: "https://oldschool.runescape.wiki/w/Ship" },
            "11825": { method: "boat", name: "Musa Point ship", source: "https://oldschool.runescape.wiki/w/Ship" },
            "5941": { method: "boat", name: "Land's End ship", source: "https://oldschool.runescape.wiki/w/Ship" }
        },
        "10537": {
            "12082": { method: "boat", name: "Pest Control boat", source: "https://oldschool.runescape.wiki/w/Ship" }
        },
        "11316": {
            "12082": { method: "boat", name: "Entrana ship", source: "https://oldschool.runescape.wiki/w/Ship" }
        },
        "11825": {
            "12082": { method: "boat", name: "Musa Point ship", source: "https://oldschool.runescape.wiki/w/Ship" },
            "7225": { method: "charter", name: "Charter ship to Port Piscarilius", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11058": { method: "charter", name: "Charter ship to Brimhaven", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11061": { method: "charter", name: "Charter ship to Catherby", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "10284": { method: "charter", name: "Charter ship to Corsair Cove", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "10545": { method: "charter", name: "Charter ship to Port Khazard", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "12081": { method: "charter", name: "Charter ship to Port Sarim", source: "https://oldschool.runescape.wiki/w/Charter_ship" }
        },
        "5941": {
            "12082": { method: "boat", name: "Land's End ship", source: "https://oldschool.runescape.wiki/w/Ship" }
        },
        "10547": {
            "11058": { method: "boat", name: "Captain Barnaby ship to Brimhaven", source: "https://oldschool.runescape.wiki/w/Captain_Barnaby" },
            "11570": { method: "boat", name: "Captain Barnaby ship to Rimmington", source: "https://oldschool.runescape.wiki/w/Captain_Barnaby" }
        },
        "11058": {
            "10547": { method: "boat", name: "Captain Barnaby ship to Ardougne", source: "https://oldschool.runescape.wiki/w/Captain_Barnaby" },
            "11570": { method: "boat", name: "Captain Barnaby ship to Rimmington", source: "https://oldschool.runescape.wiki/w/Captain_Barnaby" },
            "7225": { method: "charter", name: "Charter ship to Port Piscarilius", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11061": { method: "charter", name: "Charter ship to Catherby", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "10284": { method: "charter", name: "Charter ship to Corsair Cove", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11825": { method: "charter", name: "Charter ship to Musa Point", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "10545": { method: "charter", name: "Charter ship to Port Khazard", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "12081": { method: "charter", name: "Charter ship to Port Sarim", source: "https://oldschool.runescape.wiki/w/Charter_ship" }
        },
        "11570": {
            "10547": { method: "boat", name: "Captain Barnaby ship to Ardougne", source: "https://oldschool.runescape.wiki/w/Captain_Barnaby" },
            "11058": { method: "boat", name: "Captain Barnaby ship to Brimhaven", source: "https://oldschool.runescape.wiki/w/Captain_Barnaby" },
            "10284": { method: "boat", name: "Cabin Boy Colin boat to Corsair Cove", source: "https://oldschool.runescape.wiki/w/Ship" }
        },
        "10284": {
            "11570": { method: "boat", name: "Cabin Boy Colin boat to Rimmington", source: "https://oldschool.runescape.wiki/w/Ship" },
            "7225": { method: "charter", name: "Charter ship to Port Piscarilius", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11058": { method: "charter", name: "Charter ship to Brimhaven", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11061": { method: "charter", name: "Charter ship to Catherby", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11825": { method: "charter", name: "Charter ship to Musa Point", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "10545": { method: "charter", name: "Charter ship to Port Khazard", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "12081": { method: "charter", name: "Charter ship to Port Sarim", source: "https://oldschool.runescape.wiki/w/Charter_ship" }
        },
        "11061": {
            "7225": { method: "charter", name: "Charter ship to Port Piscarilius", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11058": { method: "charter", name: "Charter ship to Brimhaven", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "10284": { method: "charter", name: "Charter ship to Corsair Cove", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11825": { method: "charter", name: "Charter ship to Musa Point", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "10545": { method: "charter", name: "Charter ship to Port Khazard", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "12081": { method: "charter", name: "Charter ship to Port Sarim", source: "https://oldschool.runescape.wiki/w/Charter_ship" }
        },
        "10545": {
            "7225": { method: "charter", name: "Charter ship to Port Piscarilius", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11058": { method: "charter", name: "Charter ship to Brimhaven", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11061": { method: "charter", name: "Charter ship to Catherby", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "10284": { method: "charter", name: "Charter ship to Corsair Cove", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11825": { method: "charter", name: "Charter ship to Musa Point", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "12081": { method: "charter", name: "Charter ship to Port Sarim", source: "https://oldschool.runescape.wiki/w/Charter_ship" }
        },
        "12081": {
            "11058": { method: "charter", name: "Charter ship to Brimhaven", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11061": { method: "charter", name: "Charter ship to Catherby", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "10284": { method: "charter", name: "Charter ship to Corsair Cove", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "11825": { method: "charter", name: "Charter ship to Musa Point", source: "https://oldschool.runescape.wiki/w/Charter_ship" },
            "10545": { method: "charter", name: "Charter ship to Port Khazard", source: "https://oldschool.runescape.wiki/w/Charter_ship" }
        },
        "13105": {
            "12588": { method: "ferry", name: "Al Kharid ferry to Ruins of Unkah", source: "https://oldschool.runescape.wiki/w/Ferry" }
        },
        "12588": {
            "13105": { method: "ferry", name: "Ruins of Unkah ferry to Al Kharid", source: "https://oldschool.runescape.wiki/w/Ferry" }
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = transportConnectionData;
}

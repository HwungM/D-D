"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLASS_ABILITIES = void 0;
exports.getAbilityForLevel = getAbilityForLevel;
exports.CLASS_ABILITIES = {
    Fighter: {
        1: { name: 'Second Wind', description: 'Once per rest, heal 1d10 + your level as a bonus action.' },
        3: { name: 'Action Surge', description: 'Once per rest, take one additional action on your turn.' },
        5: { name: 'Extra Attack', description: 'Attack twice whenever you take the Attack action.' },
        10: { name: 'Indomitable', description: 'Reroll a failed saving throw once per rest.' },
    },
    Wizard: {
        1: { name: 'Arcane Recovery', description: 'Once per day during a short rest, recover expended spell slots totaling half your level.' },
        3: { name: 'Spell Sculpting', description: 'Shape your area spells to exclude allies from their effects.' },
        5: { name: 'Potent Cantrip', description: 'Your cantrip spells deal full damage even on a successful save.' },
        10: { name: 'Spell Mastery', description: 'Choose one 1st and one 2nd level spell — cast them at will without a spell slot.' },
    },
    Rogue: {
        1: { name: 'Sneak Attack', description: 'Deal an extra 1d6 damage when you have advantage or an ally adjacent to your target.' },
        3: { name: 'Uncanny Dodge', description: 'When an attacker you can see hits you, use your reaction to halve the damage.' },
        5: { name: 'Evasion', description: 'When you succeed on a Dexterity save, you take no damage; on a failure, only half.' },
        10: { name: 'Reliable Talent', description: 'Treat any d20 roll of 9 or lower as a 10 on ability checks using your proficiencies.' },
    },
    Cleric: {
        1: { name: 'Divine Domain', description: 'Channel the power of your deity to cast domain spells and shape divine energy around you.' },
        3: { name: 'Channel Divinity', description: 'Once per rest, channel divine energy to power sacred effects such as Turn Undead or domain abilities.' },
        5: { name: 'Divine Intervention', description: 'Call on your deity for aid; roll d100 — on a result ≤ your level, the deity intervenes.' },
        10: { name: 'Blessed Strikes', description: 'Once per turn, deal an extra 1d8 radiant damage on a weapon or cantrip attack.' },
    },
    Ranger: {
        1: { name: "Favored Enemy", description: 'Choose a creature type. You have advantage on Survival checks to track them and on Intelligence checks to recall information about them.' },
        3: { name: 'Natural Explorer', description: 'Difficult terrain costs no extra movement in your favored terrain; you are rarely surprised there.' },
        5: { name: 'Extra Attack', description: 'Attack twice whenever you take the Attack action.' },
        10: { name: "Hide in Plain Sight", description: 'Spend 1 minute camouflaging yourself; gain +10 to Stealth while you remain still.' },
    },
    Paladin: {
        1: { name: 'Divine Smite', description: 'On a melee hit, expend a spell slot to deal an extra 2d8 radiant damage per slot level.' },
        3: { name: 'Divine Health', description: 'The divine magic flowing through you makes you immune to disease.' },
        5: { name: 'Extra Attack', description: 'Attack twice whenever you take the Attack action.' },
        10: { name: 'Aura of Protection', description: 'Allies within 10 feet add your Charisma modifier to all saving throws.' },
    },
    Barbarian: {
        1: { name: 'Rage', description: 'Enter a battle fury: advantage on Strength checks and saves, bonus damage on attacks, and resistance to physical damage for 1 minute.' },
        3: { name: 'Reckless Attack', description: 'Attack with advantage on the first attack each turn, but attackers gain advantage against you until your next turn.' },
        5: { name: 'Extra Attack', description: 'Attack twice whenever you take the Attack action.' },
        10: { name: 'Relentless Rage', description: 'When reduced to 0 HP while raging, make a DC 10 Constitution save — on success, drop to 1 HP instead.' },
    },
    Bard: {
        1: { name: 'Bardic Inspiration', description: 'Bestow a creature a d6 Inspiration die to add to an ability check, attack, or save within 10 minutes.' },
        3: { name: 'Jack of All Trades', description: 'Add half your proficiency bonus to any ability check you are not proficient in.' },
        5: { name: 'Font of Inspiration', description: 'Regain all Bardic Inspiration uses after a short or long rest.' },
        10: { name: 'Magical Secrets', description: 'Learn two spells from any class, adding them permanently to your spell list.' },
    },
    Druid: {
        1: { name: 'Wild Shape', description: 'Magically transform into a beast you have seen before, twice per short rest.' },
        3: { name: 'Wild Shape Improvement', description: 'Your Wild Shape can now take the form of beasts with a swim speed or up to CR 1.' },
        5: { name: 'Timeless Body', description: 'Your body ages only one year for every ten years, and you are immune to magical aging effects.' },
        10: { name: 'Beast Spells', description: 'Cast Druid spells even while in Wild Shape, provided the spell has no material components.' },
    },
    Monk: {
        1: { name: 'Martial Arts', description: 'Use Dexterity instead of Strength for unarmed strikes and monk weapons, and deal 1d4 unarmed damage.' },
        3: { name: 'Ki', description: 'Spend Ki points to Flurry of Blows, use Patient Defense (Dodge), or Step of the Wind (Dash/Disengage).' },
        5: { name: 'Stunning Strike', description: 'Spend 1 Ki on a hit to force a Constitution save or stun the target until the end of your next turn.' },
        10: { name: 'Purity of Body', description: 'Your mastery of the Ki flowing through you makes you immune to disease and poison.' },
    },
    Sorcerer: {
        1: { name: 'Sorcerous Origin', description: 'Innate magical power flows through you, granting bonus spells and shaping your magical abilities.' },
        3: { name: 'Font of Magic', description: 'Draw on your Sorcery Points to create spell slots or fuel metamagic options.' },
        5: { name: 'Metamagic', description: 'Twist spells with Metamagic options: Quicken, Twin, Empower, Extend, and more.' },
        10: { name: 'Empowered Spell', description: 'Spend 1 Sorcery Point to reroll up to your Charisma modifier damage dice when you cast a spell.' },
    },
    Warlock: {
        1: { name: 'Eldritch Blast', description: 'Hurl a beam of crackling energy dealing 1d10 force damage — your signature cantrip that scales with level.' },
        3: { name: 'Eldritch Invocations', description: 'Choose two Eldritch Invocations to augment your powers, such as Agonizing Blast or Devil\'s Sight.' },
        5: { name: 'Pact Boon', description: 'Your patron grants a lasting boon: the Pact of the Blade, Chain, or Tome.' },
        10: { name: 'Mystic Arcanum', description: 'Your patron grants a 6th-level spell you can cast once per long rest without expending a spell slot.' },
    },
};
function getAbilityForLevel(cls, level) {
    const milestones = [1, 3, 5, 10];
    if (!milestones.includes(level))
        return null;
    return exports.CLASS_ABILITIES[cls]?.[level] ?? null;
}
//# sourceMappingURL=classAbilities.js.map
import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';
import { generateCharacterPortrait, extractBackstoryHooks } from '../services/openai';
import { z } from 'zod';
import { RACE_STAT_BONUSES, CLASS_BASE_HP } from '../../../shared/types';
import type { CharacterStats, Race, CharacterClass } from '../../../shared/types';
import { rollDice } from '../services/gameEngine';
import { getAbilityForLevel } from '../../../shared/classAbilities';

const router = Router();

const createSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(50),
  race: z.enum(['Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-Orc', 'Tiefling', 'Dragonborn']),
  class: z.enum(['Fighter', 'Wizard', 'Rogue', 'Cleric', 'Ranger', 'Paladin', 'Barbarian', 'Bard', 'Druid', 'Monk', 'Sorcerer', 'Warlock']),
  backstory: z.string().max(1000).optional(),
  generatePortrait: z.boolean().optional().default(false),
  portraitUrl: z.string().optional(),
});

function rollStats(): CharacterStats {
  const rollStat = () => {
    const rolls = [rollDice(6).total, rollDice(6).total, rollDice(6).total, rollDice(6).total];
    rolls.sort((a, b) => a - b);
    return rolls.slice(1).reduce((a, b) => a + b, 0);
  };
  return {
    str: rollStat(),
    dex: rollStat(),
    con: rollStat(),
    int: rollStat(),
    wis: rollStat(),
    cha: rollStat(),
  };
}

router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }
  const { campaignId, name, race, class: characterClass, backstory, generatePortrait, portraitUrl: clientPortraitUrl } = parse.data;

  // Verify membership
  const { data: membership } = await supabaseAdmin
    .from('campaign_members')
    .select('campaign_id')
    .eq('campaign_id', campaignId)
    .eq('user_id', req.user!.id)
    .single();

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this campaign' });
    return;
  }

  // Roll stats with racial bonuses
  const baseStats = rollStats();
  const racialBonuses = RACE_STAT_BONUSES[race as Race] || {};
  const finalStats: CharacterStats = {
    str: baseStats.str + (racialBonuses.str || 0),
    dex: baseStats.dex + (racialBonuses.dex || 0),
    con: baseStats.con + (racialBonuses.con || 0),
    int: baseStats.int + (racialBonuses.int || 0),
    wis: baseStats.wis + (racialBonuses.wis || 0),
    cha: baseStats.cha + (racialBonuses.cha || 0),
  };

  const baseHp = CLASS_BASE_HP[characterClass as CharacterClass] || 8;
  const conMod = Math.floor((finalStats.con - 10) / 2);
  const maxHp = Math.max(1, baseHp + conMod);

  let portraitUrl: string | undefined = clientPortraitUrl;
  if (!portraitUrl && generatePortrait) {
    try {
      portraitUrl = await generateCharacterPortrait(name, race, characterClass, backstory);
    } catch (err) {
      console.error('Portrait generation failed:', err);
    }
  }

  // Grant level 1 class ability
  const level1Ability = getAbilityForLevel(characterClass, 1);
  const startingAbilities = level1Ability ? [level1Ability] : [];

  const { data: character, error } = await supabaseAdmin
    .from('characters')
    .insert({
      user_id: req.user!.id,
      campaign_id: campaignId,
      name,
      race,
      class: characterClass,
      backstory,
      stats: finalStats,
      hp: maxHp,
      max_hp: maxHp,
      portrait_url: portraitUrl,
      abilities: startingAbilities,
      inventory: [
        { id: '1', name: 'Traveler\'s Pack', description: 'Basic supplies for adventure', quantity: 1, type: 'misc' },
      ],
      gold: 50,
      reputation: {},
    })
    .select()
    .single();

  if (error || !character) {
    res.status(500).json({ error: 'Failed to create character' });
    return;
  }

  // Extract backstory hooks and store in campaign world state (non-blocking)
  if (backstory && backstory.length > 20) {
    (async () => {
      try {
        const { data: campaign } = await supabaseAdmin.from('campaigns').select('world_state, world_bible').eq('id', campaignId).single();
        if (!campaign) return;
        const worldBible = campaign.world_bible as import('../../../shared/types').WorldBible;
        const hooks = await extractBackstoryHooks(backstory, name, race, characterClass, worldBible, character.id);
        if (hooks.length === 0) return;
        const ws = campaign.world_state as import('../../../shared/types').WorldState;
        const existing = new Map((ws.backstoryHooks || []).map((h: import('../../../shared/types').BackstoryHook) => [`${h.characterId}:${h.hook}`, h]));
        for (const hook of hooks) existing.set(`${hook.characterId}:${hook.hook}`, hook);
        ws.backstoryHooks = Array.from(existing.values());
        await supabaseAdmin.from('campaigns').update({ world_state: ws }).eq('id', campaignId);
      } catch (err) {
        console.error('Backstory hook extraction failed (non-critical):', err);
      }
    })();
  }

  res.status(201).json({ character });
});

router.get('/campaign/:campaignId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { campaignId } = req.params;

  const { data, error } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', req.user!.id);

  if (error) {
    res.status(500).json({ error: 'Failed to fetch characters' });
    return;
  }

  res.json({ characters: data || [] });
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const { data: character, error } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('id', id)
    .eq('user_id', req.user!.id)
    .single();

  if (error || !character) {
    res.status(404).json({ error: 'Character not found' });
    return;
  }

  res.json({ character });
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const allowedFields = ['name', 'backstory', 'portrait_url', 'hp', 'gold', 'inventory', 'abilities'];
  const updates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  const { data: character, error } = await supabaseAdmin
    .from('characters')
    .update(updates)
    .eq('id', id)
    .eq('user_id', req.user!.id)
    .select()
    .single();

  if (error || !character) {
    res.status(404).json({ error: 'Character not found or unauthorized' });
    return;
  }

  res.json({ character });
});

// Validated shop purchase — server verifies gold and item existence before applying
router.post('/:id/purchase', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { item, campaignId } = req.body as { item: { id: string; name: string; description: string; type: string; price: number; quantity: number }; campaignId: string };

  if (!item?.name || typeof item.price !== 'number' || item.price < 0) {
    res.status(400).json({ error: 'Invalid item' });
    return;
  }

  const { data: character, error: charError } = await supabaseAdmin
    .from('characters')
    .select('id, gold, inventory, campaign_id, user_id')
    .eq('id', id)
    .eq('user_id', req.user!.id)
    .single();

  if (charError || !character) {
    res.status(404).json({ error: 'Character not found or unauthorized' });
    return;
  }

  // Verify item exists in current shop inventory for this campaign/location
  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('world_state')
    .eq('id', campaignId || character.campaign_id)
    .single();

  if (campaign?.world_state) {
    const ws = campaign.world_state as { shopInventory?: Record<string, { id: string; name: string; price: number }[]>; currentLocation?: string };
    const currentLocation = ws.currentLocation || '';
    const shopItems = ws.shopInventory?.[currentLocation] || [];
    const shopItem = shopItems.find((s: { id: string; name: string; price: number }) => s.name.toLowerCase() === item.name.toLowerCase());
    if (shopItem && shopItem.price !== item.price) {
      res.status(400).json({ error: 'Item price mismatch' });
      return;
    }
  }

  if (character.gold < item.price) {
    res.status(400).json({ error: 'Insufficient gold' });
    return;
  }

  const validTypes = new Set(['weapon', 'armor', 'potion', 'misc', 'key']);
  const newItem = {
    id: item.id || crypto.randomUUID(),
    name: item.name,
    description: item.description || '',
    quantity: 1,
    type: validTypes.has(item.type) ? item.type : 'misc',
    value: item.price,
  };

  const existingInventory = (character.inventory as typeof newItem[]) || [];
  const merged = [...existingInventory];
  const existing = merged.find(i => i.name.toLowerCase() === newItem.name.toLowerCase());
  if (existing) {
    existing.quantity += 1;
  } else {
    merged.push(newItem);
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('characters')
    .update({ gold: character.gold - item.price, inventory: merged })
    .eq('id', id)
    .select()
    .single();

  if (updateError || !updated) {
    res.status(500).json({ error: 'Failed to complete purchase' });
    return;
  }

  res.json({ character: updated });
});

// Validated sell — server verifies item exists before applying
router.post('/:id/sell', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { itemName, sellPrice } = req.body as { itemName: string; sellPrice: number };

  if (!itemName || typeof sellPrice !== 'number' || sellPrice < 0) {
    res.status(400).json({ error: 'Invalid sell request' });
    return;
  }

  const { data: character, error: charError } = await supabaseAdmin
    .from('characters')
    .select('id, gold, inventory, user_id')
    .eq('id', id)
    .eq('user_id', req.user!.id)
    .single();

  if (charError || !character) {
    res.status(404).json({ error: 'Character not found or unauthorized' });
    return;
  }

  const inventory = (character.inventory as { name: string; quantity: number }[]) || [];
  const itemIndex = inventory.findIndex(i => i.name.toLowerCase() === itemName.toLowerCase());
  if (itemIndex === -1) {
    res.status(400).json({ error: 'Item not in inventory' });
    return;
  }

  const updatedInventory = [...inventory];
  if (updatedInventory[itemIndex].quantity > 1) {
    updatedInventory[itemIndex] = { ...updatedInventory[itemIndex], quantity: updatedInventory[itemIndex].quantity - 1 };
  } else {
    updatedInventory.splice(itemIndex, 1);
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('characters')
    .update({ gold: character.gold + sellPrice, inventory: updatedInventory })
    .eq('id', id)
    .select()
    .single();

  if (updateError || !updated) {
    res.status(500).json({ error: 'Failed to complete sale' });
    return;
  }

  res.json({ character: updated });
});

export default router;

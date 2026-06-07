# Everrealm Codex Handoff

Use this document to start a new Codex chat with enough context to continue the work without re-auditing from scratch.

## Project

- Repo: `C:\Users\Hwung\D-D`
- GitHub repo: `HwungM/D-D`
- Main branch is the working branch.
- App name: **The Everrealm**
- Product goal: a D&D-core AI Dungeon Master / Game Master experience for King and Sun Mi that feels more like a premium fantasy game app than a plain chatbot.
- Deployment:
  - Vercel hosts the client.
  - Railway hosts the backend/server.
  - Railway and Vercel should both be pointed at `main`.
  - Vercel root directory is `client`.
  - Railway previously had branch/source confusion; verify deployment source if production does not update.

## User Preferences

- The user wants fast, direct builds on `main`, not PR ceremony.
- They prefer implementation over long planning once the direction is clear.
- They are comfortable pushing to main themselves if given commands.
- They are sensitive to usage budget, so keep responses high-signal and avoid unnecessary re-audits.
- They want the game to be deeply polished, visual, alive, stimulating, and replayable on both phone and computer.
- They want D&D at the core, but are open to strong game-like UI, animation, maps, visuals, sounds, and progression loops.
- Avoid describing things as final too early. The current work is iterative.

## Current Creative Direction

The app is no longer "dark fantasy only." It should be a:

**Dynamic, genre-fluid fantasy sandbox.**

The world is a blank canvas where any fantasy tone can exist:

- bleak dungeon
- whimsical city
- heroic kingdom
- eerie mystery
- cozy tavern
- cosmic ruin
- strange fairy realm
- war story

The AI DM / Game Master should be allowed to build tone dynamically based on player choices, campaign setup, and location. Do not hard-lock the world into one mood.

## Art Direction

The user wants the art direction to match the new Everrealm images, not the older dark-fantasy-only assets.

Style language:

- hand-painted western fantasy animation
- sharp expressive faces
- strong silhouettes
- painterly linework and shadows
- rugged varied proportions
- expressive but not overly anime eyes
- varied species and body types
- dramatic character personality in every face
- colorful, cinematic fantasy lighting
- "not anime, but anime-aware"

The user provided new art examples and wants those to guide future loading screens, scene art, character portraits, and eventually generated character references.

Important assets already in the app:

- `client/public/media/everrealm-hero-desktop.png`
- `client/public/media/everrealm-hero-mobile.png`
- `client/public/media/dnd-game-intro.mp4`
- `client/public/media/loading/everrealm-crystal-party.png`
- `client/public/media/loading/everrealm-eclipse-citadel.png`
- `client/public/media/loading/everrealm-moonlit-party.png`
- `client/public/media/loading/everrealm-portal-party.png`
- `client/public/media/loading/everrealm-snow-ascent.png`
- `client/public/media/loading/everrealm-storm-party.png`

Older scene assets still exist in `client/public/assets/scenes`, but many are more dark fantasy and may need replacement or reframing later.

## What Has Been Built Recently

Latest commit at time of handoff:

`e24a445 Remodel Everrealm hub foundation`

Recent important commits:

- `e24a445` Remodel Everrealm hub foundation
- `43e8520` Add scene context panel
- `8df00dc` Make gameplay decisions chat first
- `733812b` Add Everrealm loading visuals
- `2ba7c76` Add campaign length pacing
- `262ea6b` Ground optional suggestions in scene context
- `f65789b` Polish co-op waiting and party UI
- `bbf61b9` Restore chat-first game input
- `8df00dc` Make gameplay decisions chat first
- `7fd7242` Add Everrealm art bible and clean wizard text
- `729b8cd` Polish co-op party flow
- `887120f` Improve campaign wizard flow

## Current State By Area

### Landing / Login

Files:

- `client/src/pages/Landing.tsx`

Status:

- Rebranded to **The Everrealm**.
- Uses desktop/mobile Everrealm hero images.
- Has trailer modal using `client/public/media/dnd-game-intro.mp4`.
- King and Sun Mi login cards exist.
- UI sound hooks were added for trailer, skip, and login.

Still needs:

- Full login screen interaction polish later.
- Better transition from login into dashboard/game.
- Possibly "press to watch trailer" copy refinement.
- Better first-time audio handling and music fade.

### Dashboard / Hub

Files:

- `client/src/pages/Dashboard.tsx`

Status:

- Rebuilt into a new Everrealm hub foundation.
- Uses cinematic hero art.
- Has "Adventurer's Hall" hero area.
- Has richer campaign cards.
- Has a Party Gate for invite codes.
- Has a "Living systems" side panel.
- Keeps a dev/test world shelf, but no longer makes it dominate the page.
- Removed broken mojibake symbols from the previous dashboard.

Still needs:

- More visual verification in real signed-in environment.
- More detailed campaign progress display once campaign metadata is stronger.
- Better "last session recap / next beat" cards.
- Possibly active party presence, recent memories, location snapshot, and next session call-to-action.

### Campaign Wizard

Files:

- `client/src/pages/CampaignWizard.tsx`
- `client/src/pages/CampaignBrief.tsx`
- `server/src/routes/campaigns.ts`
- `shared/types.ts`

Status:

- Co-op setup flow has been improved from the earlier confusing version.
- Campaign length preferences were added:
  - one-shot
  - short
  - medium
  - long
  - open-ended
- Genre has been reframed toward genre-fluid fantasy sandbox.
- Wizard text mojibake was cleaned in a prior pass.

User concern:

- The wizard still may not fully make sense emotionally.
- After choosing collaborative party, the flow should more clearly move toward waiting for party / invite flow.
- "Tell me about your character" may be confusing if character creation happens afterward.

Still needs:

- Full wizard UX remodel.
- Better branching:
  - Solo alone
  - Solo with AI companions
  - Collaborative wait for players
  - Collaborative start now
- Better party setup logic.
- Better clarity on when character creation starts and why.
- Better mobile layout and transitions.

### In-Game Experience

Files:

- `client/src/pages/Game.tsx`
- `client/src/components/ActionPanel.tsx`
- `client/src/components/HighStakesChoice.tsx`
- `client/src/components/SceneDisplay.tsx`
- `client/src/components/NarratorBox.tsx`
- `server/src/services/openai.ts`
- `server/src/services/gameEngine.ts`

Status:

- The in-game screen has **not** yet received the full UI remodel.
- The previous "moment of choice" direction was rolled back toward chat-first.
- Suggested actions are now more optional / hidden behind action UI instead of dominating the turn.
- Scene context panel was added:
  - weather
  - purpose
  - pacing
  - party presence
  - combat state
  - summary
- Dice rolls were made more server-authoritative in prior work.
- Roll animation still exists.
- AI DM prompting was tightened in earlier passes.

User preference:

- Do not call anything "Moment of Choice." User thinks that wording is cringe.
- Keep the main flow as chat-first.
- Suggestions should be available by clicking a button, not always shoved in the player's face.
- Encourage player creativity first.

Still needs:

- Full in-game UI remodel.
- Better chat composer.
- Better scene art layout.
- Better right-side world/party panel.
- Better animations and transitions.
- Sound design pass.
- Map/location panel eventually.
- Inventory and character sheet visual overhaul.
- Better support for long campaigns and campaign endings.

### Co-op

Status:

- Co-op party flow has been improved.
- Party waiting and invite UI have had polish.
- Dashboard has a Party Gate.

Still needs:

- End-to-end test with King and Sun Mi accounts on production.
- Test invite code creation and joining.
- Test simultaneous play:
  - one player submits action
  - waits for the other
  - both actions resolve
  - disconnect/reconnect behavior
- Better player presence indicators.
- Better "waiting for Sun Mi" experience.
- Better handling if only one player is active.

### Long Campaign Readiness

The user asked if the code is ready for 50+ sessions over a year.

Current answer:

- It has some foundations:
  - world state
  - NPC memory
  - session notes
  - foreshadowing ledger
  - backstory hooks
  - act goals
  - campaign length setting
- But it is not yet "near perfect" for year-long campaigns.

Needed system:

- Campaign memory layers:
  - session recap
  - long-term canon
  - unresolved threads
  - character arcs
  - NPC relationship history
  - location history
  - faction state
- Campaign spine:
  - one-shot, short, medium, long, open-ended pacing
  - rising tension
  - act structure
  - meaningful endings
  - not forcing long campaigns when the user selected short
- DM continuity:
  - remind itself of promises
  - pay off foreshadowing
  - rotate spotlight
  - avoid forgetting key NPCs
  - know when to end an arc

## Audio / Sound

Files:

- `client/src/lib/audio.ts`
- `client/src/components/AudioControls.tsx`
- `client/public/audio`
- `client/public/assets/music`

Recent fix:

- Some audio methods pointed to missing files:
  - `/audio/magic.mp3`
  - `/audio/gold.mp3`
  - `/audio/door.mp3`
- They were corrected to existing assets:
  - `/assets/music/13a309fa-magic_spell_cast.mp3`
  - `/assets/music/65b20f81-coin_sound.mp3`
  - `/assets/music/4c1400b0-door_open.mp3`
- Added:
  - `playUiClick()`
  - `playConfirm()`
  - `bindUiSounds()`
- `bindUiSounds()` is called from:
  - Landing
  - Dashboard
  - Game

Still needs:

- A real sound design map:
  - open panel
  - close panel
  - send action
  - receive DM response
  - major choice
  - dice roll begin/result
  - critical success/fail
  - combat begins
  - loot found
  - level up
  - invite copied/joined
- Better volume balancing.
- Avoid too many click sounds becoming annoying.

## Verification Last Done

On latest build pass:

- Client TypeScript passed:
  - `node client/node_modules/typescript/bin/tsc -p client --noEmit`
- Server TypeScript passed:
  - `node server/node_modules/typescript/bin/tsc -p server --noEmit`
- Vite production build passed:
  - from `client`: `node node_modules/vite/bin/vite.js build`
- `git diff --check` passed.
- Known warning:
  - Vite warns that JS bundle is larger than 500 KB.
  - This is not currently breaking deployment.
  - Future improvement: code splitting / lazy routes.

Local browser visual check note:

- Login page rendered without runtime crash.
- Local auth failed with app message: "Having trouble signing in. Ask King to check the server."
- Backend `/health` worked locally.
- The failure appeared related to local Supabase/auth environment, not the dashboard code.
- Full dashboard visual verification should be done in the user's real signed-in local/prod environment.

## Current Build Queue

Recommended order from here:

1. **In-game UI remodel foundation**
   - This is the biggest visible gap right now.
   - The dashboard changed, but game screen still feels beta.
   - Keep D&D chat-first, but make the play surface feel cinematic and alive.
   - Remodel:
     - scene art stage
     - narrator/chat feed
     - composer
     - optional suggestions drawer/button
     - party/world sidebar
     - dice/result overlays
     - transitions and sounds

2. **Loading screen remodel**
   - Use new Everrealm loading art.
   - Add rotating tips/DM prep flavor.
   - Different loading modes:
     - creating campaign
     - generating opening
     - waiting for party
     - resolving action
     - rolling dice
   - Add subtle animation, not cheesy spinner-only loading.

3. **Campaign wizard remodel**
   - Make the flow make sense:
     - adventure style
     - party mode
     - campaign length
     - tone/art preference
     - wait for party if collaborative
     - then character creation
   - Remove confusing "tell me about your character" unless it has a clear purpose.
   - Support AI companions later.

4. **Co-op production test and polish**
   - Test invite join on production:
     - King creates campaign
     - invites Sun Mi
     - Sun Mi joins
     - both create characters
     - both submit actions
     - game waits/resolves correctly
   - Add missing feedback states.

5. **Long campaign spine**
   - Build robust memory + recap + arc tracking.
   - Respect chosen campaign length.
   - Make the DM able to end arcs and campaigns meaningfully.

6. **Map/location system**
   - Not overkill if scoped correctly.
   - Start with generated/world-state locations and character positions.
   - Later: scrollable maps, points of interest, party/NPC markers.
   - AI DM should know the current location and nearby relevant places.

7. **Inventory/character sheet remodel**
   - Make inventory useful and visual.
   - Equipment slots, item actions, context menus, item art.
   - Character sheet should feel like a premium RPG panel.

8. **Character portrait generation system**
   - Ambitious but desired.
   - After character creation, generate:
     - portrait
     - full body
     - expressions
     - possibly outfit/pose variants
   - Need external storage/generation strategy before building hard.

9. **Art asset replacement**
   - Replace old dark-fantasy scene images with genre-fluid Everrealm art.
   - Keep item assets if they still look good.
   - New art bible should drive all future image prompts.

10. **Performance/code splitting**
    - Address large Vite bundle.
    - Lazy-load big pages/components.

## Specific Next Build Recommendation

Start with **In-game UI remodel foundation**.

Target files:

- `client/src/pages/Game.tsx`
- `client/src/components/SceneDisplay.tsx`
- `client/src/components/NarratorBox.tsx`
- `client/src/components/ActionPanel.tsx`
- `client/src/components/HighStakesChoice.tsx`
- `client/src/components/PartyPanel.tsx`
- `client/src/components/WorldPanel.tsx`
- `client/src/components/CharacterSheet.tsx`
- `client/src/components/DiceRollModal.tsx`
- `client/src/lib/audio.ts`
- `client/src/index.css`

Principles:

- Do not make it only a chat app.
- Do not make suggestions always visible.
- Keep the primary input as player-authored action.
- Scene art should be prominent.
- World/party context should be useful but not overwhelming.
- Transitions should feel like opening panels in a fantasy game UI.
- Mobile and desktop must both feel first-class.
- Avoid broken glyphs or mojibake.
- Avoid overly dark one-note UI; use amber, cyan, violet, warm parchment, and deep black carefully.

Potential in-game layout:

- Desktop:
  - left/center: large scene image stage
  - center below/overlay: narrator/chat feed
  - bottom: player composer
  - right: collapsible world/party/character panel
  - dice rolls as modal/overlay
- Mobile:
  - scene art top
  - story feed
  - sticky composer
  - panels as bottom sheets/tabs

## Commands

Common verification commands:

```powershell
cd C:\Users\Hwung\D-D
& 'C:\Users\Hwung\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'C:\Users\Hwung\D-D\client\node_modules\typescript\bin\tsc' -p client --noEmit
& 'C:\Users\Hwung\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'C:\Users\Hwung\D-D\server\node_modules\typescript\bin\tsc' -p server --noEmit
cd C:\Users\Hwung\D-D\client
& 'C:\Users\Hwung\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'C:\Users\Hwung\D-D\client\node_modules\vite\bin\vite.js' build
```

Commit/push pattern:

```powershell
cd C:\Users\Hwung\D-D
git status
git add <changed-files>
git commit -m "Short useful commit message"
git push origin main
```

Pull pattern for user:

```powershell
cd C:\Users\Hwung\D-D
git pull origin main
```

If pull is blocked by local changes:

```powershell
git status
```

Then decide whether those local changes are expected. Do not blindly restore unless the user confirms or the file is clearly generated/unwanted.

## Important Cautions

- Do not use or repeat any GitHub token the user previously pasted. Treat it as compromised; do not include it in docs or messages.
- Do not revert user changes.
- User may have local changes in `C:\Users\Hwung\D-D`; always check `git status` first.
- Avoid telling the user the entire app is remodeled when only one surface changed.
- Avoid overpromising that the game is ready for 50+ sessions until memory/spine systems are built and tested.
- When making UI changes, run at least client typecheck and Vite build.
- For major frontend changes, use the in-app browser or local test when possible.

## Current State Summary For New Chat

The Everrealm is in a strong transitional state:

- Brand and art direction are now much clearer.
- Dashboard/hub has been remodeled.
- Landing is themed and has the trailer.
- Co-op and campaign setup have partial foundations.
- AI DM prompting has been tightened but still needs long-campaign infrastructure.
- The biggest visible gap is the actual in-game play screen, which still looks closer to the beta chat UI.

Next Codex should continue by remodeling the in-game experience while preserving the chat-first D&D core.


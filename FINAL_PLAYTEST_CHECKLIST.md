# Final Playtest Checklist

Use this as the human pass after the automated scripted playtest is green.

## Before testing

- Run `npm run check`.
- Run `npm run test:playtest`.
- Open the World tab and confirm the Final Test Readiness panel is visible after one fresh turn.

## Scenarios to try

1. Type "look for a fight."
   - Pass: no enemy appears from nowhere.
   - Pass: World tab audit says the ungrounded fight was blocked.

2. Follow a concrete trail into a fight with multiple enemies.
   - Pass: combat starts only after tracks/witnesses/patrol/hideout/ambush/etc.
   - Pass: every enemy is tracked separately in combat.

3. Defeat, corner, and spare enemies.
   - Pass: People Sheet records each person-like opponent.
   - Pass: relationship stays wary/hostile/bitter, not acquaintance.

4. Try to rush each arc role.
   - Pass: setup acts (Act I, Act IV, Act VII...) wait for a hook or active quest.
   - Pass: escalation acts (Act II, Act V, Act VIII...) wait for goals + high stakes.
   - Pass: climax acts (Act III, Act VI, Act IX...) wait for convergence + combat-free concrete resolution.
   - Pass: long/open-ended campaigns can resolve Act III as a local arc and continue into Act IV instead of ending the whole campaign.

5. Play co-op with Sun Mi.
   - Pass: spotlight does not drift permanently to one player.
   - Pass: World tab audit shows spotlight assignment.

If any pass condition fails, keep the campaign state and inspect the latest World tab audit entry first.

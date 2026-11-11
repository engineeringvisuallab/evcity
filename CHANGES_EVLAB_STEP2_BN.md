# EVLab Step 2: office ar hall default-e khali

- Main Office (desk, reception, meeting room) ar Engineering Lab-e kono manush figure chhilo na, kono change lageni.
- Presentation Hall-er 1000+ audience ager moto shobshomoy dekha jeto. Ekhon default-e hidden.
- `EVLabAudience.ts`: `setPresent(on)` ar `present` add. Default `group.visible = false`, hidden thakle `update()` kono kaj kore na (performance-o bhalo).
- `EVLabManager.ts`: `enterStage()` -> audience dekha jay, `leaveStage()` -> abar hidden.
- Mission-er manush ashar/boshar kaj Step 5, chole jaoa Step 6.
- `scripts/evlab-tower-test.ts`: default khali, mission-e show, shesh-e hide check.

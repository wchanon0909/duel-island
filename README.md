# Duel Island

เวอร์ชันนี้ปรับระบบตัวละครเป็น Hero Selection + AI 3D Models ตามแผนล่าสุด

## Run local

```bash
npm install
npm start
```

เปิด `http://localhost:3000`

## Update ล่าสุด

- ปรับ Lobby เป็นหน้า Hero Selection แบบกริด เลือกตัวละครแล้วมีกรอบ Active
- เอาฟังก์ชันแต่งสี/หมวก/ของหลังออกจาก UI ชั่วคราว
- ล็อก Layout ของ Lobby ไม่ให้ปุ่ม Start Game หลุดจอ เมื่อเพิ่มบอทหลายตัว
- ใช้ตัวละครเฉพาะชุดที่ผู้ใช้กำหนดไว้เท่านั้น:
  - islander
  - islander-girl
  - ninja
  - princess
  - pirate
  - suitguy
  - dino
  - armedguy
- โหลด AI 3D models จาก `public/assets/models/`
- ปรับสเกลโมเดลให้สูงใกล้กัน และยกเท้าให้อยู่เหนือพื้น/วงแหวน
- คง hitbox เดิมไว้ ไม่ให้ตัวละครแต่ละแบบได้เปรียบเสียเปรียบ
- เพิ่มวงแหวน/ฐานสีตาม player color เพื่อแยกผู้เล่น แม้เลือกตัวละครซ้ำกัน
- ตั้งค่าโมเดลให้หันปืนไปทางเดียวกับทิศยิงของเกม โดยใช้ +Z เป็น forward direction

## Notes

`armedguy` ใช้ OBJ + texture เพราะไฟล์ที่ได้รับมาไม่มี GLB ส่วนตัวอื่นใช้ GLB แบบ shaded เพื่อให้เบากว่า PBR และเหมาะกับเว็บเกมมากขึ้น

## Update: orientation and HUD fix
- Rechecked imported AI character orientation so the model gun faces the same direction as the in-game firing laser.
- Changed the End Game control from a full-width top bar into a compact corner button.

## Update: room list, lobby cleanup, hero UX, and game over summary
- Home screen now shows open rooms as clickable cards: room code + host name + mode + player count.
- Host can lock/unlock the room from the lobby with a small lock button. Locked rooms stay visible but cannot be joined by new players.
- Lobby player strip now shows only player names and colored dots, without overlapping hero names or vertical scrolling.
- Hero Selection is compact and non-scroll: all 8 heroes are visible as selection cards without short tags.
- Character preview now spins automatically only; manual rotate/stop buttons were removed.
- Player names above characters are centered text without a background label box.
- Game over screen now shows the winner standing alone on a small stage and includes a kill-count summary table.

## Skill Phase V5 update

- Skill mode no longer has passive selection. Every player starts with `Dodge` once per game.
- Active skills remain: Shotgun, Sniper, Taser, Foresight, Shield.
- Shotgun uses a visible cone aiming preview with max 3-cell range.
- Sniper now renders as a long straight fade beam that disappears over about 2 seconds.
- Taser adds a visible status notice to the affected player in the next round.
- Foresight now opens a temporary spectator-style overview that shows all other players during the placement phase. The user can still reposition/rotate, but will not fire in that round and Taser movement lock still applies.
- Shield blocks one bullet during the round it is used.
- Active skill capacity remains 1 per player. Angel Blessing behavior is unchanged.
- Added phase announcements: placement/action phase, firing order roll phase, shooting phase, and round death summary.
- Bullet travel slows down near a hit target for a short cinematic effect.

## Update: Preview containment fix v6
- Fixed the lobby character preview so the canvas is contained inside the preview card on different screen sizes and browser zoom levels.
- Reduced preview-only model scale and camera framing; gameplay model scale and hitbox are unchanged.
- Preview now resizes from the actual preview frame rather than relying only on canvas CSS size.


## Update: Preview scale readability fix v7
- Character preview now uses a closer camera and dynamic auto-fit scaling.
- Preview characters are larger/readable again while still staying inside the preview card.
- Gameplay character size, hitbox, skills, and phase mechanics are unchanged.

## Update v9 - Preview, Dodge, Shield polish

- Improved the hero preview fit so the 3D character stays readable and closer to equal size across heroes.
- Passive Dodge is now consumed after it saves the player once, then disappears from the skill table.
- Shield remains an Active Skill. When used, it protects the player from one lethal shot in that round and shows a stronger shield effect when blocking.


## v10 Preview Final Fix
- Reworked the lobby hero preview layout so the preview viewport has a stable fixed readable size on desktop screens.
- Reworked preview camera fitting to use normalized character bounds and a safe aspect-ratio clamp so heroes no longer shrink into a tall narrow capsule.
- The preview only affects the lobby; gameplay scale, hitbox, skill behavior, Dodge, Shield, and Foresight logic are unchanged.

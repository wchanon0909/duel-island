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

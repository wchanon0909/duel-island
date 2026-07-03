# Duel Island

เกม 3 มิติมุมสูง ให้ผู้เล่นแอบเดินหาจุดยืน+ทิศทางบนเกาะ แล้วยิงพร้อมกันตอนหมดเวลา เกาะจะเล็กลงทุกรอบจนเหลือผู้รอดคนเดียว

## รันบนเครื่องตัวเอง

```
npm install
npm start
```

เปิด `http://localhost:3000`

## Deploy ขึ้น Render (ฟรี)

1. Push โปรเจกต์นี้ขึ้น GitHub repo
2. เข้า https://render.com สมัคร/ล็อกอินด้วยบัญชี GitHub
3. New > Blueprint > เลือก repo นี้ (จะอ่านค่าใน `render.yaml` ให้อัตโนมัติ) หรือเลือก New > Web Service แล้วตั้งค่าเอง:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. รอ deploy เสร็จ จะได้ URL แบบ `https://duel-island-xxxx.onrender.com` ส่งให้เพื่อนเข้าเล่นได้ทันที

> หมายเหตุ: free tier ของ Render จะ sleep เมื่อไม่มีคนใช้งาน ทำให้การเปิดครั้งแรกช้าประมาณ 30-60 วินาที

## Skill System V2 Roadmap Update

This version adds two game modes:

- Classic mode: basic movement, aiming, and shooting only. Skill logic and skill UI are disabled.
- Skill mode: passive selection before Round 1, active skills from Angel Blessing, skill table, tooltip descriptions, animations, and event log.

### Passive skills

- Bounce Bullet: normal bullets bounce once from walls/objects. Bullets do not bounce from players.
- Dodge: automatically dodges one incoming bullet once per match.
- Second Chance: when hit, the player retreats 3 spaces backward. If this falls outside the island, the player dies. If the player has not fired yet this round, they counter-fire in their current aimed direction.

### Active skills

- Shotgun: cone shot with maximum 3-space range.
- Sniper: long straight precision shot. Dodge and Shield can still protect against it.
- Taser: if it hits, the target cannot move next round but can still turn, shoot, or use skills.
- Foresight: the player skips shooting this round and dodges incoming fire for the round.
- Shield: when used, blocks one bullet in the current round.

### Local run

```bash
npm install
npm start
```

Open `http://localhost:3000`.


## Skill System V2 update - Active Skill reward mechanic

- ผู้เล่นถือ Active Skill ได้สูงสุด 1 สกิลเท่านั้น
- หลังจบรอบ Angel Blessing จะเริ่มตรวจจากผู้เล่นที่เข้าเงื่อนไขท้ายลำดับยิงเดิม
- ถ้าผู้เล่นคนนั้นมี Active Skill อยู่แล้ว ระบบจะเลื่อนสิทธิ์ขึ้นไปยังผู้เล่นลำดับก่อนหน้า
- ถ้าไม่มีผู้เล่นที่มีสิทธิ์และยังไม่มี Active Skill ระบบจะไม่แจกสกิลในรอบนั้น
- เมื่อผู้เล่นได้รับ Active Skill จะมีประกาศกลางจอ
- เมื่อผู้เล่นกดใช้ Active Skill จะมีประกาศกลางจอให้ผู้เล่นทุกคนเห็น
- Animation การ roll ลำดับยิงถูกปรับให้เริ่มหมุนเร็ว แล้วค่อย ๆ ช้าลงก่อนหยุดที่ลำดับจริง

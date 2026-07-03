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

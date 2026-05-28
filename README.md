## ส่วนที่ 2 — System Design & Business Logic

### ข้อ 4: Real-time Live Tracking Architecture

#### 1. Data Flow Protocol (การเลือกโปรโตคอล)
เลือกใช้สถาปัตยกรรมแบบ **Hybrid (MQTT + WebSockets)**
* **ฝั่ง Rider App ไปยังระบบหลังบ้าน (Ingress):** เลือกใช้โปรโตคอล **MQTT** เนื่องจากเป็น Lightweight Publish/Subscribe ที่ออกแบบมาสำหรับ Mobile Network โดยเฉพาะ ช่วยประหยัดแบตเตอรี่ของไรเดอร์ที่ต้องส่งพิกัดถี่ๆ ทุก 2 วินาที และรองรับกรณีเน็ตมือถือหลุดบ่อย (Keep-Alive ต่ำ)
* **ฝั่งหลังบ้านไปยัง Customer App (Egress):** เลือกใช้ **WebSockets** เนื่องจากแอปฝั่งลูกค้าส่วนใหญ่เปิดผ่าน Web Browser หรือ Mobile Client ที่ต้องการ Bi-directional connection แบบมาตรฐาน เชื่อมต่อเข้าสู่ API Gateway ได้ง่ายเพื่อกระจายพิกัดไปแสดงบนแผนที่แบบ Real-time

#### 2. Storage Strategy (กลยุทธ์การจัดเก็บข้อมูล)
การเขียนพิกัดลง Disk ของ Relational DB ทุกๆ 2 วินาที จากไรเดอร์ 2,000 คนจะทำให้เกิด I/O Bottleneck ทันที ทางแก้คือการแบ่ง Layer ข้อมูล:
* **Hot Data Layer (พิกัดปัจจุบัน):** เก็บใน **In-memory Database (Redis)** โดยใช้ฟีเจอร์ **Redis Geospatial (`GEOADD` / `GEOPOS`)** เนื่องจากเก็บใน RAM ทำให้ความเร็วการอ่านเขียนเป็นแบบ $O(1)$ ไม่รบกวนความเร็วของ Disk และใช้คำสั่งดึงไรเดอร์รอบตัวลูกค้าได้ไวมาก
* **Cold Data Layer (ประวัติการเดินทางหลังจบทริป):** เมื่อ Order เสร็จสิ้น ค่อยดึงประวัติเส้นทางทั้งหมดจากหน่วยความจำไปบันทึกเป็นก้อนลงใน **NoSQL Database (เช่น MongoDB หรือ TimescaleDB)** เพื่อนำไปใช้ทำ Data Analytics ย้อนหลัง โดยวิธีนี้จะไม่สร้างภาระให้กับระบบงานหลัก

---

### ข้อ 5: Rush Hour Cancellation Crisis

#### 1. ฟีเจอร์ Dynamic Incentive (โบนัสแปรผันรายพื้นที่)
เพื่อลดอัตราการยกเลิกงาน 25% ในช่วงเร่งด่วน ระบบจะคำนวณ **Supply-Demand Ratio** ในทุกๆ ตารางกิโลเมตรแบบ Real-time:
* หากพื้นที่ใดออเดอร์ค้างสูง แต่ไรเดอร์ในบริเวณนั้นเหลือน้อย ระบบจะประกาศพื้นที่นั้นเป็น **"Surge Zone"** บนหน้าจอแอปของไรเดอร์ทันที 
* เพิ่มค่าธรรมเนียมพิเศษให้ไรเดอร์ (เช่น +20 บาทต่อออเดอร์) โดยกำหนดเวลาจำกัดสั้นๆ เช่น 30 นาที เพื่อกระตุ้นให้ไรเดอร์ในพื้นที่ยอมเปิดรับงาน หรือดึงดูดให้ไรเดอร์นอกพื้นที่ขับเข้ามาช่วยรับงานในบริเวณนี้

#### 2. Data Modeling: Cancellation Log Schema (JSON Schema สำหรับตรวจจับการทุจริต)
```json
{
  "$schema": "[http://json-schema.org/draft-07/schema#](http://json-schema.org/draft-07/schema#)",
  "title": "CancellationLog",
  "type": "object",
  "properties": {
    "log_id": { "type": "string", "format": "uuid" },
    "order_id": { "type": "string", "format": "uuid" },
    "rider_id": { "type": "string" },
    "cancellation_reason_code": { "type": "string", "enum": ["DISTANCE_TOO_FAR", "RESTAURANT_LONG_WAIT", "ACCIDENT", "PASS_ORDER"] },
    "cancelled_by": { "type": "string", "enum": ["RIDER", "CUSTOMER", "SYSTEM"] },
    "location": {
      "type": "object",
      "properties": {
        "lat": { "type": "number" },
        "lng": { "type": "number" }
      },
      "required": ["lat", "lng"]
    },
    "device_metadata": {
      "type": "object",
      "properties": {
        "device_id": { "type": "string" },
        "os_version": { "type": "string" },
        "ip_address": { "type": "string" }
      }
    },
    "created_at": { "type": "string", "format": "date-time" }
  },
  "required": ["log_id", "order_id", "rider_id", "cancellation_reason_code", "location", "created_at"]
}
🤖 ส่วนที่ 3 — AI Implementation & Guardrails
ข้อ 6: AI-Powered Delivery Time Predictor
1. System Prompt สำหรับคำนวณ ETA
Markdown
คุณคือ AI Engine ผู้เชี่ยวชาญด้านการคำนวณเวลาจัดส่งอาหาร (ETA) ของแพลตฟอร์ม Delivery
จงคำนวณเวลาการจัดส่งรวม (หน่วย: นาที) โดยวิเคราะห์จากข้อมูล Input ที่ได้รับอย่างเข้มงวดตามหลักการจริง

[เงื่อนไขทางธุรกิจที่ต้องนำมาคิด]
1. สภาพอากาศ: หากฝนตกหนัก ความเร็วการเดินทางของมอเตอร์ไซค์จะลดลง 40% และให้เพิ่มเวลาในการจอดสวมชุดกันฝนอีก 5 นาที
2. เวลาจัดเตรียมอาหาร: หากร้านอาหารเป็นประเภทปรุงสด ให้บวกเวลาเตรียมอย่างน้อย 15 นาที หากเป็นร้านฟาสต์ฟู้ดคิด 7 นาที
3. ความเร็วเฉลี่ยไรเดอร์ในสภาวะปกติ: 30 กม./ชม. (หรือ 1 กม. ใช้เวลา 2 นาที)

[รูปแบบของข้อมูลนำเข้า (Input JSON)]
{
  "distance_km": 10.0,
  "weather": "heavy_rain",
  "restaurant_type": "fresh_cooked",
  "base_preparation_time_mins": 20
}

[กฎเหล็กในการแสดงผล]
ให้ส่งคืนผลลัพธ์เป็น JSON Object เท่านั้น ห้ามมีข้อความเกริ่นนำหรือลงท้าย โครงสร้างข้อมูลมีดังนี้:
{
  "estimated_delivery_time_mins": integer,
  "breakdown": {
    "preparation_time_mins": integer,
    "travel_time_mins": integer,
    "weather_buffer_mins": integer
  },
  "confidence_score": float (0.0 to 1.0)
}
2. วิธีจัดการเมื่อ AI ทำนายเวลาผิดพลาดอย่างรุนแรง (AI Hallucination)
ระบบวางระบบ Rule-Based Validation Layer (Sanity Check) ไว้ที่ฝั่ง Backend ก่อนนำค่าไปแสดงผล:

ตั้งค่า Mathematical Boundary Check: หากระยะทางจริงคือ 10 กม. ระบบจะคำนวณค่าต่ำสุดทางฟิสิกส์ที่เป็นไปได้ (เช่น ขับรถเร็วสุด 80 กม./ชม. ต้องใช้เวลาอย่างน้อย 7.5 นาที)

หากผลลัพธ์ของ AI ส่งกลับมาต่ำกว่าขีดจำกัดล่างนี้ (เช่น บอกว่าถึงใน 5 นาที ทั้งที่ฝนตกหนักและทางไกล) ระบบจะทำการ Auto-Reject ทันที และสลับไปใช้ Fallback Rule (Standard Matrix Calculation) คำนวณด้วยสูตรคณิตศาสตร์แบบดั้งเดิมแทน เพื่อไม่ให้ข้อมูลที่ผิดพลาดหลุดไปถึงหน้าจอแอปของลูกค้า

ข้อ 7: Dynamic Pricing Engine — Surge Pricing
1. Data Flow Architecture


2. Safety & Ethics Guardrails (การควบคุมจริยธรรมราคา)
 - เพื่อป้องกันไม่ให้ AI แนะนำราคาที่แพงเกินไปจนผิดกฎหมายควบคุมราคาหรือเอาเปรียบผู้บริโภค ระบบได้ตั้งค่า Hard-coded Guardrails บนระดับสคริปต์หลังบ้าน (Backend Layer) ที่ AI ไม่สามารถฝ่าฝืนหรือปลดล็อกเองได้:

 - Max Multiplier Cap: กำหนดค่า Surge สูงสุดห้ามเกิน 3.0x ของราคาค่าส่งฐานปกติในทุกกรณี

 - Absolute Price Cap: กำหนดเพดานราคาค่าส่งสูงสุดล็อกไว้ที่ 150 บาท ต่อหนึ่งการสั่งซื้อ แม้ดีมานด์จะสูงมากก็ตาม

 - Surge Cool-down Rate-limit: ราคาค่าจัดส่งในพื้นที่เดิมจะอัปเดตเพิ่มขึ้นได้สูงสุดไม่เกิน 15% ในทุกๆ 5 นาที เพื่อป้องกันราคาดีดตัวกระทันหัน

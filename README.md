## ส่วนที่ 1 — Technical Mastery & Scalability

*(รายละเอียดโค้ดแบบเต็มอยู่ในไฟล์ `.js` และ `.sql`)*

### ข้อ 1: Smart & Stale Rider Assignment

> **โจทย์:** จงเขียนฟังก์ชัน assignRider(order, riders) เพื่อหา Rider ที่เหมาะสมที่สุด โดยมีเงื่อนไข:
> Distance: ใช้สูตร Haversine คำนวณระยะทางจาก Rider ถึงร้านอาหาร
> Stale Data Protection: ห้ามเลือก Rider ที่ไม่ได้อัปเดตพิกัดเกิน 2 นาที
> Tie-breaker: ถ้าระยะทางต่างกันไม่เกิน 500 เมตร ให้เลือกคนที่มี Rating สูงกว่า
> Edge Case: หากไม่มี Rider ในระยะ 5 กม. เลย ระบบควรทำอย่างไร? อธิบาย Logic การขยายรัศมีหรือ Fallback

* **Logic:** 1. กรอง Rider ที่ `last_updated` เกิน 2 นาทีทิ้ง (Stale Data Protection)
2. คำนวณระยะทางด้วยสูตร Haversine และจัดเรียงจากใกล้ไปไกล
3. หากมี Rider ที่ระยะทางสูสีกัน (ต่างกันไม่เกิน 500m) ระบบจะใช้เงื่อนไข Rating ที่สูงกว่าเป็นตัวตัดสิน (Tie-breaker)
* **Edge Case:** หากไม่มี Rider ในระยะ 5 กม. ระบบจะใช้ Logic "Radius Expansion" ขยายรัศมีการค้นหาเป็น 8 กม. และ 10 กม. ตามลำดับ หากถึง 10 กม. แล้วยังหาไม่ได้ จะเข้าสู่ระบบ Fallback ทันที เช่น โยนออเดอร์ให้ 3rd Party Logistics (Grab/Lalamove) หรือส่ง Notification แจ้งลูกค้ายกเลิกออเดอร์พร้อมมอบคูปองชดเชย

### ข้อ 2: SQL — Revenue Attribution & Ranking

> **โจทย์:** จงเขียน SQL เพื่อหา "ร้านอาหารที่มีมูลค่าคำสั่งซื้อเฉลี่ย (AOV) สูงสุด 3 อันดับแรกในแต่ละ Category" โดย:
> นับเฉพาะออเดอร์ที่ status = 'delivered' ในเดือนปัจจุบันเท่านั้น
> ต้องจัดการกรณีที่บางร้านไม่มีออเดอร์เลย
> ต้องใช้ Window Function เพื่อจัดอันดับภายในกลุ่ม

* **Logic:** 1. ใช้ `LEFT JOIN` เริ่มจากตารางร้านอาหารไปหาออเดอร์ เพื่อให้ร้านที่ไม่มีออเดอร์เลยยังคงแสดงผลใน Query
2. ใช้ `COALESCE(AVG(order_total), 0)` เพื่อบังคับให้ร้านที่ไม่มีออเดอร์แสดงยอด AOV เป็น 0
3. ใส่เงื่อนไข `WHERE status = 'delivered'` และกรองเฉพาะเดือนปัจจุบัน
4. ใช้ Window Function `DENSE_RANK() OVER (PARTITION BY category_id ORDER BY aov DESC)` เพื่อจัด 3 อันดับแรกของแต่ละ Category โดยที่ไม่ข้ามลำดับหากมีคะแนนเสมอกัน

### ข้อ 3: Code Review — Inventory Race Condition

> **โจทย์:** จงแก้ไข Code ต่อไปนี้ที่ใช้ตัดสต็อกเมื่อมีการสั่งซื้อ: ระบุปัญหา N+1 Query, Race Condition (สต็อกติดลบ), และการขาด Transaction พร้อมเขียน Code ใหม่ที่ใช้ Atomic Update หรือ Pessimistic Locking

* **ปัญหาเดิม:** 1. **N+1 Query:** มีการคิวรี Database ซ้ำซ้อนอยู่ภายในลูป `for`
2. **ขาด Transaction:** หากเกิด Error กลางทาง จะทำให้ข้อมูลไม่ Consistency (บางชิ้นตัดสต็อกไปแล้ว แต่ออเดอร์สร้างไม่สำเร็จ)
3. **Race Condition:** ดึงสต็อกมาตรวจสอบบน Memory (`product.stock >= item.qty`) หากมีคนกดสั่งของชิ้นเดียวกันพร้อมกันในเสี้ยววินาที จะทำให้สต็อกถูกตัดซ้ำซ้อนจนติดลบได้
* **วิธีแก้:** นำ `BEGIN TRANSACTION` มาครอบระบบทั้งหมด ลด N+1 ด้วยการดึงข้อมูลสต็อกครั้งเดียวด้วย `IN (...)` และเปลี่ยนมาใช้ `SELECT ... FOR UPDATE` (Pessimistic Locking) เพื่อล็อก Row ของสินค้าชิ้นนั้นๆ ป้องกันไม่ให้ Transaction อื่นเข้ามาอ่านหรือแก้ไขได้จนกว่าจะตัดสต็อกเสร็จสมบูรณ์

---

## ส่วนที่ 2 — System Design & Business Logic

### ข้อ 4: Real-time Live Tracking Architecture

> **โจทย์:** ออกแบบระบบที่รองรับการติดตาม Rider 2,000 คนพร้อมกัน โดยลูกค้า 10,000 คนต้องเห็นตำแหน่งขยับแบบ Real-time:
> Data Flow: จะใช้โปรโตคอลใดระหว่าง WebSocket, gRPC, หรือ MQTT เพราะเหตุใด?
> Storage Strategy: ตำแหน่งพิกัดที่เปลี่ยนทุก 2 วินาที ควรเก็บลง Database ประเภทใด (SQL / NoSQL / In-memory) เพื่อไม่ให้ Disk I/O เต็ม?

**1. Data Flow (การรับส่งข้อมูลพิกัด)**

* **ฝั่ง Rider ส่งพิกัด (Ingress):** เลือกใช้ **MQTT** เพราะเป็นโปรโตคอลแบบ Lightweight ออกแบบมาสำหรับเครือข่ายมือถือที่ไม่เสถียร ใช้ Bandwidth ต่ำมาก ช่วยประหยัดแบตเตอรี่แม้ Rider จะต้องส่งพิกัดทุกๆ 2 วินาทีก็ตาม
* **ฝั่งลูกค้ารอรับพิกัด (Egress):** เลือกใช้ **WebSocket** เพื่ออัปเดตตำแหน่ง Rider บนหน้าแอปแบบ Real-time เพราะรองรับการสื่อสารแบบ 2 ทาง (Bi-directional) และทำงานร่วมกับ Web/Mobile Client ได้เสถียรที่สุด

**2. Storage Strategy (การเก็บข้อมูลป้องกัน Disk เต็ม)**

* ตำแหน่งพิกัดที่เปลี่ยนทุก 2 วินาที (Write-heavy) จะต้องเก็บลง **In-memory Database (เช่น Redis)** โดยใช้คำสั่งกลุ่ม GEO (Geo-Spatial) เพราะการทำงานบน RAM ทำให้เขียน/อ่านได้รวดเร็วระดับมิลลิวินาที (O(1)) ช่วยแก้ปัญหา Disk I/O Bottleneck ที่จะเกิดหากเขียนลง SQL/NoSQL โดยตรง

### ข้อ 5: Rush Hour Cancellation Crisis

> **โจทย์:** จาก Scenario ที่ Rider ยกเลิกงานสูงถึง 25% ในช่วง Rush Hour:
> Requirement: ออกแบบฟีเจอร์ Dynamic Incentive (โบนัสพิเศษรายพื้นที่) เพื่อดึงดูด Rider
> Data Modeling: ออกแบบ Schema ที่เก็บประวัติการยกเลิกงาน (Cancellation Log) เพื่อวิเคราะห์พฤติกรรมทุจริต (Fraud Detection)

**1. Requirement: Dynamic Incentive (โบนัสรายพื้นที่)**

* เมื่อระบบคำนวณพบว่าพื้นที่ใดมีอัตราส่วน Demand (ออเดอร์) สูงกว่า Supply (Rider) อย่างมีนัยสำคัญ ระบบจะเปลี่ยนพื้นที่นั้นเป็น **"Surge Zone"** พร้อมแสดง Heatmap บนแอป Rider และอัดฉีดเงินพิเศษแบบเรียลไทม์ (เช่น +20 บาท/ออเดอร์) ในเวลาจำกัด เพื่อดึงดูด Rider จากนอกพื้นที่ให้ขับเข้ามารับงาน

**2. Data Modeling: Cancellation Log Schema**

* ออกแบบ Schema เก็บประวัติอย่างละเอียด รวมถึงข้อมูล Device เพื่อนำไปวิเคราะห์ Fraud Detection (เช่น จับพฤติกรรมใช้เครื่องเดียวกันปั่นกดยกเลิกงาน):

```json
{
  "log_id": "uuid",
  "order_id": "uuid",
  "rider_id": "string",
  "cancelled_by": "RIDER | CUSTOMER | SYSTEM",
  "reason": "DISTANCE_TOO_FAR | RESTAURANT_LONG_WAIT | PASS_ORDER",
  "location": { "lat": 13.756, "lng": 100.501 },
  "device_metadata": { "device_id": "string", "ip_address": "string" },
  "created_at": "timestamp"
}

```

---

## ส่วนที่ 3 — AI Implementation & Guardrails

### ข้อ 6: AI-Powered Delivery Time Predictor

> **โจทย์:** เขียน Prompt เพื่อให้ AI คำนวณ ETA โดยใช้ข้อมูล: ระยะทาง, สภาพอากาศ (ฝนตก), และเวลาเตรียมอาหารของร้าน
> พร้อมระบุวิธีจัดการหาก AI ทำนายเวลาผิดพลาดอย่างรุนแรง เช่น บอกว่าถึงใน 5 นาที ทั้งที่ฝนตกหนักและร้านอยู่ไกล 10 กม.

**1. System Prompt สำหรับให้ AI คำนวณ ETA:**

```text
Role: คุณคือ AI ประเมินเวลาจัดส่งอาหาร (ETA) ของระบบ Delivery
Task: คำนวณเวลาจัดส่งรวม (นาที) จากข้อมูล Input โดยคำนึงถึงเงื่อนไขทางธุรกิจอย่างเคร่งครัด:
1. สภาพอากาศ: หากฝนตกหนัก ให้ลดความเร็วเดินทางลง 40% และบวกเวลาสวมชุดกันฝน 5 นาที
2. การเตรียมอาหาร: ร้านปรุงสด บวกเวลา +15 นาที / ร้านฟาสต์ฟู้ด บวกเวลา +7 นาที
3. ความเร็วปกติ: 30 กม./ชม. (ระยะทาง 1 กม. = 2 นาที)

Output: ห้ามมีข้อความเกริ่นนำ ตอบกลับเป็น JSON Format เท่านั้น ประกอบด้วย "total_eta_mins" และออบเจ็กต์ "breakdown_mins" ที่แยกเวลาเดินทาง, เวลาเตรียมอาหาร, และเวลาเผื่อสภาพอากาศ

```

**2. การจัดการกรณี AI ทำนายผิดพลาดรุนแรง (Hallucination)**

* สร้าง **(Rule-based)** ไว้ที่ฝั่ง Backend เพื่อเช็คค่าต่ำสุด
* หากผลลัพธ์จาก AI ต่ำกว่าความเป็นจริง (เช่น ระยะทาง 10 กม. ฝนตกหนัก แต่บอกใช้เวลา 5 นาที) ระบบจะทำการ **Auto-Reject** ค่าของ AI ทันที และเปิดโหมด Fallback สลับไปใช้สูตรคำนวณระยะทาง (Standard Matrix) เพื่อความถูกต้องและปลอดภัย

### ข้อ 7: Dynamic Pricing Engine — Surge Pricing

> **โจทย์:** ออกแบบฟีเจอร์ปรับค่าส่งตาม Demand/Supply:
> Architecture: เขียน Diagram แสดงการไหลของข้อมูลจาก Rider App ไปยัง AI Model และสะท้อนกลับไปที่ Customer App
> Safety & Ethics: หาก AI แนะนำค่าส่งที่แพงเกินไปจนผิดกฎหมายคุ้มครองผู้บริโภค จะวาง Hard-coded Guardrails อย่างไร?

**1. Architecture Diagram (การไหลของข้อมูล)**

```text
[Rider App] --(ส่งพิกัดผ่าน MQTT)--> [API Gateway] 
                                         |
[AI Pricing Model] <--(ดึงข้อมูล Demand/Supply แบบ Real-time เพื่อคำนวณราคา)
                                         |
[Redis Cache] --(อัปเดตราคา Surge ใหม่ทุก 1 นาที)--> [Customer App] (รับการแจ้งเตือนค่าส่งใหม่ผ่าน WebSocket)

```

**2. Safety & Ethics (การตั้ง Guardrails คุ้มครองผู้บริโภค)**
ป้องกันเหตุการณ์ AI ตัดสินใจตั้งราคาแพงเกินไปจนผิดกฎหมาย (Price Gouging) โดยฝัง Rule ไว้ที่ Backend Layer ซึ่ง AI ไม่สามารถ Overwrite ได้:

* **Max Multiplier (จำกัดตัวคูณ):** ราคา Surge สูงสุดห้ามเกิน **3.0 เท่า** ของราคาค่าส่งฐานปกติ
* **Absolute Cap (เพดานราคาสูงสุด):** ล็อกค่าส่งรวมสูงสุดไว้ที่ไม่เกิน **150 บาท** ต่อออเดอร์ในทุกกรณี ไม่ว่า Demand จะพุ่งสูงแค่ไหนก็ตาม
* **Cool-down Rate (จำกัดความผันผวน):** ค่าส่งจะปรับขึ้นได้สูงสุดไม่เกิน **15% ภายในกรอบเวลา 5 นาที** เพื่อป้องกันการเกิด Price Shock ที่สร้างความตื่นตระหนกให้กับลูกค้า


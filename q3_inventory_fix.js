async function placeOrder(orderId, items) {
  const client = await db.connect(); // สมมติว่าใช้ pg-pool หรือระบบที่รองรับ transaction

  try {
    await client.query("BEGIN"); // 1. เริ่มต้น Transaction

    for (const item of items) {
      // 2. ใช้ Atomic Update: อัปเดตและเช็คเงื่อนไขในคำสั่งเดียว ป้องกัน Race Condition
      // และใช้ Parameterized Query เพื่อป้องกัน SQL Injection ปลอดภัยร้อยเปอร์เซ็นต์
      const result = await client.query(
        `UPDATE menu 
                 SET stock = stock - $1 
                 WHERE id = $2 AND stock >= $1 
                 RETURNING stock`,
        [item.qty, item.id],
      );

      // ถ้าไม่มีแถวไหนอัปเดตได้ แปลว่าของหมดหรือสต็อกไม่พอ
      if (result.rowCount === 0) {
        throw new Error(`สินค้าไอดี ${item.id} มีจำนวนไม่พอครับ`);
      }
    }

    // 3. สร้างออเดอร์เมื่อตัดสต็อกผ่านครบทุกชิ้น
    await client.query(`INSERT INTO orders (id, status) VALUES ($1, $2)`, [
      orderId,
      "confirmed",
    ]);

    await client.query("COMMIT"); // บันทึกข้อมูลลงฐานข้อมูลทั้งหมดพร้อมกัน
  } catch (error) {
    await client.query("ROLLBACK"); // เกิดปัญหาอะไรขึ้นให้ยกเลิกทั้งหมด ย้อนกลับเหมือนไม่มีอะไรเกิดขึ้น
    throw error;
  } finally {
    client.release();
  }
}

function haversineDistance(coords1, coords2) {
  const R = 6371; // รัศมีของโลก (กิโลเมตร)
  const dLat = ((coords2.lat - coords1.lat) * Math.PI) / 180;
  const dLon = ((coords2.lon - coords1.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coords1.lat * Math.PI) / 180) *
      Math.cos((coords2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // ได้ระยะทางออกมาเป็นกิโลเมตร
}

function assignRider(order, riders) {
  const NOW = new Date();
  const MAX_STALE_TIME = 2 * 60 * 1000; // 2 นาทีในหน่วยมิลลิวินาที
  const MAX_DISTANCE = 5; // รัศมีเริ่มต้น 5 กม.

  // 1. Filter คนที่พิกัดยังอัปเดตอยู่
  let activeRiders = riders.filter((rider) => {
    return NOW - new Date(rider.lastUpdatedAt) <= MAX_STALE_TIME;
  });

  // 2. คำนวณหาคนที่เหมาะสม
  let bestRider = null;
  let bestDistance = Infinity;

  activeRiders.forEach((rider) => {
    const distance = haversineDistance(order.restaurantCoords, rider.coords);

    if (distance <= MAX_DISTANCE) {
      if (!bestRider) {
        bestRider = rider;
        bestDistance = distance;
      } else {
        // Tie-breaker: ห่างกันไม่เกิน 500 เมตร (0.5 กม.)
        if (Math.abs(distance - bestDistance) <= 0.5) {
          if (rider.rating > bestRider.rating) {
            bestRider = rider;
            bestDistance = distance;
          }
        } else if (distance < bestDistance) {
          bestRider = rider;
          bestDistance = distance;
        }
      }
    }
  });

  // 💡 Edge Case: หากไม่มี Rider ในระยะ 5 กม. เลย
  if (!bestRider) {
    return fallbackAssignment(order, activeRiders, MAX_DISTANCE);
  }

  return bestRider;
}

// Logic การขยายรัศมี (Fallback)
function fallbackAssignment(order, activeRiders, currentRadius) {
  // ขยายรัศมีเพิ่มทีละ 2 กม. สูงสุดไม่เกิน 15 กม.
  let radius = currentRadius;
  while (radius <= 15) {
    radius += 2;
    // ทำการค้นหาซ้ำในรัศมีใหม่...
    // (ในระบบจริงจะใช้คิวจำพวก Redis Geo หรือส่ง Notification ขยายวงกว้างออกไป)
  }
  // หากสุดท้ายยังไม่ได้จริงๆ -> แจ้งระบบให้ดีเลย์ออเดอร์หรือให้ลูกค้าทราบว่าไรเดอร์ไม่พอกลางพื้นที่
  return "No rider available, triggering dynamic incentive bump.";
}

WITH
    MonthlyDeliveredOrders AS (
        -- ขั้นที่ 1: กรองเฉพาะออเดอร์ที่ส่งสำเร็จในเดือนปัจจุบัน
        SELECT o.restaurant_id, o.total_amount
        FROM orders o
        WHERE
            o.status = 'delivered'
            AND o.created_at >= DATE_TRUNC('month', CURRENT_DATE)
    ),
    RestaurantAOV AS (
        -- ขั้นที่ 2: คำนวณค่าเฉลี่ยออเดอร์ (AOV) ของแต่ละร้าน และ Join ข้อมูลหมวดหมู่
        SELECT
            r.id AS restaurant_id,
            r.name AS restaurant_name,
            r.category,
            COALESCE(AVG(m.total_amount), 0) AS average_order_value
        FROM
            restaurants r
            LEFT JOIN MonthlyDeliveredOrders m ON r.id = m.restaurant_id
        GROUP BY
            r.id,
            r.name,
            r.category
    ),
    RankedRestaurants AS (
        -- ขั้นที่ 3: ใช้ Window Function (DENSE_RANK) จัดอันดับตามหมวดหมู่
        SELECT
            category,
            restaurant_name,
            average_order_value,
            DENSE_RANK() OVER (
                PARTITION BY
                    category
                ORDER BY average_order_value DESC
            ) as rank
        FROM RestaurantAOV
    )
    -- ขั้นสุดท้าย: เอาเฉพาะ 3 อันดับแรกของแต่ละหมวดหมู่
SELECT
    category,
    restaurant_name,
    average_order_value,
    rank
FROM RankedRestaurants
WHERE
    rank <= 3;
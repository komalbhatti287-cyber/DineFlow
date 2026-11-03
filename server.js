
require('dotenv').config();

const express = require('express');
const oracledb = require('oracledb');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Return Oracle query results as objects
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// Database connection
async function db() {
    return await oracledb.getConnection({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        connectString: process.env.DB_CONNECT_STRING
    });
}

// Common error handler
const asyncRoute = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
        console.error('API ERROR:', err);
        res.status(500).json({ error: err.message });
    });
};

// Health check
app.get('/api/health', asyncRoute(async (req, res) => {
    const c = await db();

    try {
        const r = await c.execute(`
            SELECT
                USER AS DB_USER,
                SYS_CONTEXT('USERENV','SERVICE_NAME') AS SERVICE_NAME
            FROM DUAL
        `);

        res.json(r.rows[0]);
    } finally {
        await c.close();
    }
}));

// Dashboard
app.get('/api/dashboard', asyncRoute(async (req, res) => {
    const c = await db();

    try {
        const r = await c.execute(
            `BEGIN DINEFLOW_PKG.DASHBOARD(:o,:rev,:occ,:pend); END;`,
            {
                o: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
                rev: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
                occ: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
                pend: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
            }
        );

        const recent = await c.execute(`
            SELECT
                O.ORDER_ID,
                C.CUSTOMER_NAME,
                T.TABLE_NAME,
                O.ORDER_STATUS,
                TO_CHAR(O.ORDER_DATE,'DD-MON HH:MI AM') AS ORDER_TIME
            FROM DF_ORDERS O
            LEFT JOIN DF_CUSTOMERS C
                ON C.CUSTOMER_ID = O.CUSTOMER_ID
            LEFT JOIN DF_TABLES T
                ON T.TABLE_ID = O.TABLE_ID
            ORDER BY O.ORDER_ID DESC
            FETCH FIRST 8 ROWS ONLY
        `);

        // app.js tableHtml() expects each row as an array
        const recentRows = recent.rows.map(row => [
            row.ORDER_ID,
            row.CUSTOMER_NAME,
            row.TABLE_NAME,
            row.ORDER_STATUS,
            row.ORDER_TIME
        ]);

        res.json({
            orders: r.outBinds.o,
            revenue: r.outBinds.rev,
            occupied: r.outBinds.occ,
            pending: r.outBinds.pend,
            recent: recentRows
        });

    } finally {
        await c.close();
    }
}));

// Menu
app.get('/api/menu', asyncRoute(async (req, res) => {
    const c = await db();

    try {
        const r = await c.execute(`
            SELECT
                M.ITEM_ID,
                C.CATEGORY_NAME,
                M.ITEM_NAME,
                M.PRICE,
                M.IS_AVAILABLE
            FROM DF_MENU M
            JOIN DF_CATEGORIES C
                ON C.CATEGORY_ID = M.CATEGORY_ID
            ORDER BY C.CATEGORY_NAME, M.ITEM_NAME
        `);

        res.json(r.rows);
    } finally {
        await c.close();
    }
}));

// Tables
app.get('/api/tables', asyncRoute(async (req, res) => {
    const c = await db();

    try {
        const r = await c.execute(`
            SELECT
                TABLE_ID,
                TABLE_NAME,
                CAPACITY,
                TABLE_STATUS
            FROM DF_TABLES
            ORDER BY TABLE_ID
        `);

        res.json(r.rows);
    } finally {
        await c.close();
    }
}));

// Update table status
app.patch('/api/tables/:id', asyncRoute(async (req, res) => {
    const c = await db();

    try {
        await c.execute(
            `UPDATE DF_TABLES
             SET TABLE_STATUS = :s
             WHERE TABLE_ID = :id`,
            {
                s: req.body.status,
                id: Number(req.params.id)
            },
            { autoCommit: true }
        );

        res.json({ ok: true });
    } finally {
        await c.close();
    }
}));

// Customers
app.get('/api/customers', asyncRoute(async (req, res) => {
    const c = await db();

    try {
        const r = await c.execute(`
            SELECT CUSTOMER_ID, CUSTOMER_NAME
            FROM DF_CUSTOMERS
            ORDER BY CUSTOMER_NAME
        `);

        res.json(r.rows);
    } finally {
        await c.close();
    }
}));

// All orders
app.get('/api/orders', asyncRoute(async (req, res) => {
    const c = await db();

    try {
        const r = await c.execute(`
            SELECT
                O.ORDER_ID,
                C.CUSTOMER_NAME,
                T.TABLE_NAME,
                O.ORDER_STATUS,
                TO_CHAR(O.ORDER_DATE,'DD-MON HH:MI AM') AS ORDER_TIME
            FROM DF_ORDERS O
            LEFT JOIN DF_CUSTOMERS C
                ON C.CUSTOMER_ID = O.CUSTOMER_ID
            LEFT JOIN DF_TABLES T
                ON T.TABLE_ID = O.TABLE_ID
            ORDER BY O.ORDER_ID DESC
        `);

        res.json(r.rows);
    } finally {
        await c.close();
    }
}));

// Create order
app.post('/api/orders', asyncRoute(async (req, res) => {
    const { customerId, tableId, items } = req.body;

    if (!customerId || !tableId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            error: 'Customer, table and at least one menu item are required.'
        });
    }

    const c = await db();

    try {
        // Oracle collection type
        const ListType = await c.getDbObjectClass('SYS.ODCIVARCHAR2LIST');

        const list = new ListType();

        // Add values using Oracle collection append()
        items.forEach((item) => {
            list.append(`${item.itemId}:${item.quantity}`);
        });

        // Call PL/SQL package
        const r = await c.execute(
            `BEGIN
                DINEFLOW_PKG.CREATE_ORDER(
                    :cust,
                    :tab,
                    :items,
                    :oid
                );
            END;`,
            {
                cust: Number(customerId),
                tab: Number(tableId),
                items: {
                    val: list,
                    type: ListType
                },
                oid: {
                    dir: oracledb.BIND_OUT,
                    type: oracledb.NUMBER
                }
            }
        );

        await c.commit();

        res.json({
            ok: true,
            orderId: r.outBinds.oid
        });

    } catch (err) {
        await c.rollback();
        throw err;
    } finally {
        await c.close();
    }
}));

// Update order status
app.patch('/api/orders/:id/status', asyncRoute(async (req, res) => {
    const c = await db();

    try {
        await c.execute(
            `BEGIN
                DINEFLOW_PKG.UPDATE_STATUS(:id, :status);
            END;`,
            {
                id: Number(req.params.id),
                status: req.body.status
            }
        );

        await c.commit();

        res.json({ ok: true });

    } catch (err) {
        await c.rollback();
        throw err;
    } finally {
        await c.close();
    }
}));

// Generate bill
app.get('/api/orders/:id/bill', asyncRoute(async (req, res) => {
    const c = await db();

    try {
        const r = await c.execute(
            `BEGIN
                DINEFLOW_PKG.GET_BILL(:id, :sub, :tax, :total);
            END;`,
            {
                id: Number(req.params.id),
                sub: {
                    dir: oracledb.BIND_OUT,
                    type: oracledb.NUMBER
                },
                tax: {
                    dir: oracledb.BIND_OUT,
                    type: oracledb.NUMBER
                },
                total: {
                    dir: oracledb.BIND_OUT,
                    type: oracledb.NUMBER
                }
            }
        );

        res.json(r.outBinds);
    } finally {
        await c.close();
    }
}));

// Start server
const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`DineFlow running at http://localhost:${port}`);
});


const $ = (s) => document.querySelector(s);

const money = (n) =>
    "₹ " + Number(n || 0).toLocaleString("en-IN", {
        maximumFractionDigits: 2
    });

let selectedOrder = null;

// API helper
async function api(url, opts = {}) {
    const r = await fetch("/api" + url, {
        headers: { "Content-Type": "application/json" },
        ...opts
    });

    const d = await r.json();

    if (!r.ok) {
        throw new Error(d.error || "Request failed");
    }

    return d;
}

// Toast notification
function toast(t) {
    const x = $("#toast");
    x.textContent = t;
    x.classList.add("show");

    setTimeout(() => x.classList.remove("show"), 2600);
}

// Page layout
function shell(title, html) {
    $("#pageTitle").innerHTML = title;
    $("#content").innerHTML = html;
}

// Navigation
function nav(page) {
    document.querySelectorAll(".nav").forEach((b) =>
        b.classList.toggle("active", b.dataset.page === page)
    );

    (({ dashboard, menu, tables, orders })[page] || dashboard)()
        .catch((err) => toast(err.message));
}

document.querySelectorAll(".nav").forEach((b) =>
    b.addEventListener("click", () => nav(b.dataset.page))
);

$("#refreshBtn").onclick = () =>
    nav(document.querySelector(".nav.active")?.dataset.page || "dashboard");

// Database health check
async function check() {
    try {
        const h = await api("/health");

        $("#dbStatus").innerHTML =
            `<i></i> ${h.DB_USER} · ${h.SERVICE_NAME}`;

        $("#dbStatus").style.color = "var(--green)";

    } catch (e) {
        $("#dbStatus").textContent = "DATABASE OFFLINE";
        $("#dbStatus").style.color = "var(--red)";
        toast(e.message);
    }
}

// Dashboard
async function dashboard() {
    shell(
        "Good evening, Chef <span>✦</span>",
        `
        <div class="welcome">
            <div>
                <h2>Service overview</h2>
                <p>Here’s what’s happening across your restaurant today.</p>
            </div>
            <span class="date-pill">● LIVE SNAPSHOT</span>
        </div>

        <div id="stats" class="stats"></div>

        <div class="two-col">
            <div class="panel">
                <div class="panel-head">
                    <h3>Recent orders</h3>
                    <span>Latest activity</span>
                </div>
                <div id="recent"></div>
            </div>

            <div class="panel">
                <div class="panel-head">
                    <h3>Floor snapshot</h3>
                    <span>Table availability</span>
                </div>
                <div id="floor" class="table-grid"></div>
            </div>
        </div>
        `
    );

    const [d, t] = await Promise.all([
        api("/dashboard"),
        api("/tables")
    ]);

    $("#stats").innerHTML = [
        ["ORDERS TODAY", d.orders, "gold", "↗ Service volume"],
        ["TODAY'S REVENUE", money(d.revenue), "green", "↗ Gross order value"],
        ["OCCUPIED TABLES", d.occupied, "blue", "● Live seating"],
        ["PENDING ORDERS", d.pending, "red", "◷ Needs attention"]
    ].map((x) => `
        <div class="stat">
            <label>${x[0]}</label>
            <strong class="${x[2]}">${x[1] ?? 0}</strong>
            <small>${x[3]}</small>
        </div>
    `).join("");

    const rows = d.recent || [];

    $("#recent").innerHTML = rows.length
        ? tableHtml(
            ["ORDER", "CUSTOMER", "TABLE", "STATUS", "TIME"],
            rows
        )
        : '<div class="empty">No orders yet. Create your first order.</div>';

    $("#floor").innerHTML = t.map((x) => `
        <div class="table-card ${x.TABLE_STATUS === "OCCUPIED" ? "occupied" : ""}">
            <i class="dot"></i>
            <b>${x.TABLE_NAME}</b>
            <small>${x.CAPACITY} seats · ${x.TABLE_STATUS}</small>
        </div>
    `).join("");
}

// Table HTML helper
function tableHtml(head, rows) {
    return `
        <table>
            <thead>
                <tr>${head.map((x) => `<th>${x}</th>`).join("")}</tr>
            </thead>
            <tbody>
                ${rows.map((r) => {
                    const values = Array.isArray(r) ? r : Object.values(r);

                    return `
                        <tr>
                            ${values.map((v, i) => `
                                <td>
                                    ${i === 3
                                        ? `<span class="pill ${v}">${v ?? "—"}</span>`
                                        : (v ?? "—")}
                                </td>
                            `).join("")}
                        </tr>
                    `;
                }).join("")}
            </tbody>
        </table>
    `;
}

// Menu page
async function menu() {
    shell(
        "Menu studio <span>✦</span>",
        `
        <div class="welcome">
            <div>
                <h2>Curated for your guests</h2>
                <p>Browse dishes, categories and current menu prices.</p>
            </div>
            <span class="date-pill">MENU CATALOGUE</span>
        </div>
        <div id="menuGrid" class="menu-grid"></div>
        `
    );

    const rows = await api("/menu");

    $("#menuGrid").innerHTML = rows.map((x, i) => `
        <article class="dish">
            <div class="dish-icon">
                ${["🥗", "🍛", "🍕", "🥤", "🍰"][i % 5]}
            </div>
            <h4>${x.ITEM_NAME}</h4>
            <p>${x.CATEGORY_NAME}</p>
            <strong>${money(x.PRICE)}</strong>
            <span class="pill" style="float:right">
                ${x.IS_AVAILABLE === "Y" ? "AVAILABLE" : "UNAVAILABLE"}
            </span>
        </article>
    `).join("");
}

// Tables page
async function tables() {
    shell(
        "Floor & tables <span>✦</span>",
        `
        <div class="welcome">
            <div>
                <h2>Your dining floor</h2>
                <p>Update seating status as guests arrive and leave.</p>
            </div>
        </div>

        <div class="panel">
            <div class="panel-head">
                <h3>Table map</h3>
                <span>Choose a table below to update status</span>
            </div>
            <div id="tableGrid" class="table-grid"></div>
        </div>
        `
    );

    const rows = await api("/tables");

    $("#tableGrid").innerHTML = rows.map((x) => `
        <div class="table-card ${x.TABLE_STATUS === "OCCUPIED" ? "occupied" : ""}">
            <i class="dot"></i>
            <b>${x.TABLE_NAME}</b>
            <small>${x.CAPACITY} seats · ${x.TABLE_STATUS}</small>

            <button
                class="btn secondary"
                style="margin-top:12px"
                onclick="setTable(${x.TABLE_ID}, '${x.TABLE_STATUS === "AVAILABLE" ? "OCCUPIED" : "AVAILABLE"}')"
            >
                MARK ${x.TABLE_STATUS === "AVAILABLE" ? "OCCUPIED" : "AVAILABLE"}
            </button>
        </div>
    `).join("");
}

// Update table status
async function setTable(id, status) {
    await api("/tables/" + id, {
        method: "PATCH",
        body: JSON.stringify({ status })
    });

    toast("Table status updated");
    tables();
}

// Orders page
async function orders() {
    shell(
        "Orders & billing <span>✦</span>",
        `
        <div class="welcome">
            <div>
                <h2>Order management</h2>
                <p>Place orders, follow preparation and generate customer bills.</p>
            </div>
            <button class="btn" id="newOrder">＋ CREATE ORDER</button>
        </div>

        <div class="panel">
            <div class="panel-head">
                <h3>All orders</h3>
                <span>Select an order to manage it</span>
            </div>
            <div id="ordersTable"></div>
        </div>
        `
    );

    const rows = await api("/orders");

    $("#ordersTable").innerHTML = rows.length
        ? `
            <table>
                <thead>
                    <tr>
                        <th>ORDER</th>
                        <th>CUSTOMER</th>
                        <th>TABLE</th>
                        <th>STATUS</th>
                        <th>TIME</th>
                        <th>ACTION</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((x) => `
                        <tr>
                            <td>#${x.ORDER_ID}</td>
                            <td>${x.CUSTOMER_NAME ?? "—"}</td>
                            <td>${x.TABLE_NAME ?? "—"}</td>
                            <td>
                                <span class="pill ${x.ORDER_STATUS}">
                                    ${x.ORDER_STATUS}
                                </span>
                            </td>
                            <td>${x.ORDER_TIME ?? "—"}</td>
                            <td>
                                <button
                                    class="btn secondary"
                                    onclick="manageOrder(${x.ORDER_ID})"
                                >
                                    MANAGE
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `
        : '<div class="empty">No orders yet. Create your first order.</div>';

    $("#newOrder").onclick = createOrder;
}

// Modal helper
function modal(title, body, submitText, fn) {
    const wrap = document.createElement("div");

    wrap.className = "modal-back";

    wrap.innerHTML = `
        <div class="modal">
            <h3>${title}</h3>
            ${body}

            <div class="modal-actions">
                <button class="btn secondary" id="cancelModal">CANCEL</button>
                <button class="btn" id="submitModal">${submitText}</button>
            </div>
        </div>
    `;

    document.body.append(wrap);

    wrap.querySelector("#cancelModal").onclick = () => wrap.remove();

    wrap.querySelector("#submitModal").onclick = async () => {
        try {
            await fn(wrap);
            wrap.remove();
        } catch (e) {
            toast(e.message);
        }
    };
}

// Create new order
async function createOrder() {
    const [customers, tablesData, menuItems] = await Promise.all([
        api("/customers"),
        api("/tables"),
        api("/menu")
    ]);

    const available = tablesData.filter(
        (t) => t.TABLE_STATUS === "AVAILABLE"
    );

    if (!available.length) {
        throw new Error("No available tables right now");
    }

    const availableMenu = menuItems.filter(
        (m) => m.IS_AVAILABLE === "Y"
    );

    if (!customers.length || !availableMenu.length) {
        throw new Error("Please add customers and available menu items first");
    }

    modal(
        "Create a new order",

        `
        <div class="form-grid">
            <div class="field">
                <label>Customer</label>
                <select id="cust">
                    ${customers.map((c) => `
                        <option value="${c.CUSTOMER_ID}">
                            ${c.CUSTOMER_NAME}
                        </option>
                    `).join("")}
                </select>
            </div>

            <div class="field">
                <label>Available table</label>
                <select id="tab">
                    ${available.map((t) => `
                        <option value="${t.TABLE_ID}">
                            ${t.TABLE_NAME} · ${t.CAPACITY} seats
                        </option>
                    `).join("")}
                </select>
            </div>
        </div>

        <div class="field" style="margin-top:15px">
            <label>Menu item</label>
            <select id="dish">
                ${availableMenu.map((m) => `
                    <option value="${m.ITEM_ID}">
                        ${m.ITEM_NAME} — ${money(m.PRICE)}
                    </option>
                `).join("")}
            </select>
        </div>

        <div class="field" style="margin-top:12px">
            <label>Quantity</label>
            <input id="qty" type="number" min="1" value="1">
        </div>
        `,

        "PLACE ORDER",

        async (w) => {
            const quantity = Number(w.querySelector("#qty").value);

            if (!Number.isInteger(quantity) || quantity < 1) {
                throw new Error("Enter a valid quantity");
            }

            const result = await api("/orders", {
                method: "POST",

                body: JSON.stringify({
                    customerId: w.querySelector("#cust").value,
                    tableId: w.querySelector("#tab").value,

                    items: [
                        {
                            itemId: w.querySelector("#dish").value,
                            quantity
                        }
                    ]
                })
            });

            toast("Order #" + result.orderId + " placed successfully");

            orders();
        }
    );
}

// Manage order
async function manageOrder(id) {
    selectedOrder = id;

    modal(
        "Manage order #" + id,

        `
        <div class="field">
            <label>Update preparation status</label>
            <select id="status">
                <option>PLACED</option>
                <option>PREPARING</option>
                <option>SERVED</option>
                <option>CANCELLED</option>
            </select>
        </div>

        <p class="muted" style="margin-top:12px">
            SERVED or CANCELLED will release the restaurant table.
        </p>

        <button class="btn secondary" id="billBtn" style="margin-top:14px">
            VIEW BILL
        </button>
        `,

        "SAVE STATUS",

        async (w) => {
            await api("/orders/" + id + "/status", {
                method: "PATCH",

                body: JSON.stringify({
                    status: w.querySelector("#status").value
                })
            });

            toast("Order status updated");
            orders();
        }
    );

    setTimeout(() => {
        const b = document.querySelector("#billBtn");

        if (b) {
            b.onclick = () => viewBill(id).catch((e) => toast(e.message));
        }
    }, 0);
}

// FIXED BILL FUNCTION
async function viewBill(id) {
    const b = await api("/orders/" + id + "/bill");

    // Match the exact OUT bind names from server.js
    const subtotal = Number(
        b.sub ?? b.SUB ?? b.P_SUBTOTAL ?? b.SUBTOTAL ?? 0
    );

    const tax = Number(
        b.tax ?? b.TAX ?? b.P_TAX ?? 0
    );

    const total = Number(
        b.total ?? b.TOTAL ?? b.P_TOTAL ?? 0
    );

    modal(
        "Bill · Order #" + id,

        `
        <div class="bill-line">
            <span>Subtotal</span>
            <b>${money(subtotal)}</b>
        </div>

        <div class="bill-line">
            <span>Tax (5%)</span>
            <b>${money(tax)}</b>
        </div>

        <hr style="border-color:var(--line)">

        <div class="bill-line" style="font-size:17px">
            <b>Grand total</b>
            <b class="gold">${money(total)}</b>
        </div>
        `,

        "DONE",

        async () => {}
    );
}

// Initial load
check();
dashboard().catch((e) => toast(e.message));

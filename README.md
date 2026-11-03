# DineFlow — Restaurant Management System (Web + Oracle PL/SQL)

A browser-based MCA mini project. The frontend uses HTML, CSS and vanilla JavaScript. Node.js + Express is the thin API bridge to Oracle; the main business operations are implemented in the Oracle PL/SQL package `DINEFLOW_PKG`.

## Architecture
Browser (HTML/CSS/JS) → Express API (Node.js + `oracledb`) → Oracle Database → `DINEFLOW_PKG` (PL/SQL).

A browser cannot safely connect directly to Oracle. The small Node.js server handles database connections and calls PL/SQL procedures. Order creation, order status, billing totals and dashboard KPIs are performed by PL/SQL.

## Requirements
- Node.js 18+
- Oracle Database with a PDB service, e.g. `FREEPDB1`
- Oracle SQL Developer

## Database setup
Connect SQL Developer to your **PDB service** (for example `localhost:1521/FREEPDB1`), not `CDB$ROOT`.
Run scripts in this order with F5:
1. `database/01_schema.sql`
2. `database/02_package.sql`
3. `database/03_seed.sql`

The scripts create tables prefixed `DF_` and package `DINEFLOW_PKG`.

## Configure
Copy `.env.example` to `.env` and set your Oracle credentials:
```env
DB_USER=SYSTEM
DB_PASSWORD=your_oracle_password
DB_CONNECT_STRING=localhost:1521/FREEPDB1
PORT=3000
```
Use the same PDB connection in SQL Developer and `.env`. Do not use `CDB$ROOT` for this app.

## Run
From project root:
```powershell
npm install
npm start
```
Open `http://localhost:3000`.

## Modules
- Overview dashboard: orders today, sales today, occupied tables, pending orders
- Menu: category, item, price, availability
- Floor: table capacity and availability
- Orders: create order, update status, view bill
- PL/SQL package: `CREATE_ORDER`, `UPDATE_STATUS`, `GET_BILL`, `DASHBOARD`

## Notes
- Currency: INR; demo tax: 5%.
- Seed data is for demonstration.
- This is an academic mini-project, not a production restaurant POS.

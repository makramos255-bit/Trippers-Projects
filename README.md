# TRIPPERS COFFEE — Coffee Shop Management System

A complete, self-contained coffee shop management system with three roles:
**Administrator**, **Inventory Staff** and **Cashier**. It covers the point of
sale, menu and inventory management, staff accounts, sales records, reports,
activity logging and printable receipts.

Built with plain **HTML5, CSS3, Bootstrap 5, Bootstrap Icons and vanilla
JavaScript** (plus a small canvas chart engine). There is no build step, no
server, no database and no external dependency at runtime — open the file and it
runs.

---

## Quick start

1. Open the project folder.
2. Double-click **`index.html`** (or drag it into Chrome, Edge or Firefox).

That's it. The app seeds a full demo dataset on first launch.

> Optional: serve the folder with any static file server (for example
> `npx serve .`) if you prefer an `http://` URL. Everything works over `file://`
> as well.

### Demo logins

| Role             | Username    | Password       | Lands on              |
| ---------------- | ----------- | -------------- | --------------------- |
| Administrator    | `admin`     | `admin123`     | Admin dashboard       |
| Inventory Staff  | `inventory` | `inventory123` | Inventory dashboard   |
| Cashier          | `cashier`   | `cashier123`   | Cashier dashboard     |

The Cashier lands on a personal dashboard with a **Start a sale** shortcut to the
POS. Two extra demo staff accounts exist for reporting variety:
`miguel / miguel123` (Cashier). Click a demo chip on the sign-in screen to fill
the credentials automatically.

Accounts sign in with **either a username or an email address**. Every demo
account also has an email such as `admin@trippers.coffee`.

---

## Roles & permissions

Only the **Administrator** can create or edit staff accounts. There is no public
registration, and deactivated accounts are refused at sign-in even if the
password is correct.

| Area                      | Admin | Inventory Staff | Cashier |
| ------------------------- | :---: | :-------------: | :-----: |
| Admin dashboard           |  ✔    |                 |         |
| Cashier dashboard         |       |                 |    ✔    |
| Inventory (full CRUD)     |  ✔    |        ✔        |         |
| Products & categories     |  ✔    |                 |         |
| Staff accounts            |  ✔    |                 |         |
| Sales / transactions      |  ✔    |                 |         |
| Reports & analytics       |  ✔    |                 |         |
| Settings / activity logs  |  ✔    |                 |         |
| POS                       |  ✔    |                 |    ✔    |
| Own transaction history   |  ✔    |                 |    ✔    |

Role-based access is enforced in the router and again inside each page module,
so typing an admin URL while signed in as a cashier bounces back to that user's
home route with a permission notice.

### Administrator

- **Dashboard** — eight KPI cards (total sales today, orders today, total
  products, low-stock items, total staff, total revenue, monthly sales and the
  best-selling product) with day-over-day and month-over-month comparisons;
  revenue chart filters for **Today / Week / Month / Year** with revenue, orders
  and average-order summaries; category-performance doughnut with legend; best
  sellers with images; recent transactions; inventory alerts with a detail view;
  recent staff activity; staff overview and quick actions. Data refreshes after
  every sale/stock change and every minute while the page is visible.
- **Appearance (Settings)** — Light / Dark / System theme, Gold / Brown / Black
  or custom accent, expanded or collapsed sidebar, compact or comfortable
  density, and Small / Medium / Large text, with a live preview. Saved per device
  to `localStorage`; **Reset to default** restores the black & gold look.
- **Global search** — the top-bar search (also **Ctrl/Cmd + K**) finds products,
  inventory, staff, categories, sales, activity and stock movements. Results are
  role-scoped, grouped, keyboard navigable and prefill the destination page's
  filter.
- **Inventory** — raw supplies with search, category/status filters, sorting,
  pagination, stock in/out movements, per-item history, low-stock thresholds and
  deletion protection for items used in recipes.
- **Products** — menu cards with image upload (auto-compressed), live preview,
  pricing, category, POS visibility, enable/disable and an ingredient **recipe**
  (bill of materials) that deducts raw stock on every sale.
- **Categories** — create, edit, delete (blocked while products are assigned) and
  view the products in each category.
- **Staff Accounts** — create/edit Inventory Staff and Cashier accounts, reset
  passwords, activate or deactivate, delete, and review each account's
  performance, sign-in history and recorded activity. Admin-only at both the UI
  and router level.
- **Sales** — every transaction with date/cashier/method filters, pagination,
  detail view, receipt reprint, CSV export and admin-only **voiding** (which
  restores the deducted inventory and removes the sale from revenue).
- **Transactions** — a single register of every sale with status/method/search
  filters, quick receipt reprint and CSV export.
- **Reports** — date/payment/cashier/category filters with revenue, orders, items
  sold and average order KPIs; sales trend, category mix, best sellers and
  cashier performance charts; category and cashier tables; CSV export pack.
- **Settings** — shop name, address, contact, currency code/symbol, VAT rate,
  receipt width (58 mm / 80 mm), receipt footer, logo upload, low-stock
  threshold, admin profile/password, JSON backup & restore, storage usage and a
  full demo-data reset.
- **Activity Logs** — every sign-in, sign-out, stock movement, staff change,
  sale, settings change and password reset, filterable by role and type.

### Inventory Staff

- **Inventory dashboard** — four KPI cards (total items, in stock, low stock,
  out of stock), total **stock value** at cost, retail value, units on hand,
  low-stock alerts, recently updated items and recent stock movements.
- **Inventory list** — search by name/ID, category and status filters, sorting,
  pagination and a full table showing category, quantity, unit, cost, selling
  price, minimum stock and status badges.
- **Stock In / Stock Out** — dedicated forms with live current/minimum levels,
  validation (cannot remove more than is on hand), notes and an immediate
  movement log. Sales also appear in the movement history.
- **Inventory History** — every movement with item, type, signed quantity,
  note, staff member and timestamp, searchable and filterable.
- Inventory Staff can add and edit supply items but **cannot** delete them,
  manage menu products, see sales or open the admin area.

### Cashier (dashboard + POS)

- **Cashier dashboard** (`#/cashier/dashboard`) — personal shift cards for today's
  sales, orders, average order, items sold, all-time revenue and menu size;
  recent own sales; personal best sellers; quick links to the POS, transaction
  history and password change.
- Four personal shift cards in the POS: today's transactions, today's sales,
  completed orders and current cashier.
- A **Back** button in the POS top-left returns admins to the admin dashboard and
  cashiers to the cashier dashboard. With items in the cart it asks first, then
  saves the draft so nothing is lost.
- Category tabs, live search and product tiles with stock-aware "sold out"
  states.
- Cart with quantity controls, percentage or fixed-amount discounts, VAT, and a
  running total.
- Payment via **Cash**, **GCash** or **Maya**, quick-cash buttons, change due /
  short-payment feedback and optional e-wallet reference numbers.
- Stock is verified against every recipe line before checkout and deducted
  atomically; the checkout button locks during processing to prevent duplicates.
- Receipt preview with print support, plus a **personal** transaction history
  (cashiers never see another cashier's sales).
- Draft orders are saved to `localStorage` and restored on reload.

---

## Account security

- **Sign in** with username *or* email, a show/hide password toggle and
  **Remember me** (30 days; otherwise the session expires after 12 hours).
- **Forgot Password** is a standalone three-step recovery page (`#/forgot`) that
  runs entirely in the browser:
  1. Enter your username or email. The same response is shown whether or not an
     account exists, so the form cannot be used to enumerate accounts.
  2. A **six-digit, single-use code** is generated. It expires after **10
     minutes**; demo delivery displays it in the on-page demo inbox (a real build
     would email it). **New code** reissues it.
  3. Enter the code, choose and confirm a new password, then return to sign-in.
  Resetting a password immediately invalidates every outstanding code and any
  other session for that account.
- **Change Password** is available to every role from the account menu (current
  password, new password, confirmation, minimum 6 characters).
- **Login history** records successful and failed attempts with a reason and
  timestamp; admins can inspect it from each staff member's activity dialog.
- Passwords are stored as a per-user salted hash. This is still a demo-grade
  client-side scheme, not production authentication.
- A real "email me a reset link" flow needs a backend or auth provider; the demo
  intentionally keeps the delivery simulated.
- After a password reset or deactivation, existing sessions are invalidated on
  the next request.

> **Why not real email?** A static page has no server that can send mail or hold
> private secrets. The short-lived code demonstrates the same screens, expiry and
> single-use validation without a backend.

---

## Data & storage

Everything lives in the browser's `localStorage`:

| Key                | Contents                                  |
| ------------------ | ----------------------------------------- |
| `trippers.db`      | Users, categories, inventory, products, sales, notifications, stock moves, activities, login history, recovery tokens, settings |
| `trippers.db.bak`  | Last known-good snapshot of the database  |
| `trippers.images`  | Uploaded product images and shop logo (JPEG data URLs) |
| `trippers.session` | Signed-in session with expiry             |
| `trippers.cart`    | Saved POS draft order                     |
| `trippers.appearance` | Per-device theme, accent, sidebar, density and font preferences |

- Data is **shared by every role in the same browser** and is **per browser
  profile** — it does not sync between devices.
- Seeding runs only on first launch; reloading never duplicates the demo data.
- If `trippers.db` is ever corrupted, the app automatically recovers from
  `trippers.db.bak`.
- Uploaded images are resized and JPEG-compressed before saving. If storage
  fills up, the app warns you and rolls back the change instead of saving a
  half-broken record.

### Backup / restore / reset

- **Settings → Download JSON backup** writes the full database and images to a
  file.
- **Settings → Restore from backup** replaces current data with a backup
  (you are signed out afterwards).
- **Settings → Reset demo data** is **admin-only**; it wipes everything and
  reseeds the original demo dataset, including the demo accounts.

Use the backup button before clearing browser history or switching browsers.

---

## Receipt printing

Receipts print on thermal roll paper at **80 mm** (default) or **58 mm**. Choose
the width in **Settings → Receipt width**, then use **Print receipt** from the
POS, the receipt modal, a transaction row or the Sales page. Printing uses a
dedicated print stylesheet so only the receipt is sent to the printer — set the
printer's paper size to match in the browser print dialog.

---

## Project structure

```
index.html                  App shell: login, admin/inventory layouts, POS, modals
assets/images/
  logo.svg                  Full brand lockup (beans + TRIPPERS COFFEE)
  logo-mark.svg             Beans mark used in the sidebar and POS top bar
  favicon.svg               Browser tab icon
css/
  style.css                 Design tokens, layout, components, receipt, print
  appearance.css            Theme variants, sidebar, search, recovery, dashboard extras
  dashboard.css             Admin dashboard widgets
  inventory.css             Inventory tables and stock meters
  products.css              Product grid, recipe editor, image drop zone
  pos.css                   POS tiles, cart, payment and mobile drawer
  reports.css               Filters, KPI cards and report grids
  responsive.css            Breakpoint and motion overrides
js/
  storage.js                Utilities, schema, seed data, persistence, activity,
                            login history and reset tokens
  auth.js                   Login, sessions, password changes, role guards
  appearance.js             Theme/accent/layout preferences and Settings preview
  search.js                 Role-aware global search and keyboard navigation
  charts.js                 Canvas line / bar / horizontal bar / doughnut engine
  receipt.js                Shared receipt builder, preview and printing
  admin.js                  Admin dashboard metrics, charts and widgets
  inventory.js              Shared inventory CRUD and stock modals
  inventoryStaff.js         Inventory Staff dashboard, list, stock in/out, history
  products.js               Products + categories management
  staff.js                  Staff account management (admin only)
  cashier.js                Cashier dashboard: personal shift overview
  pos.js                    POS catalogue, cart, payments, checkout, history
  sales.js                  Sales list, details, void, CSV export
  transactions.js           Admin transaction register
  reports.js                Analytics, filters and export pack
  settings.js               Shop/profile settings and data tools
  activity.js               Admin activity log
  app.js                    Boot, hash router, shells, recovery, toasts
archive/                    Superseded modules kept for reference
vendor/                     Bootstrap 5.3.3 CSS/JS and Bootstrap Icons (local)
```

Scripts load as classic `<script>` tags in dependency order, so no module server
is required.

---

## Routes

| Role            | Routes |
| --------------- | ------ |
| Admin           | `#/admin/dashboard`, `inventory`, `products`, `categories`, `staff`, `sales`, `transactions`, `reports`, `settings`, `activity` |
| Inventory Staff | `#/inventory/dashboard`, `list`, `stock-in`, `stock-out`, `history` |
| Cashier         | `#/cashier/dashboard` |
| Cashier / Admin | `#/pos` |
| Everyone        | `#/login`, `#/forgot` |

`#/admin/cashiers` from the older two-role build redirects to
`#/admin/staff`. Unknown routes fall back to the signed-in user's home route.

---

## Motion & accessibility

Animation is used to explain change, not to decorate it. Everything shares one
easing family (defined as `--ease-out`, `--ease-in-out`, `--ease-spring`, plus
`--dur-fast`, `--dur`, `--dur-slow` in `css/style.css`), so the whole app moves
at a consistent tempo.

- **Page changes** fade the page in and stagger its top-level blocks
  (`page-in` + `block-in`). Dashboard and report KPIs count up from zero.
- **Charts** draw themselves in — the line sweeps left → right, bars grow from
  the axis, horizontal bars extend, doughnuts sweep round. Hovering a chart
  cancels the reveal immediately and hands control to the tooltip.
- **POS** replays a short tile stagger when you search or switch category (never
  when the cart changes), animates only newly added cart lines, and bumps the
  grand total when it changes.
- **Sign-in stage** — the brand emblem floats inside a pulsing halo and a
  slowly rotating gold orbit, over drifting warm aurora orbs, two sweeping
  light beams and rising dust motes.
- **Chrome** — sidebar links, stat icons, payment methods and product tiles all
  lift or scale on hover; the sticky top bar gains elevation as you scroll; the
  mobile sidebar and cart drawer slide with the same easing.
- **Feedback** — toasts spring in with a countdown bar that pauses while you
  hover them, and modals lift in over a blurred backdrop.

All of it respects **`prefers-reduced-motion: reduce`**: CSS animations and
transitions collapse to near-zero, stagger delays are removed, and the JS chart
reveals and number count-ups jump straight to their final values. No animation
is required to use any part of the app.

---

## Notes & limitations

- This is a **local demonstration build**. Credentials use a deliberate
  demo-grade salted hash, not production cryptography — do not reuse it for real
  accounts.
- All state is device-local. For multi-device or multi-terminal use you would
  replace `js/storage.js` with an API-backed data layer and real server-side
  authentication.
- VAT (12% by default, editable) is applied to `subtotal − discount`.
- Product prices are tax-exclusive; receipts show the tax line separately.
- Product sales deduct raw inventory through each product's recipe, so a sale
  can be blocked when an ingredient would go negative.
- Tested in current Chrome, Edge and Firefox at desktop, tablet and phone sizes.
- Use **Settings → Reset demo data** whenever you want a clean starting point.

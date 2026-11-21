/* ==========================================================================
   TRIPPERS COFFEE — admin.js
   Admin dashboard: eight KPIs, ranged sales chart, category donut, best
   sellers, recent transactions, inventory alerts, staff overview, activity.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;
  var range = "today";

  /* ------------------------------------------------------------- dates */
  function dayStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function sameDay(iso, d) {
    var x = new Date(iso);
    return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
  }

  function completedSales() {
    return Store.db.sales.filter(function (s) { return s.status === "completed"; });
  }

  function sumBetween(sales, from, to) {
    var total = 0, count = 0;
    sales.forEach(function (s) {
      var t = new Date(s.datetime).getTime();
      if (t >= from.getTime() && t <= to.getTime()) {
        total += Number(s.total) || 0;
        count++;
      }
    });
    return { total: U.r2(total), count: count };
  }

  /* ------------------------------------------------------------- deltas */
  function setDelta(id, current, previous, suffix) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = "stat-delta";
    if (!previous && !current) {
      el.classList.add("delta-flat");
      el.innerHTML = "—";
      return;
    }
    if (!previous) {
      el.classList.add("delta-up");
      el.innerHTML = '<i class="bi bi-arrow-up-right"></i> new' + (suffix || "");
      return;
    }
    var pct = ((current - previous) / previous) * 100;
    if (Math.abs(pct) < 0.05) {
      el.classList.add("delta-flat");
      el.innerHTML = "flat";
      return;
    }
    var up = pct > 0;
    el.classList.add(up ? "delta-up" : "delta-down");
    el.innerHTML = '<i class="bi bi-arrow-' + (up ? "up" : "down") + '-right"></i> ' +
      Math.abs(pct).toFixed(1) + "%";
  }

  function setChip(id, text, tone) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = "stat-delta " + (tone === "down" ? "delta-down" : tone === "up" ? "delta-up" : "delta-flat");
    el.textContent = text;
  }

  /* ------------------------------------------------------------- chart series */
  function seriesFor(kind) {
    var sales = completedSales();
    var now = new Date();

    if (kind === "today") {
      var labels = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];
      var values = labels.map(function () { return 0; });
      sales.forEach(function (s) {
        if (!sameDay(s.datetime, now)) return;
        var h = new Date(s.datetime).getHours();
        var idx = Math.min(7, Math.floor(h / 3));
        values[idx] += Number(s.total) || 0;
      });
      return { labels: labels, values: values.map(U.r2), caption: "Today · every 3 hours" };
    }

    if (kind === "week") {
      var wl = [], wv = [];
      for (var i = 6; i >= 0; i--) {
        var d = addDays(now, -i);
        var total = 0;
        sales.forEach(function (s) { if (sameDay(s.datetime, d)) total += Number(s.total) || 0; });
        wl.push(d.toLocaleDateString("en-PH", { weekday: "short" }));
        wv.push(U.r2(total));
      }
      return { labels: wl, values: wv, caption: "Last 7 days" };
    }

    if (kind === "month") {
      var ml = [], mv = [];
      var start = new Date(now.getFullYear(), now.getMonth(), 1);
      var end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      var cursor = new Date(start);
      while (cursor <= now && cursor <= end) {
        var blockEnd = addDays(cursor, 6);
        if (blockEnd > now) blockEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        var r = sumBetween(sales, cursor, blockEnd);
        ml.push(cursor.getDate() + "–" + blockEnd.getDate());
        mv.push(r.total);
        cursor = addDays(cursor, 7);
      }
      return { labels: ml, values: mv, caption: "This month · weekly blocks" };
    }

    var yl = [], yv = [];
    for (var m = 0; m < 12; m++) {
      var mStart = new Date(now.getFullYear(), m, 1);
      var mEnd = new Date(now.getFullYear(), m + 1, 0, 23, 59, 59);
      yl.push(mStart.toLocaleDateString("en-PH", { month: "short" }));
      yv.push(mStart > now ? 0 : sumBetween(sales, mStart, mEnd).total);
    }
    return { labels: yl, values: yv, caption: now.getFullYear() + " · monthly revenue" };
  }

  function rangeBounds(kind) {
    var now = new Date();
    var start = dayStart(now);
    if (kind === "week") start = addDays(start, -6);
    else if (kind === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (kind === "year") start = new Date(now.getFullYear(), 0, 1);
    var end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { start: start, end: end };
  }

  function drawTrend() {
    var canvas = document.getElementById("dashTrendChart");
    if (!canvas) return;
    var series = seriesFor(range);
    var label = document.getElementById("chartPeriodLabel");
    if (label) label.textContent = series.caption;

    window.Charts.line(canvas, {
      labels: series.labels,
      series: [{ label: "Revenue", data: series.values, color: "#D4AF37" }],
      format: function (v) {
        if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k";
        return U.num(v, 0);
      },
      emptyText: "No sales recorded for this period yet"
    });
  }

  function renderSummary() {
    var bounds = rangeBounds(range);
    var stats = sumBetween(completedSales(), bounds.start, bounds.end);
    var aov = stats.count ? stats.total / stats.count : 0;
    var labels = { today: "Today", week: "Last 7 days", month: "This month", year: "This year" };

    U.countUp(document.getElementById("sumRevenue"), stats.total, function (v) { return U.money(v); });
    U.countUp(document.getElementById("sumOrders"), stats.count, function (v) { return U.num(v, 0); });
    U.countUp(document.getElementById("sumAov"), aov, function (v) { return U.money(v); });
    document.getElementById("sumRangeLabel").textContent = labels[range];
  }

  /* ------------------------------------------------------------- KPI cards */
  function renderCards() {
    var sales = completedSales();
    var now = new Date();
    var todayStart = dayStart(now);
    var tomorrow = addDays(todayStart, 1);
    var yesterdayStart = addDays(todayStart, -1);

    var today = sumBetween(sales, todayStart, tomorrow);
    var yesterday = sumBetween(sales, yesterdayStart, todayStart);

    var revenue = sales.reduce(function (a, s) { return a + (Number(s.total) || 0); }, 0);
    var last30 = sumBetween(sales, addDays(todayStart, -29), tomorrow);
    var prev30 = sumBetween(sales, addDays(todayStart, -59), addDays(todayStart, -29));

    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    var nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    var prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var thisMonth = sumBetween(sales, monthStart, nextMonth);
    var prevMonth = sumBetween(sales, prevMonthStart, monthStart);
    var top = bestSellers()[0];

    var products = Store.db.products;
    var activeProducts = products.filter(function (p) { return p.active && p.available; });
    var lowItems = Store.lowStockItems();
    var outItems = lowItems.filter(function (i) { return Store.stockStatus(i) === "out"; });
    var staff = Store.staff();
    var activeStaff = staff.filter(function (u) { return u.status === "active"; });

    U.countUp(document.getElementById("kpiTodaySales"), today.total, function (v) { return U.money(v); });
    U.countUp(document.getElementById("kpiTodayOrders"), today.count, function (v) { return U.num(v, 0); });
    U.countUp(document.getElementById("kpiProducts"), products.length, function (v) { return U.num(v, 0); });
    U.countUp(document.getElementById("kpiLowStock"), lowItems.length, function (v) { return U.num(v, 0); });
    U.countUp(document.getElementById("kpiStaff"), staff.length, function (v) { return U.num(v, 0); });
    U.countUp(document.getElementById("kpiRevenue"), revenue, function (v) { return U.money(v); });
    U.countUp(document.getElementById("kpiMonthly"), thisMonth.total, function (v) { return U.money(v); });

    var bestEl = document.getElementById("kpiBestProduct");
    if (bestEl) {
      bestEl.textContent = top ? top.name : "No sales yet";
      bestEl.title = top ? top.name : "";
    }

    document.getElementById("kpiTodaySalesFoot").textContent =
      today.count ? today.count + " order" + (today.count === 1 ? "" : "s") + " completed today" : "No sales yet today";
    document.getElementById("kpiTodayOrdersFoot").textContent =
      yesterday.count + " order" + (yesterday.count === 1 ? "" : "s") + " yesterday";
    document.getElementById("kpiProductsFoot").textContent =
      activeProducts.length + " available on the POS";
    document.getElementById("kpiLowStockFoot").textContent =
      outItems.length + " out of stock · " + (lowItems.length - outItems.length) + " running low";
    document.getElementById("kpiStaffFoot").textContent =
      activeStaff.length + " active · " + Store.staffByRole("inventory").length + " inventory · " +
      Store.staffByRole("cashier").length + " cashier";
    document.getElementById("kpiRevenueFoot").textContent =
      sales.length + " recorded transaction" + (sales.length === 1 ? "" : "s");
    document.getElementById("kpiMonthlyFoot").textContent =
      thisMonth.count + " order" + (thisMonth.count === 1 ? "" : "s") + " this month";
    document.getElementById("kpiBestFoot").textContent = top
      ? U.num(top.qty, 0) + " unit" + (top.qty === 1 ? "" : "s") + " · " + U.money(top.revenue) + " earned"
      : "Waiting for the first sale";

    setDelta("kpiTodaySalesDelta", today.total, yesterday.total);
    setDelta("kpiTodayOrdersDelta", today.count, yesterday.count);
    setChip("kpiProductsDelta", activeProducts.length + " live", activeProducts.length ? "up" : "flat");
    setChip("kpiLowStockDelta", outItems.length ? "urgent" : "healthy", outItems.length ? "down" : "up");
    setChip("kpiStaffDelta", activeStaff.length + " active", "flat");
    setDelta("kpiRevenueDelta", last30.total, prev30.total);
    setDelta("kpiMonthlyDelta", thisMonth.total, prevMonth.total);
    if (top) setChip("kpiBestDelta", "Top seller", "up");
    else setChip("kpiBestDelta", "—", "flat");

    document.getElementById("dashSubtitle").textContent =
      now.toLocaleDateString("en-PH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) +
      " · " + U.money(today.total) + " in completed sales today.";
  }

  /* ------------------------------------------------------------- best sellers */
  function bestSellers() {
    var map = {};
    completedSales().forEach(function (s) {
      (s.items || []).forEach(function (it) {
        var key = it.productId || it.name;
        if (!map[key]) map[key] = { productId: it.productId, name: it.name, qty: 0, revenue: 0 };
        map[key].qty += Number(it.qty) || 0;
        map[key].revenue += Number(it.lineTotal) || (Number(it.price) * Number(it.qty)) || 0;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.qty - a.qty; });
  }

  function renderBestSellers() {
    var list = document.getElementById("bestSellersList");
    if (!list) return;
    var rows = bestSellers().slice(0, 5);

    if (!rows.length) {
      list.innerHTML = '<div class="empty-state" style="padding:1.4rem 1rem"><i class="bi bi-cup-hot"></i>' +
        "<p>No completed sales yet. Start a sale to see which products are popular.</p></div>";
      return;
    }

    list.innerHTML = rows.map(function (r) {
      var product = r.productId ? Store.product(r.productId) : null;
      var img = product ? (Store.image(product.id) || U.placeholderImage(product.name)) : U.placeholderImage(r.name);
      return '<div class="best-row">' +
        '<div class="best-thumb"><img src="' + U.esc(img) + '" alt=""></div>' +
        '<div class="best-main">' +
        '<div class="best-name"><span>' + U.esc(r.name) + "</span><span>" + U.money(r.revenue) + "</span></div>" +
        '<div class="cell-sub">' + U.num(r.qty, 0) + " unit" + (r.qty === 1 ? "" : "s") + " sold</div>" +
        "</div></div>";
    }).join("");
  }

  /* ------------------------------------------------------------- category mix */
  var CAT_COLORS = ["#D4AF37", "#B8912F", "#94722A", "#6E5520", "#C9A44C", "#A98B3F", "#7C6631", "#4B3D1F"];

  function categoryTotals() {
    var map = {};
    completedSales().forEach(function (s) {
      (s.items || []).forEach(function (it) {
        var product = it.productId ? Store.product(it.productId) : null;
        var cat = product && product.categoryId ? Store.db.categories.filter(function (c) {
          return c.id === product.categoryId;
        })[0] : null;
        var key = cat ? cat.id : "uncategorized";
        if (!map[key]) map[key] = { name: cat ? cat.name : "Uncategorized", revenue: 0, qty: 0 };
        map[key].revenue += Number(it.lineTotal) || (Number(it.price) * Number(it.qty)) || 0;
        map[key].qty += Number(it.qty) || 0;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.revenue - a.revenue; });
  }

  function renderCategoryChart() {
    var canvas = document.getElementById("dashCategoryChart");
    var legend = document.getElementById("dashCategoryLegend");
    if (!canvas || !legend) return;

    var rows = categoryTotals();
    if (rows.length > 5) {
      var rest = rows.slice(4).reduce(function (a, r) {
        a.revenue += r.revenue;
        a.qty += r.qty;
        return a;
      }, { name: "Other categories", revenue: 0, qty: 0 });
      rows = rows.slice(0, 4).concat([rest]);
    }

    var total = rows.reduce(function (a, r) { return a + r.revenue; }, 0);

    window.Charts.doughnut(canvas, {
      labels: rows.map(function (r) { return r.name; }),
      data: rows.map(function (r) { return U.r2(r.revenue); }),
      colors: CAT_COLORS,
      centerLabel: "REVENUE",
      format: function (v) { return U.money(v); },
      emptyText: "Complete a sale to see category performance"
    });

    if (!rows.length || total <= 0) {
      legend.innerHTML = '<div class="empty-state" style="padding:.6rem"><p>No category sales yet.</p></div>';
      return;
    }

    legend.innerHTML = rows.map(function (r, i) {
      var pct = total > 0 ? Math.round((r.revenue / total) * 100) : 0;
      return '<div class="legend-row">' +
        '<span class="legend-dot" style="background:' + CAT_COLORS[i % CAT_COLORS.length] + '"></span>' +
        '<span class="legend-name">' + U.esc(r.name) + "</span>" +
        '<span class="legend-val mono">' + U.money(r.revenue) + "</span>" +
        '<span class="legend-pct">' + pct + "%</span>" +
        "</div>";
    }).join("");
  }

  /* ------------------------------------------------------------- staff activity */
  function activityIcon(action) {
    var a = String(action || "").toLowerCase();
    if (a.indexOf("password") > -1) return "bi-key";
    if (a.indexOf("sign") > -1) return "bi-box-arrow-in-right";
    if (a.indexOf("stock") > -1) return "bi-box-seam";
    if (a.indexOf("sale") > -1) return "bi-bag-check";
    if (a.indexOf("product") > -1) return "bi-cup-hot";
    if (a.indexOf("user") > -1 || a.indexOf("staff") > -1) return "bi-person-gear";
    return "bi-activity";
  }

  function renderStaffActivity() {
    var box = document.getElementById("dashStaffActivity");
    if (!box) return;
    var rows = (Store.db.activities || []).slice(0, 6);

    if (!rows.length) {
      box.innerHTML = '<div class="empty-state" style="padding:1.2rem"><i class="bi bi-activity"></i>' +
        "<p>No staff activity recorded yet.</p></div>";
      return;
    }

    box.innerHTML = rows.map(function (a) {
      return '<div class="activity-row">' +
        '<div class="act-ico"><i class="bi ' + activityIcon(a.action) + '"></i></div>' +
        '<div class="flex-grow-1 min-w-0">' +
        '<div class="act-title">' + U.esc(a.action || "Activity") + "</div>" +
        '<div class="cell-sub">' + U.esc(a.userName || "System") + " · " +
        U.esc(window.Auth.roleLabel(a.role)) + "</div>" +
        "</div>" +
        '<div class="act-time">' + U.fmtTime(a.datetime) + "</div>" +
        "</div>";
    }).join("");
  }

  /* ------------------------------------------------------------- tables */
  function renderRecent() {
    var body = document.getElementById("recentSalesBody");
    if (!body) return;
    var rows = completedSales().slice().sort(function (a, b) {
      return new Date(b.datetime) - new Date(a.datetime);
    }).slice(0, 5);

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5"><div class="empty-state"><i class="bi bi-receipt"></i>' +
        "<p>No transactions yet — open the POS to make the first sale.</p></div></td></tr>";
      return;
    }

    body.innerHTML = rows.map(function (s) {
      var cls = s.paymentMethod === "Cash" ? "badge-cash" : s.paymentMethod === "GCash" ? "badge-gcash" : "badge-maya";
      return '<tr class="cursor-pointer" data-sale="' + s.id + '">' +
        '<td><div class="cell-title mono">' + U.esc(s.id) + "</div>" +
        '<div class="cell-sub">' + U.fmtTime(s.datetime) + "</div></td>" +
        '<td class="cell-sub">' + U.esc(s.cashierName) + "</td>" +
        '<td><span class="badge-soft ' + cls + '">' + U.esc(s.paymentMethod) + "</span></td>" +
        '<td><span class="badge-soft badge-in"><i class="bi bi-check-circle"></i> Completed</span></td>' +
        '<td class="text-end mono fw-600">' + U.money(s.total) + "</td></tr>";
    }).join("");

    body.querySelectorAll("[data-sale]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        if (window.SalesPage) window.SalesPage.openSale(tr.getAttribute("data-sale"));
      });
    });
  }

  function renderAlerts() {
    var box = document.getElementById("dashAlerts");
    if (!box) return;
    var low = Store.lowStockItems().slice().sort(function (a, b) {
      var sa = Store.stockStatus(a) === "out" ? 0 : 1;
      var sb = Store.stockStatus(b) === "out" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return Number(a.qty) - Number(b.qty);
    }).slice(0, 4);

    if (!low.length) {
      box.innerHTML = '<div class="empty-state" style="padding:1.4rem 1rem">' +
        '<i class="bi bi-check2-circle" style="color:#5fae8a"></i>' +
        "<p>Great—nothing needs restocking right now.</p></div>";
      return;
    }

    box.innerHTML = low.map(function (i) {
      var status = Store.stockStatus(i);
      var badge = status === "out" ? "badge-out" : "badge-low";
      var text = status === "out" ? "Out of stock" : "Low stock";
      return '<div class="alert-item">' +
        '<div class="notif-ico ' + (status === "out" ? "out" : "low") + '">' +
        '<i class="bi ' + (status === "out" ? "bi-x-octagon" : "bi-exclamation-triangle") + '"></i></div>' +
        '<div class="a-main">' +
        '<div class="a1">' + U.esc(i.name) + "</div>" +
        '<div class="a2">' + U.qty(i.qty) + " " + U.esc(i.unit) + " remaining · min " +
        U.qty(i.minStock) + " " + U.esc(i.unit) + "</div>" +
        "</div>" +
        '<span class="badge-soft ' + badge + '">' + text + "</span>" +
        '<button class="btn btn-ghost btn-sm" data-view-alert="' + i.id + '">View</button>' +
        "</div>";
    }).join("");

    box.querySelectorAll("[data-view-alert]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-view-alert");
        window.App.go("#/admin/inventory");
        setTimeout(function () {
          if (window.InventoryPage) window.InventoryPage.openItem(id);
        }, 260);
      });
    });
  }

  function renderStaff() {
    var box = document.getElementById("staffOverviewList");
    if (!box) return;
    var staff = Store.staff().slice().sort(function (a, b) {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      if (a.role !== b.role) return a.role === "inventory" ? -1 : 1;
      return a.fullName.localeCompare(b.fullName);
    }).slice(0, 6);

    if (!staff.length) {
      box.innerHTML = '<div class="empty-state" style="padding:1.2rem"><i class="bi bi-people"></i>' +
        "<p>No staff accounts yet. Create one from Staff Accounts.</p></div>";
      return;
    }

    box.innerHTML = staff.map(function (u) {
      var metric;
      if (u.role === "cashier") {
        var count = Store.db.sales.filter(function (s) {
          return s.cashierId === u.id && s.status === "completed";
        }).length;
        metric = count + " sale" + (count === 1 ? "" : "s");
      } else {
        var moves = Store.db.stockMoves.filter(function (m) {
          return m.userId === u.id && (m.type === "in" || m.type === "out");
        }).length;
        metric = moves + " stock move" + (moves === 1 ? "" : "s");
      }
      return '<div class="staff-row">' +
        (u.avatarData ? '<img class="avatar" src="' + U.attr(u.avatarData) + '" alt="">' : '<div class="avatar">' + U.esc(U.initials(u.fullName)) + "</div>") +
        '<div class="flex-grow-1 min-w-0">' +
        '<div class="staff-name">' + U.esc(u.fullName) + "</div>" +
        '<div class="cell-sub">' + (u.role === "inventory" ? "Inventory Staff" : "Cashier") +
        " · " + U.esc(metric) + "</div></div>" +
        (u.status === "active"
          ? '<span class="badge-soft badge-in">Active</span>'
          : '<span class="badge-soft badge-muted">Inactive</span>') +
        "</div>";
    }).join("");
  }

  function renderAttendanceOverview() {
    var box = document.getElementById("dashRecentAttendance");
    if (!box) return;
    var users = Store.db.users.filter(function (u) { return u.role !== "admin" && u.status === "active"; });
    var today = U.todayISO();
    var rows = (Store.db.attendance || []).filter(function (r) { return r.date === today && r.clockInAt; });
    var parts = String(Store.db.settings.attendanceStartTime || "09:00").split(":");
    var start = (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
    var present = rows.filter(function (r) { var d = new Date(r.clockInAt); return d.getHours() * 60 + d.getMinutes() <= start; }).length;
    var late = rows.filter(function (r) { var d = new Date(r.clockInAt); return d.getHours() * 60 + d.getMinutes() > start; }).length;
    var absent = Math.max(0, users.length - rows.length), total = users.length || 1;
    [["dashAttTotal", users.length], ["dashAttPresent", present], ["dashAttLate", late], ["dashAttAbsent", absent]].forEach(function (p) { var el = document.getElementById(p[0]); if (el) el.textContent = p[1]; });
    [["dashAttPresentBar", present], ["dashAttLateBar", late], ["dashAttAbsentBar", absent]].forEach(function (p) { var el = document.getElementById(p[0]); if (el) el.style.width = Math.round(p[1] / total * 100) + "%"; });
    var sorted = rows.slice().sort(function (a, b) { return b.clockInAt.localeCompare(a.clockInAt); }).slice(0, 4);
    box.innerHTML = sorted.length ? sorted.map(function (r) { var u = Store.user(r.userId); if (!u) return ""; var d = new Date(r.clockInAt), lateNow = d.getHours() * 60 + d.getMinutes() > start; return '<div class="dash-att-row"><span class="dash-att-name">' + U.esc(u.fullName) + '</span><span class="cell-sub">' + U.esc(U.fmtTime(r.clockInAt)) + '</span><span class="badge-soft ' + (lateNow ? "badge-low" : "badge-in") + '">' + (lateNow ? "Late" : "Present") + '</span></div>'; }).join("") : '<div class="cell-sub">No one has clocked in yet today.</div>';
  }

  /* ------------------------------------------------------------- quick actions */
  function quickAction(kind) {
    if (kind === "product") {
      if (!Store.db.categories.length) {
        window.App.toast("Create a category before adding products.", "warning");
        window.App.go("#/admin/categories");
        return;
      }
      window.App.go("#/admin/products");
      setTimeout(function () {
        if (window.ProductsPage && window.ProductsPage.openForm) window.ProductsPage.openForm();
      }, 260);
    } else if (kind === "inventory") {
      window.App.go("#/admin/inventory");
      setTimeout(function () {
        if (window.InventoryPage) window.InventoryPage.openForm(null);
      }, 260);
    } else if (kind === "staff") {
      window.App.go("#/admin/staff");
      setTimeout(function () {
        if (window.StaffPage) window.StaffPage.openForm();
      }, 260);
    } else if (kind === "sales") {
      window.App.go("#/admin/sales");
    } else if (kind === "report") {
      window.App.go("#/admin/reports");
    }
  }

  function bind() {
    var group = document.getElementById("dashPeriod");
    if (group && !group.dataset.bound) {
      group.dataset.bound = "1";
      group.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-range]");
        if (!btn) return;
        group.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        range = btn.getAttribute("data-range");
        drawTrend();
        renderSummary();
      });
    }

    var refresh = document.getElementById("dashRefresh");
    if (refresh && !refresh.dataset.bound) {
      refresh.dataset.bound = "1";
      refresh.addEventListener("click", function () {
        AdminPage.render();
        window.App.toast("Dashboard refreshed.", "success", 1800);
      });
    }

    var quick = document.querySelector(".quick-actions");
    if (quick && !quick.dataset.bound) {
      quick.dataset.bound = "1";
      quick.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-quick]");
        if (btn) quickAction(btn.getAttribute("data-quick"));
      });
    }

    if (!bind.timer) {
      bind.timer = window.setInterval(function () {
        if (window.App && window.App.current === "#/admin/dashboard" && document.visibilityState === "visible") {
          AdminPage.render();
        }
      }, 60000);
    }
  }

  var AdminPage = {
    render: function () {
      if (!window.Auth.requireAdmin(true)) return;
      renderCards();
      drawTrend();
      renderSummary();
      renderBestSellers();
      renderCategoryChart();
      renderStaffActivity();
      renderRecent();
      renderAlerts();
      renderStaff();
      renderAttendanceOverview();
      bind();
    },

    /** Used after a sale or stock change so the dashboard is never stale. */
    refreshIfVisible: function () {
      if (window.App && window.App.current === "#/admin/dashboard") this.render();
    }
  };

  window.AdminPage = AdminPage;
})(window);

/* ==========================================================================
   TRIPPERS COFFEE — reports.js
   Filtered analytics, four canvas charts and CSV exports.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;

  var state = {
    from: "",
    to: "",
    method: "all",
    cashier: "all",
    category: "all",
    bound: false
  };

  function addDays(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function resetRange() {
    var today = new Date();
    state.from = U.ymd(addDays(today, -29));
    state.to = U.ymd(today);
  }

  function fillSelects() {
    var cashierSel = document.getElementById("repCashier");
    var catSel = document.getElementById("repCategory");
    var cashiers = Store.cashiers();
    cashierSel.innerHTML = '<option value="all">All cashiers</option>' +
      cashiers.map(function (c) {
        return '<option value="' + c.id + '">' + U.esc(c.fullName) + "</option>";
      }).join("");
    catSel.innerHTML = '<option value="all">All categories</option>' +
      Store.db.categories.map(function (c) {
        return '<option value="' + c.id + '">' + U.esc(c.name) + "</option>";
      }).join("");

    cashierSel.value = state.cashier;
    catSel.value = state.category;
    document.getElementById("repMethod").value = state.method;
    document.getElementById("repFrom").value = state.from;
    document.getElementById("repTo").value = state.to;
  }

  /** Applies date/cashier/method filters, then optionally narrows by category. */
  function build() {
    var fromYmd = state.from || "0000-01-01";
    var toYmd = state.to || "9999-12-31";

    var sales = Store.db.sales.filter(function (s) {
      if (s.status !== "completed") return false;
      var d = U.ymd(new Date(s.datetime));
      if (d < fromYmd || d > toYmd) return false;
      if (state.method !== "all" && s.paymentMethod !== state.method) return false;
      if (state.cashier !== "all" && s.cashierId !== state.cashier) return false;
      if (state.category !== "all") {
        var has = (s.items || []).some(function (it) { return it.categoryId === state.category; });
        // Older seeded sales only store categoryName, so fall back to name matching.
        if (!has) {
          var cat = Store.category(state.category);
          has = cat && (s.items || []).some(function (it) { return it.categoryName === cat.name; });
        }
        if (!has) return false;
      }
      return true;
    }).sort(function (a, b) { return new Date(a.datetime) - new Date(b.datetime); });

    var cat = state.category !== "all" ? Store.category(state.category) : null;

    /* Revenue weighting keeps category-filtered totals meaningful. */
    var weightedRevenue = 0;
    var itemsSold = 0;
    var productMap = {};
    var catMap = {};
    var cashierMap = {};

    sales.forEach(function (s) {
      var matching = (s.items || []).filter(function (it) {
        if (state.category === "all") return true;
        return it.categoryId === state.category || (cat && it.categoryName === cat.name);
      });
      var matchingTotal = matching.reduce(function (a, it) {
        return a + (Number(it.lineTotal) || Number(it.price) * Number(it.qty) || 0);
      }, 0);
      var subtotal = Number(s.subtotal) || matchingTotal || 1;
      var factor = state.category === "all" ? 1 : Math.min(1, matchingTotal / subtotal);
      var revenue = (Number(s.total) || 0) * factor;
      weightedRevenue += revenue;

      matching.forEach(function (it) {
        itemsSold += Number(it.qty) || 0;
        var key = it.productId || it.name;
        if (!productMap[key]) productMap[key] = { name: it.name, qty: 0, revenue: 0 };
        productMap[key].qty += Number(it.qty) || 0;
        productMap[key].revenue += Number(it.lineTotal) || (Number(it.price) * Number(it.qty)) || 0;

        var cname = it.categoryName || "Uncategorised";
        if (!catMap[cname]) catMap[cname] = { name: cname, qty: 0, revenue: 0 };
        catMap[cname].qty += Number(it.qty) || 0;
        catMap[cname].revenue += Number(it.lineTotal) || (Number(it.price) * Number(it.qty)) || 0;
      });

      var cid = s.cashierId || s.cashierName;
      if (!cashierMap[cid]) cashierMap[cid] = { id: cid, name: s.cashierName, orders: 0, revenue: 0 };
      cashierMap[cid].orders++;
      cashierMap[cid].revenue += revenue;
    });

    return {
      sales: sales,
      revenue: U.r2(weightedRevenue),
      orders: sales.length,
      items: itemsSold,
      aov: sales.length ? U.r2(weightedRevenue / sales.length) : 0,
      products: Object.keys(productMap).map(function (k) { return productMap[k]; })
        .sort(function (a, b) { return b.qty - a.qty; }),
      categories: Object.keys(catMap).map(function (k) { return catMap[k]; })
        .sort(function (a, b) { return b.revenue - a.revenue; }),
      cashiers: Object.keys(cashierMap).map(function (k) { return cashierMap[k]; })
        .sort(function (a, b) { return b.revenue - a.revenue; })
    };
  }

  function dailySeries(data) {
    var labels = [], values = [];
    var from = new Date(state.from + "T00:00:00");
    var to = new Date(state.to + "T00:00:00");
    if (isNaN(from) || isNaN(to) || to < from) {
      to = new Date();
      from = addDays(to, -29);
    }
    var days = Math.round((to - from) / 86400000) + 1;
    days = Math.max(1, Math.min(days, 120));
    for (var i = 0; i < days; i++) {
      var d = addDays(from, i);
      var ymd = U.ymd(d);
      var total = 0;
      data.sales.forEach(function (s) {
        if (U.ymd(new Date(s.datetime)) !== ymd) return;
        if (state.category === "all") {
          total += Number(s.total) || 0;
        } else {
          var cat = Store.category(state.category);
          var matching = (s.items || []).filter(function (it) {
            return it.categoryId === state.category || (cat && it.categoryName === cat.name);
          });
          var mt = matching.reduce(function (a, it) { return a + (Number(it.lineTotal) || 0); }, 0);
          var st = Number(s.subtotal) || mt || 1;
          total += (Number(s.total) || 0) * Math.min(1, mt / st);
        }
      });
      labels.push(d.toLocaleDateString("en-PH", { day: "2-digit", month: "short" }));
      values.push(U.r2(total));
    }
    return { labels: labels, values: values };
  }

  function drawCharts(data) {
    var trend = dailySeries(data);
    window.Charts.line(document.getElementById("repTrendChart"), {
      labels: trend.labels,
      series: [{ label: "Revenue", data: trend.values, color: "#D4AF37" }],
      format: function (v) {
        if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k";
        return U.num(v, 0);
      },
      emptyText: "No sales in this range"
    });

    var catLabels = data.categories.slice(0, 6).map(function (c) { return c.name; });
    var catData = data.categories.slice(0, 6).map(function (c) { return U.r2(c.revenue); });
    var colors = window.Charts.palette;
    window.Charts.doughnut(document.getElementById("repCategoryChart"), {
      labels: catLabels,
      data: catData,
      colors: colors,
      centerLabel: "SALES",
      format: function (v) { return U.money(v); },
      emptyText: "No category data"
    });

    var legend = document.getElementById("repCategoryLegend");
    legend.innerHTML = catLabels.length
      ? catLabels.map(function (l, i) {
        return '<span><i style="background:' + colors[i % colors.length] + '"></i>' + U.esc(l) + "</span>";
      }).join("")
      : '<span class="text-muted-soft">No categories in range</span>';

    var best = data.products.slice(0, 7);
    window.Charts.hbar(document.getElementById("repBestChart"), {
      labels: best.map(function (p) { return p.name; }),
      data: best.map(function (p) { return p.qty; }),
      format: function (v) { return U.num(v, 0); },
      emptyText: "No products sold in this range"
    });

    window.Charts.bar(document.getElementById("repCashierChart"), {
      labels: data.cashiers.map(function (c) { return c.name.split(" ")[0]; }),
      data: data.cashiers.map(function (c) { return U.r2(c.revenue); }),
      format: function (v) {
        if (v >= 1000) return (v / 1000).toFixed(0) + "k";
        return U.num(v, 0);
      },
      emptyText: "No cashier performance yet"
    });
  }

  function renderTables(data) {
    var catBody = document.getElementById("repCategoryBody");
    var catTotal = data.categories.reduce(function (a, c) { return a + c.revenue; }, 0);
    catBody.innerHTML = data.categories.length
      ? data.categories.map(function (c) {
        var share = catTotal ? (c.revenue / catTotal) * 100 : 0;
        return "<tr><td class=\"cell-title\">" + U.esc(c.name) + "</td>" +
          '<td class="text-end mono">' + U.num(c.qty, 0) + "</td>" +
          '<td class="text-end mono">' + U.money(c.revenue) + "</td>" +
          '<td class="text-end"><div class="d-flex align-items-center justify-content-end gap-2">' +
          '<div class="progress-thin" style="width:54px"><span style="width:' + share.toFixed(0) + '%"></span></div>' +
          '<span class="cell-sub mono">' + share.toFixed(1) + "%</span></div></td></tr>";
      }).join("")
      : '<tr><td colspan="4"><div class="empty-state" style="padding:1.2rem"><p>No category data.</p></div></td></tr>';

    var cashBody = document.getElementById("repCashierBody");
    cashBody.innerHTML = data.cashiers.length
      ? data.cashiers.map(function (c) {
        return "<tr><td><div class=\"cell-title\">" + U.esc(c.name) + "</div></td>" +
          '<td class="text-end mono">' + c.orders + "</td>" +
          '<td class="text-end mono">' + U.money(c.revenue) + "</td>" +
          '<td class="text-end mono">' + U.money(c.orders ? c.revenue / c.orders : 0) + "</td></tr>";
      }).join("")
      : '<tr><td colspan="4"><div class="empty-state" style="padding:1.2rem"><p>No cashier data.</p></div></td></tr>';
  }

  function renderKPIs(data) {
    U.countUp(document.getElementById("repRevenue"), data.revenue, function (v) { return U.money(v); });
    U.countUp(document.getElementById("repOrders"), data.orders, function (v) { return U.num(Math.round(v), 0); });
    U.countUp(document.getElementById("repItems"), data.items, function (v) { return U.num(Math.round(v), 0); });
    U.countUp(document.getElementById("repAov"), data.aov, function (v) { return U.money(v); });

    document.getElementById("repRevenueNote").textContent = state.category === "all"
      ? "All completed sales"
      : "Category-adjusted revenue";
    document.getElementById("repOrdersNote").textContent = data.orders
      ? "Across " + new Set(data.sales.map(function (s) { return U.ymd(new Date(s.datetime)); })).size + " active days"
      : "No transactions in range";
    document.getElementById("repItemsNote").textContent = data.orders
      ? (data.items / data.orders).toFixed(2) + " items per order"
      : "—";
    document.getElementById("repAovNote").textContent = data.orders
      ? "Average per transaction"
      : "—";

    document.getElementById("repRangeLabel").textContent = U.fmtDate(state.from) + " → " + U.fmtDate(state.to);
  }

  function render() {
    fillSelects();
    var data = build();
    renderKPIs(data);
    drawCharts(data);
    renderTables(data);
    if (!state.bound) bind();
  }

  function apply() {
    var f = document.getElementById("repFrom").value;
    var t = document.getElementById("repTo").value;
    if (f && t && f > t) { var tmp = f; f = t; t = tmp; }
    state.from = f;
    state.to = t;
    state.method = document.getElementById("repMethod").value;
    state.cashier = document.getElementById("repCashier").value;
    state.category = document.getElementById("repCategory").value;
    render();
    window.App.toast("Report filters applied.", "success", 1800);
  }

  /* ------------------------------------------------------------- exports */
  function exportSales() {
    var data = build();
    if (!data.sales.length) {
      window.App.toast("No sales match these filters.", "warning");
      return;
    }
    var rows = [["Receipt No", "Date", "Time", "Cashier", "Items", "Subtotal", "Discount", "Tax", "Total", "Payment", "Status"]];
    data.sales.forEach(function (s) {
      rows.push([
        s.id, U.fmtDate(s.datetime), U.fmtTime(s.datetime), s.cashierName,
        s.items.map(function (i) { return i.name + " x" + i.qty; }).join(" | "),
        s.subtotal.toFixed(2), s.discountAmount.toFixed(2), s.taxAmount.toFixed(2),
        s.total.toFixed(2), s.paymentMethod, s.status
      ]);
    });
    U.downloadCSV("trippers-sales-report-" + U.todayISO() + ".csv", rows);
    window.App.toast("Sales report exported.", "success");
  }

  function exportInventory() {
    var rows = [["Item ID", "Name", "Category", "Quantity", "Unit", "Cost Price", "Selling Price",
      "Stock Value", "Minimum Level", "Status", "Updated"]];
    Store.db.inventory.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (i) {
        rows.push([
          i.id, i.name, i.category, i.qty, i.unit,
          Number(i.costPrice).toFixed(2), Number(i.sellingPrice).toFixed(2),
          U.r2(Number(i.qty) * Number(i.costPrice)).toFixed(2),
          i.minStock, Store.stockStatus(i).toUpperCase(), U.fmtDate(i.updatedAt)
        ]);
      });
    U.downloadCSV("trippers-inventory-" + U.todayISO() + ".csv", rows);
  }

  function exportProducts() {
    var rows = [["Product ID", "Name", "Category", "Price", "Availability", "Status", "Recipe"]];
    Store.db.products.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (p) {
        var cat = Store.category(p.categoryId);
        rows.push([
          p.id, p.name, cat ? cat.name : "Uncategorised", Number(p.price).toFixed(2),
          p.available ? "Available" : "Unavailable",
          p.active ? "Active" : "Disabled",
          (p.recipe || []).map(function (r) {
            var item = Store.inventoryItem(r.inventoryId);
            return (item ? item.name : "Unknown") + " x" + r.qty + (item ? item.unit : "");
          }).join(" | ")
        ]);
      });
    U.downloadCSV("trippers-products-" + U.todayISO() + ".csv", rows);
  }

  function exportCashiers(data) {
    var rows = [["Cashier", "Employee ID", "Orders", "Revenue", "Average Order"]];
    (data || build()).cashiers.forEach(function (c) {
      var user = Store.cashiers().filter(function (u) { return u.id === c.id; })[0];
      rows.push([
        c.name, user ? user.employeeId : "—", c.orders,
        U.r2(c.revenue).toFixed(2), (c.orders ? U.r2(c.revenue / c.orders) : 0).toFixed(2)
      ]);
    });
    U.downloadCSV("trippers-cashier-performance-" + U.todayISO() + ".csv", rows);
  }

  function exportPack() {
    var data = build();
    if (!data.sales.length && !Store.db.products.length) {
      window.App.toast("Nothing to export yet.", "warning");
      return;
    }
    exportSales();
    setTimeout(exportInventory, 350);
    setTimeout(exportProducts, 700);
    setTimeout(function () { exportCashiers(data); }, 1050);
    window.App.toast("Export pack downloaded (4 CSV files).", "success", 4200);
  }

  function bind() {
    state.bound = true;
    document.getElementById("repApply").addEventListener("click", apply);
    document.getElementById("repReset").addEventListener("click", function () {
      resetRange();
      state.method = "all";
      state.cashier = "all";
      state.category = "all";
      render();
      window.App.toast("Report filters reset to the last 30 days.", "info", 2200);
    });
    document.getElementById("repExportSales").addEventListener("click", exportSales);
    document.getElementById("repExportAll").addEventListener("click", exportPack);
    document.getElementById("repMethod").addEventListener("change", apply);
    document.getElementById("repCashier").addEventListener("change", apply);
    document.getElementById("repCategory").addEventListener("change", apply);
    document.getElementById("repFrom").addEventListener("change", apply);
    document.getElementById("repTo").addEventListener("change", apply);
  }

  var ReportsPage = {
    render: function () {
      if (!state.from || !state.to) resetRange();
      render();
    },
    exportSales: exportSales,
    exportInventory: exportInventory,
    exportProducts: exportProducts,
    exportCashiers: exportCashiers,
    build: build
  };

  window.ReportsPage = ReportsPage;
})(window);

/* ==========================================================================
   TRIPPERS COFFEE — cashier.js
   Cashier dashboard: personal shift KPIs, recent own sales and top products.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;

  function me() {
    return window.Auth.user();
  }

  function mySales() {
    var user = me();
    if (!user) return [];
    return Store.db.sales.filter(function (s) { return s.cashierId === user.id; });
  }

  function completed(list) {
    return list.filter(function (s) { return s.status === "completed"; });
  }

  function sameDay(iso, d) {
    var x = new Date(iso);
    return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
  }

  function revenue(list) {
    return list.reduce(function (a, s) { return a + (Number(s.total) || 0); }, 0);
  }

  function renderStats() {
    var user = me();
    if (!user) return;
    var now = new Date();
    var allCompleted = completed(mySales());
    var today = allCompleted.filter(function (s) { return sameDay(s.datetime, now); });
    var todayRevenue = revenue(today);
    var items = today.reduce(function (a, s) {
      return a + (s.items || []).reduce(function (b, it) { return b + (Number(it.qty) || 0); }, 0);
    }, 0);

    var setText = function (id, text) {
      var el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText("cashTodaySales", U.money(todayRevenue));
    setText("cashTodayOrders", U.num(today.length, 0));
    setText("cashAvgOrder", U.money(today.length ? todayRevenue / today.length : 0));
    setText("cashItemsSold", U.num(items, 0));
    setText("cashRevenueAll", U.money(revenue(allCompleted)));
    setText("cashMenuCount", U.num(Store.posProducts().length, 0));
    setText("cashTodayFoot", today.length
      ? today.length + " order" + (today.length === 1 ? "" : "s") + " completed today"
      : "No sales yet today");
    setText("cashTodayOrdersFoot", today.length + " finished order" + (today.length === 1 ? "" : "s"));
    setText("cashAllTxns", allCompleted.length + " transaction" + (allCompleted.length === 1 ? "" : "s"));

    var subtitle = document.getElementById("cashierSubtitle");
    if (subtitle) {
      subtitle.textContent = now.toLocaleDateString("en-PH", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
      }) + " · " + U.money(todayRevenue) + " in your shift today";
    }
  }

  function renderRecent() {
    var body = document.getElementById("cashierRecentBody");
    if (!body) return;
    var rows = completed(mySales()).slice().sort(function (a, b) {
      return new Date(b.datetime) - new Date(a.datetime);
    }).slice(0, 6);

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5"><div class="empty-state"><i class="bi bi-receipt"></i>' +
        "<p>No sales yet. Open the POS to record your first order.</p></div></td></tr>";
      return;
    }

    body.innerHTML = rows.map(function (s) {
      var count = (s.items || []).reduce(function (a, it) { return a + (Number(it.qty) || 0); }, 0);
      var cls = s.paymentMethod === "Cash" ? "badge-cash" : s.paymentMethod === "GCash" ? "badge-gcash" : "badge-maya";
      return '<tr class="cursor-pointer" data-cash-sale="' + U.attr(s.id) + '">' +
        '<td><div class="cell-title mono">' + U.esc(s.id) + "</div>" +
        '<div class="cell-sub">' + U.esc(s.status === "void" ? "Voided" : "Completed") + "</div></td>" +
        '<td class="cell-sub">' + U.fmtTime(s.datetime) + "</td>" +
        '<td class="cell-sub">' + U.num(count, 0) + "</td>" +
        '<td><span class="badge-soft ' + cls + '">' + U.esc(s.paymentMethod) + "</span></td>" +
        '<td class="text-end mono fw-600">' + U.money(s.total) + "</td></tr>";
    }).join("");

    body.querySelectorAll("[data-cash-sale]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        var sale = Store.sale(tr.getAttribute("data-cash-sale"));
        if (sale && window.Receipt) window.Receipt.print(sale);
      });
    });
  }

  function renderTop() {
    var box = document.getElementById("cashierTopProducts");
    if (!box) return;
    var map = {};
    completed(mySales()).forEach(function (s) {
      (s.items || []).forEach(function (it) {
        var key = it.productId || it.name;
        if (!map[key]) map[key] = { productId: it.productId, name: it.name, qty: 0, revenue: 0 };
        map[key].qty += Number(it.qty) || 0;
        map[key].revenue += Number(it.lineTotal) || 0;
      });
    });
    var rows = Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);

    if (!rows.length) {
      box.innerHTML = '<div class="empty-state" style="padding:1.4rem 1rem"><i class="bi bi-cup-hot"></i>' +
        "<p>Your best sellers will appear after your first sale.</p></div>";
      return;
    }

    box.innerHTML = rows.map(function (r) {
      var product = r.productId ? Store.product(r.productId) : null;
      var img = product ? (Store.image(product.id) || U.placeholderImage(product.name)) : U.placeholderImage(r.name);
      return '<div class="best-row">' +
        '<div class="best-thumb"><img src="' + U.esc(img) + '" alt=""></div>' +
        '<div class="best-main"><div class="best-name"><span>' + U.esc(r.name) + "</span><span>" +
        U.money(r.revenue) + "</span></div>" +
        '<div class="cell-sub">' + U.num(r.qty, 0) + " unit" + (r.qty === 1 ? "" : "s") + " sold</div></div></div>";
    }).join("");
  }

  function openMySales() {
    window.App.go("#/pos");
    window.setTimeout(function () {
      var btn = document.getElementById("posMySales");
      if (btn) btn.click();
    }, 380);
  }

  function bind() {
    var refresh = document.getElementById("cashierRefresh");
    if (refresh && !refresh.dataset.bound) {
      refresh.dataset.bound = "1";
      refresh.addEventListener("click", function () {
        CashierPage.render();
        window.App.toast("Dashboard refreshed.", "success", 1800);
      });
    }
    ["cashierMySales", "cashierHistoryQuick"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.dataset.bound) {
        el.dataset.bound = "1";
        el.addEventListener("click", openMySales);
      }
    });
    var pw = document.getElementById("cashierPasswordQuick");
    if (pw && !pw.dataset.bound) {
      pw.dataset.bound = "1";
      pw.addEventListener("click", function () { window.App.openChangePassword(); });
    }
  }

  var CashierPage = {
    render: function () {
      if (!window.Auth.requireRole || !window.Auth.user()) return;
      if (window.Auth.user().role !== "cashier") return;
      renderStats();
      renderRecent();
      renderTop();
      bind();
    },

    refreshIfVisible: function () {
      if (window.App && window.App.current === "#/cashier/dashboard") this.render();
    }
  };

  window.CashierPage = CashierPage;
})(window);

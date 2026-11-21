/* ==========================================================================
   TRIPPERS COFFEE — sales.js
   Transaction list, filters, details modal, receipt reprint and voiding.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;

  var state = {
    search: "",
    from: "",
    to: "",
    cashier: "all",
    method: "all",
    page: 1,
    perPage: 10,
    bound: false
  };

  function dateOf(iso) {
    return U.ymd(new Date(iso));
  }

  function filtered() {
    var q = state.search.trim().toLowerCase();
    return Store.db.sales.filter(function (s) {
      if (state.from && dateOf(s.datetime) < state.from) return false;
      if (state.to && dateOf(s.datetime) > state.to) return false;
      if (state.cashier !== "all" && s.cashierId !== state.cashier) return false;
      if (state.method !== "all" && s.paymentMethod !== state.method) return false;
      if (q) {
        var hay = (s.id + " " + s.cashierName + " " + s.paymentMethod + " " +
          s.items.map(function (i) { return i.name; }).join(" ")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return new Date(b.datetime) - new Date(a.datetime); });
  }

  function fillCashierFilter() {
    var sel = document.getElementById("salesCashier");
    var current = state.cashier;
    var names = {};
    Store.db.users.forEach(function (u) {
      if (u.role === "cashier") names[u.id] = u.fullName;
    });
    Store.db.sales.forEach(function (s) {
      if (!names[s.cashierId]) names[s.cashierId] = s.cashierName;
    });
    sel.innerHTML = '<option value="all">All cashiers</option>' +
      Object.keys(names).map(function (id) {
        return '<option value="' + U.esc(id) + '">' + U.esc(names[id]) + "</option>";
      }).join("");
    sel.value = names[current] || current === "all" ? current : "all";
  }

  function methodBadge(method) {
    var cls = method === "Cash" ? "badge-cash" : method === "GCash" ? "badge-gcash" : "badge-maya";
    return '<span class="badge-soft ' + cls + '">' + U.esc(method) + "</span>";
  }

  function render() {
    var body = document.getElementById("salesBody");
    var list = filtered();
    var pages = Math.max(1, Math.ceil(list.length / state.perPage));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * state.perPage;
    var rows = list.slice(start, start + state.perPage);

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="bi bi-receipt"></i>' +
        "<p>No transactions match these filters.</p></div></td></tr>";
    } else {
      body.innerHTML = rows.map(function (s) {
        var itemLabel = s.items.length === 1
          ? s.items[0].name + " ×" + U.qty(s.items[0].qty)
          : s.items[0].name + " +" + (s.items.length - 1) + " more";
        var status = s.status === "voided"
          ? '<span class="badge-soft badge-void"><i class="bi bi-slash-circle"></i> Voided</span>'
          : '<span class="badge-soft badge-in"><i class="bi bi-check-circle"></i> Completed</span>';
        return "<tr>" +
          '<td><div class="cell-title mono">' + U.esc(s.id) + "</div>" +
          '<div class="cell-sub">' + U.fmtTime(s.datetime) + "</div></td>" +
          '<td class="cell-sub">' + U.fmtDateTime(s.datetime) + "</td>" +
          '<td>' + U.esc(s.cashierName) + "</td>" +
          '<td class="cell-sub" style="max-width:190px">' + U.esc(itemLabel) + "</td>" +
          '<td class="text-end mono fw-600">' + U.money(s.total) + "</td>" +
          "<td>" + methodBadge(s.paymentMethod) + "</td>" +
          "<td>" + status + "</td>" +
          '<td><div class="table-actions">' +
          '<button class="btn-icon" data-view="' + s.id + '" title="View details"><i class="bi bi-eye"></i></button>' +
          '<button class="btn-icon" data-print="' + s.id + '" title="Print receipt"><i class="bi bi-printer"></i></button>' +
          "</div></td></tr>";
      }).join("");
    }

    var completed = list.filter(function (s) { return s.status === "completed"; });
    var total = completed.reduce(function (a, s) { return a + (Number(s.total) || 0); }, 0);
    document.getElementById("salesCountLabel").textContent =
      list.length + " transaction" + (list.length === 1 ? "" : "s") +
      (list.length > state.perPage ? " · page " + state.page + " of " + pages : "");
    document.getElementById("salesFilteredTotal").textContent = U.money(total);

    var pager = document.getElementById("salesPager");
    pager.innerHTML = "";
    if (pages > 1) {
      var mk = function (label, page, disabled, active) {
        var b = document.createElement("button");
        b.innerHTML = label;
        b.disabled = !!disabled;
        if (active) b.classList.add("active");
        b.addEventListener("click", function () { state.page = page; render(); });
        pager.appendChild(b);
      };
      mk('<i class="bi bi-chevron-left"></i>', state.page - 1, state.page === 1);
      for (var p = 1; p <= pages; p++) {
        if (pages > 7 && p !== 1 && p !== pages && Math.abs(p - state.page) > 1) {
          if (p === 2 || p === pages - 1) {
            var dots = document.createElement("span");
            dots.className = "cell-sub px-1";
            dots.textContent = "…";
            pager.appendChild(dots);
          }
          continue;
        }
        mk(String(p), p, false, p === state.page);
      }
      mk('<i class="bi bi-chevron-right"></i>', state.page + 1, state.page === pages);
    }
  }

  /* ------------------------------------------------------------- details */
  function openSale(id) {
    var s = Store.sale(id);
    if (!s) {
      window.App.toast("That transaction no longer exists.", "danger");
      return;
    }
    var user = window.Auth.user();
    if (!user) return;
    if (user.role === "cashier" && s.cashierId !== user.id) {
      window.App.toast("You can only view your own transactions.", "danger");
      return;
    }

    document.getElementById("saleModalTitle").textContent = s.id;

    var items = s.items.map(function (it) {
      return "<tr><td><div class=\"cell-title\">" + U.esc(it.name) + "</div>" +
        '<div class="cell-sub">' + U.esc(it.categoryName || "") + "</div></td>" +
        '<td class="text-end mono">' + U.num(it.qty, 0) + "</td>" +
        '<td class="text-end mono">' + U.money(it.price) + "</td>" +
        '<td class="text-end mono">' + U.money(it.lineTotal) + "</td></tr>";
    }).join("");

    var statusBadge = s.status === "voided"
      ? '<span class="badge-soft badge-void">Voided</span>'
      : '<span class="badge-soft badge-in">Completed</span>';

    document.getElementById("saleModalBody").innerHTML =
      '<div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">' +
      '<div><span class="eyebrow d-block">Transaction</span><strong class="mono">' + U.esc(s.id) + "</strong></div>" +
      "<div>" + statusBadge + " " + methodBadge(s.paymentMethod) + "</div></div>" +

      '<div class="detail-grid mb-3">' +
      '<div class="detail-cell"><div class="d1">Date &amp; time</div><div class="d2">' + U.fmtDateTime(s.datetime) + "</div></div>" +
      '<div class="detail-cell"><div class="d1">Cashier</div><div class="d2">' + U.esc(s.cashierName) + "</div></div>" +
      '<div class="detail-cell"><div class="d1">Payment method</div><div class="d2">' + U.esc(s.paymentMethod) + "</div></div>" +
      '<div class="detail-cell"><div class="d1">' + (s.paymentMethod === "Cash" ? "Cash received" : "Reference") + "</div>" +
      '<div class="d2">' + (s.paymentMethod === "Cash" ? U.money(s.cashReceived) : U.esc(s.reference || "—")) + "</div></div>" +
      "</div>" +

      '<div class="table-wrap mb-3"><table class="table table-premium"><thead><tr>' +
      '<th>Item</th><th class="text-end">Qty</th><th class="text-end">Price</th><th class="text-end">Amount</th>' +
      "</tr></thead><tbody>" + items + "</tbody></table></div>" +

      '<div class="pay-summary ms-auto" style="max-width:320px">' +
      '<div class="ps-row"><span>Subtotal</span><span>' + U.money(s.subtotal) + "</span></div>" +
      '<div class="ps-row"><span>Discount' + (s.discountType === "percent" && s.discountAmount > 0 ? " (" + U.qty(s.discountValue) + "%)" : "") + "</span><span>− " + U.money(s.discountAmount) + "</span></div>" +
      '<div class="ps-row"><span>VAT (' + U.qty(s.taxRate) + "%)</span><span>" + U.money(s.taxAmount) + "</span></div>" +
      '<div class="ps-row ps-total"><span>Total</span><span>' + U.money(s.total) + "</span></div>" +
      '<div class="ps-row"><span>' + (s.paymentMethod === "Cash" ? "Change" : "Paid") + "</span><span>" +
      U.money(s.paymentMethod === "Cash" ? s.change : s.total) + "</span></div>" +
      "</div>" +

      (s.deductions && s.deductions.length
        ? '<div class="section-title mt-3">Inventory deducted</div><div class="cell-sub">' +
        s.deductions.map(function (d) {
          return U.esc(d.name) + " − " + U.qty(d.qty) + " " + U.esc(d.unit);
        }).join(" · ") + "</div>"
        : "");

    var printBtn = document.getElementById("salePrintBtn");
    printBtn.dataset.saleId = s.id;
    printBtn.onclick = function () { window.Receipt.print(s); };

    var voidBtn = document.getElementById("saleVoidBtn");
    if (user.role === "admin" && s.status === "completed") {
      voidBtn.classList.remove("hidden");
      voidBtn.onclick = function () { voidSale(s.id); };
    } else {
      voidBtn.classList.add("hidden");
    }

    window.App.modal("saleModal").show();
  }

  /* ------------------------------------------------------------- void */
  function voidSale(id) {
    if (!window.Auth.requireAdmin()) return;
    var s = Store.sale(id);
    if (!s || s.status !== "completed") return;

    window.App.confirm({
      title: "Void transaction?",
      body: "Receipt <strong class=\"mono\">" + U.esc(s.id) + "</strong> (" + U.money(s.total) + ") will be marked void. " +
        "Deducted inventory will be returned to stock and the sale will be excluded from revenue.",
      okText: "Void transaction",
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      if (!window.Auth.requireAdmin(true)) return;

      var user = window.Auth.user();
      var nowIso = new Date().toISOString();
      (s.deductions || []).forEach(function (d) {
        var item = Store.inventoryItem(d.inventoryId);
        if (!item) return;
        item.qty = Math.round((Number(item.qty) + Number(d.qty)) * 1000) / 1000;
        item.updatedAt = nowIso;
        Store.logStockMove({
          inventoryId: item.id,
          itemName: item.name,
          type: "in",
          qty: d.qty,
          unit: d.unit,
          note: "Void " + s.id,
          userId: user.id,
          userName: user.fullName
        });
      });

      s.status = "voided";
      s.voidedAt = nowIso;
      s.voidedBy = user.fullName;
      Store.notify("sale", "Transaction voided", s.id + " (" + U.money(s.total) + ") was voided by " + user.fullName + ".");
      Store.commit();

      window.App.modal("saleModal").hide();
      render();
      window.App.refreshShell();
      window.App.toast("Transaction voided and inventory restored.", "success", 3800);
      if (window.AdminPage) window.AdminPage.refreshIfVisible();
    });
  }

  /* ------------------------------------------------------------- export */
  function exportCSV() {
    var list = filtered();
    if (!list.length) {
      window.App.toast("There is nothing to export with the current filters.", "warning");
      return;
    }
    var rows = [["Receipt No", "Date", "Time", "Cashier", "Items", "Subtotal", "Discount", "Tax", "Total",
      "Payment Method", "Reference", "Cash Received", "Change", "Status"]];
    list.forEach(function (s) {
      rows.push([
        s.id,
        U.fmtDate(s.datetime),
        U.fmtTime(s.datetime),
        s.cashierName,
        s.items.map(function (i) { return i.name + " x" + i.qty; }).join(" | "),
        s.subtotal.toFixed(2),
        s.discountAmount.toFixed(2),
        s.taxAmount.toFixed(2),
        s.total.toFixed(2),
        s.paymentMethod,
        s.reference || "",
        s.cashReceived.toFixed(2),
        s.change.toFixed(2),
        s.status
      ]);
    });
    U.downloadCSV("trippers-sales-" + U.todayISO() + ".csv", rows);
    window.App.toast("Sales CSV exported (" + list.length + " rows).", "success");
  }

  /* ------------------------------------------------------------- page */
  var SalesPage = {
    render: function () {
      fillCashierFilter();
      document.getElementById("salesSearch").value = state.search;
      document.getElementById("salesFrom").value = state.from;
      document.getElementById("salesTo").value = state.to;
      document.getElementById("salesMethod").value = state.method;
      render();
      if (!state.bound) this.bind();
    },

    bind: function () {
      state.bound = true;

      document.getElementById("salesSearch").addEventListener("input", U.debounce(function (e) {
        state.search = e.target.value;
        state.page = 1;
        render();
      }, 180));

      ["salesFrom", "salesTo"].forEach(function (id) {
        document.getElementById(id).addEventListener("change", function (e) {
          if (id === "salesFrom") state.from = e.target.value;
          else state.to = e.target.value;
          state.page = 1;
          render();
        });
      });

      document.getElementById("salesCashier").addEventListener("change", function (e) {
        state.cashier = e.target.value;
        state.page = 1;
        render();
      });
      document.getElementById("salesMethod").addEventListener("change", function (e) {
        state.method = e.target.value;
        state.page = 1;
        render();
      });
      document.getElementById("salesClear").addEventListener("click", function () {
        state = {
          search: "", from: "", to: "", cashier: "all", method: "all",
          page: 1, perPage: 10, bound: true
        };
        SalesPage.render();
        window.App.toast("Filters cleared.", "info", 1600);
      });
      document.getElementById("btnSalesExport").addEventListener("click", exportCSV);

      document.getElementById("salesBody").addEventListener("click", function (e) {
        var view = e.target.closest("[data-view]");
        var print = e.target.closest("[data-print]");
        if (view) openSale(view.getAttribute("data-view"));
        else if (print) {
          var s = Store.sale(print.getAttribute("data-print"));
          if (s) window.Receipt.print(s);
        }
      });
    },

    openSale: openSale,
    filtered: filtered,
    exportCSV: exportCSV
  };

  window.SalesPage = SalesPage;
})(window);

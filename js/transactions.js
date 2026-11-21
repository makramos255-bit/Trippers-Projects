/* ==========================================================================
   TRIPPERS COFFEE — transactions.js
   Admin transaction register: filter, inspect, reprint and export every sale.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;

  var state = {
    search: "",
    status: "all",
    method: "all",
    bound: false
  };

  function methodBadge(method) {
    var cls = method === "Cash" ? "badge-cash" : method === "GCash" ? "badge-gcash" : "badge-maya";
    return '<span class="badge-soft ' + cls + '">' + U.esc(method) + "</span>";
  }

  function statusBadge(status) {
    return status === "voided"
      ? '<span class="badge-soft badge-void"><i class="bi bi-slash-circle"></i> Voided</span>'
      : '<span class="badge-soft badge-in"><i class="bi bi-check-circle"></i> Completed</span>';
  }

  function filtered() {
    var q = state.search.trim().toLowerCase();
    return Store.db.sales.filter(function (s) {
      if (state.status !== "all" && s.status !== state.status) return false;
      if (state.method !== "all" && s.paymentMethod !== state.method) return false;
      if (!q) return true;
      var items = (s.items || []).map(function (i) { return i.name; }).join(" ");
      return (s.id + " " + s.cashierName + " " + s.paymentMethod + " " + items).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      return new Date(b.datetime) - new Date(a.datetime);
    });
  }

  function itemLabel(s) {
    var items = s.items || [];
    if (!items.length) return "—";
    if (items.length === 1) return items[0].name + " ×" + U.qty(items[0].qty);
    return items[0].name + " +" + (items.length - 1) + " more";
  }

  function render() {
    var body = document.getElementById("transactionsBody");
    if (!body) return;
    var list = filtered();

    if (!list.length) {
      body.innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="bi bi-receipt"></i>' +
        "<p>No transactions match these filters.</p></div></td></tr>";
    } else {
      body.innerHTML = list.slice(0, 200).map(function (s) {
        return "<tr>" +
          '<td><div class="cell-title mono">' + U.esc(s.id) + "</div>" +
          '<div class="cell-sub">' + U.fmtTime(s.datetime) + "</div></td>" +
          '<td class="cell-sub">' + U.fmtDateTime(s.datetime) + "</td>" +
          "<td>" + U.esc(s.cashierName) + "</td>" +
          '<td class="cell-sub" style="max-width:210px">' + U.esc(itemLabel(s)) + "</td>" +
          "<td>" + methodBadge(s.paymentMethod) + "</td>" +
          "<td>" + statusBadge(s.status) + "</td>" +
          '<td class="text-end mono fw-600">' + U.money(s.total) + "</td>" +
          '<td><div class="table-actions justify-content-end">' +
          '<button class="btn-icon" data-view="' + s.id + '" title="View details"><i class="bi bi-eye"></i></button>' +
          '<button class="btn-icon" data-print="' + s.id + '" title="Print receipt"><i class="bi bi-printer"></i></button>' +
          "</div></td></tr>";
      }).join("");
    }

    var completed = list.filter(function (s) { return s.status === "completed"; });
    var total = completed.reduce(function (a, s) { return a + (Number(s.total) || 0); }, 0);
    document.getElementById("txnCountLabel").textContent =
      list.length + " transaction" + (list.length === 1 ? "" : "s") +
      (list.length > 200 ? " · showing latest 200" : "");
    document.getElementById("txnTotal").textContent = U.money(total);

    if (!state.bound) {
      state.bound = true;

      document.getElementById("txnSearch").addEventListener("input", U.debounce(function (e) {
        state.search = e.target.value;
        render();
      }, 170));
      document.getElementById("txnStatus").addEventListener("change", function (e) {
        state.status = e.target.value;
        render();
      });
      document.getElementById("txnMethod").addEventListener("change", function (e) {
        state.method = e.target.value;
        render();
      });

      body.addEventListener("click", function (e) {
        var view = e.target.closest("[data-view]");
        var print = e.target.closest("[data-print]");
        if (view) {
          var sale = Store.sale(view.getAttribute("data-view"));
          if (sale && window.SalesPage) window.SalesPage.openSale(sale.id);
        } else if (print) {
          var pSale = Store.sale(print.getAttribute("data-print"));
          if (pSale) window.Receipt.print(pSale);
        }
      });

      document.getElementById("btnTransactionsExport").addEventListener("click", exportCSV);
    }
  }

  function exportCSV() {
    var list = filtered();
    if (!list.length) {
      window.App.toast("There is nothing to export with the current filters.", "warning");
      return;
    }
    var rows = [["Transaction ID", "Date & time", "Cashier", "Items", "Payment method", "Status", "Total"]];
    list.forEach(function (s) {
      rows.push([
        s.id,
        U.fmtDateTime(s.datetime),
        s.cashierName,
        (s.items || []).map(function (i) { return i.name + " x" + i.qty; }).join(" | "),
        s.paymentMethod,
        s.status === "voided" ? "Voided" : "Completed",
        Number(s.total) || 0
      ]);
    });
    U.downloadCSV("trippers-transactions-" + U.todayISO() + ".csv", rows);
    window.App.toast("Transactions exported (" + list.length + " rows).", "success");
  }

  var TransactionsPage = {
    render: function () {
      if (!window.Auth.requireAdmin(true)) return;
      document.getElementById("txnSearch").value = state.search;
      document.getElementById("txnStatus").value = state.status;
      document.getElementById("txnMethod").value = state.method;
      render();
    },

    exportCSV: exportCSV
  };

  window.TransactionsPage = TransactionsPage;
})(window);

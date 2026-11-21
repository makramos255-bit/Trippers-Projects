/* ==========================================================================
   TRIPPERS COFFEE — inventoryStaff.js
   Inventory Staff module: dashboard, inventory list, stock in/out and history.
   Shares the same localStorage data as the admin and cashier modules.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;

  var state = {
    search: "",
    category: "all",
    status: "all",
    sort: "name-asc",
    page: 1,
    perPage: 10,
    historySearch: "",
    historyType: "all",
    listBound: false,
    dashBound: false,
    formsBound: false,
    historyBound: false
  };

  /* ------------------------------------------------------------- helpers */
  function inStock() {
    return Store.db.inventory.filter(function (i) { return Store.stockStatus(i) === "in"; });
  }

  function lowOnly() {
    return Store.db.inventory.filter(function (i) { return Store.stockStatus(i) === "low"; });
  }

  function outOnly() {
    return Store.db.inventory.filter(function (i) { return Store.stockStatus(i) === "out"; });
  }

  function statusBadge(item) {
    var s = Store.stockStatus(item);
    if (s === "out") return '<span class="badge-soft badge-out"><i class="bi bi-x-circle"></i> Out of stock</span>';
    if (s === "low") return '<span class="badge-soft badge-low"><i class="bi bi-exclamation-triangle"></i> Low stock</span>';
    return '<span class="badge-soft badge-in"><i class="bi bi-check-circle"></i> In stock</span>';
  }

  function moveBadge(type) {
    if (type === "in") return '<span class="badge-soft badge-in"><i class="bi bi-plus-circle"></i> Stock in</span>';
    if (type === "sale") return '<span class="badge-soft badge-gold"><i class="bi bi-bag-check"></i> Sale</span>';
    return '<span class="badge-soft badge-out"><i class="bi bi-dash-circle"></i> Stock out</span>';
  }

  function stockValue() {
    return Store.db.inventory.reduce(function (a, i) {
      return a + (Number(i.qty) || 0) * (Number(i.costPrice) || 0);
    }, 0);
  }

  function retailValue() {
    return Store.db.inventory.reduce(function (a, i) {
      return a + (Number(i.qty) || 0) * (Number(i.sellingPrice) || 0);
    }, 0);
  }

  function sortedItems() {
    var q = state.search.trim().toLowerCase();
    var list = Store.db.inventory.filter(function (i) {
      if (state.category !== "all" && i.category !== state.category) return false;
      if (state.status !== "all" && Store.stockStatus(i) !== state.status) return false;
      if (!q) return true;
      return (i.name + " " + i.id + " " + i.category).toLowerCase().indexOf(q) >= 0;
    });

    list.sort(function (a, b) {
      switch (state.sort) {
        case "name-desc": return b.name.localeCompare(a.name);
        case "qty-asc": return Number(a.qty) - Number(b.qty);
        case "qty-desc": return Number(b.qty) - Number(a.qty);
        case "updated-desc": return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
        default: return a.name.localeCompare(b.name);
      }
    });
    return list;
  }

  /* ------------------------------------------------------------- dashboard */
  function renderDashboard() {
    var total = Store.db.inventory.length;
    var categories = {};
    Store.db.inventory.forEach(function (i) { categories[i.category] = true; });
    var low = lowOnly().length;
    var out = outOnly().length;
    var healthy = inStock().length;

    U.countUp(document.getElementById("ivKpiItems"), total, function (v) { return U.num(v, 0); });
    U.countUp(document.getElementById("ivKpiInStock"), healthy, function (v) { return U.num(v, 0); });
    U.countUp(document.getElementById("ivKpiLow"), low, function (v) { return U.num(v, 0); });
    U.countUp(document.getElementById("ivKpiOut"), out, function (v) { return U.num(v, 0); });

    document.getElementById("ivKpiCategories").textContent =
      Object.keys(categories).length + " categor" + (Object.keys(categories).length === 1 ? "y" : "ies");
    document.getElementById("ivKpiInStockFoot").textContent =
      total ? Math.round((healthy / total) * 100) + "% of all items above minimum" : "Nothing recorded yet";
    document.getElementById("ivKpiLowFoot").textContent =
      low ? "At or below minimum level" : "No low-stock items right now";
    document.getElementById("ivKpiOutFoot").textContent =
      out ? "Needs immediate restocking" : "Every item has stock";

    var welcome = document.getElementById("ivWelcome");
    if (welcome) {
      if (!total) welcome.textContent = "No supplies are tracked yet. Add your first item to get started.";
      else if (low + out) welcome.textContent =
        low + out + " " + (low + out === 1 ? "item needs" : "items need") + " restocking. Review the list below.";
      else welcome.textContent = "All items are above their minimum level. Keep stock records up to date.";
    }

    U.countUp(document.getElementById("ivStockValue"), stockValue(), function (v) { return U.money(v); });
    U.countUp(document.getElementById("ivRetailValue"), retailValue(), function (v) { return U.money(v); });
    U.countUp(document.getElementById("ivUnitsOnHand"), low + out, function (v) { return U.num(v, 0); });
    document.getElementById("ivMoveCount").textContent = Store.db.stockMoves.length;

    renderAlerts();
    renderRecentUpdated();
    renderRecentMoves();
    bindDashboard();
  }

  function renderAlerts() {
    var box = document.getElementById("ivAlerts");
    if (!box) return;
    var low = Store.lowStockItems().slice().sort(function (a, b) {
      var sa = Store.stockStatus(a) === "out" ? 0 : 1;
      var sb = Store.stockStatus(b) === "out" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return Number(a.qty) - Number(b.qty);
    }).slice(0, 5);

    if (!low.length) {
      box.innerHTML = '<div class="empty-state" style="padding:1.4rem 1rem">' +
        '<i class="bi bi-check2-circle" style="color:#5fae8a"></i>' +
        "<p>Great—nothing needs restocking right now. All items are above their minimum level.</p></div>";
      return;
    }

    box.innerHTML = low.map(function (i) {
      var s = Store.stockStatus(i);
      return '<div class="alert-item">' +
        '<div class="notif-ico ' + (s === "out" ? "out" : "low") + '">' +
        '<i class="bi ' + (s === "out" ? "bi-x-octagon" : "bi-exclamation-triangle") + '"></i></div>' +
        '<div class="a-main">' +
        '<div class="a1">' + U.esc(i.name) + "</div>" +
        '<div class="a2">Remaining ' + U.qty(i.qty) + " " + U.esc(i.unit) +
        " · minimum " + U.qty(i.minStock) + " " + U.esc(i.unit) + "</div>" +
        "</div>" +
        '<button class="btn btn-ghost btn-sm" data-alert-view="' + i.id + '">Review item</button>' +
        "</div>";
    }).join("");
  }

  function renderRecentUpdated() {
    var box = document.getElementById("ivRecentUpdated");
    if (!box) return;
    var rows = Store.db.inventory.slice().sort(function (a, b) {
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    }).slice(0, 5);

    if (!rows.length) {
      box.innerHTML = '<div class="empty-state" style="padding:1.2rem"><i class="bi bi-box-seam"></i><p>No items yet. Use Add item above to track your first supply.</p></div>';
      return;
    }

    box.innerHTML = rows.map(function (i) {
      return '<div class="alert-item">' +
        '<div class="best-thumb"><i class="bi bi-box-seam"></i></div>' +
        '<div class="a-main">' +
        '<div class="a1">' + U.esc(i.name) + "</div>" +
        '<div class="a2">' + U.qty(i.qty) + " " + U.esc(i.unit) + " · " + U.fmtDate(i.updatedAt) + "</div>" +
        "</div>" + statusBadge(i) + "</div>";
    }).join("");
  }

  function movementRow(m) {
    var type = m.type === "in" ? "in" : "out";
    var icon = m.type === "in" ? "bi-plus-circle" : m.type === "sale" ? "bi-bag-check" : "bi-dash-circle";
    var sign = m.type === "in" ? "+" : "−";
    return '<div class="move-row">' +
      '<span class="m-' + type + '"><i class="bi ' + icon + '"></i></span>' +
      '<div class="flex-grow-1 min-w-0">' +
      "<div><strong>" + sign + U.qty(m.qty) + " " + U.esc(m.unit || "") + "</strong> " +
      '<span class="text-muted-soft">' + U.esc(m.itemName) + "</span></div>" +
      '<div class="cell-sub">' + U.fmtDateTime(m.datetime) + " · " + U.esc(m.note || "—") +
      " · " + U.esc(m.userName || "System") + "</div></div></div>";
  }

  function renderRecentMoves() {
    var box = document.getElementById("ivRecentMoves");
    if (!box) return;
    var moves = Store.db.stockMoves.slice(0, 8);
    if (!moves.length) {
      box.innerHTML = '<div class="empty-state" style="padding:1.2rem"><i class="bi bi-arrow-left-right"></i>' +
        "<p>No stock updates yet. Stock received or removed will appear here.</p></div>";
      return;
    }
    box.innerHTML = moves.map(movementRow).join("");
  }

  function bindDashboard() {
    if (state.dashBound) return;
    state.dashBound = true;

    document.getElementById("ivRefresh").addEventListener("click", function () {
      renderDashboard();
      window.App.toast("Inventory dashboard refreshed.", "success", 1800);
    });
    document.getElementById("ivAddItem").addEventListener("click", function () {
      window.InventoryPage.openForm(null);
    });
    document.getElementById("ivAlerts").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-alert-view]");
      if (btn) window.InventoryPage.openItem(btn.getAttribute("data-alert-view"));
    });
  }

  /* ------------------------------------------------------------- list */
  function fillCategories() {
    var select = document.getElementById("ivtCategory");
    var current = state.category;
    var cats = {};
    Store.db.inventory.forEach(function (i) { cats[i.category] = true; });
    (window.InventoryCategories || []).forEach(function (c) { cats[c] = true; });

    select.innerHTML = '<option value="all">All categories</option>' +
      Object.keys(cats).sort().map(function (c) {
        return '<option value="' + U.esc(c) + '">' + U.esc(c) + "</option>";
      }).join("");
    select.value = current === "all" || cats[current] ? current : "all";
    state.category = select.value;
  }

  function renderList() {
    fillCategories();
    document.getElementById("ivtSearch").value = state.search;
    document.getElementById("ivtStatus").value = state.status;
    document.getElementById("ivtSort").value = state.sort;

    var body = document.getElementById("ivtBody");
    var list = sortedItems();
    var pages = Math.max(1, Math.ceil(list.length / state.perPage));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * state.perPage;
    var rows = list.slice(start, start + state.perPage);

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="10"><div class="empty-state"><i class="bi bi-box-seam"></i>' +
        "<p>No inventory items match your filters.</p></div></td></tr>";
    } else {
      body.innerHTML = rows.map(function (i) {
        var status = Store.stockStatus(i);
        var cls = status === "out" ? "out" : status === "low" ? "low" : "ok";
        return "<tr>" +
          '<td><span class="cell-sub mono">' + U.esc(i.id) + "</span></td>" +
          '<td><div class="cell-title">' + U.esc(i.name) + "</div>" +
          '<div class="cell-sub">Updated ' + U.fmtDate(i.updatedAt) + "</div></td>" +
          '<td><span class="badge-soft badge-muted">' + U.esc(i.category) + "</span></td>" +
          '<td><span class="qty ' + cls + '" style="font-weight:700">' + U.qty(i.qty) + "</span>" +
          '<div class="cell-sub">minimum ' + U.qty(i.minStock) + "</div></td>" +
          '<td class="cell-sub">' + U.esc(i.unit) + "</td>" +
          '<td class="text-end mono">' + U.money(i.costPrice) + "</td>" +
          '<td class="text-end mono">' + U.money(i.sellingPrice) + "</td>" +
          '<td class="cell-sub">' + U.qty(i.minStock) + " " + U.esc(i.unit) + "</td>" +
          "<td>" + statusBadge(i) + "</td>" +
          '<td><div class="table-actions">' +
          '<button class="btn-icon" data-view="' + i.id + '" title="View details"><i class="bi bi-eye"></i></button>' +
          '<button class="btn-icon success" data-in="' + i.id + '" title="Stock in"><i class="bi bi-plus-lg"></i></button>' +
          '<button class="btn-icon danger" data-out="' + i.id + '" title="Stock out"><i class="bi bi-dash-lg"></i></button>' +
          '<button class="btn-icon" data-edit="' + i.id + '" title="Edit item"><i class="bi bi-pencil"></i></button>' +
          "</div></td></tr>";
      }).join("");
    }

    document.getElementById("ivtCountLabel").textContent =
      "Showing " + (list.length ? start + 1 : 0) + "–" + Math.min(start + state.perPage, list.length) +
      " of " + list.length + " items";

    var pager = document.getElementById("ivtPager");
    pager.innerHTML = "";
    if (pages > 1) {
      var mk = function (label, page, disabled, active) {
        var b = document.createElement("button");
        b.innerHTML = label;
        b.disabled = !!disabled;
        if (active) b.classList.add("active");
        b.addEventListener("click", function () { state.page = page; renderList(); });
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

    bindList();
  }

  function bindList() {
    if (state.listBound) return;
    state.listBound = true;

    document.getElementById("ivtSearch").addEventListener("input", U.debounce(function (e) {
      state.search = e.target.value;
      state.page = 1;
      renderList();
    }, 170));
    document.getElementById("ivtCategory").addEventListener("change", function (e) {
      state.category = e.target.value;
      state.page = 1;
      renderList();
    });
    document.getElementById("ivtStatus").addEventListener("change", function (e) {
      state.status = e.target.value;
      state.page = 1;
      renderList();
    });
    document.getElementById("ivtSort").addEventListener("change", function (e) {
      state.sort = e.target.value;
      state.page = 1;
      renderList();
    });

    document.getElementById("ivtAddItem").addEventListener("click", function () {
      window.InventoryPage.openForm(null);
    });
    document.getElementById("ivtStockBtn").addEventListener("click", function () {
      if (!Store.db.inventory.length) {
        window.App.toast("Add an inventory item first.", "warning");
        return;
      }
      window.App.go("#/inventory/stock-in");
    });

    document.getElementById("ivtBody").addEventListener("click", function (e) {
      var view = e.target.closest("[data-view]");
      var stockIn = e.target.closest("[data-in]");
      var stockOut = e.target.closest("[data-out]");
      var edit = e.target.closest("[data-edit]");
      if (view) window.InventoryPage.openItem(view.getAttribute("data-view"));
      else if (stockIn) window.App.go("#/inventory/stock-in");
      else if (stockOut) window.App.go("#/inventory/stock-out");
      else if (edit) {
        var item = Store.inventoryItem(edit.getAttribute("data-edit"));
        if (item) window.InventoryPage.openForm(item);
      }
    });
  }

  /* ------------------------------------------------------------- stock forms */
  function fillItemSelect(prefix) {
    var select = document.getElementById(prefix + "Item");
    if (!select) return null;
    var items = Store.db.inventory.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    var current = select.value;
    select.innerHTML = items.map(function (i) {
      return '<option value="' + i.id + '">' + U.esc(i.name) + " (" + U.qty(i.qty) + " " + U.esc(i.unit) + ")</option>";
    }).join("");
    if (current && Store.inventoryItem(current)) select.value = current;
    return items;
  }

  function updateDetail(prefix) {
    var id = document.getElementById(prefix + "Item").value;
    var item = Store.inventoryItem(id);
    var cur = document.getElementById(prefix + "Current");
    var min = document.getElementById(prefix + "Min");
    var unit = document.getElementById(prefix + "Unit");
    if (!item) {
      cur.textContent = "—";
      min.textContent = "—";
      unit.value = "";
      return;
    }
    cur.textContent = U.qty(item.qty) + " " + item.unit;
    min.textContent = U.qty(item.minStock) + " " + item.unit;
    unit.value = item.unit;
  }

  function renderRecentMovesInto(id, type) {
    var box = document.getElementById(id);
    if (!box) return;
    var moves = Store.db.stockMoves.filter(function (m) { return m.type === type; }).slice(0, 8);
    box.innerHTML = moves.length
      ? moves.map(movementRow).join("")
      : '<div class="empty-state" style="padding:1.2rem"><i class="bi bi-clock-history"></i>' +
        "<p>No " + (type === "in" ? "stock-in" : "stock-out") + " movements yet.</p></div>";
  }

  function bindStockForms() {
    if (state.formsBound) return;
    state.formsBound = true;

    ["ivIn", "ivOut"].forEach(function (prefix) {
      var type = prefix === "ivIn" ? "in" : "out";
      document.getElementById(prefix + "Item").addEventListener("change", function () {
        updateDetail(prefix);
      });
      document.getElementById(prefix + "Submit").addEventListener("click", function () {
        var err = document.getElementById(prefix + "Error");
        err.classList.add("hidden");
        var id = document.getElementById(prefix + "Item").value;
        var qty = parseFloat(document.getElementById(prefix + "Qty").value);
        var note = document.getElementById(prefix + "Note").value.trim();

        var result = Store.adjustStock(id, type, qty, note);
        if (!result.ok) {
          err.textContent = result.error;
          err.classList.remove("hidden");
          return;
        }

        document.getElementById(prefix + "Qty").value = "";
        document.getElementById(prefix + "Note").value = "";
        updateDetail(prefix);
        renderRecentMovesInto(prefix + "Recent", type);
        window.App.refreshShell();
        window.App.toast(
          (type === "in" ? "Added " : "Removed ") + U.qty(Math.abs(Number(qty))) + " " +
          result.item.unit + (type === "in" ? " to " : " from ") + result.item.name + ".",
          "success"
        );
        if (window.AdminPage) window.AdminPage.refreshIfVisible();
      });
    });
  }

  function renderStockIn() {
    fillItemSelect("ivIn");
    updateDetail("ivIn");
    renderRecentMovesInto("ivInRecent", "in");
    bindStockForms();
  }

  function renderStockOut() {
    fillItemSelect("ivOut");
    updateDetail("ivOut");
    renderRecentMovesInto("ivOutRecent", "out");
    bindStockForms();
  }

  /* ------------------------------------------------------------- history */
  function historyRows() {
    var q = state.historySearch.trim().toLowerCase();
    return Store.db.stockMoves.filter(function (m) {
      if (state.historyType !== "all" && m.type !== state.historyType) return false;
      if (!q) return true;
      return ((m.itemName || "") + " " + (m.note || "") + " " + (m.userName || "") + " " + (m.unit || ""))
        .toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      return new Date(b.datetime) - new Date(a.datetime);
    });
  }

  function renderHistory() {
    document.getElementById("ivHistorySearch").value = state.historySearch;
    document.getElementById("ivHistoryType").value = state.historyType;

    var rows = historyRows();
    var body = document.getElementById("ivHistoryBody");

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="bi bi-clock-history"></i>' +
        "<p>No stock movements match these filters.</p></div></td></tr>";
    } else {
      body.innerHTML = rows.slice(0, 150).map(function (m) {
        return "<tr>" +
          '<td class="cell-sub">' + U.fmtDateTime(m.datetime) + "</td>" +
          '<td><div class="cell-title">' + U.esc(m.itemName) + "</div>" +
          '<div class="cell-sub mono">' + U.esc(m.inventoryId || "—") + "</div></td>" +
          "<td>" + moveBadge(m.type) + "</td>" +
          '<td class="text-end mono">' + (m.type === "in" ? "+" : "−") + U.qty(m.qty) + " " + U.esc(m.unit || "") + "</td>" +
          '<td class="cell-sub" style="max-width:220px">' + U.esc(m.note || "—") + "</td>" +
          "<td>" + U.esc(m.userName || "System") + "</td></tr>";
      }).join("");
    }

    document.getElementById("ivHistoryCount").textContent =
      rows.length + " movement" + (rows.length === 1 ? "" : "s") +
      (rows.length > 150 ? " · showing latest 150" : "");

    if (!state.historyBound) {
      state.historyBound = true;
      document.getElementById("ivHistorySearch").addEventListener("input", U.debounce(function (e) {
        state.historySearch = e.target.value;
        renderHistory();
      }, 170));
      document.getElementById("ivHistoryType").addEventListener("change", function (e) {
        state.historyType = e.target.value;
        renderHistory();
      });
      document.getElementById("ivHistoryRefresh").addEventListener("click", function () {
        renderHistory();
        window.App.toast("Inventory history refreshed.", "success", 1800);
      });
    }
  }

  /* ------------------------------------------------------------- page */
  var InventoryStaffPage = {
    renderDashboard: function () {
      if (!window.Auth.requireRole(["inventory"], true)) return;
      renderDashboard();
    },

    renderList: function () {
      if (!window.Auth.requireRole(["inventory"], true)) return;
      renderList();
    },

    renderStockIn: function () {
      if (!window.Auth.requireRole(["inventory"], true)) return;
      renderStockIn();
    },

    renderStockOut: function () {
      if (!window.Auth.requireRole(["inventory"], true)) return;
      renderStockOut();
    },

    renderHistory: function () {
      if (!window.Auth.requireRole(["inventory"], true)) return;
      renderHistory();
    },

    refreshIfVisible: function () {
      var current = window.App && window.App.current;
      if (!current || current.indexOf("#/inventory/") !== 0) return;
      if (current === "#/inventory/dashboard") renderDashboard();
      else if (current === "#/inventory/list") renderList();
      else if (current === "#/inventory/stock-in") renderStockIn();
      else if (current === "#/inventory/stock-out") renderStockOut();
      else if (current === "#/inventory/history") renderHistory();
    }
  };

  window.InventoryStaffPage = InventoryStaffPage;
})(window);

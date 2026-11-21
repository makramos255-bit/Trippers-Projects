/* ==========================================================================
   TRIPPERS COFFEE — inventory.js
   Raw supply inventory: CRUD, stock movements, filters, alerts.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;

  var SUPPLY_CATEGORIES = [
    "Coffee Beans", "Milk", "Syrups", "Tea", "Chocolate",
    "Cups and Lids", "Packaging", "Other Supplies"
  ];

  var UNIT_SHORT = { pcs: "pcs", kg: "kg", g: "g", L: "L", ml: "ml", pack: "pack", bottle: "btl", box: "box" };

  var state = {
    search: "",
    category: "all",
    status: "all",
    sort: "name-asc",
    page: 1,
    perPage: 10,
    bound: false
  };

  function filtered() {
    var q = state.search.trim().toLowerCase();
    var list = Store.db.inventory.filter(function (i) {
      if (state.category !== "all" && i.category !== state.category) return false;
      if (state.status !== "all" && Store.stockStatus(i) !== state.status) return false;
      if (q) {
        var hay = (i.name + " " + i.id + " " + i.category).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
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

  function statusBadge(item) {
    var s = Store.stockStatus(item);
    if (s === "out") return '<span class="badge-soft badge-out"><i class="bi bi-x-circle"></i> Out of stock</span>';
    if (s === "low") return '<span class="badge-soft badge-low"><i class="bi bi-exclamation-triangle"></i> Low stock</span>';
    return '<span class="badge-soft badge-in"><i class="bi bi-check-circle"></i> In stock</span>';
  }

  function stockMeter(item) {
    var s = Store.stockStatus(item);
    var min = Number(item.minStock) || 1;
    var ceiling = Math.max(min * 3, 1);
    var pct = Math.max(3, Math.min(100, (Number(item.qty) / ceiling) * 100));
    var cls = s === "out" ? "out" : s === "low" ? "low" : "ok";
    return '<div class="stock-meter">' +
      '<div class="progress-thin"><span style="width:' + pct + '%;background:' +
      (s === "out" ? "var(--danger)" : s === "low" ? "var(--warning)" : "var(--success)") + '"></span></div>' +
      '<span class="qty ' + cls + '">' + U.qty(item.qty) + "</span></div>" +
      '<div class="cell-sub">min ' + U.qty(item.minStock) + " " + U.esc(item.unit) + "</div>";
  }

  function renderTable() {
    var body = document.getElementById("inventoryBody");
    var list = filtered();
    var pages = Math.max(1, Math.ceil(list.length / state.perPage));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * state.perPage;
    var rows = list.slice(start, start + state.perPage);

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9"><div class="empty-state"><i class="bi bi-box-seam"></i>' +
        "<p>No inventory items match your filters.</p></div></td></tr>";
    } else {
      body.innerHTML = rows.map(function (i) {
        return "<tr>" +
          '<td><span class="cell-sub mono">' + U.esc(i.id) + "</span></td>" +
          "<td><div class=\"cell-title\">" + U.esc(i.name) + "</div>" +
          '<div class="cell-sub">Updated ' + U.fmtDate(i.updatedAt) + "</div></td>" +
          '<td><span class="badge-soft badge-muted">' + U.esc(i.category) + "</span></td>" +
          "<td>" + stockMeter(i) + "</td>" +
          '<td class="cell-sub">' + U.esc(i.unit) + "</td>" +
          '<td class="text-end mono">' + U.money(i.costPrice) + "</td>" +
          '<td class="text-end mono">' + U.money(i.sellingPrice) + "</td>" +
          "<td>" + statusBadge(i) + "</td>" +
          '<td><div class="table-actions">' +
          '<button class="btn-icon" data-view="' + i.id + '" title="Details"><i class="bi bi-eye"></i></button>' +
          '<button class="btn-icon success" data-stock="' + i.id + '" title="Stock in / out"><i class="bi bi-arrow-left-right"></i></button>' +
          '<button class="btn-icon" data-edit="' + i.id + '" title="Edit"><i class="bi bi-pencil"></i></button>' +
          '<button class="btn-icon danger" data-del="' + i.id + '" title="Delete"><i class="bi bi-trash3"></i></button>' +
          "</div></td></tr>";
      }).join("");
    }

    document.getElementById("invCountLabel").textContent =
      "Showing " + (list.length ? start + 1 : 0) + "–" + Math.min(start + state.perPage, list.length) +
      " of " + list.length + " items";

    var pager = document.getElementById("invPager");
    pager.innerHTML = "";
    if (pages > 1) {
      var mk = function (label, page, disabled, active) {
        var b = document.createElement("button");
        b.innerHTML = label;
        b.disabled = !!disabled;
        if (active) b.classList.add("active");
        b.addEventListener("click", function () { state.page = page; renderTable(); });
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

  function fillCategoryFilters() {
    var catFilter = document.getElementById("invCategoryFilter");
    var current = catFilter.value;
    catFilter.innerHTML = '<option value="all">All categories</option>' +
      SUPPLY_CATEGORIES.map(function (c) {
        return '<option value="' + U.esc(c) + '">' + U.esc(c) + "</option>";
      }).join("");
    catFilter.value = current && (current === "all" || SUPPLY_CATEGORIES.indexOf(current) >= 0) ? current : "all";

    var formCat = document.getElementById("invCategory");
    var formCurrent = formCat.value;
    formCat.innerHTML = SUPPLY_CATEGORIES.map(function (c) {
      return '<option value="' + U.esc(c) + '">' + U.esc(c) + "</option>";
    }).join("");
    if (formCurrent && SUPPLY_CATEGORIES.indexOf(formCurrent) >= 0) formCat.value = formCurrent;
  }

  /* ------------------------------------------------------------- forms */
  function openForm(item) {
    if (!window.Auth.requireInventory()) return;
    fillCategoryFilters();
    var err = document.getElementById("invFormError");
    err.classList.add("hidden");
    var isEdit = !!item;
    document.getElementById("invModalTitle").textContent = isEdit ? "Edit inventory item" : "New inventory item";
    document.getElementById("invId").value = isEdit ? item.id : "";
    document.getElementById("invName").value = isEdit ? item.name : "";
    document.getElementById("invCategory").value = isEdit ? item.category : SUPPLY_CATEGORIES[0];
    document.getElementById("invQty").value = isEdit ? item.qty : 0;
    document.getElementById("invUnit").value = isEdit ? item.unit : "pcs";
    document.getElementById("invMin").value = isEdit ? item.minStock : 1;
    document.getElementById("invCost").value = isEdit ? item.costPrice : 0;
    document.getElementById("invPrice").value = isEdit ? item.sellingPrice : 0;
    document.getElementById("invQty").disabled = isEdit; // changes go through stock movements
    document.getElementById("invSaveBtn").innerHTML = isEdit
      ? '<i class="bi bi-check2"></i> Save changes'
      : '<i class="bi bi-plus-lg"></i> Create item';
    window.App.modal("inventoryModal").show();
  }

  function saveItem(e) {
    e.preventDefault();
    if (!window.Auth.requireInventory()) return;
    var err = document.getElementById("invFormError");
    err.classList.add("hidden");

    var id = document.getElementById("invId").value;
    var name = document.getElementById("invName").value.trim();
    var category = document.getElementById("invCategory").value;
    var qty = parseFloat(document.getElementById("invQty").value);
    var unit = document.getElementById("invUnit").value;
    var min = parseFloat(document.getElementById("invMin").value);
    var cost = parseFloat(document.getElementById("invCost").value);
    var price = parseFloat(document.getElementById("invPrice").value);

    function fail(msg) {
      err.textContent = msg;
      err.classList.remove("hidden");
    }

    if (!name) return fail("Item name is required.");
    if ([qty, min, cost, price].some(function (n) { return !isFinite(n) || n < 0; })) {
      return fail("Quantities and prices must be zero or greater.");
    }
    var dup = Store.db.inventory.filter(function (i) {
      return i.name.toLowerCase() === name.toLowerCase() && i.id !== id;
    })[0];
    if (dup) return fail("Another inventory item already uses that name.");

    if (id) {
      var item = Store.inventoryItem(id);
      if (!item) return fail("That item no longer exists.");
      item.name = name;
      item.category = category;
      item.unit = unit;
      item.minStock = min;
      item.costPrice = U.r2(cost);
      item.sellingPrice = U.r2(price);
      item.updatedAt = new Date().toISOString();
      Store.notify("inventory", "Inventory updated", name + " details were updated.");
      Store.commit();
      window.App.toast("Inventory item updated.", "success");
    } else {
      var newItem = {
        id: Store.nextId("INV", "inventory", 3),
        name: name,
        category: category,
        qty: U.r2(qty),
        unit: unit,
        minStock: min,
        costPrice: U.r2(cost),
        sellingPrice: U.r2(price),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      Store.db.inventory.push(newItem);
      if (qty > 0) {
        var user = window.Auth.user();
        Store.logStockMove({
          inventoryId: newItem.id, itemName: newItem.name, type: "in", qty: newItem.qty,
          unit: newItem.unit, note: "Opening stock",
          userId: user ? user.id : null, userName: user ? user.fullName : "System"
        });
      }
      Store.notify("inventory", "Inventory item added", name + " was added to inventory.");
      Store.logActivity("Inventory item added", name + " (" + newItem.id + ") added to " + category + ".");
      Store.commit();
      window.App.toast("Inventory item created.", "success");
    }

    Store.syncStockNotifications();
    Store.commit();
    window.App.modal("inventoryModal").hide();
    renderTable();
    window.App.refreshShell();
    if (window.AdminPage) window.AdminPage.refreshIfVisible();
    if (window.InventoryStaffPage) window.InventoryStaffPage.refreshIfVisible();
  }

  /* ------------------------------------------------------------- stock */
  function stock(itemId, type) {
    if (!window.Auth.requireInventory()) return;
    fillStockSelect(itemId);
    setStockType(type || "in");
    window.App.modal("stockModal").show();
  }

  function fillStockSelect(selectedId) {
    var select = document.getElementById("stockItem");
    var items = Store.db.inventory.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    select.innerHTML = items.map(function (i) {
      return '<option value="' + i.id + '">' + U.esc(i.name) + " (" + U.qty(i.qty) + " " + U.esc(i.unit) + ")</option>";
    }).join("");
    if (selectedId && Store.inventoryItem(selectedId)) select.value = selectedId;
    updateStockContext();
  }

  function updateStockContext() {
    var id = document.getElementById("stockItem").value;
    var item = Store.inventoryItem(id);
    var cur = document.getElementById("stockCurrent");
    var min = document.getElementById("stockMin");
    var unitField = document.getElementById("stockUnit");
    if (!item) {
      cur.textContent = "—";
      min.textContent = "—";
      unitField.value = "";
      return;
    }
    cur.textContent = U.qty(item.qty) + " " + item.unit;
    min.textContent = U.qty(item.minStock) + " " + item.unit;
    unitField.value = item.unit;
  }

  function setStockType(type) {
    document.getElementById("stockType").value = type;
    document.querySelectorAll("[data-stock-type]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-stock-type") === type);
    });
    var save = document.getElementById("stockSaveBtn");
    save.innerHTML = type === "in"
      ? '<i class="bi bi-plus-lg"></i> Add stock'
      : '<i class="bi bi-dash-lg"></i> Remove stock';
  }

  function saveStock(e) {
    e.preventDefault();
    if (!window.Auth.requireInventory()) return;
    var err = document.getElementById("stockError");
    err.classList.add("hidden");

    var id = document.getElementById("stockItem").value;
    var type = document.getElementById("stockType").value;
    var qty = parseFloat(document.getElementById("stockQty").value);
    var note = document.getElementById("stockNote").value.trim();

    function fail(msg) {
      err.textContent = msg;
      err.classList.remove("hidden");
    }

    var result = Store.adjustStock(id, type, qty, note);
    if (!result.ok) return fail(result.error);

    var item = result.item;
    window.App.modal("stockModal").hide();
    document.getElementById("stockQty").value = "";
    document.getElementById("stockNote").value = "";
    renderTable();
    window.App.refreshShell();
    window.App.toast(
      (type === "in" ? "Added " : "Removed ") + U.qty(Math.abs(Number(qty))) + " " + item.unit +
      (type === "in" ? " to " : " from ") + item.name + ".",
      "success"
    );
    if (window.AdminPage) window.AdminPage.refreshIfVisible();
    if (window.InventoryStaffPage) window.InventoryStaffPage.refreshIfVisible();
  }

  /* ------------------------------------------------------------- details */
  function showDetails(id) {
    var item = Store.inventoryItem(id);
    if (!item) return;
    document.getElementById("invDetailTitle").textContent = item.name;
    var moves = Store.movesFor(id).slice(0, 8);
    var stockValue = U.r2(Number(item.qty) * Number(item.costPrice));

    var moveRows = moves.length ? moves.map(function (m) {
      var positive = m.type === "in";
      return '<div class="move-row">' +
        '<span class="' + (positive ? "m-in" : "m-out") + '">' +
        '<i class="bi bi-' + (positive ? "plus-circle" : m.type === "sale" ? "bag-check" : "dash-circle") + '"></i></span>' +
        '<div class="flex-grow-1"><div>' + (positive ? "+" : "−") + U.qty(m.qty) + " " + U.esc(m.unit) +
        ' <span class="text-muted-soft">' + U.esc(m.note || "") + "</span></div>" +
        '<div class="cell-sub">' + U.fmtDateTime(m.datetime) + " · " + U.esc(m.userName) + "</div></div>" +
        "</div>";
    }).join("") : '<div class="cell-sub">No stock movements recorded yet.</div>';

    document.getElementById("invDetailBody").innerHTML =
      '<div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">' +
      "<div><span class=\"badge-soft badge-muted mono\">" + U.esc(item.id) + "</span> " +
      statusBadge(item) + "</div>" +
      '<div class="cell-sub">Last updated ' + U.fmtDateTime(item.updatedAt) + "</div></div>" +
      '<div class="detail-grid mb-3">' +
      '<div class="detail-cell"><div class="d1">Category</div><div class="d2">' + U.esc(item.category) + "</div></div>" +
      '<div class="detail-cell"><div class="d1">On hand</div><div class="d2">' + U.qty(item.qty) + " " + U.esc(item.unit) + "</div></div>" +
      '<div class="detail-cell"><div class="d1">Minimum level</div><div class="d2">' + U.qty(item.minStock) + " " + U.esc(item.unit) + "</div></div>" +
      '<div class="detail-cell"><div class="d1">Stock value (cost)</div><div class="d2">' + U.money(stockValue) + "</div></div>" +
      '<div class="detail-cell"><div class="d1">Cost price</div><div class="d2">' + U.money(item.costPrice) + " / " + U.esc(item.unit) + "</div></div>" +
      '<div class="detail-cell"><div class="d1">Selling price</div><div class="d2">' + U.money(item.sellingPrice) + " / " + U.esc(item.unit) + "</div></div>" +
      "</div>" +
      '<div class="section-title">Recent stock movements</div>' +
      '<div>' + moveRows + "</div>";

    var btn = document.getElementById("invDetailStock");
    btn.onclick = function () {
      window.App.modal("inventoryDetailModal").hide();
      stock(item.id, "in");
    };
    window.App.modal("inventoryDetailModal").show();
  }

  /* ------------------------------------------------------------- delete */
  function remove(id) {
    if (!window.Auth.requireAdmin()) return;
    var item = Store.inventoryItem(id);
    if (!item) return;

    var usedBy = Store.db.products.filter(function (p) {
      return (p.recipe || []).some(function (r) { return r.inventoryId === id; });
    });

    if (usedBy.length) {
      window.App.toast(
        "Cannot delete: " + item.name + " is used in " + usedBy.length + " product recipe" +
        (usedBy.length > 1 ? "s" : "") + " (" + usedBy.slice(0, 3).map(function (p) { return p.name; }).join(", ") +
        (usedBy.length > 3 ? "…" : "") + "). Remove it from those recipes first.",
        "danger", 6500
      );
      return;
    }

    window.App.confirm({
      title: "Delete inventory item?",
      body: "<strong>" + U.esc(item.name) + "</strong> will be removed from inventory. Past sales and stock movement logs are kept.",
      okText: "Delete item",
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      if (!window.Auth.requireAdmin(true)) return;
      Store.db.inventory = Store.db.inventory.filter(function (i) { return i.id !== id; });
      Store.commit();
      renderTable();
      window.App.refreshShell();
      window.App.toast("Inventory item deleted.", "success");
      if (window.AdminPage) window.AdminPage.refreshIfVisible();
    });
  }

  /* ------------------------------------------------------------- page */
  var InventoryPage = {
    render: function () {
      if (!window.Auth.requireInventory(true)) return;
      fillCategoryFilters();
      document.getElementById("invSearch").value = state.search;
      document.getElementById("invCategoryFilter").value = state.category;
      document.getElementById("invStatusFilter").value = state.status;
      document.getElementById("invSort").value = state.sort;
      renderTable();
      if (!state.bound) this.bind();
    },

    bind: function () {
      state.bound = true;

      document.getElementById("invSearch").addEventListener("input", U.debounce(function (e) {
        state.search = e.target.value;
        state.page = 1;
        renderTable();
      }, 180));

      document.getElementById("invCategoryFilter").addEventListener("change", function (e) {
        state.category = e.target.value;
        state.page = 1;
        renderTable();
      });
      document.getElementById("invStatusFilter").addEventListener("change", function (e) {
        state.status = e.target.value;
        state.page = 1;
        renderTable();
      });
      document.getElementById("invSort").addEventListener("change", function (e) {
        state.sort = e.target.value;
        state.page = 1;
        renderTable();
      });

      document.getElementById("btnAddInventory").addEventListener("click", function () { openForm(null); });
      document.getElementById("btnStockMove").addEventListener("click", function () {
        if (!Store.db.inventory.length) {
          window.App.toast("Add an inventory item first.", "warning");
          return;
        }
        stock(Store.db.inventory[0].id, "in");
      });

      document.getElementById("inventoryForm").addEventListener("submit", saveItem);
      document.getElementById("stockForm").addEventListener("submit", saveStock);
      document.getElementById("stockItem").addEventListener("change", updateStockContext);
      document.getElementById("stockTypeGroup").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-stock-type]");
        if (btn) setStockType(btn.getAttribute("data-stock-type"));
      });

      document.getElementById("inventoryBody").addEventListener("click", function (e) {
        var view = e.target.closest("[data-view]");
        var st = e.target.closest("[data-stock]");
        var edit = e.target.closest("[data-edit]");
        var del = e.target.closest("[data-del]");
        if (view) showDetails(view.getAttribute("data-view"));
        else if (st) stock(st.getAttribute("data-stock"), "in");
        else if (edit) {
          var item = Store.inventoryItem(edit.getAttribute("data-edit"));
          if (item) openForm(item);
        } else if (del) remove(del.getAttribute("data-del"));
      });
    },

    /** Public: open the stock modal for a specific item (used by dashboards). */
    openStock: function (id, type) {
      if (!window.Auth.requireInventory()) return;
      stock(id, type);
    },

    /** Public: open the add/edit form (used by dashboards and quick actions). */
    openForm: function (item) {
      if (!window.Auth.requireInventory()) return;
      openForm(item || null);
    },

    openItem: function (id) {
      if (!window.Auth.requireInventory()) return;
      showDetails(id);
    }
  };

  window.InventoryPage = InventoryPage;
  window.InventoryCategories = SUPPLY_CATEGORIES;
})(window);

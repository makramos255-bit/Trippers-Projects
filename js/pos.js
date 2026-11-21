/* ==========================================================================
   TRIPPERS COFFEE — pos.js
   Cashier point of sale: catalogue, cart, discounts, payments, stock checks.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;
  var CART_KEY = "trippers.cart";

  var pos = {
    search: "",
    category: "all",
    cart: [],              // [{ productId, qty }]
    discountType: "percent",
    discountValue: 0,
    bound: false,
    loaded: false,
    pay: {
      method: "Cash",
      cash: 0,
      reference: "",
      completing: false
    }
  };

  /* ------------------------------------------------------------- helpers */
  function r3(n) { return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000; }

  function catName(id) {
    var c = Store.category(id);
    return c ? c.name : "Uncategorised";
  }

  function productImage(p) {
    return Store.image(p.id) || U.placeholderImage(p.name);
  }

  function cartProduct(line) {
    return Store.product(line.productId);
  }

  /** Maximum sellable servings given current raw inventory (Infinity = untracked). */
  function maxServings(product) {
    if (!product || !product.recipe || !product.recipe.length) return Infinity;
    var min = Infinity;
    product.recipe.forEach(function (r) {
      var item = Store.inventoryItem(r.inventoryId);
      if (!item) { min = 0; return; }
      var possible = Math.floor(Number(item.qty) / Number(r.qty));
      if (possible < min) min = possible;
    });
    return Math.max(0, min);
  }

  function cartCount() {
    return pos.cart.reduce(function (a, l) { return a + l.qty; }, 0);
  }

  /** Today's personal shift numbers shown above the menu. */
  function renderStats() {
    var user = window.Auth.user();
    if (!user) return;
    var now = new Date();
    var mine = Store.db.sales.filter(function (s) {
      if (s.cashierId !== user.id) return false;
      var d = new Date(s.datetime);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    });
    var completed = mine.filter(function (s) { return s.status === "completed"; });
    var revenue = completed.reduce(function (a, s) { return a + (Number(s.total) || 0); }, 0);

    var txns = document.getElementById("posStatTxns");
    if (txns) txns.textContent = mine.length;
    var sales = document.getElementById("posStatSales");
    if (sales) sales.textContent = U.money(revenue);
    var done = document.getElementById("posStatDone");
    if (done) done.textContent = completed.length;
    var cashier = document.getElementById("posStatCashier");
    if (cashier) cashier.textContent = user.fullName.split(" ")[0];
  }

  function saveDraft(silent) {
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify({
        items: pos.cart,
        discountType: pos.discountType,
        discountValue: pos.discountValue,
        savedAt: new Date().toISOString()
      }));
      if (!silent) window.App.toast("Order draft saved on this device.", "success", 2200);
    } catch (e) {
      if (!silent) window.App.toast("Could not save the draft — storage is full.", "danger");
    }
  }

  function loadDraft() {
    pos.loaded = true;
    var raw;
    try { raw = window.localStorage.getItem(CART_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
      var d = JSON.parse(raw);
      if (!d || !Array.isArray(d.items)) return;
      pos.cart = d.items.filter(function (l) {
        var p = Store.product(l.productId);
        return p && p.active && p.available && l.qty > 0;
      }).map(function (l) {
        return { productId: l.productId, qty: Math.max(1, Math.floor(l.qty)) };
      });
      pos.discountType = d.discountType === "amount" ? "amount" : "percent";
      pos.discountValue = Number(d.discountValue) || 0;
      if (pos.cart.length) window.App.toast("Restored your saved order draft.", "info", 2600);
    } catch (e) { /* ignore malformed draft */ }
  }

  function clearDraft() {
    try { window.localStorage.removeItem(CART_KEY); } catch (e) { /* ignore */ }
  }

  function cartLines() {
    return pos.cart.map(function (l) {
      var p = cartProduct(l);
      return {
        productId: l.productId,
        name: p ? p.name : "Unavailable item",
        price: p ? Number(p.price) : 0,
        qty: l.qty,
        lineTotal: p ? U.r2(Number(p.price) * l.qty) : 0,
        categoryId: p ? p.categoryId : null,
        categoryName: p ? catName(p.categoryId) : "—"
      };
    });
  }

  function totals() {
    return Store.computeTotals(cartLines(), pos.discountType, pos.discountValue);
  }

  /* ------------------------------------------------------------- catalogue */
  function renderCats() {
    var wrap = document.getElementById("posCategories");
    var cats = Store.db.categories.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    var html = '<button class="pos-cat ' + (pos.category === "all" ? "active" : "") + '" data-cat="all">' +
      '<i class="bi bi-grid me-1"></i>All menu</button>';
    html += cats.map(function (c) {
      return '<button class="pos-cat ' + (pos.category === c.id ? "active" : "") + '" data-cat="' + c.id + '">' +
        U.esc(c.name) + "</button>";
    }).join("");
    wrap.innerHTML = html;
  }

  function renderGrid(animate) {
    var grid = document.getElementById("posGrid");
    var q = pos.search.trim().toLowerCase();
    var list = Store.posProducts().filter(function (p) {
      if (pos.category !== "all" && p.categoryId !== pos.category) return false;
      if (!q) return true;
      return (p.name + " " + (p.description || "") + " " + catName(p.categoryId)).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });

    // Restart the entrance animation only when the menu itself changes —
    // never when the cart updates a quantity badge.
    grid.classList.remove("grid-enter");
    if (animate) {
      void grid.offsetWidth;
      grid.classList.add("grid-enter");
      clearTimeout(grid.__enterTimer);
      grid.__enterTimer = setTimeout(function () { grid.classList.remove("grid-enter"); }, 620);
    }

    if (!list.length) {
      grid.innerHTML = '<div class="pos-empty"><i class="bi bi-search"></i>' +
        "<p>No available products match your search.</p></div>";
      return;
    }

    grid.innerHTML = list.map(function (p) {
      var inCart = pos.cart.filter(function (l) { return l.productId === p.id; })[0];
      var left = maxServings(p);
      var soldOut = left <= 0;
      return '<button class="pos-tile" data-add="' + p.id + '"' + (soldOut ? " disabled" : "") + ">" +
        '<div class="pos-tile-media">' +
        '<img src="' + U.esc(productImage(p)) + '" alt="' + U.attr(p.name) + '" loading="lazy">' +
        (soldOut ? '<span class="badge-soft badge-out tile-badge">Sold out</span>' : "") +
        (inCart ? '<span class="pos-tile-qty">' + inCart.qty + "</span>" : "") +
        "</div>" +
        '<div class="pos-tile-body">' +
        '<div class="pos-tile-cat">' + U.esc(catName(p.categoryId)) + "</div>" +
        '<div class="pos-tile-name">' + U.esc(p.name) + "</div>" +
        '<div class="pos-tile-price">' + U.money(p.price) + "</div>" +
        "</div></button>";
    }).join("");
  }

  /* ------------------------------------------------------------- cart */
  function renderCart() {
    var box = document.getElementById("posCartItems");
    var count = cartCount();
    var t = totals();

    // Remember which lines are already on screen so only newly added ones animate.
    var prevIds = {};
    Array.prototype.forEach.call(box.querySelectorAll(".cart-line"), function (el) {
      prevIds[el.getAttribute("data-line")] = true;
    });

    document.getElementById("posItemCount").textContent = count + (count === 1 ? " item" : " items");
    document.getElementById("posOrderNo").textContent = count ? Store.nextOrderNumber() + " (draft)" : "Draft order";
    document.getElementById("posSubtotal").textContent = U.money(t.subtotal);
    document.getElementById("posDiscountAmount").textContent = t.discountAmount > 0 ? "− " + U.money(t.discountAmount) : "− " + U.money(0);
    document.getElementById("posTaxRate").textContent = U.qty(t.taxRate);
    document.getElementById("posTax").textContent = U.money(t.taxAmount);
    var totalEl = document.getElementById("posTotal");
    var totalText = U.money(t.total);
    if (totalEl.textContent !== totalText) {
      totalEl.textContent = totalText;
      totalEl.classList.remove("bump");
      void totalEl.offsetWidth; // restart the keyframe
      totalEl.classList.add("bump");
      clearTimeout(pos.bumpTimer);
      pos.bumpTimer = setTimeout(function () { totalEl.classList.remove("bump"); }, 400);
    }
    document.getElementById("posChargeAmount").textContent = U.money(t.total);
    document.getElementById("posMobileCount").textContent = count + (count === 1 ? " item" : " items");
    document.getElementById("posMobileTotal").textContent = U.money(t.total);

    document.getElementById("posDiscountType").value = pos.discountType;
    // Never rewrite the value under the cashier's cursor while they are typing.
    var discountInput = document.getElementById("posDiscountValue");
    if (document.activeElement !== discountInput) {
      discountInput.value = pos.discountValue || "";
    }

    if (!count) {
      box.innerHTML = '<div class="cart-empty"><i class="bi bi-bag"></i>' +
        "<p>Tap a product to start the order.</p></div>";
      return;
    }

    box.innerHTML = pos.cart.map(function (l) {
      var p = cartProduct(l);
      if (!p) return "";
      var isNew = !prevIds[p.id];
      return '<div class="cart-line' + (isNew ? " is-new" : "") + '" data-line="' + p.id + '">' +
        '<img src="' + U.esc(productImage(p)) + '" alt="">' +
        '<div class="cl-main">' +
        '<div class="cl-name">' + U.esc(p.name) + "</div>" +
        '<div class="cl-price">' + U.money(p.price) + " each</div>" +
        "</div>" +
        '<div class="qty-ctrl">' +
        '<button data-dec="' + p.id + '" aria-label="Decrease"><i class="bi bi-dash"></i></button>' +
        '<span class="q">' + l.qty + "</span>" +
        '<button data-inc="' + p.id + '" aria-label="Increase"><i class="bi bi-plus"></i></button>' +
        "</div>" +
        '<div class="cl-total">' + U.money(p.price * l.qty) + "</div>" +
        '<button class="cl-del" data-del="' + p.id + '" aria-label="Remove"><i class="bi bi-x-lg"></i></button>' +
        "</div>";
    }).join("");
  }

  function addToCart(id) {
    var p = Store.product(id);
    if (!p || !p.active || !p.available) {
      window.App.toast("That product is not available.", "warning");
      return;
    }
    var line = pos.cart.filter(function (l) { return l.productId === id; })[0];
    var nextQty = (line ? line.qty : 0) + 1;
    var left = maxServings(p);
    if (nextQty > left) {
      Store.notify("inventory", "Insufficient stock",
        p.name + " can only be made " + left + " more time" + (left === 1 ? "" : "s") + " with current inventory.",
        "pos:stock:" + p.id);
      Store.commit();
      window.App.refreshShell();
      window.App.toast("Only " + left + " " + (left === 1 ? "serving" : "servings") + " of " +
        p.name + " can be made with current stock.", "warning", 4200);
      return;
    }
    if (line) line.qty = nextQty;
    else pos.cart.push({ productId: id, qty: 1 });
    saveDraft(true);
    renderGrid();
    renderCart();
  }

  function changeQty(id, delta) {
    var line = pos.cart.filter(function (l) { return l.productId === id; })[0];
    if (!line) return;
    if (delta > 0) {
      var p = Store.product(id);
      var left = maxServings(p);
      if (line.qty + delta > left) {
        window.App.toast("Only " + left + " " + (left === 1 ? "serving" : "servings") + " available.", "warning", 3200);
        return;
      }
    }
    line.qty += delta;
    if (line.qty <= 0) pos.cart = pos.cart.filter(function (l) { return l.productId !== id; });
    saveDraft(true);
    renderGrid();
    renderCart();
  }

  function removeLine(id) {
    pos.cart = pos.cart.filter(function (l) { return l.productId !== id; });
    saveDraft(true);
    renderGrid();
    renderCart();
  }

  function clearCart(silent) {
    pos.cart = [];
    pos.discountValue = 0;
    pos.discountType = "percent";
    clearDraft();
    renderGrid();
    renderCart();
    if (!silent) window.App.toast("Order cleared.", "info", 2000);
  }

  function askClear() {
    if (!pos.cart.length) { window.App.toast("The cart is already empty.", "info", 1600); return; }
    window.App.confirm({
      title: "Clear this order?",
      body: "All " + cartCount() + " item(s) will be removed from the current order.",
      okText: "Clear order",
      danger: true
    }).then(function (yes) { if (yes) clearCart(); });
  }

  /* ------------------------------------------------------------- stock */
  function stockCheck() {
    var needs = {};
    cartLines().forEach(function (l) {
      var p = Store.product(l.productId);
      if (!p) return;
      (p.recipe || []).forEach(function (r) {
        if (!r.inventoryId || !Number(r.qty)) return;
        needs[r.inventoryId] = (needs[r.inventoryId] || 0) + Number(r.qty) * l.qty;
      });
    });

    var shortages = [];
    Object.keys(needs).forEach(function (id) {
      var item = Store.inventoryItem(id);
      var needed = r3(needs[id]);
      if (!item) {
        shortages.push({ name: "Unknown inventory item", needed: needed, available: 0, unit: "" });
        return;
      }
      if (needed > Number(item.qty) + 1e-9) {
        shortages.push({
          name: item.name,
          needed: needed,
          available: Number(item.qty),
          unit: item.unit,
          id: item.id
        });
      }
    });

    return { needs: needs, shortages: shortages };
  }

  function renderStockWarning() {
    var box = document.getElementById("payStockWarning");
    var check = stockCheck();
    if (!check.shortages.length) {
      box.innerHTML = '<div class="alert alert-premium success py-2 px-3 mb-0" style="font-size:.78rem">' +
        '<i class="bi bi-check2-circle"></i> All ingredients are available for this order.</div>';
      return false;
    }
    box.innerHTML = '<div class="alert alert-premium danger py-2 px-3 mb-0" style="font-size:.78rem">' +
      '<strong><i class="bi bi-exclamation-triangle"></i> Insufficient stock</strong>' +
      '<ul class="mb-0 mt-1 ps-3">' +
      check.shortages.map(function (s) {
        return "<li>" + U.esc(s.name) + ": need " + U.qty(s.needed) + " " + U.esc(s.unit) +
          ", available " + U.qty(s.available) + " " + U.esc(s.unit) + "</li>";
      }).join("") + "</ul></div>";
    return true;
  }

  /* ------------------------------------------------------------- payment */
  function openPayment() {
    if (!window.Auth.requireRole(["admin", "cashier"])) return;
    if (!pos.cart.length) {
      window.App.toast("Add at least one product before charging.", "warning");
      return;
    }
    if (stockCheck().shortages.length) {
      window.App.toast("Some ingredients are out of stock — review the order.", "danger", 5000);
      return;
    }

    var t = totals();
    document.getElementById("paySubtotal").textContent = U.money(t.subtotal);
    document.getElementById("payDiscount").textContent = t.discountAmount > 0 ? "− " + U.money(t.discountAmount) : U.money(0);
    document.getElementById("payTax").textContent = U.money(t.taxAmount);
    document.getElementById("payTotal").textContent = U.money(t.total);
    document.getElementById("payItemCount").textContent = cartCount() + " item(s)";
    document.getElementById("payError").classList.add("hidden");
    document.getElementById("payCash").value = "";
    document.getElementById("payRef").value = "";

    pos.pay.method = "Cash";
    pos.pay.cash = 0;
    document.querySelectorAll("#payMethods .pay-method").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-method") === "Cash");
    });
    document.getElementById("payCashWrap").classList.remove("hidden");
    document.getElementById("payRefWrap").classList.add("hidden");
    renderStockWarning();
    updateChange();
    window.App.modal("paymentModal").show();
    setTimeout(function () { document.getElementById("payCash").focus(); }, 350);
  }

  function setMethod(method) {
    pos.pay.method = method;
    document.querySelectorAll("#payMethods .pay-method").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-method") === method);
    });
    document.getElementById("payCashWrap").classList.toggle("hidden", method !== "Cash");
    document.getElementById("payRefWrap").classList.toggle("hidden", method === "Cash");
    var box = document.getElementById("payChangeBox");
    if (method === "Cash") {
      document.getElementById("payChangeLabel").textContent = "Change due";
      updateChange();
    } else {
      box.classList.remove("insufficient");
      document.getElementById("payChangeLabel").textContent = "Amount to collect";
      document.getElementById("payChange").textContent = U.money(totals().total);
    }
  }

  function updateChange() {
    var t = totals();
    var cash = parseFloat(document.getElementById("payCash").value);
    pos.pay.cash = isFinite(cash) ? cash : 0;
    var box = document.getElementById("payChangeBox");
    if (pos.pay.method !== "Cash") return;

    if (!pos.pay.cash) {
      box.classList.remove("insufficient");
      document.getElementById("payChangeLabel").textContent = "Change due";
      document.getElementById("payChange").textContent = U.money(0);
      return;
    }
    var diff = U.r2(pos.pay.cash - t.total);
    if (diff < 0) {
      box.classList.add("insufficient");
      document.getElementById("payChangeLabel").textContent = "Short by";
      document.getElementById("payChange").textContent = U.money(Math.abs(diff));
    } else {
      box.classList.remove("insufficient");
      document.getElementById("payChangeLabel").textContent = "Change due";
      document.getElementById("payChange").textContent = U.money(diff);
    }
  }

  function completeSale() {
    if (pos.pay.completing) return; // idempotency guard
    if (!window.Auth.requireRole(["admin", "cashier"])) return;

    var user = window.Auth.user();
    var t = totals();
    var method = pos.pay.method;
    var cash = parseFloat(document.getElementById("payCash").value) || 0;
    var ref = document.getElementById("payRef").value.trim();
    var err = document.getElementById("payError");

    function fail(msg) {
      err.textContent = msg;
      err.classList.remove("hidden");
      err.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    if (!pos.cart.length) return fail("The order is empty.");
    if (method === "Cash" && cash < t.total) {
      return fail("Cash received (" + U.money(cash) + ") is less than the total (" + U.money(t.total) + ").");
    }
    if (method !== "Cash" && !ref) {
      // Reference is optional, but make the cashier acknowledge e-wallet payment.
      if (!window.confirm(method + " payment has no reference number. Complete anyway?")) return;
    }

    var check = stockCheck();
    if (check.shortages.length) {
      err.innerHTML = "<strong>Insufficient stock:</strong> " +
        check.shortages.map(function (s) {
          return U.esc(s.name) + " (need " + U.qty(s.needed) + ", have " + U.qty(s.available) + " " + U.esc(s.unit) + ")";
        }).join("; ");
      err.classList.remove("hidden");
      return;
    }

    // Verify every product is still sellable.
    var invalid = pos.cart.filter(function (l) {
      var p = Store.product(l.productId);
      return !p || !p.active || !p.available;
    });
    if (invalid.length) return fail("One or more products are no longer available. Refresh the order.");

    pos.pay.completing = true;
    var btn = document.getElementById("payConfirmBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-mini"></span> Processing…';

    setTimeout(function () {
      try {
        var saleId = Store.newSaleId();
        var lines = cartLines();
        var deductions = [];
        var nowIso = new Date().toISOString();

        // Deduct raw inventory (validated above).
        Object.keys(check.needs).forEach(function (invId) {
          var item = Store.inventoryItem(invId);
          if (!item) return;
          var take = r3(check.needs[invId]);
          item.qty = Math.max(0, r3(Number(item.qty) - take));
          item.updatedAt = nowIso;
          deductions.push({ inventoryId: item.id, name: item.name, qty: take, unit: item.unit });
          Store.logStockMove({
            inventoryId: item.id,
            itemName: item.name,
            type: "sale",
            qty: take,
            unit: item.unit,
            note: "Sale " + saleId,
            userId: user.id,
            userName: user.fullName
          });
        });

        var sale = {
          id: saleId,
          datetime: nowIso,
          cashierId: user.id,
          cashierName: user.fullName,
          items: lines,
          subtotal: t.subtotal,
          discountType: t.discountType,
          discountValue: t.discountValue,
          discountAmount: t.discountAmount,
          taxRate: t.taxRate,
          taxAmount: t.taxAmount,
          total: t.total,
          paymentMethod: method,
          reference: method === "Cash" ? "" : ref,
          cashReceived: method === "Cash" ? U.r2(cash) : t.total,
          change: method === "Cash" ? U.r2(cash - t.total) : 0,
          status: "completed",
          deductions: deductions
        };

        Store.db.sales.push(sale);
        Store.notify("sale", "Sale completed",
          sale.id + " · " + U.money(sale.total) + " via " + method + " · " + user.fullName);
        Store.logActivity("Sale completed",
          sale.id + " · " + U.money(sale.total) + " · " + lines.length + " line(s) via " + method + ".");
        Store.syncStockNotifications();
        Store.commit();

        clearCart(true);
        window.App.modal("paymentModal").hide();
        renderStats();
        window.App.refreshShell();

        /* receipt */
        var paidLine = document.getElementById("receiptChangeLine");
        var paidLabel = document.getElementById("receiptChangeLabel");
        if (method === "Cash") {
          paidLine.textContent = U.money(sale.cashReceived);
          paidLabel.textContent = "Change due " + U.money(sale.change);
        } else {
          paidLine.textContent = U.money(sale.total);
          paidLabel.textContent = "Paid via " + method + (ref ? " · " + ref : "");
        }
        window.Receipt.show(sale);

        window.App.toast("Sale " + sale.id + " completed successfully.", "success", 4200);
        if (window.AdminPage) window.AdminPage.refreshIfVisible();
      } catch (ex) {
        window.App.error(ex);
        err.textContent = "The sale could not be completed: " + ex.message;
        err.classList.remove("hidden");
      } finally {
        pos.pay.completing = false;
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check2-circle"></i> Complete payment';
      }
    }, 260);
  }

  /* ------------------------------------------------------------- history */
  function openHistory() {
    var user = window.Auth.user();
    if (!user) return;
    var sales = Store.db.sales.filter(function (s) {
      return user.role === "admin" || s.cashierId === user.id;
    }).slice().sort(function (a, b) { return new Date(b.datetime) - new Date(a.datetime); });

    var total = sales.reduce(function (a, s) {
      return a + (s.status === "completed" ? Number(s.total) || 0 : 0);
    }, 0);

    document.getElementById("posHistoryBody").innerHTML =
      '<div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">' +
      '<div class="cell-sub">' + (user.role === "admin" ? "All transactions in this store" : "Your transactions") + "</div>" +
      '<div><span class="eyebrow me-2">Total</span><strong class="text-gold">' + U.money(total) + "</strong></div></div>" +
      (sales.length
        ? '<div class="table-wrap"><table class="table table-premium"><thead><tr>' +
        "<th>Receipt</th><th>Date &amp; time</th><th>Items</th><th>Payment</th><th class=\"text-end\">Total</th><th></th></tr></thead><tbody>" +
        sales.slice(0, 60).map(function (s) {
          var cls = s.paymentMethod === "Cash" ? "badge-cash" : s.paymentMethod === "GCash" ? "badge-gcash" : "badge-maya";
          return "<tr><td class=\"mono\">" + U.esc(s.id) + "</td>" +
            '<td class="cell-sub">' + U.fmtDateTime(s.datetime) + "</td>" +
            '<td class="cell-sub">' + U.esc(s.items.length) + " line(s) · " +
            U.esc(s.items[0] ? s.items[0].name : "") + (s.items.length > 1 ? " +" + (s.items.length - 1) : "") + "</td>" +
            '<td><span class="badge-soft ' + cls + '">' + U.esc(s.paymentMethod) + "</span></td>" +
            '<td class="text-end mono">' + U.money(s.total) + "</td>" +
            '<td class="text-end"><div class="table-actions">' +
            '<button class="btn-icon" data-phist-view="' + s.id + '" title="View receipt"><i class="bi bi-eye"></i></button>' +
            '<button class="btn-icon" data-phist-print="' + s.id + '" title="Print"><i class="bi bi-printer"></i></button>' +
            "</div></td></tr>";
        }).join("") + "</tbody></table></div>" +
        (sales.length > 60 ? '<div class="cell-sub mt-2">Showing the latest 60 of ' + sales.length + " transactions.</div>" : "")
        : '<div class="empty-state"><i class="bi bi-receipt"></i><p>No transactions yet.</p></div>');

    var body = document.getElementById("posHistoryBody");
    body.querySelectorAll("[data-phist-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        var sale = Store.sale(b.getAttribute("data-phist-view"));
        if (!sale) return;
        window.App.modal("posHistoryModal").hide();
        window.Receipt.show(sale, { hideSuccess: true, title: '<i class="bi bi-receipt text-gold me-2"></i>' + sale.id });
      });
    });
    body.querySelectorAll("[data-phist-print]").forEach(function (b) {
      b.addEventListener("click", function () {
        var sale = Store.sale(b.getAttribute("data-phist-print"));
        if (sale) window.Receipt.print(sale);
      });
    });

    window.App.modal("posHistoryModal").show();
  }

  /* ------------------------------------------------------------- page */
  var POS = {
    render: function () {
      if (!pos.loaded) loadDraft();
      document.getElementById("posSearch").value = pos.search;
      renderCats();
      renderGrid(true);
      renderCart();
      renderStats();
      this.bind();
    },

    bind: function () {
      if (pos.bound) {
        var closeBtn = document.getElementById("posCart");
        closeBtn.classList.remove("open");
        return;
      }
      pos.bound = true;

      document.getElementById("posSearch").addEventListener("input", U.debounce(function (e) {
        pos.search = e.target.value;
        renderGrid(true);
      }, 150));

      document.getElementById("posClearSearch").addEventListener("click", function () {
        pos.search = "";
        document.getElementById("posSearch").value = "";
        renderGrid(true);
      });

      document.getElementById("posCategories").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-cat]");
        if (!btn) return;
        pos.category = btn.getAttribute("data-cat");
        renderCats();
        renderGrid(true);
      });

      document.getElementById("posGrid").addEventListener("click", function (e) {
        var tile = e.target.closest("[data-add]");
        if (tile && !tile.disabled) addToCart(tile.getAttribute("data-add"));
      });

      document.getElementById("posCartItems").addEventListener("click", function (e) {
        var inc = e.target.closest("[data-inc]");
        var dec = e.target.closest("[data-dec]");
        var del = e.target.closest("[data-del]");
        if (inc) changeQty(inc.getAttribute("data-inc"), 1);
        else if (dec) changeQty(dec.getAttribute("data-dec"), -1);
        else if (del) removeLine(del.getAttribute("data-del"));
      });

      document.getElementById("posDiscountType").addEventListener("change", function (e) {
        pos.discountType = e.target.value;
        pos.discountValue = 0;
        saveDraft(true);
        renderCart();
      });
      document.getElementById("posDiscountValue").addEventListener("input", U.debounce(function (e) {
        var v = parseFloat(e.target.value);
        pos.discountValue = isFinite(v) && v > 0 ? v : 0;
        saveDraft(true);
        renderCart();
      }, 320));

      document.getElementById("posClearCart").addEventListener("click", askClear);
      document.getElementById("posHold").addEventListener("click", function () {
        if (!pos.cart.length) { window.App.toast("Nothing to save yet.", "info"); return; }
        saveDraft(false);
      });
      document.getElementById("posCheckout").addEventListener("click", openPayment);

      /* mobile cart drawer */
      document.getElementById("posMobileReview").addEventListener("click", function () {
        document.getElementById("posCart").classList.add("open");
      });
      document.getElementById("posCartClose").addEventListener("click", function () {
        document.getElementById("posCart").classList.remove("open");
      });

      document.getElementById("posMySales").addEventListener("click", openHistory);
      document.getElementById("posNotifBtn").addEventListener("click", function () {
        window.App.openNotifications();
      });
      document.getElementById("posChangePassword").addEventListener("click", function () {
        window.App.openChangePassword();
      });
      document.getElementById("posClockBtn").addEventListener("click", function () {
        window.App.toast(new Date().toLocaleString("en-PH"), "info", 2600);
      });

      /* payment modal */
      document.getElementById("payMethods").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-method]");
        if (btn) setMethod(btn.getAttribute("data-method"));
      });
      document.getElementById("payCash").addEventListener("input", updateChange);
      document.getElementById("quickCash").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-cash]");
        if (!btn) return;
        var total = totals().total;
        if (btn.getAttribute("data-cash") === "exact") {
          document.getElementById("payCash").value = total.toFixed(2);
        } else {
          var val = parseFloat(btn.getAttribute("data-cash"));
          var current = parseFloat(document.getElementById("payCash").value) || 0;
          document.getElementById("payCash").value = (current + val).toFixed(2);
        }
        updateChange();
      });
      document.getElementById("payConfirmBtn").addEventListener("click", completeSale);

      document.getElementById("receiptPrintBtn").addEventListener("click", function () {
        var id = this.dataset.saleId;
        var sale = Store.sale(id);
        if (sale) window.Receipt.print(sale);
      });
      document.getElementById("receiptNewSale").addEventListener("click", function () {
        window.App.modal("receiptModal").hide();
        POS.render();
      });
    },

    /** Lets the router warn before leaving with a live order. */
    hasItems: function () {
      return pos.cart.length > 0;
    },

    saveDraftSilent: function () {
      saveDraft(true);
    },

    /** Clears in-memory cart/UI state so the next sign-in starts clean. */
    resetState: function () {
      pos.cart = [];
      pos.discountType = "percent";
      pos.discountValue = 0;
      pos.search = "";
      pos.category = "all";
      pos.loaded = false;
      pos.pay.method = "Cash";
      pos.pay.cash = 0;
      pos.pay.reference = "";
      pos.pay.completing = false;
      clearDraft();
    }
  };

  window.POS = POS;
})(window);

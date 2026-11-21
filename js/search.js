/* ==========================================================================
   TRIPPERS COFFEE — search.js
   Role-aware global search across products, inventory, staff, sales and
   activity. Keyboard driven (Ctrl/Cmd+K) and prefills each page's filter.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;
  var activeIndex = 0;
  var currentResults = [];
  var bound = false;

  function norm(v) {
    return String(v === null || v === undefined ? "" : v).toLowerCase();
  }

  function includes(haystack, q) {
    return norm(haystack).indexOf(q) !== -1;
  }

  function money(v) {
    return U.money(Number(v) || 0);
  }

  function role() {
    var user = window.Auth.user();
    return user ? user.role : "admin";
  }

  /* ------------------------------------------------------------- sources */
  function productResults(q) {
    var r = role();
    var route = r === "cashier" ? "#/pos" : "#/admin/products";
    var input = r === "cashier" ? "posSearch" : "prdSearch";
    var list = Store.db.products.filter(function (p) {
      var cat = Store.category(p.categoryId);
      return includes(p.name, q) || includes(p.id, q) || includes(cat ? cat.name : "", q) || includes(p.description || "", q);
    }).sort(function (a, b) {
      return norm(a.name).indexOf(q) === 0 ? -1 : norm(b.name).indexOf(q) === 0 ? 1 : a.name.localeCompare(b.name);
    });

    return list.slice(0, 5).map(function (p) {
      var cat = Store.category(p.categoryId);
      var visible = p.active && p.available;
      return {
        group: "Products",
        icon: "bi-cup-hot",
        title: p.name,
        meta: (cat ? cat.name : "Uncategorised") + " · " + money(p.price) + (visible ? "" : " · hidden from POS"),
        route: route,
        input: input,
        term: p.name
      };
    });
  }

  function inventoryResults(q) {
    var r = role();
    var route = r === "inventory" ? "#/inventory/list" : "#/admin/inventory";
    var input = r === "inventory" ? "ivtSearch" : "invSearch";
    var list = Store.db.inventory.filter(function (i) {
      return includes(i.name, q) || includes(i.id, q) || includes(i.category || "", q) || includes(i.unit || "", q);
    }).sort(function (a, b) {
      return norm(a.name).indexOf(q) === 0 ? -1 : norm(b.name).indexOf(q) === 0 ? 1 : a.name.localeCompare(b.name);
    });

    return list.slice(0, 5).map(function (i) {
      var status = Store.stockStatus(i);
      var label = status === "out" ? "Out of stock" : status === "low" ? "Low stock" : "In stock";
      return {
        group: "Inventory",
        icon: "bi-box-seam",
        title: i.name,
        meta: U.qty(i.qty) + " " + i.unit + " · " + label + " · " + (i.category || "Supplies"),
        route: route,
        input: input,
        term: i.name
      };
    });
  }

  function staffResults(q) {
    if (role() !== "admin") return [];
    return Store.staff().filter(function (u) {
      return includes(u.fullName, q) || includes(u.username, q) || includes(u.email || "", q) ||
        includes(u.employeeId || "", q) || includes(u.contact || "", q);
    }).sort(function (a, b) {
      return norm(a.fullName).indexOf(q) === 0 ? -1 : norm(b.fullName).indexOf(q) === 0 ? 1 : a.fullName.localeCompare(b.fullName);
    }).slice(0, 5).map(function (u) {
      return {
        group: "Staff",
        icon: u.role === "inventory" ? "bi-box-seam" : "bi-person-badge",
        title: u.fullName,
        meta: window.Auth.roleLabel(u.role) + " · @" + u.username + " · " + (u.status === "active" ? "Active" : "Inactive"),
        route: "#/admin/staff",
        input: "stfSearch",
        term: u.fullName
      };
    });
  }

  function salesResults(q) {
    var r = role();
    var user = window.Auth.user();
    var list = Store.db.sales.filter(function (s) {
      if (r === "cashier" && (!user || s.cashierId !== user.id)) return false;
      if (r === "inventory") return false;
      var items = (s.items || []).map(function (it) { return it.name; }).join(" ");
      return includes(s.id, q) || includes(s.cashierName, q) || includes(s.paymentMethod, q) ||
        includes(s.status, q) || includes(items, q);
    }).sort(function (a, b) {
      return new Date(b.datetime) - new Date(a.datetime);
    });

    return list.slice(0, 5).map(function (s) {
      var count = (s.items || []).reduce(function (a, it) { return a + (Number(it.qty) || 0); }, 0);
      return {
        group: "Transactions",
        icon: "bi-receipt",
        title: s.id,
        meta: U.fmtDateTime(s.datetime) + " · " + s.cashierName + " · " + count + " item" +
          (count === 1 ? "" : "s") + " · " + money(s.total),
        route: r === "cashier" ? "#/cashier/dashboard" : "#/admin/transactions",
        input: r === "cashier" ? null : "txnSearch",
        term: s.id
      };
    });
  }

  function categoryResults(q) {
    if (role() !== "admin") return [];
    return Store.db.categories.filter(function (c) {
      return includes(c.name, q) || includes(c.description || "", q);
    }).slice(0, 4).map(function (c) {
      return {
        group: "Categories",
        icon: "bi-tags",
        title: c.name,
        meta: Store.productsInCategory(c.id).length + " product" +
          (Store.productsInCategory(c.id).length === 1 ? "" : "s") + " · " + (c.description || "Menu grouping"),
        route: "#/admin/categories",
        input: "catSearch",
        term: c.name
      };
    });
  }

  function activityResults(q) {
    if (role() !== "admin") return [];
    return Store.db.activities.filter(function (a) {
      return includes(a.action, q) || includes(a.detail, q) || includes(a.userName, q);
    }).slice(0, 4).map(function (a) {
      return {
        group: "Activity",
        icon: "bi-clock-history",
        title: a.action,
        meta: U.fmtDateTime(a.datetime) + " · " + a.userName + " · " + (a.detail || ""),
        route: "#/admin/activity",
        input: "actSearch",
        term: a.action
      };
    });
  }

  function movementResults(q) {
    if (role() !== "inventory") return [];
    return Store.db.stockMoves.filter(function (m) {
      return includes(m.itemName, q) || includes(m.note || "", q) || includes(m.userName || "", q);
    }).slice(0, 4).map(function (m) {
      return {
        group: "Stock movements",
        icon: m.type === "in" ? "bi-plus-circle" : "bi-dash-circle",
        title: m.itemName,
        meta: (m.type === "in" ? "Stock in" : m.type === "out" ? "Stock out" : "Sale deduction") +
          " · " + U.qty(m.qty) + " " + (m.unit || "") + " · " + U.fmtDateTime(m.datetime),
        route: "#/inventory/history",
        input: "ivHistorySearch",
        term: m.itemName
      };
    });
  }

  function search(q) {
    q = norm(q).trim();
    if (q.length < 2) return [];
    var groups = [
      productResults(q),
      inventoryResults(q),
      staffResults(q),
      salesResults(q),
      categoryResults(q),
      movementResults(q),
      activityResults(q)
    ];
    var out = [];
    groups.forEach(function (g) { out = out.concat(g); });
    return out.slice(0, 18);
  }

  /* ------------------------------------------------------------- rendering */
  function elsFor(input) {
    var wrap = input.closest(".global-search");
    return {
      wrap: wrap,
      results: wrap ? wrap.querySelector(".gs-results") : null
    };
  }

  function setActive(idx) {
    if (!currentResults.length) return;
    activeIndex = Math.max(0, Math.min(currentResults.length - 1, idx));
    document.querySelectorAll(".gs-item").forEach(function (el) {
      var on = Number(el.getAttribute("data-gs-idx")) === activeIndex;
      el.classList.toggle("is-active", on);
      if (on && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    });
  }

  function render(input, query) {
    var parts = elsFor(input);
    if (!parts.results) return;
    currentResults = search(query);
    activeIndex = 0;

    if (norm(query).trim().length < 2) {
      parts.results.classList.add("hidden");
      parts.results.innerHTML = "";
      return;
    }

    if (!currentResults.length) {
      parts.results.innerHTML =
        '<div class="gs-head"><span>Search</span><span>0 results</span></div>' +
        '<div class="gs-empty"><i class="bi bi-search"></i>No matches for “' + U.esc(query.trim()) + '”.' +
        '<div class="mt-1">Try a name, ID, product, cashier or receipt number.</div></div>';
      parts.results.classList.remove("hidden");
      return;
    }

    var html = '<div class="gs-head"><span>Search results</span><span>' + currentResults.length + " found</span></div>";
    var lastGroup = "";
    currentResults.forEach(function (r, i) {
      if (r.group !== lastGroup) {
        html += '<div class="gs-group-title">' + U.esc(r.group) + "</div>";
        lastGroup = r.group;
      }
      html += '<button type="button" class="gs-item' + (i === 0 ? " is-active" : "") + '" data-gs-idx="' + i + '" role="option">' +
        '<span class="gs-ico"><i class="bi ' + U.esc(r.icon) + '"></i></span>' +
        '<span class="gs-main"><span class="gs-title">' + U.esc(r.title) + "</span>" +
        '<span class="gs-meta">' + U.esc(r.meta) + "</span></span>" +
        '<i class="bi bi-arrow-return-left" style="color:#7d7466;font-size:.75rem"></i>' +
        "</button>";
    });
    html += '<div class="gs-hint"><i class="bi bi-keyboard me-1"></i>↑↓ to move · Enter to open · Esc to close</div>';
    parts.results.innerHTML = html;
    parts.results.classList.remove("hidden");

    parts.results.querySelectorAll("[data-gs-idx]").forEach(function (btn) {
      btn.addEventListener("mousemove", function () {
        setActive(Number(btn.getAttribute("data-gs-idx")));
      });
      btn.addEventListener("click", function () {
        choose(Number(btn.getAttribute("data-gs-idx")));
      });
    });
  }

  function closeAll() {
    document.querySelectorAll(".global-search .gs-results").forEach(function (el) {
      el.classList.add("hidden");
      el.innerHTML = "";
    });
    currentResults = [];
  }

  function choose(idx) {
    var r = currentResults[idx];
    if (!r) return;
    var input = document.querySelector("[data-global-search]:focus") ||
      Array.prototype.filter.call(document.querySelectorAll("[data-global-search]"), function (el) {
        return el.offsetParent !== null;
      })[0];
    if (input) input.value = "";
    closeAll();
    if (input) input.blur();

    function applyFilter() {
      if (!r.input) return;
      var el = document.getElementById(r.input);
      if (!el) return;
      el.value = r.term || "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    }

    var target = window.App.parse();
    if (target !== r.route) {
      window.App.go(r.route);
      window.setTimeout(applyFilter, 330);
    } else {
      applyFilter();
    }
  }

  /* ------------------------------------------------------------- binding */
  function init() {
    if (bound) return;
    bound = true;

    document.querySelectorAll("[data-global-search]").forEach(function (input) {
      input.addEventListener("input", U.debounce(function () {
        render(input, input.value);
      }, 120));

      input.addEventListener("focus", function () {
        if (input.value.trim().length >= 2) render(input, input.value);
      });

      input.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive(activeIndex + 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive(activeIndex - 1);
        } else if (e.key === "Enter") {
          if (currentResults.length) {
            e.preventDefault();
            choose(activeIndex);
          }
        } else if (e.key === "Escape") {
          closeAll();
          input.blur();
        }
      });
    });

    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && norm(e.key) === "k") {
        var input = Array.prototype.filter.call(document.querySelectorAll("[data-global-search]"), function (el) {
          return el.offsetParent !== null && !el.disabled;
        })[0];
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
        }
      } else if (e.key === "Escape") {
        closeAll();
      }
    });

    document.addEventListener("click", function (e) {
      if (!e.target.closest(".global-search")) closeAll();
    });
  }

  window.GlobalSearch = {
    init: init,
    open: function () {
      var input = Array.prototype.filter.call(document.querySelectorAll("[data-global-search]"), function (el) {
        return el.offsetParent !== null;
      })[0];
      if (input) { input.focus(); input.select(); }
    },
    close: closeAll,
    query: search
  };
})(window);

/* ==========================================================================
   TRIPPERS COFFEE — cashier.js
   Cashier accounts: create, edit, activate/deactivate, delete, sales history.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;

  var state = { search: "", status: "all", bound: false };

  function cashierSales(id) {
    return Store.db.sales.filter(function (s) {
      return s.cashierId === id && s.status === "completed";
    });
  }

  function list() {
    var q = state.search.trim().toLowerCase();
    return Store.cashiers().filter(function (u) {
      if (state.status !== "all" && u.status !== state.status) return false;
      if (!q) return true;
      return (u.fullName + " " + u.username + " " + u.employeeId + " " + (u.contact || ""))
        .toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return a.fullName.localeCompare(b.fullName); });
  }

  function render() {
    var body = document.getElementById("cashierBody");
    var rows = list();

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="bi bi-people"></i>' +
        "<p>No cashier accounts match your filters.</p></div></td></tr>";
    } else {
      body.innerHTML = rows.map(function (u) {
        var sales = cashierSales(u.id);
        var total = sales.reduce(function (a, s) { return a + (Number(s.total) || 0); }, 0);
        var active = u.status === "active";
        return "<tr>" +
          '<td><div class="d-flex align-items-center gap-2">' +
          '<div class="avatar">' + U.esc(U.initials(u.fullName)) + "</div>" +
          '<div><div class="cell-title">' + U.esc(u.fullName) + "</div>" +
          '<div class="cell-sub mono">' + U.esc(u.employeeId) + "</div></div></div></td>" +
          '<td><span class="mono">@' + U.esc(u.username) + "</span>" +
          '<div class="cell-sub">Since ' + U.fmtDate(u.createdAt) + "</div></td>" +
          '<td class="cell-sub">' + U.esc(u.contact || "—") + "</td>" +
          "<td>" + (active
            ? '<span class="badge-soft badge-in"><i class="bi bi-check-circle"></i> Active</span>'
            : '<span class="badge-soft badge-muted"><i class="bi bi-slash-circle"></i> Inactive</span>') + "</td>" +
          '<td class="text-end"><div class="mono fw-600">' + U.money(total) + "</div>" +
          '<div class="cell-sub">' + sales.length + " orders</div></td>" +
          '<td class="cell-sub">' + U.fmtDate(u.createdAt) + "</td>" +
          '<td><div class="table-actions">' +
          '<button class="btn-icon" data-view="' + u.id + '" title="View sales"><i class="bi bi-receipt"></i></button>' +
          '<button class="btn-icon" data-edit="' + u.id + '" title="Edit"><i class="bi bi-pencil"></i></button>' +
          '<button class="btn-icon ' + (active ? "danger" : "success") + '" data-toggle="' + u.id + '" title="' +
          (active ? "Deactivate" : "Activate") + '"><i class="bi ' +
          (active ? "bi-pause-circle" : "bi-play-circle") + '"></i></button>' +
          '<button class="btn-icon danger" data-del="' + u.id + '" title="Delete"><i class="bi bi-trash3"></i></button>' +
          "</div></td></tr>";
      }).join("");
    }

    var activeCount = Store.cashiers().filter(function (u) { return u.status === "active"; }).length;
    document.getElementById("cshCountLabel").textContent =
      Store.cashiers().length + " cashiers · " + activeCount + " active";
  }

  function openForm(user) {
    if (!window.Auth.requireAdmin()) return;
    var err = document.getElementById("cshFormError");
    err.classList.add("hidden");
    var isEdit = !!user;

    document.getElementById("cshModalTitle").textContent = isEdit ? "Edit cashier" : "New cashier";
    document.getElementById("cshId").value = isEdit ? user.id : "";
    document.getElementById("cshName").value = isEdit ? user.fullName : "";
    document.getElementById("cshUsername").value = isEdit ? user.username : "";
    document.getElementById("cshContact").value = isEdit ? (user.contact || "") : "";
    document.getElementById("cshEmpId").value = isEdit ? user.employeeId : nextEmployeeId();
    document.getElementById("cshPassword").value = "";
    document.getElementById("cshConfirm").value = "";
    document.getElementById("cshActive").checked = isEdit ? user.status === "active" : true;
    document.getElementById("cshPasswordHint").textContent = isEdit
      ? "Leave both password fields blank to keep the current password."
      : "Minimum 6 characters.";
    window.App.modal("cashierModal").show();
  }

  function nextEmployeeId() {
    var max = 0;
    Store.db.users.forEach(function (u) {
      var m = /^EMP-(\d+)$/i.exec(u.employeeId || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return "EMP-" + U.pad(max + 1, 3);
  }

  function save(e) {
    e.preventDefault();
    if (!window.Auth.requireAdmin()) return;

    var err = document.getElementById("cshFormError");
    err.classList.add("hidden");
    function fail(msg) {
      err.textContent = msg;
      err.classList.remove("hidden");
    }

    var id = document.getElementById("cshId").value;
    var name = document.getElementById("cshName").value.trim();
    var username = document.getElementById("cshUsername").value.trim();
    var contact = document.getElementById("cshContact").value.trim();
    var empId = document.getElementById("cshEmpId").value.trim();
    var pw = document.getElementById("cshPassword").value;
    var confirm = document.getElementById("cshConfirm").value;
    var active = document.getElementById("cshActive").checked;

    if (!name || !username || !contact || !empId) return fail("All fields except password are required.");
    if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username)) {
      return fail("Username must be 3–20 characters using letters, numbers, dot, dash or underscore.");
    }

    var unameDup = Store.db.users.filter(function (u) {
      return u.username.toLowerCase() === username.toLowerCase() && u.id !== id;
    })[0];
    if (unameDup) return fail("That username is already taken.");

    var empDup = Store.db.users.filter(function (u) {
      return String(u.employeeId).toLowerCase() === empId.toLowerCase() && u.id !== id;
    })[0];
    if (empDup) return fail("That employee ID is already assigned.");

    if (!id && !pw) return fail("Set a password for the new cashier.");
    if (pw || confirm) {
      if (pw.length < 6) return fail("Password must be at least 6 characters.");
      if (pw !== confirm) return fail("Passwords do not match.");
    }

    if (id) {
      var user = Store.user(id);
      if (!user) return fail("That account no longer exists.");
      user.fullName = name;
      user.username = username;
      user.contact = contact;
      user.employeeId = empId;
      user.status = active ? "active" : "inactive";
      user.updatedAt = new Date().toISOString();
      if (pw) window.Auth.setPassword(user, pw);
      Store.commit();
      window.App.toast("Cashier account updated.", "success");
    } else {
      var salt = U.salt();
      var newUser = {
        id: Store.nextId("USR", "user", 3),
        role: "cashier",
        fullName: name,
        username: username,
        salt: salt,
        passwordHash: U.password(pw, salt),
        employeeId: empId,
        contact: contact,
        status: active ? "active" : "inactive",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      Store.db.users.push(newUser);
      Store.notify("user", "New cashier account", name + " (" + empId + ") was added as a cashier.");
      Store.commit();
      window.App.toast("Cashier account created.", "success");
    }

    window.App.modal("cashierModal").hide();
    render();
    window.App.refreshShell();
  }

  function toggleStatus(id) {
    if (!window.Auth.requireAdmin()) return;
    var user = Store.user(id);
    if (!user || user.role !== "cashier") return;
    var activating = user.status !== "active";

    window.App.confirm({
      title: (activating ? "Activate" : "Deactivate") + " cashier?",
      body: activating
        ? "<strong>" + U.esc(user.fullName) + "</strong> will be able to sign in and use the POS again."
        : "<strong>" + U.esc(user.fullName) + "</strong> will be signed out and blocked from the POS. Their sales history is kept.",
      okText: activating ? "Activate account" : "Deactivate account",
      danger: !activating
    }).then(function (yes) {
      if (!yes) return;
      if (!window.Auth.requireAdmin(true)) return;
      user.status = activating ? "active" : "inactive";
      user.updatedAt = new Date().toISOString();
      Store.commit();
      render();
      window.App.refreshShell();
      window.App.toast("Cashier " + (activating ? "activated." : "deactivated."), "success");
    });
  }

  function remove(id) {
    if (!window.Auth.requireAdmin()) return;
    var user = Store.user(id);
    if (!user) return;
    var sales = cashierSales(id);
    window.App.confirm({
      title: "Delete cashier account?",
      body: "<strong>" + U.esc(user.fullName) + "</strong> will be removed permanently. " +
        sales.length + " recorded sale" + (sales.length === 1 ? "" : "s") +
        " will be kept for reporting, but the account can no longer sign in.",
      okText: "Delete account",
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      if (!window.Auth.requireAdmin(true)) return;
      Store.db.users = Store.db.users.filter(function (u) { return u.id !== id; });
      Store.commit();
      render();
      window.App.refreshShell();
      window.App.toast("Cashier account deleted.", "success");
    });
  }

  function viewSales(id) {
    var user = Store.user(id);
    if (!user) return;
    var sales = cashierSales(id).slice().sort(function (a, b) {
      return new Date(b.datetime) - new Date(a.datetime);
    });
    var total = sales.reduce(function (a, s) { return a + (Number(s.total) || 0); }, 0);
    var avg = sales.length ? total / sales.length : 0;

    document.getElementById("cshSalesTitle").textContent = user.fullName + " — sales";
    var body = document.getElementById("cshSalesBody");
    body.innerHTML =
      '<div class="kpi-grid mb-3" style="grid-template-columns:repeat(3,1fr)">' +
      '<div class="kpi"><div class="k1">Orders</div><div class="k2">' + sales.length + "</div></div>" +
      '<div class="kpi"><div class="k1">Revenue</div><div class="k2">' + U.money(total) + "</div></div>" +
      '<div class="kpi"><div class="k1">Average</div><div class="k2">' + U.money(avg) + "</div></div>" +
      "</div>" +
      (sales.length
        ? '<div class="table-wrap"><table class="table table-premium"><thead><tr>' +
        "<th>Receipt</th><th>Date</th><th>Payment</th><th class=\"text-end\">Total</th><th></th></tr></thead><tbody>" +
        sales.slice(0, 40).map(function (s) {
          var cls = s.paymentMethod === "Cash" ? "badge-cash" : s.paymentMethod === "GCash" ? "badge-gcash" : "badge-maya";
          return "<tr><td class=\"mono\">" + U.esc(s.id) + "</td>" +
            '<td class="cell-sub">' + U.fmtDateTime(s.datetime) + "</td>" +
            '<td><span class="badge-soft ' + cls + '">' + U.esc(s.paymentMethod) + "</span></td>" +
            '<td class="text-end mono">' + U.money(s.total) + "</td>" +
            '<td class="text-end"><button class="btn-icon" data-sale="' + s.id + '" title="View"><i class="bi bi-eye"></i></button></td></tr>';
        }).join("") + "</tbody></table></div>" +
        (sales.length > 40 ? '<div class="cell-sub mt-2">Showing the latest 40 of ' + sales.length + " transactions.</div>" : "")
        : '<div class="empty-state"><i class="bi bi-receipt"></i><p>No sales recorded for this cashier yet.</p></div>');

    body.querySelectorAll("[data-sale]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        window.App.modal("cashierSalesModal").hide();
        if (window.SalesPage) window.SalesPage.openSale(btn.getAttribute("data-sale"));
      });
    });

    window.App.modal("cashierSalesModal").show();
  }

  var CashierPage = {
    render: function () {
      document.getElementById("cshSearch").value = state.search;
      document.getElementById("cshStatusFilter").value = state.status;
      render();
      if (!state.bound) this.bind();
    },

    bind: function () {
      state.bound = true;

      document.getElementById("cshSearch").addEventListener("input", U.debounce(function (e) {
        state.search = e.target.value;
        render();
      }, 170));

      document.getElementById("cshStatusFilter").addEventListener("change", function (e) {
        state.status = e.target.value;
        render();
      });

      document.getElementById("btnAddCashier").addEventListener("click", function () { openForm(null); });
      document.getElementById("cashierForm").addEventListener("submit", save);

      document.getElementById("cashierBody").addEventListener("click", function (e) {
        var view = e.target.closest("[data-view]");
        var edit = e.target.closest("[data-edit]");
        var toggle = e.target.closest("[data-toggle]");
        var del = e.target.closest("[data-del]");
        if (view) viewSales(view.getAttribute("data-view"));
        else if (edit) {
          var u = Store.user(edit.getAttribute("data-edit"));
          if (u) openForm(u);
        } else if (toggle) toggleStatus(toggle.getAttribute("data-toggle"));
        else if (del) remove(del.getAttribute("data-del"));
      });
    }
  };

  window.CashierPage = CashierPage;
})(window);

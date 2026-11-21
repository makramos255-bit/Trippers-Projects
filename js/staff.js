/* ==========================================================================
   TRIPPERS COFFEE — staff.js
   Admin-only staff accounts: Inventory Staff + Cashier CRUD, activity,
   password resets and performance snapshots.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;

  var state = { search: "", role: "all", status: "all", bound: false };

  function roleLabel(role) {
    return role === "inventory" ? "Inventory Staff" : role === "cashier" ? "Cashier" : "Administrator";
  }

  function roleBadge(role) {
    return role === "inventory"
      ? '<span class="badge-soft badge-gold"><i class="bi bi-box-seam"></i> Inventory Staff</span>'
      : '<span class="badge-soft badge-info"><i class="bi bi-person-badge"></i> Cashier</span>';
  }

  function completedSales(id) {
    return Store.db.sales.filter(function (s) {
      return s.cashierId === id && s.status === "completed";
    });
  }

  function staffMoves(id) {
    return Store.db.stockMoves.filter(function (m) {
      return m.userId === id && (m.type === "in" || m.type === "out");
    });
  }

  function list() {
    var q = state.search.trim().toLowerCase();
    return Store.staff().filter(function (u) {
      if (state.role !== "all" && u.role !== state.role) return false;
      if (state.status !== "all" && u.status !== state.status) return false;
      if (!q) return true;
      return (u.fullName + " " + u.username + " " + (u.email || "") + " " + u.employeeId + " " + (u.contact || ""))
        .toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      if (a.role !== b.role) return a.role === "inventory" ? -1 : 1;
      return a.fullName.localeCompare(b.fullName);
    });
  }

  function performanceCell(u) {
    if (u.role === "cashier") {
      var sales = completedSales(u.id);
      var total = sales.reduce(function (a, s) { return a + (Number(s.total) || 0); }, 0);
      return '<div class="mono fw-600">' + U.money(total) + "</div>" +
        '<div class="cell-sub">' + sales.length + " order" + (sales.length === 1 ? "" : "s") + "</div>";
    }
    var moves = staffMoves(u.id);
    var units = moves.reduce(function (a, m) { return a + (Number(m.qty) || 0); }, 0);
    return '<div class="mono fw-600">' + moves.length + " moves</div>" +
      '<div class="cell-sub">' + U.qty(units) + " units handled</div>";
  }

  function render() {
    var body = document.getElementById("staffBody");
    if (!body) return;
    var rows = list();

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="bi bi-people"></i>' +
        "<p>No staff accounts match your filters.</p></div></td></tr>";
    } else {
      body.innerHTML = rows.map(function (u) {
        var active = u.status === "active";
        return "<tr>" +
          '<td><div class="d-flex align-items-center gap-2">' +
          '<div class="avatar">' + U.esc(U.initials(u.fullName)) + "</div>" +
          '<div><div class="cell-title">' + U.esc(u.fullName) + "</div>" +
          '<div class="cell-sub mono">' + U.esc(u.employeeId) + "</div></div></div></td>" +
          '<td><span class="mono">@' + U.esc(u.username) + "</span>" +
          '<div class="cell-sub">' + U.esc(u.email || "—") + "</div></td>" +
          "<td>" + roleBadge(u.role) + "</td>" +
          '<td class="cell-sub">' + U.esc(u.contact || "—") + "</td>" +
          "<td>" + (active
            ? '<span class="badge-soft badge-in"><i class="bi bi-check-circle"></i> Active</span>'
            : '<span class="badge-soft badge-muted"><i class="bi bi-slash-circle"></i> Inactive</span>') + "</td>" +
          '<td class="cell-sub">' + U.fmtDate(u.createdAt) + "</td>" +
          '<td class="text-end">' + performanceCell(u) + "</td>" +
          '<td><div class="table-actions">' +
          '<button class="btn-icon" data-view="' + u.id + '" title="View activity and performance"><i class="bi bi-activity"></i></button>' +
          '<button class="btn-icon" data-edit="' + u.id + '" title="Edit staff information"><i class="bi bi-pencil"></i></button>' +
          '<button class="btn-icon" data-reset="' + u.id + '" title="Reset password"><i class="bi bi-key"></i></button>' +
          '<button class="btn-icon ' + (active ? "danger" : "success") + '" data-toggle="' + u.id + '" title="' +
          (active ? "Deactivate" : "Activate") + '"><i class="bi ' +
          (active ? "bi-pause-circle" : "bi-play-circle") + '"></i></button>' +
          '<button class="btn-icon danger" data-del="' + u.id + '" title="Delete account"><i class="bi bi-trash3"></i></button>' +
          "</div></td></tr>";
      }).join("");
    }

    var all = Store.staff();
    var active = all.filter(function (u) { return u.status === "active"; });
    document.getElementById("stfCountLabel").textContent =
      all.length + " staff accounts · " + active.length + " active · " +
      Store.staffByRole("inventory").length + " inventory · " +
      Store.staffByRole("cashier").length + " cashier";
  }

  /* ------------------------------------------------------------- form */
  function nextEmployeeId() {
    var max = 0;
    Store.db.users.forEach(function (u) {
      var m = /^EMP-(\d+)$/i.exec(u.employeeId || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return "EMP-" + U.pad(max + 1, 3);
  }

  function openForm(user) {
    if (!window.Auth.requireAdmin()) return;
    var isEdit = !!user;
    document.getElementById("stfFormError").classList.add("hidden");
    document.getElementById("stfModalTitle").textContent = isEdit ? "Edit staff account" : "Create staff account";
    document.getElementById("stfId").value = isEdit ? user.id : "";
    document.getElementById("stfName").value = isEdit ? user.fullName : "";
    document.getElementById("stfUsername").value = isEdit ? user.username : "";
    document.getElementById("stfEmail").value = isEdit ? (user.email || "") : "";
    document.getElementById("stfContact").value = isEdit ? (user.contact || "") : "";
    document.getElementById("stfEmpId").value = isEdit ? user.employeeId : nextEmployeeId();
    document.getElementById("stfRole").value = isEdit ? user.role : "inventory";
    document.getElementById("stfPassword").value = "";
    document.getElementById("stfConfirm").value = "";
    document.getElementById("stfActive").checked = isEdit ? user.status === "active" : true;
    document.getElementById("stfPasswordHint").textContent = isEdit
      ? "Leave both password fields blank to keep the current password."
      : "Minimum 6 characters.";
    window.App.modal("staffModal").show();
  }

  function save(e) {
    e.preventDefault();
    if (!window.Auth.requireAdmin()) return;

    var err = document.getElementById("stfFormError");
    err.classList.add("hidden");
    function fail(msg) {
      err.textContent = msg;
      err.classList.remove("hidden");
      err.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    var id = document.getElementById("stfId").value;
    var name = document.getElementById("stfName").value.trim();
    var username = document.getElementById("stfUsername").value.trim();
    var email = document.getElementById("stfEmail").value.trim().toLowerCase();
    var contact = document.getElementById("stfContact").value.trim();
    var empId = document.getElementById("stfEmpId").value.trim();
    var role = document.getElementById("stfRole").value;
    var pw = document.getElementById("stfPassword").value;
    var confirm = document.getElementById("stfConfirm").value;
    var active = document.getElementById("stfActive").checked;

    if (!name || !username || !contact || !empId) return fail("All required fields must be completed.");
    if (role !== "inventory" && role !== "cashier") return fail("Choose a valid staff role.");
    if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username)) {
      return fail("Username must be 3–20 characters using letters, numbers, dot, dash or underscore.");
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");

    var unameDup = Store.db.users.filter(function (u) {
      return u.username.toLowerCase() === username.toLowerCase() && u.id !== id;
    })[0];
    if (unameDup) return fail("That username is already taken.");

    if (email) {
      var emailDup = Store.db.users.filter(function (u) {
        return String(u.email || "").toLowerCase() === email && u.id !== id;
      })[0];
      if (emailDup) return fail("That email is already linked to another account.");
    }

    var empDup = Store.db.users.filter(function (u) {
      return String(u.employeeId).toLowerCase() === empId.toLowerCase() && u.id !== id;
    })[0];
    if (empDup) return fail("That employee ID is already assigned.");

    if (!id && !pw) return fail("Set a password for the new staff account.");
    if (pw || confirm) {
      if (pw.length < 6) return fail("Password must be at least 6 characters.");
      if (pw !== confirm) return fail("Passwords do not match.");
    }

    if (id) {
      var user = Store.user(id);
      if (!user) return fail("That account no longer exists.");
      var oldRole = user.role;
      user.fullName = name;
      user.username = username;
      user.email = email || (username + "@trippers.coffee");
      user.contact = contact;
      user.employeeId = empId;
      user.role = role;
      user.status = active ? "active" : "inactive";
      user.updatedAt = new Date().toISOString();
      if (pw) window.Auth.setPassword(user, pw, "Password changed by admin");
      Store.logActivity("Staff account updated",
        name + " (" + empId + ") updated" + (oldRole !== role ? " · role changed to " + roleLabel(role) : "") + ".");
      Store.commit();
      window.App.toast("Staff account updated.", "success");
    } else {
      var salt = U.salt();
      var newUser = {
        id: Store.nextId("USR", "user", 3),
        role: role,
        fullName: name,
        username: username,
        email: email || (username + "@trippers.coffee"),
        salt: salt,
        passwordHash: U.password(pw, salt),
        employeeId: empId,
        contact: contact,
        status: active ? "active" : "inactive",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      Store.db.users.push(newUser);
      Store.notify("user", "New staff account created", name + " (" + empId + ") was added as " + roleLabel(role) + ".");
      Store.logActivity("Staff account created", name + " (" + empId + ") added as " + roleLabel(role) + ".");
      Store.commit();
      window.App.toast(roleLabel(role) + " account created successfully.", "success");
    }

    window.App.modal("staffModal").hide();
    render();
    window.App.refreshShell();
  }

  /* ------------------------------------------------------------- actions */
  function toggleStatus(id) {
    if (!window.Auth.requireAdmin()) return;
    var user = Store.user(id);
    if (!user) return;
    var activating = user.status !== "active";
    var role = roleLabel(user.role);

    window.App.confirm({
      title: (activating ? "Activate" : "Deactivate") + " account?",
      body: activating
        ? "<strong>" + U.esc(user.fullName) + "</strong> will be able to sign in to the " +
          (user.role === "inventory" ? "inventory module" : "POS") + " again."
        : "<strong>" + U.esc(user.fullName) + "</strong> will be signed out and blocked from signing in. Their history is kept.",
      okText: activating ? "Activate account" : "Deactivate account",
      danger: !activating
    }).then(function (yes) {
      if (!yes) return;
      if (!window.Auth.requireAdmin(true)) return;
      user.status = activating ? "active" : "inactive";
      user.updatedAt = new Date().toISOString();
      Store.logActivity(activating ? "Staff account activated" : "Staff account deactivated",
        user.fullName + " (" + role + ") was " + (activating ? "activated." : "deactivated."));
      Store.commit();
      render();
      window.App.refreshShell();
      window.App.toast(role + " account " + (activating ? "activated." : "deactivated."), "success");
    });
  }

  function remove(id) {
    if (!window.Auth.requireAdmin()) return;
    var user = Store.user(id);
    if (!user) return;
    var sales = completedSales(id);
    var moves = staffMoves(id);

    window.App.confirm({
      title: "Delete staff account?",
      body: "<strong>" + U.esc(user.fullName) + "</strong> (" + roleLabel(user.role) + ") will be removed permanently. " +
        sales.length + " sale" + (sales.length === 1 ? "" : "s") + " and " + moves.length +
        " stock movement" + (moves.length === 1 ? "" : "s") + " will be kept for reporting, but the account can no longer sign in.",
      okText: "Delete account",
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      if (!window.Auth.requireAdmin(true)) return;
      Store.db.users = Store.db.users.filter(function (u) { return u.id !== id; });
      Store.logActivity("Staff account deleted", user.fullName + " (" + user.employeeId + ") was removed.");
      Store.commit();
      render();
      window.App.refreshShell();
      window.App.toast("Staff account deleted.", "success");
    });
  }

  function openReset(id) {
    if (!window.Auth.requireAdmin()) return;
    var user = Store.user(id);
    if (!user) return;
    document.getElementById("resetPwError").classList.add("hidden");
    document.getElementById("resetUserId").value = user.id;
    document.getElementById("resetUserName").textContent = user.fullName + " (@" + user.username + ")";
    document.getElementById("resetPassword").value = "";
    document.getElementById("resetConfirm").value = "";
    window.App.modal("resetPasswordModal").show();
    setTimeout(function () { document.getElementById("resetPassword").focus(); }, 320);
  }

  function saveReset(e) {
    e.preventDefault();
    if (!window.Auth.requireAdmin()) return;
    var err = document.getElementById("resetPwError");
    err.classList.add("hidden");
    function fail(msg) {
      err.textContent = msg;
      err.classList.remove("hidden");
    }
    var user = Store.user(document.getElementById("resetUserId").value);
    var pw = document.getElementById("resetPassword").value;
    var confirm = document.getElementById("resetConfirm").value;
    if (!user) return fail("That account no longer exists.");
    if (pw.length < 6) return fail("Password must be at least 6 characters.");
    if (pw !== confirm) return fail("Passwords do not match.");

    window.Auth.setPassword(user, pw, "Password reset by administrator");
    Store.notify("user", "Password reset", user.fullName + "'s password was reset by the administrator.");
    Store.commit();
    window.App.modal("resetPasswordModal").hide();
    render();
    window.App.toast("Password reset for " + user.fullName + ".", "success", 4200);
  }

  function openActivity(id) {
    var user = Store.user(id);
    if (!user) return;
    var activities = Store.activitiesFor(id, 20);
    var body = document.getElementById("staffActivityBody");
    var title = document.getElementById("staffActivityTitle");
    title.textContent = user.fullName + " — " + roleLabel(user.role);

    var stats;
    if (user.role === "cashier") {
      var sales = completedSales(id);
      var revenue = sales.reduce(function (a, s) { return a + (Number(s.total) || 0); }, 0);
      var avg = sales.length ? revenue / sales.length : 0;
      stats = '<div class="kpi-grid mb-3" style="grid-template-columns:repeat(3,1fr)">' +
        '<div class="kpi"><div class="k1">Orders</div><div class="k2">' + sales.length + "</div></div>" +
        '<div class="kpi"><div class="k1">Revenue</div><div class="k2">' + U.money(revenue) + "</div></div>" +
        '<div class="kpi"><div class="k1">Average order</div><div class="k2">' + U.money(avg) + "</div></div>" +
        "</div>";
    } else {
      var moves = staffMoves(id);
      var unitsIn = moves.filter(function (m) { return m.type === "in"; })
        .reduce(function (a, m) { return a + (Number(m.qty) || 0); }, 0);
      var unitsOut = moves.filter(function (m) { return m.type === "out"; })
        .reduce(function (a, m) { return a + (Number(m.qty) || 0); }, 0);
      stats = '<div class="kpi-grid mb-3" style="grid-template-columns:repeat(3,1fr)">' +
        '<div class="kpi"><div class="k1">Stock moves</div><div class="k2">' + moves.length + "</div></div>" +
        '<div class="kpi"><div class="k1">Units in</div><div class="k2">' + U.qty(unitsIn) + "</div></div>" +
        '<div class="kpi"><div class="k1">Units out</div><div class="k2">' + U.qty(unitsOut) + "</div></div>" +
        "</div>";
    }

    var account =
      '<div class="detail-grid mb-3">' +
      '<div class="detail-cell"><div class="d1">Employee ID</div><div class="d2 mono">' + U.esc(user.employeeId) + "</div></div>" +
      '<div class="detail-cell"><div class="d1">Username</div><div class="d2 mono">@' + U.esc(user.username) + "</div></div>" +
      '<div class="detail-cell"><div class="d1">Email</div><div class="d2">' + U.esc(user.email || "—") + "</div></div>" +
      '<div class="detail-cell"><div class="d1">Status</div><div class="d2">' +
      (user.status === "active" ? "Active" : "Inactive") + "</div></div>" +
      "</div>";

    var logins = Store.loginHistoryFor(id, 8);
    var loginFeed = logins.length ? logins.map(function (h) {
      return '<div class="move-row">' +
        '<span class="' + (h.ok ? "m-in" : "m-out") + '"><i class="bi ' +
        (h.ok ? "bi-box-arrow-in-right" : "bi-shield-exclamation") + '"></i></span>' +
        '<div class="flex-grow-1"><div><strong>' + U.esc(h.ok ? "Successful sign-in" : "Failed attempt") +
        '</strong> <span class="text-muted-soft">' + U.esc(h.reason) + "</span></div>" +
        '<div class="cell-sub">' + U.fmtDateTime(h.datetime) + "</div></div></div>";
    }).join("") : '<div class="empty-state" style="padding:1.2rem"><i class="bi bi-clock-history"></i>' +
      "<p>No sign-in history recorded yet.</p></div>";

    var feed = activities.length ? activities.map(function (a) {
      return '<div class="move-row">' +
        '<span class="m-in"><i class="bi bi-dot"></i></span>' +
        '<div class="flex-grow-1"><div><strong>' + U.esc(a.action) + "</strong> " +
        '<span class="text-muted-soft">' + U.esc(a.detail) + "</span></div>" +
        '<div class="cell-sub">' + U.fmtDateTime(a.datetime) + "</div></div></div>";
    }).join("") : '<div class="empty-state" style="padding:1.2rem"><i class="bi bi-activity"></i><p>No recorded activity yet.</p></div>';

    body.innerHTML = stats + account +
      '<div class="section-title">Login history</div><div>' + loginFeed + "</div>" +
      '<div class="section-title">Recent activity</div><div>' + feed + "</div>";
    window.App.modal("staffActivityModal").show();
  }

  /* ------------------------------------------------------------- page */
  var StaffPage = {
    render: function () {
      if (!window.Auth.requireAdmin(true)) return;
      document.getElementById("stfSearch").value = state.search;
      document.getElementById("stfRoleFilter").value = state.role;
      document.getElementById("stfStatusFilter").value = state.status;
      render();
      if (!state.bound) this.bind();
    },

    bind: function () {
      state.bound = true;

      document.getElementById("stfSearch").addEventListener("input", U.debounce(function (e) {
        state.search = e.target.value;
        render();
      }, 170));
      document.getElementById("stfRoleFilter").addEventListener("change", function (e) {
        state.role = e.target.value;
        render();
      });
      document.getElementById("stfStatusFilter").addEventListener("change", function (e) {
        state.status = e.target.value;
        render();
      });

      document.getElementById("btnAddStaff").addEventListener("click", function () { openForm(null); });
      document.getElementById("staffForm").addEventListener("submit", save);
      document.getElementById("resetPasswordForm").addEventListener("submit", saveReset);

      document.getElementById("staffBody").addEventListener("click", function (e) {
        var view = e.target.closest("[data-view]");
        var edit = e.target.closest("[data-edit]");
        var reset = e.target.closest("[data-reset]");
        var toggle = e.target.closest("[data-toggle]");
        var del = e.target.closest("[data-del]");
        if (view) openActivity(view.getAttribute("data-view"));
        else if (edit) {
          var u = Store.user(edit.getAttribute("data-edit"));
          if (u) openForm(u);
        } else if (reset) openReset(reset.getAttribute("data-reset"));
        else if (toggle) toggleStatus(toggle.getAttribute("data-toggle"));
        else if (del) remove(del.getAttribute("data-del"));
      });
    },

    /** Public so the dashboard quick action can open a blank form. */
    openForm: function () {
      if (!window.Auth.requireAdmin()) return;
      openForm(null);
    }
  };

  window.StaffPage = StaffPage;
})(window);

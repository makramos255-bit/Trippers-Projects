/* ==========================================================================
   TRIPPERS COFFEE — activity.js
   System-wide activity log for the administrator.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;

  var state = {
    search: "",
    role: "all",
    type: "all",
    bound: false
  };

  function category(action) {
    var a = String(action || "").toLowerCase();
    if (a.indexOf("signed") >= 0) return "auth";
    if (a.indexOf("stock") >= 0 || a.indexOf("inventory") >= 0) return "stock";
    if (a.indexOf("staff") >= 0) return "staff";
    if (a.indexOf("sale") >= 0) return "sale";
    if (a.indexOf("product") >= 0) return "product";
    if (a.indexOf("setting") >= 0 || a.indexOf("profile") >= 0 || a.indexOf("password") >= 0 ||
      a.indexOf("backup") >= 0 || a.indexOf("demo data") >= 0) return "settings";
    return "other";
  }

  function roleBadge(role) {
    if (role === "admin") return '<span class="badge-soft badge-gold"><i class="bi bi-shield-lock"></i> Admin</span>';
    if (role === "inventory") return '<span class="badge-soft badge-in"><i class="bi bi-box-seam"></i> Inventory</span>';
    if (role === "cashier") return '<span class="badge-soft badge-info"><i class="bi bi-person-badge"></i> Cashier</span>';
    return '<span class="badge-soft badge-muted">System</span>';
  }

  function filtered() {
    var q = state.search.trim().toLowerCase();
    return Store.db.activities.filter(function (a) {
      if (state.role !== "all" && a.role !== state.role) return false;
      if (state.type !== "all" && category(a.action) !== state.type) return false;
      if (!q) return true;
      return ((a.userName || "") + " " + (a.action || "") + " " + (a.detail || "") + " " + (a.role || ""))
        .toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      return new Date(b.datetime) - new Date(a.datetime);
    });
  }

  function render() {
    var body = document.getElementById("activityBody");
    if (!body) return;
    var rows = filtered();

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5"><div class="empty-state"><i class="bi bi-clock-history"></i>' +
        "<p>No activity matches these filters.</p></div></td></tr>";
    } else {
      body.innerHTML = rows.slice(0, 200).map(function (a) {
        return "<tr>" +
          '<td class="cell-sub" style="white-space:nowrap">' + U.fmtDateTime(a.datetime) + "</td>" +
          '<td><div class="cell-title">' + U.esc(a.userName || "System") + "</div>" +
          '<div class="cell-sub mono">' + U.esc(a.userId || "—") + "</div></td>" +
          "<td>" + roleBadge(a.role) + "</td>" +
          "<td>" + U.esc(a.action || "Activity") + "</td>" +
          '<td class="cell-sub" style="max-width:330px">' + U.esc(a.detail || "—") + "</td></tr>";
      }).join("");
    }

    document.getElementById("actCountLabel").textContent =
      rows.length + " activit" + (rows.length === 1 ? "y" : "ies") +
      (rows.length > 200 ? " · showing latest 200" : "");

    if (!state.bound) {
      state.bound = true;
      document.getElementById("actSearch").addEventListener("input", U.debounce(function (e) {
        state.search = e.target.value;
        render();
      }, 170));
      document.getElementById("actRoleFilter").addEventListener("change", function (e) {
        state.role = e.target.value;
        render();
      });
      document.getElementById("actTypeFilter").addEventListener("change", function (e) {
        state.type = e.target.value;
        render();
      });
      document.getElementById("btnActivityRefresh").addEventListener("click", function () {
        render();
        window.App.toast("Activity log refreshed.", "success", 1800);
      });
    }
  }

  var ActivityPage = {
    render: function () {
      if (!window.Auth.requireAdmin(true)) return;
      document.getElementById("actSearch").value = state.search;
      document.getElementById("actRoleFilter").value = state.role;
      document.getElementById("actTypeFilter").value = state.type;
      render();
    }
  };

  window.ActivityPage = ActivityPage;
})(window);

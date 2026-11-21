/* ==========================================================================
   TRIPPERS COFFEE — settings.js
   Shop profile, currency/tax, receipt config, admin profile, data tools.
   ========================================================================== */
(function (window) {
  "use strict";

  var U = window.Utils;
  var Store = window.Store;

  var state = { bound: false, pendingLogo: null };

  function syncCurrencySymbols() {
    var sym = Store.db.settings.currencySymbol;
    document.querySelectorAll("[data-currency-symbol]").forEach(function (el) {
      el.textContent = sym;
    });
  }

  function fillForms() {
    var S = Store.db.settings;
    document.getElementById("setShopName").value = S.shopName;
    document.getElementById("setAddress").value = S.address;
    document.getElementById("setContact").value = S.contact;
    document.getElementById("setCurrencyCode").value = S.currencyCode;
    document.getElementById("setCurrencySymbol").value = S.currencySymbol;
    document.getElementById("setTax").value = S.taxRate;
    document.getElementById("setReceiptWidth").value = String(S.receiptWidth);
    document.getElementById("setLowStock").value = S.lowStockThreshold;
    document.getElementById("setAttendanceStart").value = S.attendanceStartTime || "09:00";
    document.getElementById("setFooter").value = S.receiptFooter;
    document.getElementById("setNotifLow").checked = !!S.notifLowStock;
    var customLogo = S.logo && !/^data:image\/svg\+xml/i.test(S.logo);
    document.getElementById("logoPreview").src = customLogo ? S.logo : U.logoImage();
    state.pendingLogo = null;

    var user = window.Auth.user();
    if (user) {
      document.getElementById("setAdminName").value = user.fullName;
      document.getElementById("setAdminUsername").value = user.username;
    }
    document.getElementById("setAdminCurrent").value = "";
    document.getElementById("setAdminNew").value = "";
    document.getElementById("setAdminConfirm").value = "";

    syncCurrencySymbols();

    var bytes = Store.storageBytes();
    var pct = Math.min(100, (bytes / (5 * 1024 * 1024)) * 100);
    document.getElementById("storageUsage").textContent =
      (bytes / 1024).toFixed(1) + " KB · ~" + pct.toFixed(1) + "% of a typical 5 MB quota";
  }

  /* ------------------------------------------------------------- shop */
  function saveShop(e) {
    e.preventDefault();
    if (!window.Auth.requireAdmin()) return;
    var S = Store.db.settings;

    var name = document.getElementById("setShopName").value.trim();
    var address = document.getElementById("setAddress").value.trim();
    var contact = document.getElementById("setContact").value.trim();
    var code = document.getElementById("setCurrencyCode").value.trim().toUpperCase();
    var symbol = document.getElementById("setCurrencySymbol").value.trim();
    var tax = parseFloat(document.getElementById("setTax").value);
    var lowStock = parseFloat(document.getElementById("setLowStock").value);
    var attendanceStart = document.getElementById("setAttendanceStart").value;

    if (!name || !address || !contact) {
      window.App.toast("Shop name, address and contact number are required.", "warning");
      return;
    }
    if (!/^[A-Z]{2,5}$/.test(code)) {
      window.App.toast("Currency code should be 2–5 letters (e.g. PHP).", "warning");
      return;
    }
    if (!symbol) {
      window.App.toast("Enter a currency symbol.", "warning");
      return;
    }
    if (!isFinite(tax) || tax < 0 || tax > 40) {
      window.App.toast("Tax rate must be between 0 and 40%.", "warning");
      return;
    }
    if (!isFinite(lowStock) || lowStock < 0) {
      window.App.toast("Low-stock threshold must be zero or greater.", "warning");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(attendanceStart)) {
      window.App.toast("Choose a valid shift start time.", "warning");
      return;
    }

    S.shopName = name;
    S.address = address;
    S.contact = contact;
    S.currencyCode = code;
    S.currencySymbol = symbol;
    S.taxRate = U.r2(tax);
    S.receiptWidth = document.getElementById("setReceiptWidth").value;
    S.lowStockThreshold = lowStock;
    S.attendanceStartTime = attendanceStart;
    S.receiptFooter = document.getElementById("setFooter").value;
    S.notifLowStock = document.getElementById("setNotifLow").checked;
    if (state.pendingLogo) S.logo = state.pendingLogo;

    Store.logActivity("Settings updated",
      "Shop profile, currency, tax or receipt settings were updated.");
    Store.commit();
    state.pendingLogo = null;
    syncCurrencySymbols();
    fillForms();
    window.App.refreshShell();
    window.App.toast("Shop settings saved.", "success");
  }

  function bindLogo() {
    var drop = document.getElementById("logoDrop");
    var input = document.getElementById("logoInput");
    drop.addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      U.readImage(file, 260, 0.85).then(function (dataUrl) {
        state.pendingLogo = dataUrl;
        document.getElementById("logoPreview").src = dataUrl;
        window.App.toast("Logo ready — save shop settings to apply it.", "info", 3000);
      }).catch(function (err) {
        window.App.toast(err.message, "danger");
      });
    });
  }

  /* ------------------------------------------------------------- admin */
  function saveAdmin(e) {
    e.preventDefault();
    if (!window.Auth.requireAdmin()) return;
    var user = window.Auth.user();
    if (!user) return;

    var name = document.getElementById("setAdminName").value.trim();
    var username = document.getElementById("setAdminUsername").value.trim();
    var current = document.getElementById("setAdminCurrent").value;
    var next = document.getElementById("setAdminNew").value;
    var confirm = document.getElementById("setAdminConfirm").value;

    if (!name) {
      window.App.toast("Your full name cannot be empty.", "warning");
      return;
    }
    if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username)) {
      window.App.toast("Username must be 3–20 characters (letters, numbers, dot, dash, underscore).", "warning");
      return;
    }
    var dup = Store.db.users.filter(function (u) {
      return u.username.toLowerCase() === username.toLowerCase() && u.id !== user.id;
    })[0];
    if (dup) {
      window.App.toast("That username is already used by another account.", "warning");
      return;
    }

    if (next || confirm) {
      if (!window.Auth.verifyPassword(current)) {
        window.App.toast("Your current password is incorrect.", "danger");
        return;
      }
      if (next.length < 6) {
        window.App.toast("New password must be at least 6 characters.", "warning");
        return;
      }
      if (next !== confirm) {
        window.App.toast("New passwords do not match.", "warning");
        return;
      }
    }

    user.fullName = name;
    user.username = username;
    user.updatedAt = new Date().toISOString();
    if (next) window.Auth.setPassword(user, next, "Password changed in Settings");
    Store.logActivity("Profile updated", "Administrator profile details were updated.");
    Store.commit();

    // Keep the stored session label in sync.
    try {
      var raw = window.localStorage.getItem("trippers.session");
      if (raw) {
        var s = JSON.parse(raw);
        s.username = username;
        window.localStorage.setItem("trippers.session", JSON.stringify(s));
      }
    } catch (err) { /* ignore */ }

    fillForms();
    window.App.refreshShell();
    window.App.toast(next ? "Profile and password updated." : "Profile updated.", "success");
  }

  /* ------------------------------------------------------------- data */
  function backup() {
    if (!window.Auth.requireAdmin()) return;
    U.download("trippers-backup-" + U.todayISO() + ".json", Store.exportData(), "application/json;charset=utf-8");
    Store.logActivity("Backup downloaded", "A full JSON backup of the system was exported.");
    Store.commit();
    window.App.toast("Backup downloaded.", "success");
  }

  function restore(file) {
    if (!window.Auth.requireAdmin()) return;
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { window.App.toast("Could not read that file.", "danger"); };
    reader.onload = function () {
      var text = reader.result;
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        window.App.toast("That file is not valid JSON.", "danger");
        return;
      }
      var when = parsed && parsed.exportedAt ? U.fmtDateTime(parsed.exportedAt) : "an unknown date";

      window.App.confirm({
        title: "Restore backup?",
        body: "This will replace all current products, inventory, sales and settings with the backup from <strong>" +
          U.esc(when) + "</strong>. You will be signed out and must log in again.",
        okText: "Restore backup",
        danger: true
      }).then(function (yes) {
        if (!yes) return;
        if (!window.Auth.requireAdmin(true)) return;
        try {
          Store.importData(text);
          window.Auth.logout(true);
          window.App.toast("Backup restored. Redirecting to sign in…", "success", 2600);
          setTimeout(function () { window.location.hash = "#/login"; window.location.reload(); }, 900);
        } catch (err) {
          window.App.toast("Restore failed: " + err.message, "danger", 6000);
        }
      });
    };
    reader.readAsText(file);
  }

  function resetDemo() {
    if (!window.Auth.requireAdmin()) return;
    window.App.confirm({
      title: "Reset all demo data?",
      body: "Every product, image, inventory item, staff account, sale and setting will be erased and replaced with the " +
        "original demo dataset. <strong>This cannot be undone.</strong> Download a backup first if you need the current data.",
      okText: "Yes, reset everything",
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      if (!window.Auth.requireAdmin(true)) return;
      try {
        Store.reset();
        window.Auth.logout(true);
        window.App.toast("Demo data restored. Please sign in again.", "success", 3000);
        setTimeout(function () { window.location.hash = "#/login"; window.location.reload(); }, 900);
      } catch (err) {
        window.App.error(err);
      }
    });
  }

  /* ------------------------------------------------------------- page */
  var SettingsPage = {
    render: function () {
      fillForms();
      if (!state.bound) this.bind();
      if (window.Appearance && window.Appearance.initSettings) window.Appearance.initSettings();
    },

    bind: function () {
      state.bound = true;
      bindLogo();
      document.getElementById("shopForm").addEventListener("submit", saveShop);
      document.getElementById("adminForm").addEventListener("submit", saveAdmin);
      document.getElementById("btnBackup").addEventListener("click", backup);

      var restoreInput = document.getElementById("restoreInput");
      document.getElementById("btnRestore").addEventListener("click", function () {
        restoreInput.value = "";
        restoreInput.click();
      });
      restoreInput.addEventListener("change", function () {
        var f = restoreInput.files && restoreInput.files[0];
        if (f) restore(f);
      });

      document.getElementById("btnReset").addEventListener("click", resetDemo);
    }
  };

  window.SettingsPage = SettingsPage;
})(window);

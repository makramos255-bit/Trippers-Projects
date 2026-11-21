/* ==========================================================================
   TRIPPERS COFFEE — auth.js
   Login, session persistence, expiry and role guards.
   ========================================================================== */
(function (window) {
  "use strict";

  var KEY = "trippers.session";
  var REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  var SESSION_MS = 12 * 60 * 60 * 1000;       // 12 hours

  var Auth = {
    /** Reads the stored session, dropping it when expired or invalid. */
    session: function () {
      var raw;
      try { raw = window.localStorage.getItem(KEY); } catch (e) { return null; }
      if (!raw) return null;
      var s;
      try { s = JSON.parse(raw); } catch (e) { this.logout(true); return null; }
      if (!s || !s.userId || !s.expiresAt) { this.logout(true); return null; }
      if (new Date(s.expiresAt).getTime() < Date.now()) { this.logout(true); return null; }

      // Inactive or deleted accounts lose their session immediately.
      var user = window.Store.user(s.userId);
      if (!user || user.status !== "active") { this.logout(true); return null; }
      return s;
    },

    user: function () {
      var s = this.session();
      return s ? window.Store.user(s.userId) : null;
    },

    isAdmin: function () {
      var u = this.user();
      return !!u && u.role === "admin";
    },

    isCashier: function () {
      var u = this.user();
      return !!u && u.role === "cashier";
    },

    isInventory: function () {
      var u = this.user();
      return !!u && u.role === "inventory";
    },

    roleLabel: function (role) {
      return role === "admin" ? "Administrator" : role === "inventory" ? "Inventory Staff" : role === "cashier" ? "Cashier" : "Staff";
    },

    /** Validates credentials and starts a session. */
    login: function (username, password, remember) {
      var uname = String(username || "").trim().toLowerCase();
      var pw = String(password || "");
      if (!uname || !pw) return { ok: false, error: "Enter both your username/email and password." };

      var user = window.Store.findUser(uname);

      if (!user) return { ok: false, error: "No account matches that username or email." };
      if (user.status !== "active") {
        window.Store.recordLogin(user, false, "Account deactivated");
        window.Store.commit();
        return { ok: false, error: "This account is deactivated. Ask an administrator to reactivate it." };
      }
      var hash = window.Utils.password(pw, user.salt);
      if (hash !== user.passwordHash) {
        window.Store.recordLogin(user, false, "Incorrect password");
        window.Store.commit();
        return { ok: false, error: "Incorrect password. Please try again." };
      }

      var session = {
        userId: user.id,
        username: user.username,
        role: user.role,
        loginAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (remember ? REMEMBER_MS : SESSION_MS)).toISOString(),
        remember: !!remember
      };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(session));
      } catch (e) {
        return { ok: false, error: "Could not start a session — browser storage is unavailable." };
      }

      user.lastLoginAt = session.loginAt;
      window.Store.recordLogin(user, true, remember ? "Signed in · remembered device" : "Signed in");
      window.Store.logActivity("Signed in", this.roleLabel(user.role) + " signed in to the system.");
      window.Store.commit();

      return { ok: true, user: user, session: session };
    },

    logout: function (silent) {
      if (!silent) {
        var u = this.user();
        if (u) {
          window.Store.logActivity("Signed out", this.roleLabel(u.role) + " signed out.");
          window.Store.commit();
        }
      }
      try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      try { window.localStorage.removeItem("trippers.cart"); } catch (e) { /* ignore */ }
      // Clear in-memory POS state too, including on silent/expired logouts.
      if (window.POS && window.POS.resetState) window.POS.resetState();
      if (window.App && window.App.closeModals) window.App.closeModals();
      if (!silent && window.App && window.App.afterLogout) window.App.afterLogout();
    },

    /** Called by route handlers and by mutating actions. */
    requireRole: function (roles, silent) {
      var u = this.user();
      if (!u) {
        if (!silent && window.App) {
          window.App.toast("Your session expired. Please sign in again.", "warning");
          window.App.go("#/login");
        }
        return false;
      }
      if (u.mustChangePassword && u.role !== "admin") {
        if (!silent && window.App) window.App.go("#/change-password");
        return false;
      }
      if (roles.indexOf(u.role) === -1) {
        if (!silent && window.App) {
          window.App.toast("You don't have permission to do that.", "danger");
          window.App.go(this.homeRoute());
        }
        return false;
      }
      return true;
    },

    requireAdmin: function (silent) {
      return this.requireRole(["admin"], silent);
    },

    requireInventory: function (silent) {
      return this.requireRole(["admin", "inventory"], silent);
    },

    requirePOS: function (silent) {
      return this.requireRole(["admin", "cashier"], silent);
    },

    /** Verifies the signed-in user's password (used by settings). */
    verifyPassword: function (password) {
      var u = this.user();
      if (!u) return false;
      return window.Utils.password(String(password || ""), u.salt) === u.passwordHash;
    },

    setPassword: function (user, newPassword, reason, mustChangePassword) {
      user.salt = window.Utils.salt();
      user.passwordHash = window.Utils.password(newPassword, user.salt);
      user.mustChangePassword = !!mustChangePassword && user.role !== "admin";
      user.updatedAt = new Date().toISOString();
      window.Store.invalidateResetTokens(user.id);

      var actor = this.user();
      var detail = (reason || "Password changed") + " for " + user.fullName + " (@" + user.username + ").";
      if (actor) {
        window.Store.logActivity("Password updated", detail);
      } else {
        // Recovery happens before sign-in, so attribute the entry to the account.
        window.Store.logActivity("Password reset", detail,
          { userId: user.id, userName: user.fullName, role: user.role });
      }
      window.Store.commit();
    },

    /** Home route for the current role. */
    homeRoute: function () {
      var u = this.user();
      if (!u) return "#/login";
      if (u.role !== "admin" && u.mustChangePassword) return "#/change-password";
      if (u.role === "admin") return "#/admin/dashboard";
      if (u.role === "inventory") return "#/inventory/dashboard";
      return "#/cashier/dashboard";
    }
  };

  window.Auth = Auth;
})(window);

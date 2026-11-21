/* ==========================================================================
   TRIPPERS COFFEE — app.js
   Boot, hash router, three role shells, guards, login/recovery, toasts.
   Loaded last so every page module exists before the first render.
   ========================================================================== */
(function (window) {
  "use strict";

  var App = {
    routes: {},
    current: null,
    clockTimer: null,
    confirmResolver: null,
    forgotUser: null,
    forgotStep: 1,

    /* ---------------------------------------------------------- boot */
    boot: function () {
      if (window.Appearance) window.Appearance.init();
      window.Store.boot();

      if (window.Store.corrupt) {
        setTimeout(function () {
          App.toast("Saved data was corrupted and restored from the last good backup.", "warning", 6000);
        }, 500);
      }

      this.bindLogin();
      this.bindChrome();
      this.bindAccount();
      this.bindGlobalModals();
      if (window.GlobalSearch) window.GlobalSearch.init();
      this.startClock();

      window.addEventListener("trippers:datachanged", function () {
        if (window.AdminPage && window.AdminPage.refreshIfVisible) window.AdminPage.refreshIfVisible();
        if (window.CashierPage && window.CashierPage.refreshIfVisible) window.CashierPage.refreshIfVisible();
      });

      window.addEventListener("hashchange", function () { App.render(); });
      if (!window.location.hash) {
        window.location.hash = window.Auth.session() ? window.Auth.homeRoute() : "#/login";
      }
      this.render();
      if (window.BrandIntro && window.BrandIntro.playIfNeeded) window.BrandIntro.playIfNeeded();
    },

    /* ---------------------------------------------------------- routing */
    register: function (routes) {
      this.routes = routes;
    },

    parse: function () {
      var hash = String(window.location.hash || "").trim();
      if (!hash || hash === "#" || hash === "#/") return "#/login";
      return hash.replace(/\/+$/, "");
    },

    go: function (hash) {
      if (this.parse() === hash) {
        this.render();
        return;
      }
      window.location.hash = hash;
    },

    render: function () {
      var route = this.parse();

      // Legacy link from the two-role build.
      if (route === "#/admin/cashiers") {
        window.location.hash = "#/admin/staff";
        return;
      }

      // Recovery is a standalone page; signed-in users go back to their home.
      if (route === "#/forgot") {
        if (window.Auth.user()) { this.go(window.Auth.homeRoute()); return; }
        this.current = route;
        this.showForgot();
        return;
      }

      // Leaving Settings without saving should drop the live preview.
      if (this.current && this.current.indexOf("/settings") >= 0 && route !== this.current && window.Appearance) {
        window.Appearance.revertPreview();
        if (window.AttendancePage && window.AttendancePage.cancelSettings) window.AttendancePage.cancelSettings();
      }

      var def = this.routes[route];
      if (!def) {
        var s0 = window.Auth.session();
        this.go(s0 ? window.Auth.homeRoute() : "#/login");
        return;
      }

      var user = window.Auth.user();
      if (window.Appearance && window.Appearance.loadForUser) window.Appearance.loadForUser(user);

      if (route === "#/login") {
        if (user) { this.go(window.Auth.homeRoute()); return; }
        this.current = route;
        this.showLogin();
        return;
      }

      if (!user) {
        this.current = "#/login";
        this.showLogin();
        this.toast("Please sign in to continue.", "warning");
        window.location.hash = "#/login";
        return;
      }

      if (user.mustChangePassword && user.role !== "admin" && route !== "#/change-password") {
        this.go("#/change-password");
        return;
      }

      if (route === "#/change-password") {
        if (!user.mustChangePassword || user.role === "admin") {
          this.go(window.Auth.homeRoute());
          return;
        }
        this.current = route;
        this.showForcePassword(user);
        return;
      }

      if (def.roles && def.roles.indexOf(user.role) === -1) {
        this.toast("You don't have permission to open that page.", "danger");
        this.go(window.Auth.homeRoute());
        return;
      }

      this.current = route;

      if (def.view === "pos") {
        this.showPOS(user);
        this.safeRender(function () { window.POS.render(); }, "POS", user);
      } else if (def.view === "inventory") {
        this.showInventory(user);
        this.setInvActive(def.page);
        this.setInvTopbar(def.title, user);
        this.safeRender(function () {
          var inv = window.InventoryStaffPage;
          if (!inv) return;
          if (def.page === "inv-dashboard") inv.renderDashboard();
          else if (def.page === "inv-list") inv.renderList();
          else if (def.page === "inv-stock-in") inv.renderStockIn();
          else if (def.page === "inv-stock-out") inv.renderStockOut();
          else if (def.page === "inv-history") inv.renderHistory();
          else if (def.page === "attendance" || def.page === "profile" || def.page === "settings") window.AttendancePage.render();
        }, def.title, user);
      } else if (def.view === "cashier") {
        this.showCashier(user);
        this.setCashierActive(def.page);
        this.setCashierTopbar(def.title, user);
        this.safeRender(function () {
          if (def.page === "attendance" || def.page === "profile" || def.page === "settings") window.AttendancePage.render();
          else if (window.CashierPage) window.CashierPage.render();
        }, def.title, user);
      } else {
        this.showAdmin(user);
        this.setActiveSection(def.page);
        this.setTopbar(def.title, user);
        this.safeRender(function () {
          var map = {
            dashboard: window.AdminPage,
            inventory: window.InventoryPage,
            products: window.ProductsPage,
            categories: window.CategoriesPage,
            staff: window.StaffPage,
            sales: window.SalesPage,
            transactions: window.TransactionsPage,
            reports: window.ReportsPage,
            settings: window.SettingsPage,
            activity: window.ActivityPage,
            attendance: window.AttendancePage,
            profile: window.AttendancePage
          };
          var mod = map[def.page];
          if (mod && mod.render) mod.render();
          if (def.page === "settings" && window.AttendancePage) window.AttendancePage.renderSettings();
        }, def.title, user);
      }

      this.refreshShell(user);
    },

    safeRender: function (fn, label, user) {
      try {
        fn();
      } catch (err) {
        console.error("[TRIPPERS] Failed to render " + label, err);
        this.toast("Something went wrong rendering " + label + ": " + err.message, "danger", 6000);
      }
      this.refreshShell(user);
    },

    /* ---------------------------------------------------------- shells */
    /** Closes any open Bootstrap modal, e.g. after a session ends mid-dialog. */
    closeModals: function () {
      if (!window.bootstrap) return;
      document.querySelectorAll(".modal.show").forEach(function (el) {
        var inst = window.bootstrap.Modal.getInstance(el);
        if (inst) inst.hide();
      });
    },

    showLogin: function () {
      this.closeModals();
      document.getElementById("loginView").classList.remove("hidden");
      document.getElementById("forgotView").classList.add("hidden");
      document.getElementById("forcePasswordView").classList.add("hidden");
      document.getElementById("adminShell").classList.add("hidden");
      document.getElementById("inventoryShell").classList.add("hidden");
      document.getElementById("cashierShell").classList.add("hidden");
      document.getElementById("posShell").classList.add("hidden");
      document.body.classList.remove("pos-mode");
      document.title = "Sign in — TRIPPERS COFFEE";
      var input = document.getElementById("loginUsername");
      if (input) setTimeout(function () { input.focus(); }, 60);
      this.refreshShell();
    },

    showForgot: function () {
      this.closeModals();
      document.getElementById("loginView").classList.add("hidden");
      document.getElementById("forgotView").classList.remove("hidden");
      document.getElementById("forcePasswordView").classList.add("hidden");
      document.getElementById("adminShell").classList.add("hidden");
      document.getElementById("inventoryShell").classList.add("hidden");
      document.getElementById("cashierShell").classList.add("hidden");
      document.getElementById("posShell").classList.add("hidden");
      document.body.classList.remove("pos-mode");
      document.title = "Account recovery — TRIPPERS COFFEE";
      this.openForgot();
    },

    showForcePassword: function (user) {
      this.closeModals();
      document.getElementById("loginView").classList.add("hidden");
      document.getElementById("forgotView").classList.add("hidden");
      document.getElementById("forcePasswordView").classList.remove("hidden");
      document.getElementById("adminShell").classList.add("hidden");
      document.getElementById("inventoryShell").classList.add("hidden");
      document.getElementById("cashierShell").classList.add("hidden");
      document.getElementById("posShell").classList.add("hidden");
      document.body.classList.remove("pos-mode");
      document.title = "Choose a password — TRIPPERS COFFEE";
      document.getElementById("forcePasswordRole").textContent = window.Auth.roleLabel(user.role);
      document.getElementById("forcePasswordError").classList.add("hidden");
      document.getElementById("forcePasswordNew").value = "";
      document.getElementById("forcePasswordConfirm").value = "";

      var form = document.getElementById("forcePasswordForm");
      if (!form.dataset.bound) {
        form.dataset.bound = "1";
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var currentUser = window.Auth.user();
          var error = document.getElementById("forcePasswordError");
          var next = document.getElementById("forcePasswordNew").value;
          var confirm = document.getElementById("forcePasswordConfirm").value;
          error.classList.add("hidden");

          function fail(message) {
            error.textContent = message;
            error.classList.remove("hidden");
          }

          if (!currentUser || !currentUser.mustChangePassword || currentUser.role === "admin") {
            window.location.hash = window.Auth.homeRoute();
            return;
          }
          if (next.length < 6) return fail("Choose a password with at least 6 characters.");
          if (next !== confirm) return fail("The passwords do not match. Please try again.");
          if (window.Auth.verifyPassword(next)) return fail("Choose a password different from your temporary password.");

          window.Auth.setPassword(currentUser, next, "Temporary password changed at first sign-in");
          App.toast("Password saved. You can now continue to your dashboard.", "success");
          App.go(window.Auth.homeRoute());
        });

        document.getElementById("forcePasswordLogout").addEventListener("click", function () {
          window.Auth.logout();
        });
      }
      setTimeout(function () { document.getElementById("forcePasswordNew").focus(); }, 60);
    },

    showAdmin: function (user) {
      if (user.role !== "admin") { this.go(window.Auth.homeRoute()); return; }
      this.closeModals();
      document.getElementById("loginView").classList.add("hidden");
      document.getElementById("forgotView").classList.add("hidden");
      document.getElementById("forcePasswordView").classList.add("hidden");
      document.getElementById("inventoryShell").classList.add("hidden");
      document.getElementById("cashierShell").classList.add("hidden");
      document.getElementById("posShell").classList.add("hidden");
      document.getElementById("adminShell").classList.remove("hidden");
      document.body.classList.remove("pos-mode");
      this.refreshShell(user);
    },

    showInventory: function (user) {
      if (user.role !== "inventory") { this.go(window.Auth.homeRoute()); return; }
      this.closeModals();
      document.getElementById("loginView").classList.add("hidden");
      document.getElementById("forgotView").classList.add("hidden");
      document.getElementById("forcePasswordView").classList.add("hidden");
      document.getElementById("adminShell").classList.add("hidden");
      document.getElementById("cashierShell").classList.add("hidden");
      document.getElementById("posShell").classList.add("hidden");
      document.getElementById("inventoryShell").classList.remove("hidden");
      document.body.classList.remove("pos-mode");
      this.refreshShell(user);
    },

    showCashier: function (user) {
      if (user.role !== "cashier") { this.go(window.Auth.homeRoute()); return; }
      this.closeModals();
      document.getElementById("loginView").classList.add("hidden");
      document.getElementById("forgotView").classList.add("hidden");
      document.getElementById("forcePasswordView").classList.add("hidden");
      document.getElementById("adminShell").classList.add("hidden");
      document.getElementById("inventoryShell").classList.add("hidden");
      document.getElementById("posShell").classList.add("hidden");
      document.getElementById("cashierShell").classList.remove("hidden");
      document.body.classList.remove("pos-mode");
      this.refreshShell(user);
    },

    showPOS: function (user) {
      this.closeModals();
      document.getElementById("loginView").classList.add("hidden");
      document.getElementById("forgotView").classList.add("hidden");
      document.getElementById("forcePasswordView").classList.add("hidden");
      document.getElementById("adminShell").classList.add("hidden");
      document.getElementById("inventoryShell").classList.add("hidden");
      document.getElementById("cashierShell").classList.add("hidden");
      document.getElementById("posShell").classList.remove("hidden");
      document.body.classList.add("pos-mode");
      document.title = "POS — TRIPPERS COFFEE";
      var nameEl = document.getElementById("posCashierName");
      if (nameEl) nameEl.textContent = user.fullName;
      var welcome = document.getElementById("posWelcomeName");
      if (welcome) welcome.textContent = user.fullName.split(" ")[0];
      var cashier = document.getElementById("posStatCashier");
      if (cashier) cashier.textContent = user.fullName.split(" ")[0];
      var shiftEl = document.getElementById("posShiftDate");
      if (shiftEl) {
        shiftEl.textContent = new Date().toLocaleDateString("en-PH", {
          weekday: "short", month: "short", day: "numeric"
        });
      }
      document.getElementById("posCart").classList.remove("open");
      this.refreshShell(user);
    },

    setActiveSection: function (page) {
      document.querySelectorAll("#adminShell .page").forEach(function (sec) {
        sec.classList.add("hidden");
      });
      var el = document.querySelector("#adminShell #page-" + page);
      if (el) {
        el.classList.remove("hidden");
        el.classList.add("fade-up");
        setTimeout(function () { el.classList.remove("fade-up"); }, 820);
      }
      document.querySelectorAll("#adminShell [data-route]").forEach(function (link) {
        link.classList.toggle("active", link.getAttribute("data-route") === App.current);
      });
      document.getElementById("sidebar").classList.remove("show");
      document.getElementById("sidebarOverlay").classList.remove("show");
    },

    setInvActive: function (page) {
      document.querySelectorAll("#inventoryShell .page").forEach(function (sec) {
        sec.classList.add("hidden");
      });
      var el = document.querySelector("#inventoryShell #page-" + page);
      if (el) {
        el.classList.remove("hidden");
        el.classList.add("fade-up");
        setTimeout(function () { el.classList.remove("fade-up"); }, 820);
      }
      document.querySelectorAll("#inventoryShell [data-route]").forEach(function (link) {
        link.classList.toggle("active", link.getAttribute("data-route") === App.current);
      });
      document.getElementById("invSidebar").classList.remove("show");
      document.getElementById("invSidebarOverlay").classList.remove("show");
    },

    setCashierActive: function (page) {
      document.querySelectorAll("#cashierShell .page").forEach(function (sec) {
        sec.classList.add("hidden");
      });
      var el = document.querySelector("#cashierShell #page-" + page);
      if (el) {
        el.classList.remove("hidden");
        el.classList.add("fade-up");
        setTimeout(function () { el.classList.remove("fade-up"); }, 820);
      }
      document.querySelectorAll("#cashierShell [data-route]").forEach(function (link) {
        link.classList.toggle("active", link.getAttribute("data-route") === App.current);
      });
      document.getElementById("cashierSidebar").classList.remove("show");
      document.getElementById("cashierSidebarOverlay").classList.remove("show");
    },

    greeting: function () {
      var h = new Date().getHours();
      return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    },

    setTopbar: function (title, user) {
      document.title = title + " — TRIPPERS COFFEE";
      var t = document.getElementById("topbarTitle");
      if (t) t.textContent = title;
      var w = document.getElementById("welcomeLine");
      if (w) {
        var first = (user && user.fullName ? user.fullName.split(" ")[0] : "there");
        w.textContent = this.greeting() + ", " + first + "!";
      }
    },

    setInvTopbar: function (title, user) {
      document.title = title + " — TRIPPERS Inventory";
      var t = document.getElementById("invTopbarTitle");
      if (t) t.textContent = title;
      var w = document.getElementById("invWelcomeLine");
      if (w) {
        var first = (user && user.fullName ? user.fullName.split(" ")[0] : "there");
        w.textContent = this.greeting() + ", " + first + "! · Inventory Staff";
      }
    },

    setCashierTopbar: function (title, user) {
      document.title = title + " — TRIPPERS Cashier";
      var t = document.getElementById("cashierTopbarTitle");
      if (t) t.textContent = title;
      var w = document.getElementById("cashierWelcomeLine");
      if (w) {
        var first = (user && user.fullName ? user.fullName.split(" ")[0] : "there");
        w.textContent = this.greeting() + ", " + first + "! · Cashier";
      }
    },

    /** Keeps identity, sidebar badges and notifications in sync everywhere. */
    refreshShell: function (user) {
      user = user || window.Auth.user();
      if (user) {
        var initials = window.Utils.initials(user.fullName);
        ["sideAvatar", "topAvatar", "invAvatar", "invTopAvatar", "cashierAvatar", "cashierTopAvatar"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) {
            el.innerHTML = user.avatarData ? '<img src="' + window.Utils.attr(user.avatarData) + '" alt="">' : window.Utils.esc(initials);
            el.classList.toggle("has-avatar-image", !!user.avatarData);
          }
        });
        var nameIds = ["sideUserName", "topUserName", "invUserName", "invTopUserName", "cashierSideName", "cashierTopUserName"];
        nameIds.forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.textContent = user.fullName;
        });
        var roleIds = ["sideRoleLabel", "topRoleLabel", "cashierTopRole"];
        roleIds.forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.textContent = window.Auth.roleLabel(user.role);
        });
        var pu = document.getElementById("profileUser");
        if (pu) pu.textContent = "@" + user.username + " · " + window.Auth.roleLabel(user.role);
        var iu = document.getElementById("invProfileUser");
        if (iu) iu.textContent = "@" + user.username + " · " + user.email;
        var cu = document.getElementById("cashierProfileUser");
        if (cu) cu.textContent = "@" + user.username + " · " + window.Auth.roleLabel(user.role);
        var pn = document.getElementById("posCashierName");
        if (pn) pn.textContent = user.fullName;
      }

      var low = window.Store.lowStockItems().length;
      ["navLowStock", "invNavLowStock"].forEach(function (id) {
        var badge = document.getElementById(id);
        if (!badge) return;
        badge.textContent = low;
        badge.classList.toggle("hidden", low === 0);
      });

      this.renderNotifications();
    },

    /* ---------------------------------------------------------- clock */
    startClock: function () {
      function tick() {
        var now = new Date();
        var time = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        var date = now.toLocaleDateString("en-PH", {
          weekday: "short", year: "numeric", month: "short", day: "numeric"
        });
        ["clockTime", "invClockTime", "cashierClockTime"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.textContent = time;
        });
        ["clockDate", "invClockDate", "cashierClockDate"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.textContent = date;
        });
      }
      tick();
      clearInterval(this.clockTimer);
      this.clockTimer = setInterval(tick, 1000);
    },

    /* ---------------------------------------------------------- login UI */
    bindLogin: function () {
      var form = document.getElementById("loginForm");
      var err = document.getElementById("loginError");

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        err.classList.add("hidden");
        var btn = document.getElementById("loginBtn");
        var username = document.getElementById("loginUsername").value;
        var password = document.getElementById("loginPassword").value;
        var remember = document.getElementById("rememberMe").checked;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-mini"></span> Signing in…';

        setTimeout(function () {
          var result = window.Auth.login(username, password, remember);
          btn.disabled = false;
          btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Sign in';
          if (!result.ok) {
            err.textContent = result.error;
            err.classList.remove("hidden");
            return;
          }
          document.getElementById("loginPassword").value = "";
          if (result.user.mustChangePassword) {
            App.toast("Welcome, " + result.user.fullName.split(" ")[0] + ". Set a new password to continue.", "info");
          } else {
            App.toast("Welcome back, " + result.user.fullName.split(" ")[0] + "!", "success");
          }
          App.go(window.Auth.homeRoute());
        }, 220);
      });

      document.getElementById("togglePassword").addEventListener("click", function () {
        var input = document.getElementById("loginPassword");
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        this.innerHTML = show ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
        this.setAttribute("aria-label", show ? "Hide password" : "Show password");
      });

      document.querySelectorAll("[data-demo]").forEach(function (chip) {
        chip.addEventListener("click", function () {
          var map = {
            admin: ["admin", "admin123"],
            inventory: ["inventory", "inventory123"],
            cashier: ["cashier", "cashier123"]
          };
          var creds = map[chip.getAttribute("data-demo")];
          if (!creds) return;
          document.getElementById("loginUsername").value = creds[0];
          document.getElementById("loginPassword").value = creds[1];
          err.classList.add("hidden");
          document.getElementById("loginBtn").focus();
        });
      });

      document.getElementById("forgotPasswordLink").addEventListener("click", function () {
        App.go("#/forgot");
      });
    },

    /* ---------------------------------------------------------- recovery */
    openForgot: function () {
      this.forgotUser = null;
      this.forgotToken = null;
      this.forgotIdentifier = "";
      this.forgotStep = 1;
      ["forgotError", "forgotError2", "forgotError3"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.add("hidden");
      });
      document.getElementById("forgotIdentifier").value = "";
      document.getElementById("forgotCode").value = "";
      document.getElementById("forgotNew").value = "";
      document.getElementById("forgotConfirm").value = "";
      document.getElementById("forgotDemoCode").textContent = "------";
      document.getElementById("forgotStep1").classList.remove("hidden");
      document.getElementById("forgotStep2").classList.add("hidden");
      document.getElementById("forgotStep3").classList.add("hidden");
      document.getElementById("forgotSuccess").classList.add("hidden");
      this.updateRecoverySteps(1);
      setTimeout(function () {
        var input = document.getElementById("forgotIdentifier");
        if (input) input.focus();
      }, 80);
    },

    updateRecoverySteps: function (step) {
      document.querySelectorAll("[data-recovery-step]").forEach(function (el) {
        var n = Number(el.getAttribute("data-recovery-step"));
        el.classList.toggle("active", n === step);
        el.classList.toggle("done", n < step);
      });
    },

    forgotFail: function (id, message) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = message;
      el.classList.remove("hidden");
    },

    /** Issues a code when the account exists; the UI response stays identical either way. */
    issueRecoveryCode: function (identifier) {
      var user = window.Store.findUser(identifier);
      var active = user && user.status === "active";
      var token = null;
      if (active) {
        // Only the newest code should work; resending invalidates older ones.
        window.Store.invalidateResetTokens(user.id);
        token = window.Store.createResetToken(user);
        window.Store.commit();
      }
      // Decoy code keeps the demo inbox identical for unknown accounts.
      var shown = token ? token.code : String(Math.floor(100000 + Math.random() * 900000));
      document.getElementById("forgotDemoCode").textContent = shown;
      return { user: active ? user : null, token: token };
    },

    forgotFind: function () {
      var identifier = document.getElementById("forgotIdentifier").value.trim();
      var err = document.getElementById("forgotError");
      err.classList.add("hidden");
      if (!identifier) return this.forgotFail("forgotError", "Enter your username or email.");

      this.forgotIdentifier = identifier;
      var issued = this.issueRecoveryCode(identifier);
      this.forgotUser = issued.user;
      this.forgotToken = issued.token;
      this.forgotStep = 2;

      document.getElementById("forgotStep1").classList.add("hidden");
      document.getElementById("forgotStep2").classList.remove("hidden");
      document.getElementById("forgotStep3").classList.add("hidden");
      document.getElementById("forgotSuccess").classList.add("hidden");
      document.getElementById("forgotCode").value = "";
      document.getElementById("forgotAccountInfo").innerHTML =
        '<i class="bi bi-envelope-check"></i> If an account matches <strong>' +
        window.Utils.esc(identifier) + "</strong>, a single-use code is ready below.";
      this.updateRecoverySteps(2);
      setTimeout(function () {
        var input = document.getElementById("forgotCode");
        if (input) input.focus();
      }, 80);
    },

    forgotResend: function () {
      var err = document.getElementById("forgotError2");
      err.classList.add("hidden");
      if (!this.forgotIdentifier) {
        return this.forgotFail("forgotError2", "Start again with your username or email.");
      }
      var issued = this.issueRecoveryCode(this.forgotIdentifier);
      this.forgotUser = issued.user;
      this.forgotToken = issued.token;
      document.getElementById("forgotCode").value = "";
      this.toast("A fresh single-use code is ready.", "info", 2600);
    },

    forgotVerify: function () {
      var err = document.getElementById("forgotError2");
      err.classList.add("hidden");
      var code = document.getElementById("forgotCode").value.trim();
      if (!/^\d{6}$/.test(code)) {
        return this.forgotFail("forgotError2", "Enter the six-digit code from your demo inbox.");
      }

      var match = window.Store.verifyResetCode(this.forgotIdentifier, code);
      if (!match) {
        return this.forgotFail("forgotError2", "That code is invalid or has expired. Request a new code and try again.");
      }
      if (match.user.status !== "active") {
        return this.forgotFail("forgotError2", "This account cannot be recovered. Contact an administrator.");
      }

      this.forgotUser = match.user;
      this.forgotToken = match.token;
      this.forgotStep = 3;
      document.getElementById("forgotStep2").classList.add("hidden");
      document.getElementById("forgotStep3").classList.remove("hidden");
      document.getElementById("forgotTargetName").textContent = match.user.fullName;
      this.updateRecoverySteps(3);
      setTimeout(function () {
        var input = document.getElementById("forgotNew");
        if (input) input.focus();
      }, 80);
    },

    forgotReset: function () {
      var err = document.getElementById("forgotError3");
      err.classList.add("hidden");
      if (!this.forgotUser || !this.forgotToken) {
        return this.forgotFail("forgotError3", "Your recovery session expired. Start again.");
      }

      var pw = document.getElementById("forgotNew").value;
      var confirm = document.getElementById("forgotConfirm").value;
      if (pw.length < 6) return this.forgotFail("forgotError3", "Password must be at least 6 characters.");
      if (pw !== confirm) return this.forgotFail("forgotError3", "Passwords do not match.");

      window.Store.consumeResetToken(this.forgotToken.id);
      window.Auth.setPassword(this.forgotUser, pw, "Password reset via verified recovery");

      this.forgotStep = 4;
      this.forgotToken = null;
      document.getElementById("forgotStep3").classList.add("hidden");
      document.getElementById("forgotSuccess").classList.remove("hidden");
      this.toast("Password reset successful. You can sign in now.", "success", 4200);
      setTimeout(function () {
        if (App.forgotStep !== 4) return;
        App.go("#/login");
      }, 2400);
    },

    /* ---------------------------------------------------------- account password */
    bindAccount: function () {
      var bind = function (id, event, fn) {
        var el = document.getElementById(id);
        if (el) el.addEventListener(event, fn);
      };
      bind("forgotFindBtn", "click", function () { App.forgotFind(); });
      bind("forgotResendBtn", "click", function () { App.forgotResend(); });
      bind("forgotVerifyBtn", "click", function () { App.forgotVerify(); });
      bind("forgotResetBtn", "click", function () { App.forgotReset(); });
      bind("forgotDoneBtn", "click", function () { App.go("#/login"); });
      bind("forgotBack", "click", function () { App.go("#/login"); });
      bind("forgotIdentifier", "keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); App.forgotFind(); }
      });
      bind("forgotCode", "keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); App.forgotVerify(); }
      });
      bind("forgotConfirm", "keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); App.forgotReset(); }
      });
      document.querySelectorAll("[data-password-toggle]").forEach(function (button) {
        button.addEventListener("click", function () {
          var input = document.getElementById(button.getAttribute("data-password-toggle"));
          if (!input) return;
          var reveal = input.type === "password";
          input.type = reveal ? "text" : "password";
          button.innerHTML = '<i class="bi ' + (reveal ? "bi-eye-slash" : "bi-eye") + '"></i>';
          button.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
        });
      });

      document.getElementById("accountForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var err = document.getElementById("accountError");
        err.classList.add("hidden");
        var user = window.Auth.user();
        if (!user) return;

        var current = document.getElementById("acctCurrent").value;
        var next = document.getElementById("acctNew").value;
        var confirm = document.getElementById("acctConfirm").value;

        function fail(msg) {
          err.textContent = msg;
          err.classList.remove("hidden");
        }

        if (!current) return fail("Enter your current password.");
        if (!window.Auth.verifyPassword(current)) return fail("Your current password is incorrect.");
        if (next.length < 6) return fail("New password must be at least 6 characters.");
        if (next !== confirm) return fail("New passwords do not match.");
        if (next === current) return fail("Choose a new password that differs from your current one.");

        window.Auth.setPassword(user, next, "Password changed from the account menu");
        window.Store.commit();
        App.modal("accountModal").hide();
        App.toast("Password updated successfully.", "success");
      });
    },

    openChangePassword: function () {
      var user = window.Auth.user();
      if (!user) return;
      document.getElementById("accountError").classList.add("hidden");
      document.getElementById("accountWho").innerHTML =
        '<i class="bi bi-person-badge"></i> Signed in as <strong>' + window.Utils.esc(user.fullName) +
        "</strong> (@" + window.Utils.esc(user.username) + ") · " + window.Auth.roleLabel(user.role);
      document.getElementById("acctCurrent").value = "";
      document.getElementById("acctNew").value = "";
      document.getElementById("acctConfirm").value = "";
      this.modal("accountModal").show();
      setTimeout(function () { document.getElementById("acctCurrent").focus(); }, 320);
    },

    /* ---------------------------------------------------------- chrome */
    bindChrome: function () {
      var toggle = document.getElementById("menuToggle");
      var overlay = document.getElementById("sidebarOverlay");
      var sidebar = document.getElementById("sidebar");

      if (toggle) {
        toggle.addEventListener("click", function () {
          sidebar.classList.toggle("show");
          overlay.classList.toggle("show", sidebar.classList.contains("show"));
        });
      }
      if (overlay) {
        overlay.addEventListener("click", function () {
          sidebar.classList.remove("show");
          overlay.classList.remove("show");
        });
      }
      document.querySelectorAll("#adminShell .side-nav .side-link[href^='#']").forEach(function (link) {
        link.addEventListener("click", function () {
          sidebar.classList.remove("show");
          overlay.classList.remove("show");
        });
      });

      var invToggle = document.getElementById("invMenuToggle");
      var invOverlay = document.getElementById("invSidebarOverlay");
      var invSidebar = document.getElementById("invSidebar");
      if (invToggle) {
        invToggle.addEventListener("click", function () {
          invSidebar.classList.toggle("show");
          invOverlay.classList.toggle("show", invSidebar.classList.contains("show"));
        });
      }
      if (invOverlay) {
        invOverlay.addEventListener("click", function () {
          invSidebar.classList.remove("show");
          invOverlay.classList.remove("show");
        });
      }
      document.querySelectorAll("#inventoryShell .side-nav .side-link[href^='#']").forEach(function (link) {
        link.addEventListener("click", function () {
          invSidebar.classList.remove("show");
          invOverlay.classList.remove("show");
        });
      });

      var cashierToggle = document.getElementById("cashierMenuToggle");
      var cashierOverlay = document.getElementById("cashierSidebarOverlay");
      var cashierSidebar = document.getElementById("cashierSidebar");
      if (cashierToggle && cashierSidebar && cashierOverlay) {
        cashierToggle.addEventListener("click", function () {
          cashierSidebar.classList.toggle("show");
          cashierOverlay.classList.toggle("show", cashierSidebar.classList.contains("show"));
        });
        cashierOverlay.addEventListener("click", function () {
          cashierSidebar.classList.remove("show");
          cashierOverlay.classList.remove("show");
        });
        document.querySelectorAll("#cashierShell .side-nav .side-link[href^='#']").forEach(function (link) {
          link.addEventListener("click", function () {
            cashierSidebar.classList.remove("show");
            cashierOverlay.classList.remove("show");
          });
        });
      }

      var posBack = document.getElementById("posBack");
      if (posBack) {
        posBack.addEventListener("click", function () { App.leavePOS(); });
      }

      var topbar = document.querySelector("#adminShell .topbar");
      if (topbar) {
        var syncTopbar = function () {
          topbar.classList.toggle("scrolled", window.scrollY > 6);
        };
        window.addEventListener("scroll", syncTopbar, { passive: true });
        syncTopbar();
      }

      ["sideLogout", "topLogout", "posLogout", "invLogout", "invLogout2", "cashierLogout", "cashierLogout2"].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("click", function (e) {
          e.preventDefault();
          App.confirm({
            title: "Sign out?",
            body: "You will need your username and password to sign back in. Any unsaved order draft is cleared.",
            okText: "Sign out",
            danger: true
          }).then(function (yes) {
            if (!yes) return;
            window.Auth.logout();
          });
        });
      });

      ["topChangePassword", "invChangePassword", "posChangePassword", "cashierChangePassword"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener("click", function () { App.openChangePassword(); });
      });

      ["invNotifBtn", "posNotifBtn", "cashierNotifBtn"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener("click", function () { App.openNotifications(); });
      });

      var markAll = document.getElementById("markAllRead");
      if (markAll) {
        markAll.addEventListener("click", function (e) {
          e.stopPropagation();
          App.markAllNotificationsRead();
        });
      }

      var notifList = document.getElementById("notifList");
      if (notifList) {
        notifList.addEventListener("click", function (e) {
          var dismiss = e.target.closest("[data-notif-dismiss]");
          if (dismiss) {
            e.stopPropagation();
            window.Store.dismissNotification(dismiss.getAttribute("data-notif-dismiss"));
            App.renderNotifications();
            return;
          }
          var item = e.target.closest("[data-notif-id]");
          if (!item) return;
          App.openNotification(item.getAttribute("data-notif-id"));
        });
      }

      var notifModalBody = document.getElementById("notifModalBody");
      if (notifModalBody) {
        notifModalBody.addEventListener("click", function (e) {
          var item = e.target.closest("[data-notif-id]");
          if (item) App.openNotification(item.getAttribute("data-notif-id"));
        });
      }

      var notifRead = document.getElementById("notifModalRead");
      if (notifRead) {
        notifRead.addEventListener("click", function () {
          App.markAllNotificationsRead();
          App.toast("All notifications marked as read.", "success");
        });
      }
    },

    /* ---------------------------------------------------------- POS navigation */
    leavePOS: function () {
      var target = window.Auth.homeRoute();
      var hasItems = window.POS && window.POS.hasItems ? window.POS.hasItems() : false;

      if (!hasItems) {
        this.go(target);
        return;
      }

      this.confirm({
        title: "Leave the POS?",
        body: "Your current order will be saved as a draft on this device, so you can pick it up again later.",
        okText: "Save & leave",
        danger: false
      }).then(function (yes) {
        if (!yes) return;
        if (window.POS && window.POS.saveDraftSilent) window.POS.saveDraftSilent();
        App.toast("Order saved as a draft.", "info", 2400);
        App.go(target);
      });
    },

    afterLogout: function () {
      document.body.classList.add("logout-transition");
      document.getElementById("loginView").classList.remove("hidden");
      document.getElementById("forgotView").classList.add("hidden");
      document.getElementById("forcePasswordView").classList.add("hidden");
      document.getElementById("adminShell").classList.add("hidden");
      document.getElementById("inventoryShell").classList.add("hidden");
      document.getElementById("cashierShell").classList.add("hidden");
      document.getElementById("posShell").classList.add("hidden");
      document.body.classList.remove("pos-mode");
      document.getElementById("loginUsername").value = "";
      document.getElementById("loginPassword").value = "";
      document.getElementById("loginError").classList.add("hidden");
      document.getElementById("sidebar").classList.remove("show");
      document.getElementById("sidebarOverlay").classList.remove("show");
      document.getElementById("invSidebar").classList.remove("show");
      document.getElementById("invSidebarOverlay").classList.remove("show");
      var cashierSidebar = document.getElementById("cashierSidebar");
      if (cashierSidebar) cashierSidebar.classList.remove("show");
      var cashierOverlay = document.getElementById("cashierSidebarOverlay");
      if (cashierOverlay) cashierOverlay.classList.remove("show");
      document.querySelectorAll(".modal.show").forEach(function (el) {
        var inst = window.bootstrap.Modal.getInstance(el);
        if (inst) inst.hide();
      });
      this.current = "#/login";
      window.location.hash = "#/login";
      window.setTimeout(function () { document.body.classList.remove("logout-transition"); }, 360);
      this.toast("Signed out. See you soon!", "success");
    },

    /* ---------------------------------------------------------- notifications */
    iconFor: function (type) {
      var map = {
        low: ["low", "bi-exclamation-triangle"],
        out: ["out", "bi-x-octagon"],
        sale: ["sale", "bi-bag-check"],
        user: ["user", "bi-person-plus"],
        inventory: ["info", "bi-box-seam"],
        product: ["info", "bi-cup-hot"],
        info: ["info", "bi-info-circle"]
      };
      return map[type] || map.info;
    },

    notifMarkup: function (items, compact) {
      if (!items.length) {
        return '<div class="empty-state" style="padding:1.4rem 1rem"><i class="bi bi-bell-slash"></i>' +
          "<p>No notifications yet.</p></div>";
      }
      return items.map(function (n) {
        var ic = App.iconFor(n.type);
        return '<div class="notif-item ' + (n.read ? "" : "unread") + '" data-notif-id="' + n.id + '">' +
          '<div class="notif-ico ' + ic[0] + '"><i class="bi ' + ic[1] + '"></i></div>' +
          '<div class="flex-grow-1 min-w-0">' +
          '<div class="n1">' + window.Utils.esc(n.title) + "</div>" +
          '<div class="n2">' + window.Utils.esc(n.message) + "</div>" +
          '<div class="n3">' + window.Utils.fmtDateTime(n.datetime) + "</div>" +
          "</div>" +
          (compact ? "" : '<button class="btn-ghost" data-notif-dismiss="' + n.id + '" title="Dismiss" ' +
            'style="border:0;background:none;color:#7d7466;padding:0 .1rem"><i class="bi bi-x-lg" ' +
            'style="font-size:.7rem"></i></button>') +
          "</div>";
      }).join("");
    },

    renderNotifications: function () {
      var user = window.Auth.user();
      var role = user ? user.role : "admin";
      var items = window.Store.notificationsFor(role, 14);
      var unread = items.filter(function (n) { return !n.read; }).length;

      [["notifBadge", role === "admin"], ["invNotifBadge", role === "inventory"], ["posNotifBadge", role === "cashier"], ["cashierNotifBadge", role === "cashier"]]
        .forEach(function (pair) {
          var badge = document.getElementById(pair[0]);
          if (!badge) return;
          badge.textContent = unread > 9 ? "9+" : String(unread);
          badge.classList.toggle("hidden", !pair[1] || unread === 0);
        });

      var list = document.getElementById("notifList");
      if (list) list.innerHTML = this.notifMarkup(items, true);

      var body = document.getElementById("notifModalBody");
      if (body) body.innerHTML = this.notifMarkup(items, false);
    },

    openNotifications: function () {
      this.renderNotifications();
      this.modal("notifModal").show();
    },

    openNotification: function (id) {
      var user = window.Auth.user();
      var n = window.Store.db.notifications.filter(function (x) { return x.id === id; })[0];
      window.Store.markNotificationsRead(id);
      this.renderNotifications();
      if (!n || !user) return;

      if (user.role === "admin") {
        if (n.type === "low" || n.type === "out" || n.type === "inventory" || n.type === "product") {
          this.go("#/admin/inventory");
        } else if (n.type === "sale") {
          this.go("#/admin/transactions");
        } else if (n.type === "user") {
          this.go("#/admin/staff");
        }
      } else if (user.role === "inventory") {
        if (n.type === "sale") this.go("#/inventory/dashboard");
        else this.go("#/inventory/list");
      }
    },

    markAllNotificationsRead: function () {
      var user = window.Auth.user();
      var items = window.Store.notificationsFor(user ? user.role : null);
      items.forEach(function (n) { n.read = true; });
      window.Store.commit();
      this.renderNotifications();
    },

    /* ---------------------------------------------------------- modals & toast */
    bindGlobalModals: function () {
      var ok = document.getElementById("confirmOk");
      var modalEl = document.getElementById("confirmModal");
      ok.addEventListener("click", function () {
        var resolve = App.confirmResolver;
        App.confirmResolver = null;
        App.modal("confirmModal").hide();
        if (resolve) resolve(true);
      });
      modalEl.addEventListener("hidden.bs.modal", function () {
        var resolve = App.confirmResolver;
        App.confirmResolver = null;
        if (resolve) resolve(false);
      });
    },

    modal: function (id) {
      var el = document.getElementById(id);
      if (!el) return null;
      return window.bootstrap.Modal.getOrCreateInstance(el);
    },

    confirm: function (opts) {
      opts = opts || {};
      if (this.confirmResolver) {
        var prev = this.confirmResolver;
        this.confirmResolver = null;
        prev(false);
      }
      document.getElementById("confirmTitle").textContent = opts.title || "Are you sure?";
      document.getElementById("confirmBody").innerHTML = opts.body || "This action cannot be undone.";
      var ok = document.getElementById("confirmOk");
      ok.innerHTML = opts.okText || "Confirm";
      ok.className = "btn " + (opts.danger === false ? "btn-gold" : "btn-danger-soft");
      document.getElementById("confirmCancel").textContent = opts.cancelText || "Cancel";

      var self = this;
      return new Promise(function (resolve) {
        self.confirmResolver = resolve;
        self.modal("confirmModal").show();
      });
    },

    toast: function (message, type, ms) {
      var stack = document.getElementById("toastStack");
      if (!stack) return;
      var icons = {
        success: "bi-check-circle-fill",
        danger: "bi-exclamation-octagon-fill",
        warning: "bi-exclamation-triangle-fill",
        info: "bi-info-circle-fill"
      };
      var life = ms || 3400;
      var el = document.createElement("div");
      el.className = "toast-item " + (type || "info");
      el.style.setProperty("--toast-ms", life + "ms");
      el.innerHTML = '<i class="bi ' + (icons[type] || icons.info) + '"></i>' +
        "<div>" + window.Utils.esc(message) + "</div>" +
        '<button class="t-close" aria-label="Dismiss"><i class="bi bi-x-lg"></i></button>' +
        '<span class="t-progress" aria-hidden="true"></span>';
      stack.appendChild(el);

      var timer = setTimeout(remove, life);
      function remove() {
        if (!el.isConnected) return;
        clearTimeout(timer);
        el.classList.add("toast-out");
        setTimeout(function () { el.remove(); }, 240);
      }
      el.addEventListener("mouseenter", function () { clearTimeout(timer); });
      el.addEventListener("mouseleave", function () {
        clearTimeout(timer);
        timer = setTimeout(remove, 1600);
      });
      el.querySelector(".t-close").addEventListener("click", remove);
    },

    error: function (err) {
      console.error(err);
      this.toast((err && err.message) || "Something went wrong.", "danger", 6000);
    }
  };

  /* Route table — page modules must already be defined (app.js loads last). */
  App.register({
    "#/login": { view: "login" },
    "#/forgot": { view: "login" },
    "#/change-password": { view: "force-password", roles: ["inventory", "cashier"] },

    "#/admin/dashboard": { view: "admin", page: "dashboard", title: "Dashboard", roles: ["admin"] },
    "#/admin/inventory": { view: "admin", page: "inventory", title: "Inventory", roles: ["admin"] },
    "#/admin/products": { view: "admin", page: "products", title: "Products", roles: ["admin"] },
    "#/admin/categories": { view: "admin", page: "categories", title: "Categories", roles: ["admin"] },
    "#/admin/staff": { view: "admin", page: "staff", title: "Staff Accounts", roles: ["admin"] },
    "#/admin/attendance": { view: "admin", page: "attendance", title: "Staff Attendance", roles: ["admin"] },
    "#/admin/profile": { view: "admin", page: "settings", title: "Settings", roles: ["admin"] },
    "#/admin/sales": { view: "admin", page: "sales", title: "Sales", roles: ["admin"] },
    "#/admin/transactions": { view: "admin", page: "transactions", title: "Transactions", roles: ["admin"] },
    "#/admin/reports": { view: "admin", page: "reports", title: "Reports", roles: ["admin"] },
    "#/admin/settings": { view: "admin", page: "settings", title: "Settings", roles: ["admin"] },
    "#/admin/activity": { view: "admin", page: "activity", title: "Activity Logs", roles: ["admin"] },

    "#/inventory/dashboard": { view: "inventory", page: "inv-dashboard", title: "Inventory", roles: ["inventory"] },
    "#/inventory/list": { view: "inventory", page: "inv-list", title: "Inventory List", roles: ["inventory"] },
    "#/inventory/stock-in": { view: "inventory", page: "inv-stock-in", title: "Stock In", roles: ["inventory"] },
    "#/inventory/stock-out": { view: "inventory", page: "inv-stock-out", title: "Stock Out", roles: ["inventory"] },
    "#/inventory/history": { view: "inventory", page: "inv-history", title: "Inventory History", roles: ["inventory"] },
    "#/inventory/attendance": { view: "inventory", page: "attendance", title: "My Attendance", roles: ["inventory"] },
    "#/inventory/profile": { view: "inventory", page: "settings", title: "Settings", roles: ["inventory"] },
    "#/inventory/settings": { view: "inventory", page: "settings", title: "Appearance Settings", roles: ["inventory"] },

    "#/cashier/dashboard": { view: "cashier", page: "cashier-dashboard", title: "Your shift", roles: ["cashier"] },
    "#/cashier/attendance": { view: "cashier", page: "attendance", title: "My Attendance", roles: ["cashier"] },
    "#/cashier/profile": { view: "cashier", page: "settings", title: "Settings", roles: ["cashier"] },
    "#/cashier/settings": { view: "cashier", page: "settings", title: "Appearance Settings", roles: ["cashier"] },

    "#/pos": { view: "pos", title: "POS", roles: ["admin", "cashier"] }
  });

  window.App = App;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { App.boot(); });
  } else {
    App.boot();
  }
})(window);

/* ==========================================================================
   TRIPPERS COFFEE — storage.js
   Utilities, localStorage persistence, schema, seed data and recovery.
   Loaded first: exposes window.Utils and window.Store.
   ========================================================================== */
(function (window) {
  "use strict";

  var DB_KEY = "trippers.db";
  var BAK_KEY = "trippers.db.bak";
  var IMG_KEY = "trippers.images";
  var SESSION_KEY = "trippers.session";
  var CART_KEY = "trippers.cart";
  var VERSION = 4;

  /* ---------------------------------------------------------------- Utils */
  var Utils = {
    /** Round to 2 decimals, avoiding 0.1+0.2 drift. */
    r2: function (n) {
      return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    },

    num: function (n, decimals) {
      var d = decimals === undefined ? 2 : decimals;
      var v = Number(n);
      if (!isFinite(v)) v = 0;
      return v.toLocaleString("en-PH", { minimumFractionDigits: d, maximumFractionDigits: d });
    },

    /** Currency string using the configured symbol (defaults to ₱). */
    money: function (n) {
      var sym = (window.Store && window.Store.db && window.Store.db.settings)
        ? window.Store.db.settings.currencySymbol
        : "₱";
      return sym + Utils.num(n, 2);
    },

    /** Quantity display: trims trailing zeros (1.50 -> 1.5, 2.00 -> 2). */
    qty: function (n) {
      var v = Number(n) || 0;
      var s = v.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
      return s;
    },

    /**
     * Eases a number from 0 to `to` inside an element. Respects reduced-motion
     * and cancels any previous run on the same element.
     */
    countUp: function (el, to, format, ms) {
      if (!el) return;
      var target = Number(to) || 0;
      var fmt = format || function (v) { return Utils.num(v, 0); };
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (el.__countRaf) {
        window.cancelAnimationFrame(el.__countRaf);
        el.__countRaf = null;
      }
      if (reduce || typeof window.requestAnimationFrame !== "function" || !target) {
        el.textContent = fmt(target);
        return;
      }
      var duration = ms || 640;
      var started = null;
      function frame(ts) {
        if (started === null) started = ts;
        var t = Math.min(1, (ts - started) / duration);
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = fmt(target * eased);
        if (t < 1) el.__countRaf = window.requestAnimationFrame(frame);
        else {
          el.__countRaf = null;
          el.textContent = fmt(target);
        }
      }
      el.__countRaf = window.requestAnimationFrame(frame);
    },

    pad: function (n, len) {
      var s = String(n);
      while (s.length < len) s = "0" + s;
      return s;
    },

    ymd: function (d) {
      d = d ? new Date(d) : new Date();
      return d.getFullYear() + "-" + Utils.pad(d.getMonth() + 1, 2) + "-" + Utils.pad(d.getDate(), 2);
    },

    todayISO: function () { return Utils.ymd(new Date()); },

    fmtDate: function (iso) {
      if (!iso) return "—";
      var d = new Date(iso);
      if (isNaN(d)) return "—";
      return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
    },

    fmtDateTime: function (iso) {
      if (!iso) return "—";
      var d = new Date(iso);
      if (isNaN(d)) return "—";
      return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" }) +
        " · " + d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
    },

    fmtTime: function (iso) {
      var d = new Date(iso);
      if (isNaN(d)) return "—";
      return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
    },

    /** Basic HTML escaping for anything inserted into rendered markup. */
    esc: function (s) {
      return String(s === undefined || s === null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    /** Escape text for use inside an HTML attribute that may contain JSON. */
    attr: function (s) {
      return Utils.esc(s).replace(/\n/g, " ");
    },

    initials: function (name) {
      var parts = String(name || "?").trim().split(/\s+/);
      if (!parts.length || !parts[0]) return "?";
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    },

    uid: function (prefix) {
      return (prefix || "ID") + "-" + Date.now().toString(36).toUpperCase() +
        Math.floor(Math.random() * 1296).toString(36).toUpperCase();
    },

    /** Demo-grade salted hash. Not cryptographic security — do not reuse. */
    hash: function (str) {
      var h1 = 0x811c9dc5, h2 = 0x1000193, h3 = 0x9e3779b9;
      var s = String(str);
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = (h2 + Math.imul(c + i, 2654435761)) >>> 0;
        h3 = Math.imul(h3 ^ (c << (i % 13)), 2246822519) >>> 0;
      }
      return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0") +
        h3.toString(16).padStart(8, "0")).slice(0, 32);
    },

    salt: function () {
      return Utils.hash(String(Date.now()) + Math.random().toString(36) + navigator.userAgent).slice(0, 12);
    },

    password: function (pw, salt) {
      return Utils.hash(salt + "::" + pw + "::trippers.v1");
    },

    debounce: function (fn, wait) {
      var t;
      return function () {
        var args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, wait || 220);
      };
    },

    /** Deterministic pseudo-random generator (for reproducible demo sales). */
    rng: function (seed) {
      var s = seed >>> 0;
      return function () {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    },

    pick: function (arr, rand) {
      return arr[Math.floor(rand() * arr.length)];
    },

    /** Download any text payload as a file. */
    download: function (filename, text, mime) {
      var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 400);
    },

    /** RFC-4180 style CSV with BOM so Excel opens ₱ correctly. */
    downloadCSV: function (filename, rows) {
      var csv = rows.map(function (row) {
        return row.map(function (cell) {
          var v = cell === null || cell === undefined ? "" : String(cell);
          if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
          return v;
        }).join(",");
      }).join("\r\n");
      Utils.download(filename, "\uFEFF" + csv, "text/csv;charset=utf-8");
    },

    /** Reads an image file, resizes it and returns a compressed JPEG data URL. */
    readImage: function (file, maxDim, quality) {
      return new Promise(function (resolve, reject) {
        if (!file) return reject(new Error("No file selected."));
        if (!/^image\//.test(file.type)) return reject(new Error("Please choose an image file."));
        if (file.size > 6 * 1024 * 1024) return reject(new Error("Image is larger than 6 MB. Choose a smaller file."));
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error("Could not read that file.")); };
        reader.onload = function () {
          var img = new Image();
          img.onerror = function () { reject(new Error("That image could not be decoded.")); };
          img.onload = function () {
            var max = maxDim || 720;
            var w = img.width, h = img.height;
            var scale = Math.min(1, max / Math.max(w, h));
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
            var canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext("2d");
            ctx.fillStyle = "#1b1814";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", quality || 0.72));
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },

    /** Gold cup artwork used when a product/logo has no uploaded image. */
    placeholderImage: function (label) {
      var text = String(label || "Coffee").replace(/[<>&"]/g, "").toUpperCase();
      if (text.length > 16) text = text.slice(0, 15) + "…";
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="440" viewBox="0 0 640 440">' +
        '<rect width="640" height="440" fill="#241f19"/>' +
        '<circle cx="320" cy="198" r="140" fill="#2c261f"/>' +
        '<circle cx="320" cy="198" r="140" fill="none" stroke="#3d3428" stroke-width="2"/>' +
        '<path d="M244 146h152v62a76 76 0 0 1-76 76h0a76 76 0 0 1-76-76v-62Z" fill="none" stroke="#D4AF37" stroke-width="5" stroke-linejoin="round"/>' +
        '<path d="M396 164h30a34 34 0 0 1 0 68h-30" fill="none" stroke="#D4AF37" stroke-width="5"/>' +
        '<path d="M254 318h132" stroke="#5C3A21" stroke-width="7" stroke-linecap="round"/>' +
        '<path d="M288 118c0-14 10-16 10-30M320 118c0-14 10-16 10-30" fill="none" stroke="#6b5333" stroke-width="4" stroke-linecap="round"/>' +
        '<text x="320" y="378" font-family="Georgia,serif" font-size="26" letter-spacing="4" fill="#E8C96A" text-anchor="middle">' + text + "</text>" +
        "</svg>";
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    },

    /** Brand bean artwork — default receipt logo (transparent, print friendly). */
    logoImage: function () {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="190" viewBox="0 0 240 190">' +
        '<defs><linearGradient id="lg" x1="0" y1="0" x2="0.9" y2="1">' +
        '<stop offset="0" stop-color="#E59150"/><stop offset=".38" stop-color="#C46A29"/>' +
        '<stop offset=".72" stop-color="#964212"/><stop offset="1" stop-color="#6E2C08"/>' +
        '</linearGradient>' +
        '<g id="b"><ellipse cx="0" cy="0" rx="62" ry="41" fill="url(#lg)" stroke="#57230A" stroke-width="3"/>' +
        '<path d="M-44 -1C-26 -18 24 -19 45 0" fill="none" stroke="#4A1D06" stroke-width="7" stroke-linecap="round"/>' +
        '<path d="M-42 6C-24 -10 22 -11 42 6" fill="none" stroke="#F6B57F" stroke-width="2.4" stroke-linecap="round" opacity=".45"/>' +
        '<ellipse cx="-16" cy="-16" rx="30" ry="12" fill="#FFCF9F" opacity=".22"/></g></defs>' +
        '<use href="#b" transform="translate(126 64) rotate(-6)"/>' +
        '<use href="#b" transform="translate(74 122) rotate(-16)"/>' +
        '<use href="#b" transform="translate(164 130) rotate(26)"/>' +
        "</svg>";
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    },
  };

  /* ---------------------------------------------------------------- Store */
  var Store = {
    db: null,
    images: {},
    corrupt: false,
    quotaWarning: false,

    /* -------- persistence -------- */
    boot: function () {
      var raw = null;
      try { raw = window.localStorage.getItem(DB_KEY); } catch (e) { raw = null; }

      if (raw) {
        try {
          var parsed = JSON.parse(raw);
          this.db = this.normalize(parsed);
          this.loadImages();
          this.persist();
          this.writeBackup();
          return this.db;
        } catch (e) {
          console.warn("[TRIPPERS] Primary data unreadable, trying backup.", e);
        }
      }

      if (raw) {
        // Primary key existed but was corrupted → attempt the backup snapshot.
        try {
          var bak = window.localStorage.getItem(BAK_KEY);
          if (bak) {
            var b = this.normalize(JSON.parse(bak));
            this.db = b;
            this.loadImages();
            this.corrupt = true;
            this.persist();
            return this.db;
          }
        } catch (e2) { /* fall through to reseed */ }
      }

      this.seed();
      return this.db;
    },

    normalize: function (raw) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid database payload");
      if (!Array.isArray(raw.users) || !Array.isArray(raw.products)) throw new Error("Invalid database payload");

      var defaults = this.defaults();
      var db = {
        version: VERSION,
        meta: Object.assign({}, defaults.meta, raw.meta || {}),
        users: raw.users || [],
        categories: raw.categories || [],
        inventory: raw.inventory || [],
        products: raw.products || [],
        sales: raw.sales || [],
        notifications: raw.notifications || [],
        stockMoves: raw.stockMoves || [],
        activities: raw.activities || [],
        loginHistory: raw.loginHistory || [],
        resetTokens: raw.resetTokens || [],
        attendance: Array.isArray(raw.attendance) ? raw.attendance : [],
        expenses: Array.isArray(raw.expenses) ? raw.expenses : this.seedExpenses(),
        settings: Object.assign({}, defaults.settings, raw.settings || {})
      };
      db.meta.counters = Object.assign({}, defaults.meta.counters, (raw.meta && raw.meta.counters) || {});
      if (!db.meta.counters.expense) db.meta.counters.expense = db.expenses.length;

      // Migration: earlier builds only had admin/cashier accounts and no email.
      var validRoles = { admin: 1, inventory: 1, cashier: 1 };
      db.users.forEach(function (u) {
        if (!validRoles[u.role]) u.role = "cashier";
        if (!u.email) u.email = String(u.username || "user").toLowerCase() + "@trippers.coffee";
        if (!u.status) u.status = "active";
        if (!u.createdAt) u.createdAt = new Date().toISOString();
        if (!u.employeeId) u.employeeId = "EMP-" + String(u.id || "").replace(/[^0-9]/g, "").slice(-3);
      });

      // Older databases have no login trail or recovery-token store.
      if (!Array.isArray(db.loginHistory)) db.loginHistory = [];
      if (!Array.isArray(db.resetTokens)) db.resetTokens = [];
      db.loginHistory = db.loginHistory.filter(function (h) { return h && h.datetime; }).slice(0, 250);
      db.resetTokens = db.resetTokens.filter(function (t) { return t && t.code && t.expiresAt; });
      var now = Date.now();
      db.resetTokens = db.resetTokens.filter(function (t) {
        return !t.usedAt && new Date(t.expiresAt).getTime() > now;
      });

      // Migration: add the Inventory Staff demo account to v1 databases so all
      // three roles remain reachable after upgrading the static build.
      var hasInventory = db.users.some(function (u) { return u.role === "inventory"; });
      if (!hasInventory) {
        var taken = {};
        db.users.forEach(function (u) {
          taken[String(u.username || "").toLowerCase()] = true;
          taken[String(u.email || "").toLowerCase()] = true;
          taken[String(u.employeeId || "").toLowerCase()] = true;
          taken[String(u.id || "").toLowerCase()] = true;
        });
        if (!taken.inventory && !taken["inventory@trippers.coffee"] && !taken["emp-004"] && !taken["usr-004"]) {
          var invSalt = Utils.salt();
          db.users.push({
            id: "USR-004",
            role: "inventory",
            fullName: "Alyssa Reyes",
            username: "inventory",
            email: "inventory@trippers.coffee",
            salt: invSalt,
            passwordHash: Utils.password("inventory123", invSalt),
            employeeId: "EMP-004",
            contact: "+63 920 555 0144",
            status: "active",
            createdAt: new Date().toISOString()
          });
        }
      }
      return db;
    },

    defaults: function () {
      return {
        meta: {
          createdAt: new Date().toISOString(),
          counters: { category: 0, inventory: 0, product: 0, user: 0, sale: 0, notification: 0, stockMove: 0, activity: 0, expense: 0, attendance: 0 }
        },
        settings: {
          shopName: "TRIPPERS COFFEE",
          address: "24 Brew Street, Salcedo Village, Makati City",
          contact: "+63 917 555 0142",
          currencyCode: "PHP",
          currencySymbol: "₱",
          taxRate: 12,
          receiptFooter: "Thank you for choosing TRIPPERS COFFEE.\nFollow @trippers.coffee for new blends.",
          receiptWidth: "80",
          lowStockThreshold: 10,
          attendanceStartTime: "09:00",
          notifLowStock: true,
          adminRecoveryCode: "TRIPPERS-2026",
          logo: Utils.logoImage()
        }
      };
    },

    loadImages: function () {
      try {
        var raw = window.localStorage.getItem(IMG_KEY);
        this.images = raw ? JSON.parse(raw) : {};
        if (!this.images || typeof this.images !== "object") this.images = {};
      } catch (e) {
        this.images = {};
      }
    },

    persist: function () {
      try {
        window.localStorage.setItem(DB_KEY, JSON.stringify(this.db));
        return true;
      } catch (e) {
        this.handleQuota(e);
        return false;
      }
    },

    persistImages: function () {
      try {
        window.localStorage.setItem(IMG_KEY, JSON.stringify(this.images));
        return true;
      } catch (e) {
        this.handleQuota(e);
        return false;
      }
    },

    handleQuota: function (e) {
      this.quotaWarning = true;
      console.error("[TRIPPERS] localStorage write failed", e);
      var msg = (e && e.name === "QuotaExceededError")
        ? "Browser storage is full. Remove some product images or export and reset the demo data."
        : "Could not save data to this browser. Storage may be blocked.";
      if (window.App && window.App.toast) window.App.toast(msg, "danger", 7000);
      else window.alert(msg);
    },

    writeBackup: function () {
      try {
        window.localStorage.setItem(BAK_KEY, JSON.stringify(this.db));
      } catch (e) { /* backup is best-effort */ }
    },

    commit: function () {
      var ok = this.persist();
      this.writeBackup();
      try {
        window.dispatchEvent(new CustomEvent("trippers:datachanged", { detail: { at: Date.now() } }));
      } catch (e) { /* CustomEvent is optional in very old browsers */ }
      return ok;
    },

    /* -------- ids -------- */
    next: function (counter) {
      this.db.meta.counters[counter] = (this.db.meta.counters[counter] || 0) + 1;
      return this.db.meta.counters[counter];
    },

    nextId: function (prefix, counter, pad) {
      return prefix + "-" + Utils.pad(this.next(counter), pad || 3);
    },

    newSaleId: function () {
      var d = new Date();
      var seq = this.next("sale");
      return "TRX-" + d.getFullYear() + Utils.pad(d.getMonth() + 1, 2) + Utils.pad(d.getDate(), 2) + "-" + Utils.pad(seq, 4);
    },

    nextOrderNumber: function () {
      return "ORD-" + Utils.pad((this.db.meta.counters.sale || 0) + 1, 4);
    },

    /* -------- images -------- */
    image: function (id) {
      return this.images[id] || null;
    },

    setImage: function (id, dataUrl) {
      var prev = this.images[id];
      this.images[id] = dataUrl;
      var ok = this.persistImages();
      if (!ok) {
        // Revert the in-memory change when the write failed (quota).
        if (prev === undefined) delete this.images[id];
        else this.images[id] = prev;
      }
      return ok;
    },

    removeImage: function (id) {
      delete this.images[id];
      this.persistImages();
    },

    /* -------- notifications -------- */
    notify: function (type, title, message, key) {
      if (key) {
        var exists = this.db.notifications.some(function (n) {
          return n.key === key && !n.read;
        });
        if (exists) return null;
      }
      var n = {
        id: this.nextId("NTF", "notification", 4),
        type: type || "info",
        title: title,
        message: message,
        key: key || null,
        datetime: new Date().toISOString(),
        read: false
      };
      this.db.notifications.unshift(n);
      if (this.db.notifications.length > 80) this.db.notifications.length = 80;
      return n;
    },

    unreadCount: function () {
      return this.db.notifications.filter(function (n) { return !n.read; }).length;
    },

    markNotificationsRead: function (id) {
      var self = this;
      if (id) {
        this.db.notifications.forEach(function (n) { if (n.id === id) n.read = true; });
      } else {
        this.db.notifications.forEach(function (n) { n.read = true; });
      }
      this.commit();
      return this.unreadCount();
    },

    dismissNotification: function (id) {
      this.db.notifications = this.db.notifications.filter(function (n) { return n.id !== id; });
      this.commit();
    },

    /** Role-aware notification feed: admins see everything, staff see relevant work. */
    notificationsFor: function (role, limit) {
      var types = null;
      if (role === "inventory") types = { low: 1, out: 1, inventory: 1, product: 1 };
      else if (role === "cashier") types = { sale: 1, low: 1, out: 1, inventory: 1 };
      var list = this.db.notifications.filter(function (n) {
        return !types || types[n.type];
      });
      return typeof limit === "number" ? list.slice(0, limit) : list;
    },

    /* -------- activity log -------- */
    logActivity: function (action, detail, meta) {
      var user = (window.Auth && window.Auth.user) ? window.Auth.user() : null;
      var entry = {
        id: this.nextId("ACT", "activity", 4),
        datetime: new Date().toISOString(),
        userId: (meta && meta.userId) || (user ? user.id : null),
        userName: (meta && meta.userName) || (user ? user.fullName : "System"),
        role: (meta && meta.role) || (user ? user.role : "system"),
        action: action || "Activity",
        detail: detail || ""
      };
      this.db.activities.unshift(entry);
      if (this.db.activities.length > 400) this.db.activities.length = 400;
      return entry;
    },

    activitiesFor: function (userId, limit) {
      var list = this.db.activities.filter(function (a) { return a.userId === userId; });
      return typeof limit === "number" ? list.slice(0, limit) : list;
    },

    /* -------- login history + password recovery -------- */
    recordLogin: function (user, ok, reason) {
      var entry = {
        id: Utils.uid("LOG"),
        userId: user ? user.id : null,
        userName: user ? user.fullName : "Unknown account",
        username: user ? user.username : "",
        role: user ? user.role : "system",
        datetime: new Date().toISOString(),
        ok: !!ok,
        reason: reason || (ok ? "Signed in" : "Sign-in failed"),
        agent: String(navigator.userAgent || "").slice(0, 140)
      };
      this.db.loginHistory.unshift(entry);
      if (this.db.loginHistory.length > 250) this.db.loginHistory.length = 250;
      return entry;
    },

    loginHistoryFor: function (userId, limit) {
      var list = this.db.loginHistory.filter(function (h) { return h.userId === userId; })
        .sort(function (a, b) { return new Date(b.datetime) - new Date(a.datetime); });
      return typeof limit === "number" ? list.slice(0, limit) : list;
    },

    recentLogins: function (limit) {
      var list = this.db.loginHistory.slice().sort(function (a, b) {
        return new Date(b.datetime) - new Date(a.datetime);
      });
      return typeof limit === "number" ? list.slice(0, limit) : list;
    },

    purgeResetTokens: function () {
      var now = Date.now();
      this.db.resetTokens = this.db.resetTokens.filter(function (t) {
        return t && !t.usedAt && new Date(t.expiresAt).getTime() > now;
      });
    },

    /** Creates a short-lived, single-use six-digit reset code (demo delivery). */
    createResetToken: function (user) {
      this.purgeResetTokens();
      var code;
      var guard = 0;
      do {
        code = String(Math.floor(100000 + Math.random() * 900000));
        guard++;
      } while (guard < 30 && this.db.resetTokens.some(function (t) { return t.code === code; }));

      var now = new Date();
      var token = {
        id: Utils.uid("RST"),
        userId: user.id,
        username: user.username,
        code: code,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
        usedAt: null
      };
      this.db.resetTokens.push(token);
      return token;
    },

    invalidateResetTokens: function (userId) {
      this.db.resetTokens = this.db.resetTokens.filter(function (t) { return t.userId !== userId; });
    },

    verifyResetCode: function (identifier, code) {
      this.purgeResetTokens();
      var user = this.findUser(identifier);
      if (!user) return null;
      var clean = String(code || "").replace(/\D/g, "");
      if (clean.length !== 6) return null;
      var token = this.db.resetTokens.filter(function (t) {
        return t.userId === user.id && !t.usedAt && t.code === clean &&
          new Date(t.expiresAt).getTime() > Date.now();
      })[0];
      return token ? { token: token, user: user } : null;
    },

    consumeResetToken: function (tokenId) {
      var token = this.db.resetTokens.filter(function (t) { return t.id === tokenId; })[0];
      if (!token) return false;
      token.usedAt = new Date().toISOString();
      return true;
    },

    /** Re-evaluates stock levels and raises deduplicated notifications. */
    syncStockNotifications: function () {
      if (!this.db.settings.notifLowStock) return;
      var self = this;
      var threshold = Number(this.db.settings.lowStockThreshold) || 0;
      this.db.inventory.forEach(function (item) {
        var min = Number(item.minStock);
        if (!isFinite(min) || min <= 0) min = threshold;
        if (Number(item.qty) <= 0) {
          self.notify("out", "Out of stock", item.name + " is out of stock.", "stock:out:" + item.id);
        } else if (Number(item.qty) <= min) {
          self.notify("low", "Low stock", item.name + " is down to " + Utils.qty(item.qty) + " " + item.unit + " (min " + Utils.qty(min) + ").", "stock:low:" + item.id);
        }
      });
    },

    /* -------- stock movements -------- */
    logStockMove: function (data) {
      var move = {
        id: this.nextId("MOV", "stockMove", 4),
        inventoryId: data.inventoryId,
        itemName: data.itemName,
        type: data.type, // in | out | sale
        qty: Number(data.qty),
        unit: data.unit,
        note: data.note || "",
        datetime: new Date().toISOString(),
        userId: data.userId || null,
        userName: data.userName || "System"
      };
      this.db.stockMoves.unshift(move);
      if (this.db.stockMoves.length > 400) this.db.stockMoves.length = 400;
      return move;
    },

    movesFor: function (inventoryId) {
      return this.db.stockMoves.filter(function (m) { return m.inventoryId === inventoryId; });
    },

    /**
     * Single validated entry point for manual stock-in / stock-out.
     * Shared by the admin inventory modal and the inventory staff pages.
     */
    adjustStock: function (id, type, qty, note) {
      var item = this.inventoryItem(id);
      if (!item) return { ok: false, error: "Choose an inventory item." };
      var amount = Math.abs(Number(qty));
      if (!isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a quantity greater than zero." };
      if (type === "out" && amount > Number(item.qty)) {
        return {
          ok: false,
          error: "Cannot remove " + Utils.qty(amount) + " " + item.unit + " — only " +
            Utils.qty(item.qty) + " " + item.unit + " available."
        };
      }
      var user = (window.Auth && window.Auth.user) ? window.Auth.user() : null;
      item.qty = Utils.r2(type === "in" ? Number(item.qty) + amount : Number(item.qty) - amount);
      item.updatedAt = new Date().toISOString();
      this.logStockMove({
        inventoryId: item.id,
        itemName: item.name,
        type: type,
        qty: amount,
        unit: item.unit,
        note: note || (type === "in" ? "Stock received" : "Stock removed"),
        userId: user ? user.id : null,
        userName: user ? user.fullName : "System"
      });
      this.logActivity(type === "in" ? "Stock in" : "Stock out",
        (type === "in" ? "Added " : "Removed ") + Utils.qty(amount) + " " + item.unit +
        " " + item.name + (note ? " (" + note + ")" : ""));
      this.notify("inventory", type === "in" ? "Stock updated" : "Stock reduced",
        item.name + " is now " + Utils.qty(item.qty) + " " + item.unit + ".");
      this.syncStockNotifications();
      this.commit();
      return { ok: true, item: item };
    },

    /* -------- lookups -------- */
    user: function (id) {
      return this.db.users.filter(function (u) { return u.id === id; })[0] || null;
    },

    cashiers: function () {
      return this.db.users.filter(function (u) { return u.role === "cashier"; });
    },

    /** Both staff account types (everything that is not the admin). */
    staff: function () {
      return this.db.users.filter(function (u) { return u.role === "inventory" || u.role === "cashier"; });
    },

    staffByRole: function (role) {
      return this.db.users.filter(function (u) { return u.role === role; });
    },

    activeStaffCount: function () {
      return this.staff().filter(function (u) { return u.status === "active"; }).length;
    },

    /** Case-insensitive lookup by username or email (login + recovery). */
    findUser: function (identifier) {
      var key = String(identifier || "").trim().toLowerCase();
      if (!key) return null;
      return this.db.users.filter(function (u) {
        return String(u.username || "").toLowerCase() === key ||
          String(u.email || "").toLowerCase() === key;
      })[0] || null;
    },

    category: function (id) {
      return this.db.categories.filter(function (c) { return c.id === id; })[0] || null;
    },

    product: function (id) {
      return this.db.products.filter(function (p) { return p.id === id; })[0] || null;
    },

    inventoryItem: function (id) {
      return this.db.inventory.filter(function (i) { return i.id === id; })[0] || null;
    },

    sale: function (id) {
      return this.db.sales.filter(function (s) { return s.id === id; })[0] || null;
    },

    productsInCategory: function (categoryId) {
      return this.db.products.filter(function (p) { return p.categoryId === categoryId; });
    },

    stockStatus: function (item) {
      var qty = Number(item.qty) || 0;
      var min = Number(item.minStock);
      if (!isFinite(min) || min <= 0) min = Number(this.db.settings.lowStockThreshold) || 0;
      if (qty <= 0) return "out";
      if (qty <= min) return "low";
      return "in";
    },

    lowStockItems: function () {
      var self = this;
      return this.db.inventory.filter(function (i) {
        var s = self.stockStatus(i);
        return s === "low" || s === "out";
      });
    },

    /** Products visible on the cashier POS. */
    posProducts: function () {
      return this.db.products.filter(function (p) { return p.active && p.available; });
    },

    money: function (n) { return Utils.money(n); },

    /* -------- costing -------- */
    /** Cost of one serving from the product recipe and current inventory cost. */
    productCost: function (productOrId) {
      var p = typeof productOrId === "string" ? this.product(productOrId) : productOrId;
      if (!p || !Array.isArray(p.recipe) || !p.recipe.length) return 0;
      var self = this;
      return Utils.r2(p.recipe.reduce(function (sum, line) {
        var item = self.inventoryItem(line.inventoryId);
        if (!item) return sum;
        return sum + (Number(item.costPrice) || 0) * (Number(line.qty) || 0);
      }, 0));
    },

    /**
     * COGS for a sale. New sales carry an exact `cost`; older seeded sales are
     * valued with today's recipe cost so historical reports stay meaningful.
     */
    saleCost: function (sale) {
      if (!sale) return 0;
      if (typeof sale.cost === "number" && isFinite(sale.cost)) return Utils.r2(sale.cost);
      var self = this;
      var total = (sale.items || []).reduce(function (sum, line) {
        var qty = Number(line.qty) || 0;
        if (typeof line.lineCost === "number" && isFinite(line.lineCost)) return sum + line.lineCost;
        if (typeof line.unitCost === "number" && isFinite(line.unitCost)) return sum + line.unitCost * qty;
        return sum + self.productCost(line.productId) * qty;
      }, 0);
      return Utils.r2(total);
    },

    /* -------- expenses -------- */
    /** Deterministic operating-expense history for the demo database. */
    seedExpenses: function () {
      var now = new Date();
      var defs = [
        ["Rent", "Monthly store rent", 45000, "Bank Transfer", 3],
        ["Utilities", "Electricity, water and internet", 8600, "Bank Transfer", 8],
        ["Payroll", "Barista and cashier payroll", 56000, "Bank Transfer", 15],
        ["Marketing", "Social media boost and store posters", 2600, "GCash", 20],
        ["Maintenance", "Espresso machine servicing and repairs", 1850, "Cash", 24],
        ["Licenses", "Business permits and sanitation fees", 1200, "Bank Transfer", 27],
        ["Other", "Cleaning supplies and minor store needs", 1450, "Cash", 28]
      ];
      var expenses = [];
      var seq = 0;
      for (var m = 5; m >= 0; m--) {
        var anchor = new Date(now.getFullYear(), now.getMonth() - m, 1);
        defs.forEach(function (d, i) {
          if (d[0] === "Maintenance" && m % 2 === 1) return;
          if (d[0] === "Licenses" && m % 3 !== 0) return;
          var date = new Date(anchor.getFullYear(), anchor.getMonth(), d[4]);
          if (date > now) return;
          var jitter = 1 + ((((m + 1) * 7 + i * 13) % 9) - 4) / 100;
          seq++;
          expenses.push({
            id: "EXP-" + Utils.pad(seq, 5),
            date: Utils.ymd(date),
            category: d[0],
            description: d[1],
            amount: Utils.r2(d[2] * jitter),
            method: d[3],
            notes: "Recurring operating expense",
            createdBy: "Marco Villanueva",
            createdAt: new Date(date.getTime() + 9 * 3600000).toISOString()
          });
        });
      }
      return expenses.sort(function (a, b) { return a.date.localeCompare(b.date); });
    },

    expensesBetween: function (fromYmd, toYmd) {
      var from = fromYmd || "0000-01-01";
      var to = toYmd || "9999-12-31";
      return this.db.expenses.filter(function (e) {
        return e && e.date >= from && e.date <= to;
      }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    },

    addExpense: function (data) {
      data = data || {};
      var amount = Number(data.amount);
      if (!data.date) return { ok: false, error: "Choose the expense date." };
      if (!data.category) return { ok: false, error: "Choose an expense category." };
      if (!String(data.description || "").trim()) return { ok: false, error: "Enter an expense description." };
      if (!isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount greater than zero." };

      var expense = {
        id: this.nextId("EXP", "expense", 5),
        date: data.date,
        category: data.category,
        description: String(data.description).trim().slice(0, 120),
        amount: Utils.r2(amount),
        method: data.method || "Cash",
        notes: String(data.notes || "").trim().slice(0, 240),
        createdBy: (window.Auth && window.Auth.user()) ? window.Auth.user().fullName : "System",
        createdAt: new Date().toISOString()
      };
      this.db.expenses.push(expense);
      this.logActivity("Expense recorded",
        expense.category + " · " + expense.description + " · " + Utils.money(expense.amount) + " (" + expense.date + ").");
      this.commit();
      return { ok: true, expense: expense };
    },

    deleteExpense: function (id) {
      var expense = this.db.expenses.filter(function (e) { return e.id === id; })[0];
      if (!expense) return { ok: false, error: "That expense no longer exists." };
      this.db.expenses = this.db.expenses.filter(function (e) { return e.id !== id; });
      this.logActivity("Expense deleted",
        expense.category + " · " + expense.description + " · " + Utils.money(expense.amount) + ".");
      this.commit();
      return { ok: true, expense: expense };
    },

    /* -------- totals -------- */
    /** Single source of truth for order maths (POS, seed, reports). */
    computeTotals: function (lines, discountType, discountValue) {
      var subtotal = 0;
      lines.forEach(function (l) {
        subtotal += (Number(l.price) || 0) * (Number(l.qty) || 0);
      });
      subtotal = Utils.r2(subtotal);

      var raw = Number(discountValue) || 0;
      var discount = 0;
      if (discountType === "percent") {
        raw = Math.min(Math.max(raw, 0), 100);
        discount = subtotal * raw / 100;
      } else {
        discount = Math.min(Math.max(raw, 0), subtotal);
      }
      discount = Utils.r2(discount);

      var taxable = Utils.r2(subtotal - discount);
      var rate = Number(this.db.settings.taxRate) || 0;
      var tax = Utils.r2(taxable * rate / 100);
      var total = Utils.r2(taxable + tax);

      return {
        subtotal: subtotal,
        discountType: discountType || "amount",
        discountValue: raw,
        discountAmount: discount,
        taxRate: rate,
        taxAmount: tax,
        total: total
      };
    },

    /* -------- export / import / reset -------- */
    exportData: function () {
      return JSON.stringify({
        app: "TRIPPERS COFFEE",
        exportedAt: new Date().toISOString(),
        version: VERSION,
        db: this.db,
        images: this.images
      }, null, 2);
    },

    importData: function (text) {
      var payload = JSON.parse(text);
      if (!payload || !payload.db) throw new Error("This file is not a TRIPPERS backup.");
      var db = this.normalize(payload.db);
      if (!db.users.some(function (u) { return u.role === "admin"; })) {
        throw new Error("Backup is missing an administrator account.");
      }
      this.db = db;
      this.images = (payload.images && typeof payload.images === "object") ? payload.images : {};
      this.persist();
      this.persistImages();
      this.writeBackup();
      return true;
    },

    storageBytes: function () {
      var total = 0;
      try {
        for (var i = 0; i < window.localStorage.length; i++) {
          var k = window.localStorage.key(i);
          if (k && k.indexOf("trippers.") === 0) {
            total += (window.localStorage.getItem(k) || "").length + k.length;
          }
        }
      } catch (e) { return 0; }
      return total;
    },

    reset: function () {
      try {
        [DB_KEY, BAK_KEY, IMG_KEY, CART_KEY].forEach(function (k) {
          window.localStorage.removeItem(k);
        });
      } catch (e) { /* ignore */ }
      this.images = {};
      this.corrupt = false;
      this.seed();
      return this.db;
    },

    /* -------- demo seed -------- */
    seed: function () {
      var now = new Date();
      var self = this;
      var db = this.defaults();
      db.notifications = [];
      db.stockMoves = [];
      db.sales = [];
      db.loginHistory = [];
      db.resetTokens = [];
      db.attendance = [];
      // computeTotals() reads settings through this.db, so publish the draft early.
      this.db = db;

      /* users */
      var adminSalt = Utils.salt();
      var admin = {
        id: "USR-ADMIN",
        role: "admin",
        fullName: "Marco Villanueva",
        username: "admin",
        email: "admin@trippers.coffee",
        salt: adminSalt,
        passwordHash: Utils.password("admin123", adminSalt),
        employeeId: "EMP-001",
        contact: "+63 917 555 0100",
        status: "active",
        createdAt: new Date(now.getTime() - 120 * 864e5).toISOString()
      };

      function makeStaff(name, username, pw, empId, contact, daysAgo, role) {
        var s = Utils.salt();
        return {
          id: "USR-" + empId.replace(/[^0-9]/g, ""),
          role: role || "cashier",
          fullName: name,
          username: username,
          email: username + "@trippers.coffee",
          salt: s,
          passwordHash: Utils.password(pw, s),
          employeeId: empId,
          contact: contact,
          status: "active",
          createdAt: new Date(now.getTime() - daysAgo * 864e5).toISOString()
        };
      }

      var jamie = makeStaff("Jamie Cruz", "cashier", "cashier123", "EMP-002", "+63 918 555 0121", 90, "cashier");
      var miguel = makeStaff("Miguel Santos", "miguel", "miguel123", "EMP-003", "+63 919 555 0187", 60, "cashier");
      var alyssa = makeStaff("Alyssa Reyes", "inventory", "inventory123", "EMP-004", "+63 920 555 0144", 75, "inventory");

      db.users = [admin, jamie, miguel, alyssa];
      db.meta.counters.user = 4;

      /* categories */
      var catDefs = [
        ["Coffee", "Espresso-based hot and iced coffee drinks"],
        ["Non-Coffee", "Matcha, chocolate and creamy indulgences"],
        ["Tea", "Brewed and iced tea selections"],
        ["Cold Drinks", "Refreshing cold beverages"],
        ["Hot Drinks", "Warm comfort cups"],
        ["Pastries", "Baked goods to pair with coffee"],
        ["Other Products", "Merchandise and retail beans"]
      ];
      db.categories = catDefs.map(function (c, i) {
        return {
          id: "CAT-" + Utils.pad(i + 1, 3),
          name: c[0],
          description: c[1],
          createdAt: new Date(now.getTime() - (110 - i) * 864e5).toISOString()
        };
      });
      db.meta.counters.category = db.categories.length;
      var catId = {};
      db.categories.forEach(function (c) { catId[c.name] = c.id; });

      /* inventory (raw supplies) */
      var invDefs = [
        ["Arabica Coffee Beans", "Coffee Beans", 4.8, "kg", 980, 1500, 1.5],
        ["Espresso Blend Beans", "Coffee Beans", 3.2, "kg", 1150, 1750, 1],
        ["Fresh Milk", "Milk", 18, "L", 110, 160, 5],
        ["Oat Milk", "Milk", 2.4, "L", 210, 280, 3],
        ["Vanilla Syrup", "Syrups", 6, "bottle", 320, 450, 2],
        ["Caramel Syrup", "Syrups", 4, "bottle", 320, 450, 2],
        ["Sugar Syrup", "Syrups", 5, "bottle", 180, 260, 2],
        ["Chocolate Sauce", "Chocolate", 3.2, "L", 420, 620, 1],
        ["Strawberry Puree", "Syrups", 0, "L", 380, 540, 1],
        ["Matcha Powder", "Tea", 0.7, "kg", 2400, 3200, 1],
        ["Iced Tea Concentrate", "Tea", 4.5, "L", 260, 380, 1.5],
        ["Paper Cups 16oz", "Cups and Lids", 420, "pcs", 7.5, 12, 150],
        ["Cup Lids 16oz", "Cups and Lids", 380, "pcs", 3.2, 6, 150],
        ["Kraft Cup Sleeves", "Packaging", 210, "pcs", 2.5, 5, 80],
        ["Takeaway Paper Bags", "Packaging", 95, "pcs", 4, 8, 50],
        ["Cleaning Tablets", "Other Supplies", 40, "pcs", 15, 25, 20]
      ];

      db.inventory = invDefs.map(function (d, i) {
        return {
          id: "INV-" + Utils.pad(i + 1, 3),
          name: d[0],
          category: d[1],
          qty: d[2],
          unit: d[3],
          costPrice: d[4],
          sellingPrice: d[5],
          minStock: d[6],
          createdAt: new Date(now.getTime() - (100 - i) * 864e5).toISOString(),
          updatedAt: new Date(now.getTime() - (3 + (i % 5)) * 864e5).toISOString()
        };
      });
      db.meta.counters.inventory = db.inventory.length;
      var invId = {};
      db.inventory.forEach(function (i) { invId[i.name] = i.id; });

      /* a short stock-movement history so the inventory pages are not empty */
      db.stockMoves = [
        {
          id: "MOV-0001", inventoryId: invId["Fresh Milk"], itemName: "Fresh Milk", type: "in",
          qty: 12, unit: "L", note: "Morning supplier delivery",
          datetime: new Date(now.getTime() - 26 * 3600000).toISOString(),
          userId: alyssa.id, userName: alyssa.fullName
        },
        {
          id: "MOV-0002", inventoryId: invId["Paper Cups 16oz"], itemName: "Paper Cups 16oz", type: "in",
          qty: 200, unit: "pcs", note: "Packaging restock",
          datetime: new Date(now.getTime() - 20 * 3600000).toISOString(),
          userId: alyssa.id, userName: alyssa.fullName
        },
        {
          id: "MOV-0003", inventoryId: invId["Chocolate Sauce"], itemName: "Chocolate Sauce", type: "out",
          qty: 0.4, unit: "L", note: "Spoilage — expired bottle",
          datetime: new Date(now.getTime() - 7 * 3600000).toISOString(),
          userId: alyssa.id, userName: alyssa.fullName
        },
        {
          id: "MOV-0004", inventoryId: invId["Caramel Syrup"], itemName: "Caramel Syrup", type: "out",
          qty: 1, unit: "bottle", note: "Transferred to bar station",
          datetime: new Date(now.getTime() - 3 * 3600000).toISOString(),
          userId: alyssa.id, userName: alyssa.fullName
        }
      ];
      db.stockMoves.sort(function (a, b) {
        return new Date(b.datetime) - new Date(a.datetime);
      });
      db.meta.counters.stockMove = db.stockMoves.length;

      /* menu products with recipes */
      var bean = function () { return { inventoryId: invId["Arabica Coffee Beans"], qty: 0.018 }; };
      var blend = function () { return { inventoryId: invId["Espresso Blend Beans"], qty: 0.018 }; };
      var cup = function () {
        return [
          { inventoryId: invId["Paper Cups 16oz"], qty: 1 },
          { inventoryId: invId["Cup Lids 16oz"], qty: 1 }
        ];
      };
      var prdDefs = [
        ["Espresso", "Coffee", 95, "A dense double shot of our house arabica.", [bean()]],
        ["Americano", "Coffee", 110, "Espresso lengthened with hot water.", [bean(), { inventoryId: invId["Paper Cups 16oz"], qty: 1 }]],
        ["Cappuccino", "Coffee", 135, "Espresso, steamed milk and a velvet foam cap.", [bean(), { inventoryId: invId["Fresh Milk"], qty: 0.12 }].concat(cup())],
        ["Cafe Latte", "Coffee", 140, "Silky steamed milk over a double shot.", [bean(), { inventoryId: invId["Fresh Milk"], qty: 0.18 }].concat(cup())],
        ["Caramel Macchiato", "Coffee", 155, "Vanilla milk, espresso and caramel drizzle.", [blend(), { inventoryId: invId["Fresh Milk"], qty: 0.15 }, { inventoryId: invId["Caramel Syrup"], qty: 0.02 }, { inventoryId: invId["Vanilla Syrup"], qty: 0.01 }].concat(cup())],
        ["Spanish Latte", "Coffee", 150, "Condensed-milk sweetness with a bold ristretto base.", [blend(), { inventoryId: invId["Fresh Milk"], qty: 0.16 }, { inventoryId: invId["Sugar Syrup"], qty: 0.02 }].concat(cup())],
        ["Mocha", "Coffee", 150, "Espresso, chocolate and steamed milk.", [bean(), { inventoryId: invId["Fresh Milk"], qty: 0.14 }, { inventoryId: invId["Chocolate Sauce"], qty: 0.03 }].concat(cup())],
        ["Vanilla Latte", "Coffee", 145, "Classic latte finished with vanilla syrup.", [bean(), { inventoryId: invId["Fresh Milk"], qty: 0.17 }, { inventoryId: invId["Vanilla Syrup"], qty: 0.02 }].concat(cup())],
        ["Matcha Latte", "Non-Coffee", 160, "Stone-ground matcha whisked with milk.", [{ inventoryId: invId["Matcha Powder"], qty: 0.008 }, { inventoryId: invId["Fresh Milk"], qty: 0.18 }].concat(cup())],
        ["Chocolate", "Non-Coffee", 140, "Rich dark chocolate steamed with milk.", [{ inventoryId: invId["Chocolate Sauce"], qty: 0.04 }, { inventoryId: invId["Fresh Milk"], qty: 0.15 }].concat(cup())],
        ["Strawberry Milk", "Cold Drinks", 145, "Fresh strawberry puree shaken with cold milk.", [{ inventoryId: invId["Strawberry Puree"], qty: 0.06 }, { inventoryId: invId["Fresh Milk"], qty: 0.15 }].concat(cup())],
        ["Iced Tea", "Tea", 120, "Slow-brewed black tea over ice with lemon.", [{ inventoryId: invId["Iced Tea Concentrate"], qty: 0.15 }].concat(cup())]
      ];

      db.products = prdDefs.map(function (d, i) {
        return {
          id: "PRD-" + Utils.pad(i + 1, 3),
          name: d[0],
          categoryId: catId[d[1]],
          price: d[2],
          description: d[3],
          recipe: d[4],
          active: true,
          available: d[0] !== "Strawberry Milk", // out-of-stock demo: hidden from POS
          createdAt: new Date(now.getTime() - (95 - i) * 864e5).toISOString(),
          updatedAt: new Date(now.getTime() - 5 * 864e5).toISOString()
        };
      });
      db.meta.counters.product = db.products.length;

      /* demo historical sales — 45 days, deterministic */
      var rand = Utils.rng(20261116);
      var saleSeq = 0;
      var sales = [];
      var cashierPool = [jamie, miguel];
      var methods = [
        ["Cash", 0.6], ["GCash", 0.25], ["Maya", 0.15]
      ];
      function pickMethod() {
        var r = rand();
        var acc = 0;
        for (var i = 0; i < methods.length; i++) {
          acc += methods[i][1];
          if (r <= acc) return methods[i][0];
        }
        return "Cash";
      }

      for (var dAgo = 45; dAgo >= 0; dAgo--) {
        var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dAgo);
        var dow = day.getDay();
        var weekend = dow === 0 || dow === 6;
        var count = weekend ? 3 + Math.floor(rand() * 4) : 2 + Math.floor(rand() * 3);
        if (dAgo === 0) count = 3 + Math.floor(rand() * 3);
        if (rand() < 0.08) count = 0;

        for (var k = 0; k < count; k++) {
          var cashier = rand() < 0.62 ? cashierPool[0] : cashierPool[1];
          var lines = [];
          var nLines = 1 + Math.floor(rand() * 3);
          var used = {};
          for (var li = 0; li < nLines; li++) {
            var p = Utils.pick(db.products, rand);
            if (used[p.id]) continue;
            used[p.id] = true;
            var cat = db.categories.filter(function (c) { return c.id === p.categoryId; })[0];
            var qty = 1 + (rand() < 0.25 ? 1 : 0);
            lines.push({
              productId: p.id,
              name: p.name,
              categoryId: p.categoryId,
              categoryName: cat ? cat.name : "Uncategorised",
              price: p.price,
              qty: qty,
              lineTotal: Utils.r2(p.price * qty),
              unitCost: self.productCost(p),
              lineCost: Utils.r2(self.productCost(p) * qty)
            });
          }
          if (!lines.length) continue;

          var discountType = rand() < 0.12 ? "percent" : "amount";
          var discountValue = discountType === "percent" ? 5 : 0;
          var t = self.computeTotals(lines, discountType, discountValue);

          var hh, mm;
          if (dAgo === 0) {
            var minsAgo = 12 + Math.floor(rand() * 420);
            var when = new Date(now.getTime() - minsAgo * 60000);
            hh = when.getHours();
            mm = when.getMinutes();
          } else {
            hh = 8 + Math.floor(rand() * 12);
            mm = Math.floor(rand() * 60);
          }
          var dt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm, Math.floor(rand() * 60));

          saleSeq++;
          var method = pickMethod();
          var received = method === "Cash" ? Math.ceil(t.total / 50) * 50 : t.total;
          if (method === "Cash" && received < t.total) received = t.total;
          sales.push({
            id: "TRX-" + dt.getFullYear() + Utils.pad(dt.getMonth() + 1, 2) + Utils.pad(dt.getDate(), 2) + "-" + Utils.pad(saleSeq, 4),
            datetime: dt.toISOString(),
            cashierId: cashier.id,
            cashierName: cashier.fullName,
            items: lines,
            subtotal: t.subtotal,
            discountType: t.discountType,
            discountValue: t.discountValue,
            discountAmount: t.discountAmount,
            taxRate: t.taxRate,
            taxAmount: t.taxAmount,
            total: t.total,
            paymentMethod: method,
            reference: method === "Cash" ? "" : "DEMO" + Utils.pad(1000 + Math.floor(rand() * 8999), 4),
            cashReceived: method === "Cash" ? received : t.total,
            change: method === "Cash" ? Utils.r2(received - t.total) : 0,
            status: "completed",
            deductions: []
          });
        }
      }
      db.sales = sales;
      db.meta.counters.sale = saleSeq;

      /* images for seeded products */
      this.images = {};
      db.products.forEach(function (p) {
        self.images[p.id] = Utils.placeholderImage(p.name);
      });

      /* seed a couple of notifications so the bell is alive */
      db.notifications = [
        {
          id: "NTF-0001", type: "out", title: "Out of stock",
          message: "Strawberry Puree is out of stock — Strawberry Milk is hidden from the POS.",
          key: "stock:out:INV-009", datetime: new Date(now.getTime() - 45 * 60000).toISOString(), read: false
        },
        {
          id: "NTF-0002", type: "low", title: "Low stock",
          message: "Matcha Powder is down to 0.7 kg (min 1).",
          key: "stock:low:INV-010", datetime: new Date(now.getTime() - 2 * 3600000).toISOString(), read: false
        },
        {
          id: "NTF-0003", type: "user", title: "Staff account created",
          message: "Miguel Santos (EMP-003) was added as a cashier.",
          key: null, datetime: new Date(now.getTime() - 26 * 3600000).toISOString(), read: true
        }
      ];
      db.meta.counters.notification = 3;

      /* a little activity history so the log is not empty on first launch */
      db.activities = [
        {
          id: "ACT-0001", datetime: new Date(now.getTime() - 26 * 3600000).toISOString(),
          userId: admin.id, userName: admin.fullName, role: "admin",
          action: "Staff account created", detail: "Miguel Santos (EMP-003) added as Cashier."
        },
        {
          id: "ACT-0002", datetime: new Date(now.getTime() - 8 * 3600000).toISOString(),
          userId: alyssa.id, userName: alyssa.fullName, role: "inventory",
          action: "Stock in", detail: "Added 12 L Fresh Milk (supplier delivery)."
        },
        {
          id: "ACT-0003", datetime: new Date(now.getTime() - 3 * 3600000).toISOString(),
          userId: jamie.id, userName: jamie.fullName, role: "cashier",
          action: "Sale completed", detail: "Transaction recorded at the POS."
        }
      ];
      db.meta.counters.activity = 3;

      this.db = db;
      this.corrupt = false;
      this.persist();
      this.persistImages();
      this.writeBackup();
      return db;
    }
  };

  window.Utils = Utils;
  window.Store = Store;
})(window);

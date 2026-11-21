(function (window) {
  "use strict";
  var U = window.Utils, S = window.Store;
  var draftAvatar = null, staffAppearanceDraft = null;
  function activeStaff() { return S.db.users.filter(function (u) { return u.role !== "admin" && u.status === "active"; }); }
  function shift() { return S.db.attendance || (S.db.attendance = []); }
  function duration(row) {
    var end = row.clockOutAt ? new Date(row.clockOutAt).getTime() : (row.clockInAt ? Date.now() : 0);
    var start = new Date(row.clockInAt).getTime();
    return end > start ? (end - start) / 3600000 : 0;
  }
  function status(row) {
    if (!row || !row.clockInAt) return "absent";
    var d = new Date(row.clockInAt);
    var parts = String(S.db.settings.attendanceStartTime || "09:00").split(":");
    var start = (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
    return d.getHours() * 60 + d.getMinutes() > start ? "late" : "present";
  }
  function badge(s) {
    var cls = s === "present" ? "badge-in" : s === "late" ? "badge-low" : s === "working" ? "badge-info" : "badge-out";
    var label = s === "working" ? "Clocked in" : s.charAt(0).toUpperCase() + s.slice(1);
    return '<span class="badge-soft ' + cls + '">' + U.esc(label) + "</span>";
  }
  function staffOf(row) { return S.user(row.userId); }
  function newestOpen(userId) {
    return shift().filter(function (r) { return r.userId === userId && !r.clockOutAt; }).sort(function (a, b) { return b.clockInAt.localeCompare(a.clockInAt); })[0] || null;
  }
  function localInputValue(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function range(date, period) {
    var d = new Date(date + "T12:00:00");
    if (period === "monthly") return [d.getFullYear() + "-" + U.pad(d.getMonth() + 1, 2) + "-01", d.getFullYear() + "-" + U.pad(d.getMonth() + 1, 2) + "-31"];
    if (period === "weekly") { var day = (d.getDay() + 6) % 7; var start = new Date(d); start.setDate(d.getDate() - day); var end = new Date(start); end.setDate(start.getDate() + 6); return [U.ymd(start), U.ymd(end)]; }
    return [date, date];
  }
  function rowMarkup(row, admin) {
    var user = staffOf(row); if (!user) return "";
    var s = status(row);
    var avatar = user.avatarData ? '<img class="avatar" src="' + U.attr(user.avatarData) + '" alt="">' : '<div class="avatar">' + U.esc(U.initials(user.fullName)) + "</div>";
    return '<tr><td><div class="d-flex align-items-center gap-2">' + avatar + '<div><div class="cell-title">' + U.esc(user.fullName) + '</div><div class="cell-sub mono">' + U.esc(user.employeeId || "—") + '</div></div></div></td>' +
      '<td>' + U.esc(U.fmtDate(row.date)) + '</td><td>' + U.esc(U.fmtTime(row.clockInAt)) + '</td><td>' + U.esc(row.clockOutAt ? U.fmtTime(row.clockOutAt) : "—") + '</td><td>' + duration(row).toFixed(2) + ' hrs</td><td>' + badge(s) + (row.clockOutAt ? "" : '<div class="cell-sub">Working now</div>') + '</td>' +
      '<td>' + (admin ? '<button class="btn-icon" title="Correct times" data-att-edit="' + U.attr(row.id) + '"><i class="bi bi-pencil"></i></button> <button class="btn-icon text-danger" title="Delete record" data-att-delete="' + U.attr(row.id) + '"><i class="bi bi-trash"></i></button>' : "—") + '</td></tr>';
  }
  function renderAttendance() {
    var scope = document.querySelector("#" + (window.Auth.user().role === "admin" ? "adminShell" : window.Auth.user().role === "inventory" ? "inventoryShell" : "cashierShell") + " #page-attendance");
    if (!scope) return;
    var user = window.Auth.user(), admin = user.role === "admin", today = U.todayISO();
    var title = scope.querySelector(".page-title"), sub = scope.querySelector(".page-sub");
    if (title) title.textContent = admin ? "Staff attendance" : "My attendance";
    if (sub) sub.textContent = admin ? "See who is working and review shift hours." : "Clock in or out and review your shift history.";
    if (!admin) {
      ["#attSearch", "#attStatus", "[data-att-export]", "[data-att-print]"].forEach(function (sel) { var el = scope.querySelector(sel); if (el) el.classList.add("hidden"); });
    }
    var dateEl = scope.querySelector("#attDate"), periodEl = scope.querySelector("#attPeriod");
    if (dateEl && !dateEl.value) dateEl.value = today;
    var selected = dateEl ? dateEl.value || today : today;
    var period = periodEl ? periodEl.value : "daily", bounds = range(selected, period);
    var list = activeStaff();
    if (admin) {
      var currentRows = shift().filter(function (r) { return r.date === today; });
      scope.querySelector("#attTotal").textContent = list.length;
      var seenToday = {}, presentToday = {}, lateToday = {};
      currentRows.forEach(function (r) { if (!r.clockInAt) return; seenToday[r.userId] = true; if (status(r) === "late") lateToday[r.userId] = true; else presentToday[r.userId] = true; });
      scope.querySelector("#attPresent").textContent = Object.keys(presentToday).length;
      scope.querySelector("#attLate").textContent = Object.keys(lateToday).length;
      scope.querySelector("#attAbsent").textContent = Math.max(0, list.length - Object.keys(seenToday).length);
      scope.querySelector("#attWorking").textContent = shift().filter(function (r) { return !r.clockOutAt; }).length;
      var clockPanel = scope.querySelector(".staff-clock-panel"); if (clockPanel) clockPanel.remove();
      scope.querySelector(".attendance-stats").classList.remove("hidden");
    } else {
      scope.querySelector(".attendance-stats").classList.add("hidden");
      var currentShift = newestOpen(user.id), clockPanel = scope.querySelector(".staff-clock-panel");
      if (!clockPanel) {
        clockPanel = document.createElement("div"); clockPanel.className = "panel staff-clock-panel";
        scope.querySelector(".attendance-toolbar").parentNode.parentNode.insertBefore(clockPanel, scope.querySelector(".attendance-toolbar").parentNode);
      }
      var todayRow = shift().filter(function (r) { return r.userId === user.id && r.date === today && r.clockInAt; })[0];
      var todayStatus = currentShift ? (status(currentShift) === "late" ? "late" : "working") : (todayRow ? status(todayRow) : "absent");
      clockPanel.innerHTML = '<div class="staff-clock-summary"><div><div class="cell-sub">Today\'s attendance</div><div class="staff-clock-status">' + badge(todayStatus) + '</div><div class="cell-sub">' + (currentShift ? "Clocked in at " + U.esc(U.fmtTime(currentShift.clockInAt)) + " · " + duration(currentShift).toFixed(2) + " hours so far" : todayRow ? "You clocked in at " + U.esc(U.fmtTime(todayRow.clockInAt)) + (todayRow.clockOutAt ? " and worked " + duration(todayRow).toFixed(2) + " hours." : "") : "No shift recorded yet today.") + '</div></div><div class="d-flex gap-2 flex-wrap">' + (currentShift ? '<button class="btn btn-outline-gold" data-clock-out><i class="bi bi-box-arrow-right"></i> Clock out</button>' : '<button class="btn btn-gold" data-clock-in><i class="bi bi-box-arrow-in-right"></i> Clock in</button>') + '</div></div>';
    }
    var rows = shift().filter(function (r) { return admin ? true : r.userId === user.id; }).filter(function (r) { return r.date >= bounds[0] && r.date <= bounds[1]; });
    var q = admin && scope.querySelector("#attSearch") ? scope.querySelector("#attSearch").value.trim().toLowerCase() : "";
    var filter = admin && scope.querySelector("#attStatus") ? scope.querySelector("#attStatus").value : "all";
    rows = rows.filter(function (r) { var u = staffOf(r); return u && (!q || (u.fullName + " " + u.employeeId).toLowerCase().indexOf(q) >= 0) && (filter === "all" || (filter === "working" ? !!r.clockInAt && !r.clockOutAt : status(r) === filter)); });
    if (admin && bounds[0] === bounds[1] && selected <= today) {
      var seen = {};
      shift().forEach(function (r) { if (r.date === selected && r.clockInAt) seen[r.userId] = true; });
      list.forEach(function (u) { if (!seen[u.id] && (!q || (u.fullName + " " + u.employeeId).toLowerCase().indexOf(q) >= 0) && (filter === "all" || filter === "absent")) rows.push({ id: "absent-" + u.id, userId: u.id, date: selected, clockInAt: null, clockOutAt: null, absent: true }); });
    }
    rows.sort(function (a, b) { return (b.date + (b.clockInAt || "")).localeCompare(a.date + (a.clockInAt || "")); });
    var body = scope.querySelector("#attendanceRows");
    body.innerHTML = rows.length ? rows.map(function (r) { return r.absent ? '<tr><td><div class="d-flex align-items-center gap-2">' + (staffOf(r).avatarData ? '<img class="avatar" src="' + U.attr(staffOf(r).avatarData) + '" alt="">' : '<div class="avatar">' + U.esc(U.initials(staffOf(r).fullName)) + '</div>') + '<div><div class="cell-title">' + U.esc(staffOf(r).fullName) + '</div><div class="cell-sub">' + U.esc(staffOf(r).employeeId || "—") + '</div></div></div></td><td>' + U.esc(U.fmtDate(r.date)) + '</td><td>—</td><td>—</td><td>0.00 hrs</td><td>' + badge("absent") + '</td><td>—</td></tr>' : rowMarkup(r, admin); }).join("") : '<tr><td colspan="7"><div class="empty-state"><i class="bi bi-calendar-check"></i><p>No attendance records for this period.</p></div></td></tr>';
    var count = scope.querySelector("#attendanceCount"); if (count) count.textContent = rows.length + (rows.length === 1 ? " attendance entry" : " attendance entries");
  }
  function renderProfile() {
    var shell = window.Auth.user().role === "admin" ? "adminShell" : window.Auth.user().role === "inventory" ? "inventoryShell" : "cashierShell";
    var scope = document.querySelector("#" + shell + " #settingsProfilePanel"); if (!scope) return;
    var user = window.Auth.user(), avatar = scope.querySelector("#profileAvatarPreview");
    avatar.innerHTML = (draftAvatar || user.avatarData) ? '<img src="' + U.attr(draftAvatar || user.avatarData) + '" alt="Profile photo">' : U.esc(U.initials(user.fullName));
    scope.querySelector("#profileFullName").textContent = user.fullName;
    scope.querySelector("#profileUsername").textContent = "@" + user.username;
    scope.querySelector("#profileEmail").textContent = user.email || "—";
    scope.querySelector("#profileEmployeeId").textContent = user.employeeId || "—";
    scope.querySelector("#profileRole").textContent = window.Auth.roleLabel(user.role);
    scope.querySelector("#profileStatus").textContent = user.status === "active" ? "Active" : "Inactive";
  }
  function renderStaffSettings() {
    var shell = window.Auth.user().role === "inventory" ? "inventoryShell" : "cashierShell";
    var scope = document.querySelector("#" + shell + " #page-settings"); if (!scope) return;
    var prefs = window.Appearance.get();
    [["theme", "dark"], ["accent", "gold"], ["surface", "classic"], ["sidebar", "expanded"]].forEach(function (pair) {
      var value = staffAppearanceDraft ? staffAppearanceDraft[pair[0]] : prefs[pair[0]];
      scope.querySelectorAll("[data-staff-app-" + pair[0] + "]").forEach(function (btn) { btn.classList.toggle("active", btn.getAttribute("data-staff-app-" + pair[0]) === value); });
    });
  }
  function prepareSettings(shellId) {
    var shell = document.getElementById(shellId), settings = shell && shell.querySelector("#page-settings");
    if (!settings || settings.dataset.tabsPrepared) return;
    var head = settings.querySelector(":scope > .page-head"), profile = shell.querySelector("#page-profile");
    if (!head || !profile) return;
    profile.classList.remove("page"); profile.id = "settingsProfilePanel"; profile.classList.add("settings-tab-panel", "hidden");
    var tabs = document.createElement("div"); tabs.className = "settings-tabs"; tabs.setAttribute("role", "tablist");
    tabs.innerHTML = '<button type="button" role="tab" data-settings-tab="appearance"><i class="bi bi-palette"></i> Appearance & settings</button><button type="button" role="tab" data-settings-tab="profile"><i class="bi bi-person-circle"></i> My profile</button>';
    var appearance = document.createElement("div"); appearance.id = "settingsAppearancePanel";
    Array.prototype.slice.call(settings.children).forEach(function (child) { if (child !== head) appearance.appendChild(child); });
    settings.appendChild(tabs); settings.appendChild(appearance); settings.appendChild(profile);
    settings.insertBefore(tabs, appearance);
    settings.dataset.tabsPrepared = "1";
    tabs.addEventListener("click", function (e) { var btn = e.target.closest("[data-settings-tab]"); if (btn) showSettingsTab(btn.getAttribute("data-settings-tab")); });
  }
  function showSettingsTab(tab) {
    var user = window.Auth.user(); if (!user) return;
    var shellId = user.role === "admin" ? "adminShell" : user.role === "inventory" ? "inventoryShell" : "cashierShell";
    var settings = document.querySelector("#" + shellId + " #page-settings"); if (!settings) return;
    var profile = tab === "profile";
    settings.querySelector("#settingsAppearancePanel").classList.toggle("hidden", profile);
    settings.querySelector("#settingsProfilePanel").classList.toggle("hidden", !profile);
    settings.querySelectorAll("[data-settings-tab]").forEach(function (btn) { var active = btn.getAttribute("data-settings-tab") === (profile ? "profile" : "appearance"); btn.classList.toggle("active", active); btn.setAttribute("aria-selected", active ? "true" : "false"); });
    if (profile) renderProfile();
  }
  function renderSettings() {
    var user = window.Auth.user(); if (!user) return;
    prepareSettings(user.role === "admin" ? "adminShell" : user.role === "inventory" ? "inventoryShell" : "cashierShell");
    if (user.role !== "admin") renderStaffSettings();
    showSettingsTab(window.App.current.indexOf("/profile") >= 0 ? "profile" : "appearance");
  }
  function render() { if (window.App.current.indexOf("attendance") >= 0) renderAttendance(); else if (window.App.current.indexOf("settings") >= 0 || window.App.current.indexOf("/profile") >= 0) renderSettings(); }
  function clockIn() {
    var user = window.Auth.user(); if (!user || user.role === "admin") return;
    if (newestOpen(user.id)) { window.App.toast("You are already clocked in. Clock out before starting another shift.", "warning"); return; }
    var now = new Date(), record = { id: S.nextId("ATT", "attendance", 4), userId: user.id, date: U.todayISO(), clockInAt: now.toISOString(), clockOutAt: null, createdAt: now.toISOString() };
    shift().push(record); S.logActivity("Clocked in", user.fullName + " started a shift."); S.commit();
    window.App.toast("Clock-in recorded at " + U.fmtTime(record.clockInAt) + ". Have a good shift!", "success"); renderAttendance();
  }
  function clockOut() {
    var user = window.Auth.user(), record = user && newestOpen(user.id); if (!record) { window.App.toast("Clock in first to start your shift.", "warning"); return; }
    record.clockOutAt = new Date().toISOString(); S.logActivity("Clocked out", user.fullName + " completed a " + duration(record).toFixed(2) + " hour shift."); S.commit();
    window.App.toast("Clock-out recorded. You worked " + duration(record).toFixed(2) + " hours.", "success"); renderAttendance();
  }
  function exportCSV() {
    var scope = document.querySelector("#adminShell #page-attendance"), rows = [["Staff", "Employee ID", "Date", "Clock In", "Clock Out", "Hours", "Status"]];
    if (!scope) return;
    scope.querySelectorAll("#attendanceRows tr").forEach(function (tr) { var cells = Array.prototype.map.call(tr.querySelectorAll("td"), function (td) { return td.innerText.trim(); }); if (cells.length >= 6) rows.push([cells[0].replace(/\s+/g, " "), cells[0].match(/EMP-[\w-]+/) || "", cells[1], cells[2], cells[3], cells[4], cells[5]]); });
    U.downloadCSV("trippers-attendance-" + U.todayISO() + ".csv", rows);
  }
  function edit(id) {
    var row = shift().filter(function (r) { return r.id === id; })[0]; if (!row || !window.Auth.requireAdmin()) return;
    var inValue = window.prompt("Correct clock-in time (YYYY-MM-DD HH:MM)", localInputValue(row.clockInAt).replace("T", " "));
    if (inValue === null) return;
    var outValue = window.prompt("Correct clock-out time (YYYY-MM-DD HH:MM), or leave blank if still working", row.clockOutAt ? localInputValue(row.clockOutAt).replace("T", " ") : "");
    if (outValue === null) return;
    var toIso = function (v) { if (!v.trim()) return null; var d = new Date(v.trim().replace(" ", "T")); return isNaN(d) ? null : d.toISOString(); };
    var cin = toIso(inValue), cout = toIso(outValue);
    if (!cin || (outValue.trim() && !cout) || (cout && new Date(cout) <= new Date(cin))) { window.App.toast("Enter valid times. Clock-out must be after clock-in.", "danger"); return; }
    row.clockInAt = cin; row.clockOutAt = cout; row.date = U.ymd(cin); S.logActivity("Attendance corrected", "Attendance times corrected for " + ((staffOf(row) || {}).fullName || "a staff member") + "."); S.commit(); window.App.toast("Attendance times corrected.", "success"); renderAttendance();
  }
  function remove(id) {
    var row = shift().filter(function (r) { return r.id === id; })[0]; if (!row || !window.Auth.requireAdmin()) return;
    window.App.confirm({ title: "Delete attendance record?", body: "This shift record will be removed. This cannot be undone.", okText: "Delete record" }).then(function (ok) {
      if (!ok) return; S.logActivity("Attendance deleted", "Attendance record deleted for " + ((staffOf(row) || {}).fullName || "a staff member") + "."); S.db.attendance = shift().filter(function (r) { return r.id !== id; }); S.commit(); window.App.toast("Attendance record deleted.", "success"); renderAttendance();
    });
  }
  function bind() {
    ["adminShell", "inventoryShell", "cashierShell"].forEach(prepareSettings);
    document.addEventListener("input", function (e) { if (e.target.matches("#attSearch")) renderAttendance(); });
    document.addEventListener("change", function (e) { if (e.target.matches("#attDate,#attPeriod,#attStatus")) renderAttendance(); if (e.target.matches("#profileAvatarInput")) { var f = e.target.files && e.target.files[0]; if (f) U.readImage(f, 360, 0.78).then(function (url) { draftAvatar = url; renderProfile(); }).catch(function (err) { window.App.toast(err.message, "danger"); }); } });
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-reset-intro]")) {
        var resetOk = window.BrandIntro && window.BrandIntro.reset && window.BrandIntro.reset();
        window.App.toast(resetOk ? "The intro will play the next time you open TRIPPERS." : "Could not reset the intro setting in browser storage.", resetOk ? "success" : "danger");
        return;
      }
      var prefButton = e.target.closest("[data-staff-app-theme],[data-staff-app-accent],[data-staff-app-surface],[data-staff-app-sidebar]");
      if (prefButton) {
        var shell = window.Auth.user().role === "inventory" ? "inventoryShell" : "cashierShell";
        var settings = document.querySelector("#" + shell + " #page-settings"), attr = Array.prototype.slice.call(prefButton.attributes).filter(function (a) { return a.name.indexOf("data-staff-app-") === 0; })[0];
        if (!staffAppearanceDraft) staffAppearanceDraft = window.Appearance.get();
        var key = attr.name.replace("data-staff-app-", ""); staffAppearanceDraft[key] = attr.value;
        settings.querySelectorAll("[data-staff-app-" + key + "]").forEach(function (b) { b.classList.toggle("active", b === prefButton); });
        window.Appearance.apply(staffAppearanceDraft); return;
      }
      if (e.target.closest("[data-staff-app-save]")) { if (staffAppearanceDraft && window.Appearance.save(staffAppearanceDraft)) { staffAppearanceDraft = null; renderStaffSettings(); window.App.toast("Appearance saved to your account.", "success"); } return; }
      if (e.target.closest("[data-staff-app-reset]")) { staffAppearanceDraft = null; window.Appearance.reset(); renderStaffSettings(); window.App.toast("Appearance reset to TRIPPERS defaults.", "success"); return; }
      var settingsTab = e.target.closest("[data-settings-tab]");
      if (settingsTab) { showSettingsTab(settingsTab.getAttribute("data-settings-tab")); return; }
      if (e.target.closest("[data-clock-in]")) clockIn();
      else if (e.target.closest("[data-clock-out]")) clockOut();
      else if (e.target.closest("[data-att-edit]")) edit(e.target.closest("[data-att-edit]").getAttribute("data-att-edit"));
      else if (e.target.closest("[data-att-delete]")) remove(e.target.closest("[data-att-delete]").getAttribute("data-att-delete"));
      else if (e.target.closest("[data-att-export]")) exportCSV();
      else if (e.target.closest("[data-att-print]")) window.print();
      else if (e.target.closest("#profileAvatarSave")) { var u = window.Auth.user(); if (!u) return; u.avatarData = draftAvatar === null ? (u.avatarData || null) : draftAvatar; S.commit(); draftAvatar = null; window.App.refreshShell(); renderProfile(); window.App.toast("Profile photo saved.", "success"); }
      else if (e.target.closest("#profileAvatarRemove")) { var current = window.Auth.user(); if (!current) return; draftAvatar = ""; current.avatarData = null; S.commit(); window.App.refreshShell(); renderProfile(); window.App.toast("Profile photo removed.", "success"); }
      else if (e.target.closest("#profileChangePassword")) window.App.openChangePassword();
    });
    window.setInterval(function () {
      if (window.App && window.App.current && window.App.current.indexOf("attendance") >= 0 && document.visibilityState === "visible") renderAttendance();
    }, 30000);
  }
  window.AttendancePage = { render: render, renderAttendance: renderAttendance, renderSettings: renderSettings, showSettingsTab: showSettingsTab };
  window.AttendancePage.cancelSettings = function () { if (staffAppearanceDraft) { staffAppearanceDraft = null; window.Appearance.apply(window.Appearance.get()); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();
})(window);

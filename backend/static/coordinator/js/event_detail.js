(function () {
  "use strict";

  var eventId = window.EVENT_ID;
  var CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]') ? document.querySelector('meta[name="csrf-token"]').content : "";
  var allRegistrations = [];

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({}, options.headers, { "X-CSRFToken": CSRF_TOKEN });
    return fetch(path, options).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.error || "Request failed (" + res.status + ")");
        });
      }
      return res.json();
    });
  }

  function loadData() {
    api("/coordinator/api/events/" + encodeURIComponent(eventId) + "/participants")
      .then(function (data) {
        if (data.attendance_stats) {
          document.getElementById("stat-confirmed").textContent = data.attendance_stats.confirmed || 0;
          document.getElementById("stat-present").textContent = data.attendance_stats.present || 0;
          document.getElementById("stat-remaining").textContent = data.attendance_stats.remaining || 0;
        }
        allRegistrations = data.registrations || [];
        renderTable();
      })
      .catch(function (err) {
        console.error("Failed to load participant data:", err);
      });
  }

  function renderTable() {
    var tbody = document.querySelector("#coordinator-participants-table tbody");
    if (!tbody) return;

    var searchQuery = (document.getElementById("part-search").value || "").toLowerCase().strip ? (document.getElementById("part-search").value || "").toLowerCase().strip() : (document.getElementById("part-search").value || "").toLowerCase();
    var statusFilter = document.getElementById("part-status-filter").value;

    var filtered = allRegistrations.filter(function (r) {
      if (statusFilter === "present" && !r.checked_in) return false;
      if (statusFilter === "remaining" && r.checked_in) return false;

      if (!searchQuery) return true;

      var textParts = [r.team_name, r.id, r.ticket_token, r.status, r.checked_in_by];
      (r.members || []).forEach(function (m) {
        textParts.push(m.name, m.email, m.phone, m.college, m.cybercarnival_token, m.register_number);
      });
      var haystack = textParts.filter(Boolean).join(" ").toLowerCase();
      return haystack.indexOf(searchQuery) !== -1;
    });

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty-state">No matching participant registrations found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(function (r) {
      var leader = (r.members || []).filter(function (m) { return m.is_leader; })[0] || (r.members || [])[0] || {};
      var tokenDisplay = r.ticket_token ? '<code>' + escapeHtml(r.ticket_token.substring(0, 10)) + '...</code>' : (leader.cybercarnival_token ? '<code>' + escapeHtml(leader.cybercarnival_token) + '</code>' : '—');

      var participantName = escapeHtml(leader.name || "Participant");
      if (r.team_name) {
        participantName = '<strong>' + escapeHtml(r.team_name) + '</strong><br/><span style="font-size:12px; color:var(--muted);">Leader: ' + escapeHtml(leader.name || "") + '</span>';
      }

      var contactInfo = escapeHtml(leader.email || "—") + (leader.phone ? '<br/><span style="font-size:11px; color:var(--muted);">' + escapeHtml(leader.phone) + '</span>' : '');
      var collegeInfo = escapeHtml(leader.college || "SRM Ramapuram");

      var statusBadge = r.checked_in
        ? '<span class="status-pill status-verified" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:bold;">🟢 PRESENT</span>'
        : '<span class="status-pill" style="background:rgba(255,255,255,0.05); color:var(--muted);">⚪ NOT ATTENDED</span>';

      var checkInTime = r.checked_in_at ? escapeHtml(r.checked_in_at) : '—';
      var checkedInBy = r.checked_in_by ? escapeHtml(r.checked_in_by) : '—';

      return '<tr>' +
        '<td>' + tokenDisplay + '</td>' +
        '<td>' + participantName + '</td>' +
        '<td>' + contactInfo + '</td>' +
        '<td>' + collegeInfo + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td style="font-size:12px;">' + checkInTime + '</td>' +
        '<td style="font-size:12px; color:var(--muted);">' + checkedInBy + '</td>' +
      '</tr>';
    }).join("");
  }

  document.getElementById("part-search").addEventListener("input", renderTable);
  document.getElementById("part-status-filter").addEventListener("change", renderTable);

  loadData();
  // Poll every 5 seconds for live attendance counter updates
  setInterval(loadData, 5000);
})();

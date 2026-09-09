(function () {
  "use strict";

  var eventId = window.EVENT_ID;
  if (!eventId) return;

  var CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]') ? document.querySelector('meta[name="csrf-token"]').content : "";

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

  function loadSingleEventData() {
    api("/coordinator/api/events/" + encodeURIComponent(eventId) + "/participants")
      .then(function (data) {
        if (data.attendance_stats) {
          document.getElementById("stat-confirmed").textContent = data.attendance_stats.confirmed || 0;
          document.getElementById("stat-present").textContent = data.attendance_stats.present || 0;
          document.getElementById("stat-remaining").textContent = data.attendance_stats.remaining || 0;
        }
        renderRoster(data.registrations || []);
      })
      .catch(function (err) {
        console.error("Failed to load single event details:", err);
      });
  }

  function renderRoster(registrations) {
    var tbody = document.querySelector("#single-event-participants-table tbody");
    if (!tbody) return;

    if (!registrations || !registrations.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty-state">No registrations found for this event.</td></tr>';
      return;
    }

    tbody.innerHTML = registrations.map(function (r) {
      var leader = (r.members || []).filter(function (m) { return m.is_leader; })[0] || (r.members || [])[0] || {};
      var tokenDisplay = r.ticket_token ? '<code>' + escapeHtml(r.ticket_token.substring(0, 10)) + '...</code>' : (leader.cybercarnival_token ? '<code>' + escapeHtml(leader.cybercarnival_token) + '</code>' : '—');

      var participantName = escapeHtml(leader.name || "Participant");
      if (r.team_name) {
        participantName = '<strong>' + escapeHtml(r.team_name) + '</strong><br/><span style="font-size:12px; color:var(--muted);">Leader: ' + escapeHtml(leader.name || "") + '</span>';
      }

      var statusBadge = r.checked_in
        ? '<span class="status-pill status-verified" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:bold;">🟢 PRESENT</span>'
        : '<span class="status-pill" style="background:rgba(255,255,255,0.05); color:var(--muted);">⚪ NOT ATTENDED</span>';

      return '<tr>' +
        '<td>' + tokenDisplay + '</td>' +
        '<td>' + participantName + '</td>' +
        '<td>' + escapeHtml(leader.email || "—") + '</td>' +
        '<td>' + escapeHtml(leader.college || "SRM Ramapuram") + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td style="font-size:12px;">' + (r.checked_in_at ? escapeHtml(r.checked_in_at) : '—') + '</td>' +
      '</tr>';
    }).join("");
  }

  loadSingleEventData();
  // Poll every 5 seconds for live attendance counter updates
  setInterval(loadSingleEventData, 5000);
})();

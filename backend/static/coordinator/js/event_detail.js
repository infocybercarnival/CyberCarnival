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

    var searchVal = (document.getElementById("part-search").value || "").trim().toLowerCase();
    var attendanceFilter = document.getElementById("part-status-filter") ? document.getElementById("part-status-filter").value : "";
    var regFilter = document.getElementById("part-reg-filter") ? document.getElementById("part-reg-filter").value : "";

    var filtered = allRegistrations.filter(function (r) {
      if (attendanceFilter === "present" && !r.checked_in) return false;
      if (attendanceFilter === "remaining" && r.checked_in) return false;

      if (regFilter && r.status !== regFilter) return false;

      if (!searchVal) return true;

      var textParts = [r.team_name, r.id, r.ticket_token, r.status, r.transaction_id, r.checked_in_by];
      (r.members || []).forEach(function (m) {
        textParts.push(m.name, m.email, m.phone, m.college, m.cybercarnival_token, m.register_number);
      });
      var haystack = textParts.filter(Boolean).join(" ").toLowerCase();
      return haystack.indexOf(searchVal) !== -1;
    });

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty-state" style="padding: 28px; text-align: center; color: var(--muted);">No matching participant registrations found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(function (r, index) {
      var leader = (r.members || []).filter(function (m) { return m.is_leader; })[0] || (r.members || [])[0] || {};
      
      var regIdShort = r.id ? r.id.substring(0, 8) : '—';
      var idDisplay = '<div><code style="font-size:11px; color:var(--primary);">' + escapeHtml(regIdShort) + '</code></div>';
      if (r.ticket_token) {
        idDisplay += '<div style="font-size:10px; color:var(--muted);">T: <code>' + escapeHtml(r.ticket_token.substring(0, 8)) + '...</code></div>';
      }

      var participantName = escapeHtml(leader.name || "Participant");
      if (r.team_name) {
        var memberCount = (r.members || []).length;
        participantName = '<strong style="color:#ffffff;">' + escapeHtml(r.team_name) + '</strong> <span style="font-size:10px; background:rgba(168,85,247,0.2); color:#c084fc; padding:2px 6px; border-radius:4px; font-weight:bold;">' + memberCount + ' MEMBERS</span><br/><span style="font-size:12px; color:var(--muted);">Leader: ' + escapeHtml(leader.name || "") + '</span>';
      }

      var contactInfo = escapeHtml(leader.email || "—") + (leader.phone ? '<br/><span style="font-size:11px; color:var(--muted);">' + escapeHtml(leader.phone) + '</span>' : '');
      var collegeInfo = escapeHtml(leader.college || "SRM Ramapuram");

      var regStatusBadge = r.status === "confirmed"
        ? '<span class="status-pill status-verified" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:bold; font-size:11px;">CONFIRMED</span>'
        : '<span class="status-pill" style="background:rgba(251,191,36,0.15); color:#fbbf24; font-weight:bold; font-size:11px;">PENDING VERIFY</span>';

      var attendanceBadge = r.checked_in
        ? '<span class="status-pill status-verified" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:bold; font-size:11px;">🟢 PRESENT</span>'
        : '<span class="status-pill" style="background:rgba(255,255,255,0.05); color:var(--muted); font-size:11px;">⚪ NOT ATTENDED</span>';

      var checkInTime = r.checked_in_at ? escapeHtml(r.checked_in_at) : '—';

      return '<tr>' +
        '<td>' + idDisplay + '</td>' +
        '<td>' + participantName + '</td>' +
        '<td>' + contactInfo + '</td>' +
        '<td>' + collegeInfo + '</td>' +
        '<td>' + regStatusBadge + '</td>' +
        '<td>' + attendanceBadge + '</td>' +
        '<td style="font-size:12px;">' + checkInTime + '</td>' +
        '<td><button type="button" class="btn-ghost btn-view-detail" data-index="' + index + '" style="font-size:11px; padding:4px 10px; border:1px solid rgba(168,85,247,0.4); color:#c084fc;">VIEW DETAILS</button></td>' +
      '</tr>';
    }).join("");

    // Bind VIEW DETAILS buttons
    var detailBtns = tbody.querySelectorAll(".btn-view-detail");
    for (var i = 0; i < detailBtns.length; i++) {
      detailBtns[i].addEventListener("click", function (e) {
        var idx = parseInt(this.getAttribute("data-index"), 10);
        if (!isNaN(idx) && filtered[idx]) {
          showRegistrationDetailsModal(filtered[idx]);
        }
      });
    }
  }

  function showRegistrationDetailsModal(reg) {
    var backdrop = document.getElementById("registration-modal-backdrop");
    var content = document.getElementById("reg-modal-content");
    if (!backdrop || !content) return;

    var modeLabel = reg.team_name ? "Team Registration (" + (reg.members || []).length + " Members)" : "Individual Registration";
    var leader = (reg.members || []).filter(function (m) { return m.is_leader; })[0] || (reg.members || [])[0] || {};
    var amountFormatted = reg.payment_amount != null ? "₹" + (reg.payment_amount / 100).toFixed(2).replace(/\.00$/, "") : "Free / N/A";

    var membersHTML = (reg.members || []).map(function (m, idx) {
      return '<tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">' +
        '<td style="padding:8px 10px; font-size:12px;">' +
          (m.is_leader ? '<span style="background:#8b5cf6; color:#fff; font-size:9px; padding:2px 6px; border-radius:4px; font-weight:bold; margin-right:6px;">LEADER</span>' : '<span style="color:var(--muted); font-size:11px; margin-right:6px;">#' + (idx+1) + '</span>') +
          '<strong style="color:#ffffff;">' + escapeHtml(m.name || "—") + '</strong>' +
        '</td>' +
        '<td style="padding:8px 10px; font-size:12px;">' + escapeHtml(m.email || "—") + '</td>' +
        '<td style="padding:8px 10px; font-size:12px;">' + escapeHtml(m.phone || "—") + '</td>' +
        '<td style="padding:8px 10px; font-size:12px;">' + escapeHtml(m.college || "—") + '</td>' +
        '<td style="padding:8px 10px; font-size:11px; font-family:monospace; color:var(--muted);">' + escapeHtml(m.register_number || "—") + '</td>' +
        '<td style="padding:8px 10px; font-size:11px; font-family:monospace; color:var(--primary);">' + escapeHtml(m.cybercarnival_token || "—") + '</td>' +
      '</tr>';
    }).join("");

    content.innerHTML = 
      '<div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 14px; margin-bottom: 16px;">' +
        '<div style="font-size: 11px; font-weight: bold; color: var(--primary); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">' + escapeHtml(modeLabel) + '</div>' +
        '<h3 style="margin: 0 0 6px 0; color: #ffffff; font-size: 20px;">' + escapeHtml(reg.team_name || leader.name || "Registration Details") + '</h3>' +
        '<div style="font-size: 12px; color: var(--muted); font-family: monospace;">Registration ID: <strong style="color:#ffffff;">' + escapeHtml(reg.id) + '</strong></div>' +
      '</div>' +

      '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px; background: rgba(255,255,255,0.02); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">' +
        '<div><div style="font-size:10px; color:var(--muted); text-transform:uppercase;">Registration Status</div><div style="font-weight:bold; font-size:13px; color:' + (reg.status === "confirmed" ? "#10b981" : "#fbbf24") + ';">' + escapeHtml((reg.status || "").toUpperCase()) + '</div></div>' +
        '<div><div style="font-size:10px; color:var(--muted); text-transform:uppercase;">Check-in Status</div><div style="font-weight:bold; font-size:13px; color:' + (reg.checked_in ? "#10b981" : "#94a3b8") + ';">' + (reg.checked_in ? "🟢 PRESENT" : "⚪ NOT CHECKED IN") + '</div></div>' +
        '<div><div style="font-size:10px; color:var(--muted); text-transform:uppercase;">Transaction ID</div><div style="font-family:monospace; font-size:12px; color:#ffffff;">' + escapeHtml(reg.transaction_id || "N/A (Free/Manual)") + '</div></div>' +
        '<div><div style="font-size:10px; color:var(--muted); text-transform:uppercase;">Payment Amount</div><div style="font-size:13px; font-weight:bold; color:#ffffff;">' + escapeHtml(amountFormatted) + '</div></div>' +
        '<div><div style="font-size:10px; color:var(--muted); text-transform:uppercase;">Checked-in At</div><div style="font-size:12px; color:var(--muted);">' + escapeHtml(reg.checked_in_at || "—") + '</div></div>' +
        '<div><div style="font-size:10px; color:var(--muted); text-transform:uppercase;">Checked-in By</div><div style="font-size:12px; color:var(--muted);">' + escapeHtml(reg.checked_in_by || "—") + '</div></div>' +
      '</div>' +

      '<h4 style="font-size: 13px; color: var(--primary); text-transform: uppercase; letter-spacing: 0.08em; margin: 16px 0 10px 0;">Participants & Roster (' + (reg.members || []).length + ')</h4>' +
      '<div style="overflow-x: auto; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;">' +
        '<table class="table" style="width:100%; font-size:12px;">' +
          '<thead>' +
            '<tr>' +
              '<th style="padding:8px 10px;">NAME</th>' +
              '<th style="padding:8px 10px;">EMAIL</th>' +
              '<th style="padding:8px 10px;">PHONE</th>' +
              '<th style="padding:8px 10px;">COLLEGE</th>' +
              '<th style="padding:8px 10px;">REG NO</th>' +
              '<th style="padding:8px 10px;">TOKEN</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + membersHTML + '</tbody>' +
        '</table>' +
      '</div>' +

      (reg.payment_proof_url ? '<div style="margin-top: 18px; text-align: right;"><a href="' + escapeHtml(reg.payment_proof_url) + '" target="_blank" class="btn-ghost" style="font-size:12px; color:#c084fc; border:1px solid rgba(192,132,252,0.4);">📷 View Uploaded Payment Proof</a></div>' : '');

    backdrop.style.display = "flex";
  }

  function closeRegistrationModal() {
    var backdrop = document.getElementById("registration-modal-backdrop");
    if (backdrop) backdrop.style.display = "none";
  }

  var closeBtn = document.getElementById("reg-modal-close");
  if (closeBtn) closeBtn.addEventListener("click", closeRegistrationModal);

  var backdrop = document.getElementById("registration-modal-backdrop");
  if (backdrop) {
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeRegistrationModal();
    });
  }

  if (document.getElementById("part-search")) {
    document.getElementById("part-search").addEventListener("input", renderTable);
  }
  if (document.getElementById("part-status-filter")) {
    document.getElementById("part-status-filter").addEventListener("change", renderTable);
  }
  if (document.getElementById("part-reg-filter")) {
    document.getElementById("part-reg-filter").addEventListener("change", renderTable);
  }

  loadData();
  // Poll every 5 seconds for live attendance counter updates
  setInterval(loadData, 5000);
})();

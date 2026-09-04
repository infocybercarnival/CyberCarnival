(function () {
  "use strict";

  var CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]').content;
  var state = {}; // eventId -> { event, registrations }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({}, options.headers, { "X-CSRFToken": CSRF_TOKEN });
    if (options.body) options.headers["Content-Type"] = "application/json";
    return fetch(path, options).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.error || "request failed (" + res.status + ")");
        });
      }
      return res.json();
    });
  }

  // ---------- toasts (replaces alert()) ----------
  function toast(message, isError) {
    var stack = document.getElementById("toast-stack");
    var el = document.createElement("div");
    el.className = "toast" + (isError ? " toast-error" : "");
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      el.style.transition = "opacity 0.25s ease";
      setTimeout(function () { el.remove(); }, 250);
    }, 3200);
  }

  function showError(err) { toast(err.message || "Something went wrong.", true); }

  // ---------- rendering ----------
  function relativeTime(ts) {
    var diffMin = Math.round((Date.now() / 1000 - ts) / 60);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return diffMin + "m ago";
    var diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return diffHr + "h ago";
    return Math.round(diffHr / 24) + "d ago";
  }


  function memberPayload(m) { return encodeURIComponent(JSON.stringify(m)); }

  function showMemberDetails(m) {
    var existing = document.getElementById("member-detail-modal");
    if (existing) existing.remove();
    var modal = document.createElement("div");
    modal.id = "member-detail-modal";
    modal.className = "member-modal-backdrop";
    modal.innerHTML = '<div class="member-modal-card">' +
      '<button type="button" class="member-modal-close" aria-label="Close">×</button>' +
      '<h3>Participant details</h3>' +
      '<dl>' +
      '<dt>Name</dt><dd>' + escapeHtml(m.name || "—") + '</dd>' +
      '<dt>CyberCarnival token</dt><dd><code>' + escapeHtml(m.cybercarnival_token || "—") + '</code></dd>' +
      '<dt>Register number</dt><dd>' + escapeHtml(m.register_number || "—") + '</dd>' +
      '<dt>Email</dt><dd>' + escapeHtml(m.email || "—") + '</dd>' +
      '<dt>Phone</dt><dd>' + escapeHtml(m.phone || "—") + '</dd>' +
      '<dt>College</dt><dd>' + escapeHtml(m.college || "—") + '</dd>' +
      '<dt>Role</dt><dd>' + (m.is_leader ? 'Team leader' : 'Team member') + '</dd>' +
      '</dl></div>';
    document.body.appendChild(modal);
    function close() { modal.remove(); }
    modal.querySelector('.member-modal-close').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  }

  function memberSearchText(m) {
    return [m.name, m.email, m.phone, m.college, m.cybercarnival_token].filter(Boolean).join(" ").toLowerCase();
  }

  function registrationSearchText(r) {
    var base = r.team_name || "";
    return (base + " " + r.members.map(memberSearchText).join(" ")).toLowerCase();
  }

  function renderRows(registrations) {
    return registrations.map(function (r) {
      var memberHtml = r.members.map(function (m) {
        var contact = [m.email, m.phone].filter(Boolean).join(" · ");
        return (
          '<div class="member-row">' +
            '<div>' +
              '<div class="member-name"><button type="button" class="member-detail-btn" data-member="' + escapeHtml(memberPayload(m)) + '">' + escapeHtml(m.name) + '</button>' +
                (m.is_leader ? '<span class="leader-tag">Leader</span>' : '') +
              '</div>' +
              '<div class="member-contact">' + escapeHtml(contact) + (m.college ? ' · ' + escapeHtml(m.college) : '') + '</div>' +
              '<div class="token-chip">' + escapeHtml(m.cybercarnival_token) + '</div>' +
            '</div>' +
            '<button class="copy-btn" data-copy="' + escapeHtml([m.name, m.phone, m.email].filter(Boolean).join(" — ")) + '">Copy</button>' +
          '</div>'
        );
      }).join("");

      return (
        "<tr>" +
          "<td>" + escapeHtml(r.team_name || "\u2014") + "</td>" +
          "<td>" + memberHtml + "</td>" +
          "<td>" + (r.transaction_id ? '<div class="token-chip">' + escapeHtml(r.transaction_id) + '</div><div class="member-contact">₹' + ((r.payment_amount || 0)/100).toFixed(2) + '</div>' : 'Free') + "</td>" +
          "<td>" + escapeHtml(r.status) + (r.status === 'pending_verification' ? '<br><button class="copy-btn" data-pay-approve="' + r.id + '">Verify</button> <button class="copy-btn" data-pay-reject="' + r.id + '">Reject</button>' : '') + "</td>" +
          "<td>" + relativeTime(r.registered_at) + "<br/><span class=\"member-contact\">" + new Date(r.registered_at * 1000).toLocaleString() + "</span></td>" +
        "</tr>"
      );
    }).join("");
  }

  function renderEvent(event, registrations) {
    var seatsKnown = event.max_teams != null;
    var pct = seatsKnown ? Math.min(100, Math.round((event.teams_registered / event.max_teams) * 100)) : 0;
    var isFull = seatsKnown && event.teams_registered >= event.max_teams;

    var totalParticipants = registrations.reduce(function (sum, r) { return sum + r.members.length; }, 0);

    var statsHtml =
      '<div class="stats-row">' +
        '<div class="stat"><div class="num">' + registrations.length + '</div><div class="label">Teams registered</div></div>' +
        '<div class="stat"><div class="num">' + totalParticipants + '</div><div class="label">Total participants</div></div>' +
        '<div class="stat">' +
          '<div class="num">' + (seatsKnown ? event.seats_available : '\u221e') + '</div>' +
          '<div class="label">Seats left' + (seatsKnown ? ' of ' + event.max_teams : ' (unlimited)') + '</div>' +
          (seatsKnown
            ? '<div class="capacity-bar"><div class="capacity-bar-fill' + (isFull ? ' capacity-full' : '') + '" style="width:' + pct + '%"></div></div>'
            : '') +
        '</div>' +
      '</div>';

    var badge = event.registration_open
      ? '<span class="badge badge-open">Registration open</span>'
      : '<span class="badge badge-closed">Registration closed</span>';

    var rowsHtml = registrations.length
      ? renderRows(registrations)
      : '';

    var tableHtml = registrations.length
      ? '<div class="reg-table-wrap"><table class="reg-table" data-event-id="' + event.id + '"><thead><tr><th>Team</th><th>Members</th><th>Payment</th><th>Status</th><th>Registered</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
      : '<div class="empty-state"><div class="icon">\u25CB</div>No registrations yet — check back once people start signing up.</div>';

    return (
      '<section class="event-card" data-event-id="' + event.id + '">' +
        '<div class="event-card-head">' +
          '<div>' +
            '<h3>' + escapeHtml(event.name) + '</h3>' +
            badge +
          '</div>' +
          '<div class="event-actions">' +
            '<a class="btn-outline" href="/coordinator/api/events/' + event.id + '/export.csv">Export CSV</a>' +
            '<button class="' + (event.registration_open ? 'btn-danger' : 'btn-primary') + '" data-action="' + (event.registration_open ? 'close' : 'reopen') + '" data-event-id="' + event.id + '">' +
              (event.registration_open ? 'Close registration' : 'Reopen registration') +
            '</button>' +
          '</div>' +
        '</div>' +
        statsHtml +
        (registrations.length
          ? '<div class="event-toolbar">' +
              '<div class="search-box">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>' +
                '<input type="text" placeholder="Search team, name, email, phone, or token..." data-search-for="' + event.id + '" />' +
              '</div>' +
              '<span class="search-count" data-count-for="' + event.id + '">' + registrations.length + ' team' + (registrations.length === 1 ? '' : 's') + '</span>' +
            '</div>'
          : '') +
        tableHtml +
      '</section>'
    );
  }

  function renderAll() {
    var ids = Object.keys(state);
    if (!ids.length) {
      document.getElementById("events-list").innerHTML =
        '<div class="empty-state"><div class="icon">\u2014</div>No events assigned to your account yet. Contact the admin.</div>';
      return;
    }
    document.getElementById("events-list").innerHTML = ids.map(function (id) {
      return renderEvent(state[id].event, state[id].registrations);
    }).join("");
  }

  function loadAll() {
    api("/coordinator/api/my-events").then(function (events) {
      if (!events.length) {
        state = {};
        renderAll();
        return;
      }
      Promise.all(
        events.map(function (e) { return api("/coordinator/api/events/" + e.id + "/registrations"); })
      ).then(function (results) {
        state = {};
        results.forEach(function (r) { state[r.event.id] = r; });
        renderAll();
      }).catch(showError);
    }).catch(showError);
  }

  // ---------- interactions ----------
  document.getElementById("events-list").addEventListener("click", function (e) {
    var memberBtn = e.target.closest(".member-detail-btn");
    if (memberBtn) {
      try { showMemberDetails(JSON.parse(decodeURIComponent(memberBtn.dataset.member))); } catch (_) {}
      return;
    }
    var payBtn = e.target.closest("[data-pay-approve], [data-pay-reject]");
    if (payBtn) {
      var registrationId = payBtn.dataset.payApprove || payBtn.dataset.payReject;
      var approved = !!payBtn.dataset.payApprove;
      var rejectionReason = null;
      if (!approved) {
        rejectionReason = prompt("Enter the rejection reason for this payment submission:");
        if (!rejectionReason || !rejectionReason.trim()) {
          toast("Rejection cancelled: a valid reason is required.", true);
          return;
        }
      } else {
        if (!confirm("Confirm this payment after checking the UPI/bank statement?")) return;
      }
      api("/coordinator/api/registrations/" + registrationId + "/payment-verification", {
        method: "POST", body: JSON.stringify({ approved: approved, rejection_reason: rejectionReason })
      }).then(function () { toast(approved ? "Payment verified." : "Payment rejected."); loadAll(); }).catch(showError);
      return;
    }

    var closeBtn = e.target.closest("button[data-action]");
    if (closeBtn) {
      var eventId = closeBtn.dataset.eventId;
      var action = closeBtn.dataset.action;
      var confirmMsg = action === "close"
        ? "Close registration for this event? Participants will no longer be able to sign up."
        : "Reopen registration for this event?";
      if (!confirm(confirmMsg)) return;

      closeBtn.disabled = true;
      api("/coordinator/api/events/" + eventId + "/" + action, { method: "POST" })
        .then(function () {
          toast(action === "close" ? "Registration closed." : "Registration reopened.");
          loadAll();
        })
        .catch(function (err) { closeBtn.disabled = false; showError(err); });
      return;
    }

    var copyBtn = e.target.closest(".copy-btn");
    if (copyBtn) {
      var text = copyBtn.dataset.copy;
      navigator.clipboard.writeText(text).then(function () {
        var original = copyBtn.textContent;
        copyBtn.textContent = "Copied";
        copyBtn.classList.add("copied");
        setTimeout(function () { copyBtn.textContent = original; copyBtn.classList.remove("copied"); }, 1500);
      }).catch(function () { toast("Could not copy — try selecting the text manually.", true); });
    }
  });

  document.getElementById("events-list").addEventListener("input", function (e) {
    var input = e.target.closest("input[data-search-for]");
    if (!input) return;
    var eventId = input.dataset.searchFor;
    var query = input.value.trim().toLowerCase();
    var entry = state[eventId];
    if (!entry) return;

    var table = document.querySelector('.reg-table[data-event-id="' + eventId + '"]');
    if (!table) return;
    var rows = table.querySelectorAll("tbody tr");
    var visibleCount = 0;

    entry.registrations.forEach(function (r, i) {
      var matches = !query || registrationSearchText(r).indexOf(query) !== -1;
      if (rows[i]) rows[i].style.display = matches ? "" : "none";
      if (matches) visibleCount++;
    });

    var countEl = document.querySelector('[data-count-for="' + eventId + '"]');
    if (countEl) {
      countEl.textContent = query
        ? visibleCount + " of " + entry.registrations.length + " team" + (entry.registrations.length === 1 ? "" : "s")
        : entry.registrations.length + " team" + (entry.registrations.length === 1 ? "" : "s");
    }
  });

  loadAll();
})();

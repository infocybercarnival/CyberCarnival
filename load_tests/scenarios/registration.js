import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, HEADERS } from '../config.js';

export function runRegistrationScenario(events) {
  const vuId = __VU;
  const iterId = __ITER;
  const uniqueId = `loadtest_reg_${vuId}_${iterId}_${Date.now()}`;
  const email = `${uniqueId}@example.com`;

  // 1. Establish session via environment-gated loadtest session endpoint
  const sessionRes = http.post(
    `${BASE_URL}/api/auth/loadtest-session`,
    JSON.stringify({ email: email }),
    { headers: HEADERS }
  );

  check(sessionRes, {
    'session created (200)': (r) => r.status === 200,
  });

  if (sessionRes.status !== 200) {
    return;
  }

  // Extract session cookie from response headers
  const cookies = sessionRes.cookies;

  // 2. Select event dynamically (cycling through available events)
  const eventList = (events && events.length > 0) ? events : [{ id: 'default_event', category: 'TECHNICAL', max_team_size: 1 }];
  const targetEvent = eventList[(vuId + iterId) % eventList.length];
  const isTeam = (targetEvent.max_team_size && targetEvent.max_team_size > 1);

  // 3. Prepare registration payload matching actual schema
  const payload = {
    event_id: targetEvent.id,
    participant_mode: isTeam ? 'team' : 'individual',
    team_name: isTeam ? `Team LoadTest ${vuId}_${iterId}` : null,
  };

  const regRes = http.post(
    `${BASE_URL}/api/registrations`,
    JSON.stringify(payload),
    {
      headers: HEADERS,
      cookies: cookies,
    }
  );

  check(regRes, {
    'registration response received': (r) => r.status === 201 || r.status === 409 || r.status === 422,
    'registration successful (201)': (r) => r.status === 201,
  });

  sleep(1);
}

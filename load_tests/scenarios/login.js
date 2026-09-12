import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, HEADERS } from '../config.js';

export function runLoginScenario() {
  const vuId = __VU;
  const iterId = __ITER;
  const uniqueId = `loadtest_login_${vuId}_${iterId}`;
  const email = `${uniqueId}@example.com`;

  // 1. Session Login
  const loginRes = http.post(
    `${BASE_URL}/api/auth/loadtest-session`,
    JSON.stringify({ email: email }),
    { headers: HEADERS }
  );

  check(loginRes, {
    'login successful (200)': (r) => r.status === 200,
  });

  if (loginRes.status === 200) {
    const cookies = loginRes.cookies;

    // 2. Profile Verification / Me request
    const meRes = http.get(`${BASE_URL}/api/auth/me`, {
      headers: HEADERS,
      cookies: cookies,
    });

    check(meRes, {
      'profile fetched (200)': (r) => r.status === 200,
      'no session crossover': (r) => {
        if (r.status !== 200) return false;
        const body = JSON.parse(r.body);
        return body.email === email;
      },
    });
  }

  sleep(1);
}

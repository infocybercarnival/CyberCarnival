import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, HEADERS } from '../config.js';

export function runWebsiteScenario(events) {
  // 1. Fetch Public Events List
  const eventsRes = http.get(`${BASE_URL}/api/events`, { headers: HEADERS });
  check(eventsRes, {
    'public events fetched (200)': (r) => r.status === 200,
  });

  // 2. Fetch Single Event Detail
  if (events && events.length > 0) {
    const randomEvent = events[Math.floor(Math.random() * events.length)];
    const detailRes = http.get(`${BASE_URL}/api/events/${randomEvent.id}`, { headers: HEADERS });
    check(detailRes, {
      'event detail fetched (200)': (r) => r.status === 200,
    });
  }

  // 3. Fetch Health Endpoint
  const healthRes = http.get(`${BASE_URL}/api/health`, { headers: HEADERS });
  check(healthRes, {
    'health check OK (200)': (r) => r.status === 200,
  });

  sleep(1);
}

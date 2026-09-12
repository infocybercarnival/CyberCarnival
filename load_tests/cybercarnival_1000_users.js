import http from 'k6/http';
import { BASE_URL, THRESHOLDS, HEADERS } from './config.js';
import { runRegistrationScenario } from './scenarios/registration.js';
import { runLoginScenario } from './scenarios/login.js';
import { runWebsiteScenario } from './scenarios/website.js';

export const options = {
  scenarios: {
    // 1. 500 Concurrent Event Registration VUs
    event_registration: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },  // Ramp to 50
        { duration: '20s', target: 250 }, // Ramp to 250
        { duration: '30s', target: 500 }, // Ramp to 500
        { duration: '60s', target: 500 }, // Sustain 500 VUs
        { duration: '15s', target: 0 },   // Ramp down
      ],
      exec: 'registrationTask',
    },
    // 2. 250 Concurrent Login VUs
    concurrent_login: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 25 },  // Ramp to 25
        { duration: '20s', target: 125 }, // Ramp to 125
        { duration: '30s', target: 250 }, // Ramp to 250
        { duration: '60s', target: 250 }, // Sustain 250 VUs
        { duration: '15s', target: 0 },   // Ramp down
      ],
      exec: 'loginTask',
    },
    // 3. 250 Concurrent Website / API Browsing VUs
    website_api_browsing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 25 },  // Ramp to 25
        { duration: '20s', target: 125 }, // Ramp to 125
        { duration: '30s', target: 250 }, // Ramp to 250
        { duration: '60s', target: 250 }, // Sustain 250 VUs
        { duration: '15s', target: 0 },   // Ramp down
      ],
      exec: 'websiteTask',
    },
  },
  thresholds: THRESHOLDS,
};

let cachedEvents = null;

export function setup() {
  // Fetch event catalog at setup time to distribute VUs across events
  const res = http.get(`${BASE_URL}/api/events`, { headers: HEADERS });
  if (res.status === 200) {
    try {
      return JSON.parse(res.body);
    } catch (e) {}
  }
  return [];
}

export function registrationTask(events) {
  runRegistrationScenario(events);
}

export function loginTask() {
  runLoginScenario();
}

export function websiteTask(events) {
  runWebsiteScenario(events);
}

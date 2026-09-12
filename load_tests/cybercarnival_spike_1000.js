import http from 'k6/http';
import { BASE_URL, THRESHOLDS, HEADERS } from './config.js';
import { runRegistrationScenario } from './scenarios/registration.js';
import { runLoginScenario } from './scenarios/login.js';
import { runWebsiteScenario } from './scenarios/website.js';

export const options = {
  scenarios: {
    // Immediate 1000 VU Spike Test (All VUs start almost simultaneously)
    spike_registration: {
      executor: 'constant-vus',
      vus: 500,
      duration: '30s',
      exec: 'registrationTask',
    },
    spike_login: {
      executor: 'constant-vus',
      vus: 250,
      duration: '30s',
      exec: 'loginTask',
    },
    spike_website: {
      executor: 'constant-vus',
      vus: 250,
      duration: '30s',
      exec: 'websiteTask',
    },
  },
  thresholds: THRESHOLDS,
};

export function setup() {
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

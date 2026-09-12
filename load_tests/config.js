// Load Test Configuration for k6 Framework
export const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:5000';

export const THRESHOLDS = {
  http_req_failed: ['rate<0.01'], // HTTP errors should be less than 1%
  http_req_duration: ['p(95)<2000', 'p(99)<5000'], // 95% of requests < 2000ms, 99% < 5000ms
  'http_req_duration{scenario:registration}': ['p(95)<2500'],
  'http_req_duration{scenario:login}': ['p(95)<1500'],
  'http_req_duration{scenario:website}': ['p(95)<1000'],
};

export const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

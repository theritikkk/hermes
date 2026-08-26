import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Hermes k6 Load Testing Script
 *
 * Configurable via environment variables:
 *   TARGET_URL      - Live API Gateway URL (mandatory)
 *   PROFILE         - smoke | baseline | stress (default: baseline)
 *   TENANT_ID       - Tenant ID (default: tenant-benchmark)
 *   AUTH_TOKEN      - Optional Cognito Bearer Token
 *
 * Usage:
 *   export TARGET_URL="https://<api-id>.execute-api.ap-south-1.amazonaws.com"
 *   k6 run --env TARGET_URL=$TARGET_URL --env PROFILE=smoke benchmarks/k6/load-test.js
 */

const profile = (__ENV.PROFILE || 'baseline').toLowerCase();

let stages = [
  { duration: '10s', target: 10 },
  { duration: '30s', target: 10 },
  { duration: '10s', target: 0 },
];

if (profile === 'smoke') {
  stages = [
    { duration: '5s', target: 2 },
    { duration: '20s', target: 2 },
    { duration: '5s', target: 0 },
  ];
} else if (profile === 'stress') {
  stages = [
    { duration: '15s', target: 25 },
    { duration: '1m', target: 25 },
    { duration: '15s', target: 0 },
  ];
}

export const options = {
  stages,
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const API_URL = (__ENV.TARGET_URL || __ENV.API_URL || '').replace(/\/+$/, '');
const TENANT_ID = __ENV.TENANT_ID || 'tenant-benchmark';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export default function () {
  if (!API_URL) {
    throw new Error('TARGET_URL or API_URL environment variable is required.');
  }

  const payload = JSON.stringify({
    s3Key: `k6-benchmarks/${TENANT_ID}/${__VU}-${__ITER}-${Date.now()}.pdf`,
    contentType: 'application/pdf',
    workflowName: 'document-pipeline-v1',
    workflowVersion: 1,
  });

  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT_ID,
    'x-role': 'User',
  };

  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  const res = http.post(`${API_URL}/assets`, payload, { headers });

  check(res, {
    'status is 200 or 202': (r) => r.status === 200 || r.status === 202,
    'has executionId': (r) => {
      try {
        return r.json('executionId') !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(0.1);
}

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 200 },
    { duration: '2m', target: 500 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const API_URL = __ENV.API_URL || 'https://tuyyhzi8w7.execute-api.ap-south-1.amazonaws.com';

export default function () {
  const payload = JSON.stringify({
    s3Key: `k6-benchmarks/doc-${__VU}-${__ITER}.pdf`,
    contentType: 'application/pdf',
    workflowName: 'document-pipeline-v1',
    workflowVersion: 1,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': 'tenant-benchmark',
      'x-role': 'User',
    },
  };

  const res = http.post(`${API_URL}/assets`, payload, params);

  check(res, {
    'status is 202': (r) => r.status === 202,
    'has executionId': (r) => r.json('executionId') !== undefined,
  });

  sleep(0.1);
}

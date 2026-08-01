// ТЗ 8 / Задача 5.3 smoke test: 100 RPS against the public catalog for 2
// minutes with zero 5xx responses.
//
// Run against a local stack (through Caddy):
//   docker run --rm --network host -v "$(pwd)/scripts:/scripts" grafana/k6 \
//     run /scripts/smoke-test.js
//
// Run against a deployed domain:
//   docker run --rm -v "$(pwd)/scripts:/scripts" -e BASE_URL=https://example.com/api/v1 \
//     grafana/k6 run /scripts/smoke-test.js
import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost/api/v1";

export const options = {
  scenarios: {
    catalog_smoke: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 50,
      maxVUs: 300,
    },
  },
  thresholds: {
    // The DoD is "zero 5xx", not zero non-2xx -- a 404 on a bad slug is a
    // legitimate response, a 5xx is a server failure. The only check() in
    // this script is exactly that 5xx test, so requiring 100% of checks to
    // pass is equivalent to requiring zero 5xx responses.
    checks: ["rate==1"],
    http_req_duration: ["p(95)<200"],
  },
};

const REQUESTS = [
  () => http.get(`${BASE_URL}/categories`),
  () => http.get(`${BASE_URL}/products?page=1&page_size=24`),
  () => http.get(`${BASE_URL}/products?sort=newest&page_size=8`),
  () => http.get(`${BASE_URL}/products?sort=popular&page_size=8`),
  () => http.get(`${BASE_URL}/products?price_min=100&price_max=1000`),
];

export default function () {
  const request = REQUESTS[Math.floor(Math.random() * REQUESTS.length)];
  const res = request();

  check(res, {
    "status is not 5xx": (r) => r.status < 500,
  });
}

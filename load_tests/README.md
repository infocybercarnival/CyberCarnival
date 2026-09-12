# CyberCarnival 1000-User Concurrency & Load Testing Framework

This directory contains the load testing suite designed to evaluate concurrency, database integrity, race conditions, and response time metrics for CyberCarnival under heavy traffic up to **1000 concurrent Virtual Users (VUs)**.

---

## 📁 Directory Structure

```
load_tests/
│
├── README.md                           # Documentation & execution guide
├── config.js                           # k6 configuration, thresholds & endpoints
├── run_load_test.py                    # High-performance Python concurrent runner
│
├── scenarios/
│   ├── registration.js                 # 500 VUs: Concurrent Event Registration
│   ├── login.js                        # 250 VUs: Concurrent User Authentication
│   └── website.js                      # 250 VUs: Concurrent Public API / Web Browsing
│
├── cybercarnival_1000_users.js          # Master k6 1000-VU Load Test
├── cybercarnival_spike_1000.js          # Master k6 1000-VU Spike Test
│
└── validation/
    ├── verify_database.sql             # SQL database integrity & race condition check
    └── cleanup_loadtest_data.sql       # Safe idempotent SQL cleanup (targets loadtest_* only)
```

---

## 🚀 Workload & Concurrency Distribution (1000 Total VUs)

| Scenario | Active VUs | Description |
| :--- | :---: | :--- |
| **Scenario 1: Event Registration** | **500 VUs** | Registers across multiple technical & non-technical events concurrently. Distributes registrations dynamically using unique `loadtest_...` emails/names. Supports team and individual event payloads. |
| **Scenario 2: Concurrent Login** | **250 VUs** | Authenticates virtual user sessions concurrently, verifies `/api/auth/me` profile details, and asserts zero session crossover between concurrent users. |
| **Scenario 3: Website / API Browsing**| **250 VUs** | Browses `/api/events`, event detail pages, and `/api/health` continuously. |
| **TOTAL** | **1000 VUs** | **All 3 scenarios execute simultaneously in parallel.** |

---

## 🛠️ Prerequisites & Setup

1. **Start the Backend Server in Load Test Mode**:
   Set `LOAD_TEST_ENABLED=1` in your environment or PowerShell before launching the Flask backend server:

   ```powershell
   $env:LOAD_TEST_ENABLED="1"
   python app.py
   ```

2. **Required Dependencies**:
   For the Python concurrent runner, ensure `aiohttp` is installed:
   ```powershell
   pip install aiohttp
   ```

---

## 🧪 Running the Load Tests (Windows PowerShell Commands)

### 1. Phase 1 — Smoke Test (10 VUs)
Verifies that all API endpoints, session handlers, and database connections respond correctly.
```powershell
python load_tests/run_load_test.py --smoke
```
*Or using k6:*
```powershell
k6 run --vus 10 --duration 10s load_tests/cybercarnival_1000_users.js
```

---

### 2. Phase 2 — Small Concurrency Test (100 VUs)
Simulates 100 concurrent users (50 Registration + 25 Login + 25 Website) for 30 seconds.
```powershell
python load_tests/run_load_test.py --small
```

---

### 3. Phase 3 — Main 1000-User Concurrency Load Test (1000 VUs)
Simulates 1000 concurrent Virtual Users simultaneously for 60 seconds.
```powershell
python load_tests/run_load_test.py --vus 1000 --duration 60
```
*Or using k6:*
```powershell
k6 run load_tests/cybercarnival_1000_users.js
```

---

### 4. Optional Phase 4 — 1000-User Immediate Spike Test
All 1000 Virtual Users start almost instantaneously to test cold-start spike resilience.
```powershell
python load_tests/run_load_test.py --spike
```
*Or using k6:*
```powershell
k6 run load_tests/cybercarnival_spike_1000.js
```

---

## 📊 Database Verification & Race Condition Auditing

After running the load test, execute the database integrity verification query to check for race conditions:

```powershell
python -c "from load_tests.run_load_test import verify_database_integrity; verify_database_integrity()"
```

Or run `load_tests/validation/verify_database.sql` directly against your PostgreSQL database:
* Verifies zero duplicate ticket tokens (`HAVING COUNT(*) > 1`).
* Verifies zero duplicate active user registrations per event.
* Verifies zero orphaned member records.
* Verifies event capacity limits were enforced.

---

## 🧹 Safe Test Data Cleanup

To remove ONLY the test records generated during the load test (`loadtest_*` emails and users), run:

```powershell
psql -U postgres -d cybercarnival -f load_tests/validation/cleanup_loadtest_data.sql
```

*Note: The cleanup script targets ONLY records prefixed with `loadtest_`. Real user accounts, real registrations, and event catalogs are NEVER modified or deleted.*

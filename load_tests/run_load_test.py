import argparse
import asyncio
import math
import random
import sys
import time
from datetime import datetime
from pathlib import Path

# Add backend directory to sys.path to access models and services if available
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    import aiohttp
except ImportError:
    import subprocess
    print("Installing aiohttp for high-performance load test runner...")
    subprocess.run([sys.executable, "-m", "pip", "install", "aiohttp"], check=True)
    import aiohttp


class LoadTestMetrics:
    def __init__(self):
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.status_codes = {}
        self.response_times = []
        self.lock = asyncio.Lock()

        # Scenario specific metrics
        self.registration_success = 0
        self.registration_conflict = 0
        self.registration_failed = 0

        self.login_success = 0
        self.login_failed = 0

        self.website_success = 0
        self.website_failed = 0

    async def record(self, scenario, status_code, elapsed_ms, is_success=True, extra_tag=None):
        async with self.lock:
            self.total_requests += 1
            if is_success and status_code < 400:
                self.successful_requests += 1
            else:
                self.failed_requests += 1

            self.status_codes[status_code] = self.status_codes.get(status_code, 0) + 1
            self.response_times.append(elapsed_ms)

            if scenario == "registration":
                if status_code == 201:
                    self.registration_success += 1
                elif status_code == 409:
                    self.registration_conflict += 1
                else:
                    self.registration_failed += 1
            elif scenario == "login":
                if status_code == 200:
                    self.login_success += 1
                else:
                    self.login_failed += 1
            elif scenario == "website":
                if status_code == 200:
                    self.website_success += 1
                else:
                    self.website_failed += 1

    def calculate_percentiles(self):
        if not self.response_times:
            return 0, 0, 0, 0, 0
        sorted_times = sorted(self.response_times)
        n = len(sorted_times)
        avg = sum(sorted_times) / n
        p50 = sorted_times[int(n * 0.50)]
        p90 = sorted_times[int(n * 0.90)]
        p95 = sorted_times[int(n * 0.95)]
        p99 = sorted_times[min(int(n * 0.99), n - 1)]
        return avg, p50, p90, p95, p99


async def fetch_events(session, base_url):
    try:
        async with session.get(f"{base_url}/api/events") as resp:
            if resp.status == 200:
                data = await resp.json()
                if isinstance(data, list) and data:
                    return data
    except Exception as e:
        print(f"Warning: Could not fetch events catalog: {e}")
    return [{"id": "default_event", "category": "TECHNICAL", "max_team_size": 1}]


async def registration_worker(worker_id, base_url, events, duration_sec, metrics, stop_event):
    jar = aiohttp.CookieJar(unsafe=True)
    async with aiohttp.ClientSession(cookie_jar=jar) as session:
        start_time = time.time()
        iteration = 0
        while time.time() - start_time < duration_sec and not stop_event.is_set():
            iteration += 1
            unique_id = f"loadtest_reg_{worker_id}_{iteration}_{random.randint(1000, 9999)}"
            email = f"{unique_id}@example.com"
            t0 = time.time()

            try:
                # 1. Establish session
                async with session.post(
                    f"{base_url}/api/auth/loadtest-session",
                    json={"email": email},
                ) as resp_sess:
                    t1 = time.time()
                    elapsed_ms = (t1 - t0) * 1000
                    if resp_sess.status != 200:
                        await metrics.record("registration", resp_sess.status, elapsed_ms, is_success=False)
                        await asyncio.sleep(0.1)
                        continue

                # 2. Select event & submit registration
                target_event = events[(worker_id + iteration) % len(events)]
                is_team = bool(target_event.get("max_team_size") and target_event.get("max_team_size") > 1)

                member_tokens = []
                if is_team:
                    needed_teammates = max(1, (target_event.get("min_team_size") or 2) - 1)
                    for tm_idx in range(needed_teammates):
                        teammate_email = f"loadtest_tm_{worker_id}_{iteration}_{tm_idx}_{random.randint(1000, 9999)}@example.com"
                        async with session.post(
                            f"{base_url}/api/auth/loadtest-session",
                            json={"email": teammate_email},
                        ) as resp_tm:
                            if resp_tm.status == 200:
                                tm_data = await resp_tm.json()
                                if tm_data.get("cybercarnival_token"):
                                    member_tokens.append(tm_data["cybercarnival_token"])
                    # Re-establish leader session
                    await session.post(
                        f"{base_url}/api/auth/loadtest-session",
                        json={"email": email},
                    )

                payload = {
                    "event_id": target_event["id"],
                    "participant_mode": "team" if is_team else "individual",
                    "team_name": f"Team LoadTest {worker_id}_{iteration}" if is_team else None,
                    "member_tokens": member_tokens if is_team else [],
                }

                t2 = time.time()
                async with session.post(
                    f"{base_url}/api/registrations",
                    json=payload,
                ) as resp_reg:
                    t3 = time.time()
                    reg_elapsed = (t3 - t2) * 1000
                    is_success = resp_reg.status in (201, 409)  # 409 duplicate is valid business rejection
                    await metrics.record("registration", resp_reg.status, reg_elapsed, is_success=is_success)

            except Exception as e:
                await metrics.record("registration", 500, 0, is_success=False)

            await asyncio.sleep(random.uniform(0.05, 0.2))


async def login_worker(worker_id, base_url, duration_sec, metrics, stop_event):
    jar = aiohttp.CookieJar(unsafe=True)
    async with aiohttp.ClientSession(cookie_jar=jar) as session:
        start_time = time.time()
        iteration = 0
        while time.time() - start_time < duration_sec and not stop_event.is_set():
            iteration += 1
            unique_id = f"loadtest_login_{worker_id}_{iteration}"
            email = f"{unique_id}@example.com"
            t0 = time.time()

            try:
                # 1. Login session
                async with session.post(
                    f"{base_url}/api/auth/loadtest-session",
                    json={"email": email},
                ) as resp_login:
                    t1 = time.time()
                    elapsed_ms = (t1 - t0) * 1000
                    if resp_login.status != 200:
                        await metrics.record("login", resp_login.status, elapsed_ms, is_success=False)
                        await asyncio.sleep(0.1)
                        continue

                # 2. Fetch authenticated profile /me
                t2 = time.time()
                async with session.get(f"{base_url}/api/auth/me") as resp_me:
                    t3 = time.time()
                    me_elapsed = (t3 - t2) * 1000
                    is_success = resp_me.status == 200
                    if is_success:
                        data = await resp_me.json()
                        is_success = (data.get("email") == email)
                    await metrics.record("login", resp_me.status, me_elapsed, is_success=is_success)

            except Exception as e:
                await metrics.record("login", 500, 0, is_success=False)

            await asyncio.sleep(random.uniform(0.05, 0.2))


async def website_worker(worker_id, base_url, events, duration_sec, metrics, stop_event):
    jar = aiohttp.CookieJar(unsafe=True)
    async with aiohttp.ClientSession(cookie_jar=jar) as session:
        start_time = time.time()
        while time.time() - start_time < duration_sec and not stop_event.is_set():
            t0 = time.time()
            try:
                # 1. Public events catalog
                async with session.get(f"{base_url}/api/events") as resp:
                    t1 = time.time()
                    await metrics.record("website", resp.status, (t1 - t0) * 1000, is_success=(resp.status == 200))

                # 2. Random event detail
                if events:
                    target_event = random.choice(events)
                    t2 = time.time()
                    async with session.get(f"{base_url}/api/events/{target_event['id']}") as resp_detail:
                        t3 = time.time()
                        await metrics.record("website", resp_detail.status, (t3 - t2) * 1000, is_success=(resp_detail.status == 200))

            except Exception as e:
                await metrics.record("website", 500, 0, is_success=False)

            await asyncio.sleep(random.uniform(0.1, 0.4))


async def run_load_test(base_url, total_vus, duration_sec, mode_name="1000-User Main Load Test"):
    print(f"\n==========================================================")
    print(f"   STARTING CYBERCARNIVAL LOAD TEST: {mode_name}")
    print(f"   Target URL: {base_url}")
    print(f"   Total Concurrent Virtual Users (VUs): {total_vus}")
    print(f"   Duration: {duration_sec} seconds")
    print(f"==========================================================\n")

    # Calculate VU distribution (50% Registration, 25% Login, 25% Website)
    reg_vus = int(total_vus * 0.50)
    login_vus = int(total_vus * 0.25)
    website_vus = total_vus - reg_vus - login_vus

    print(f"Concurrency Breakdown:")
    print(f"  - Scenario 1 (Event Registration): {reg_vus} VUs")
    print(f"  - Scenario 2 (Concurrent Login):     {login_vus} VUs")
    print(f"  - Scenario 3 (Website / API Browse): {website_vus} VUs")
    print(f"  --------------------------------------------------------")
    print(f"  Total Active VUs:                    {total_vus} VUs\n")

    metrics = LoadTestMetrics()
    stop_event = asyncio.Event()

    async with aiohttp.ClientSession() as main_session:
        events = await fetch_events(main_session, base_url)
        print(f"Discovered {len(events)} active events for load distribution.")

    workers = []
    for i in range(reg_vus):
        workers.append(registration_worker(i, base_url, events, duration_sec, metrics, stop_event))

    for i in range(login_vus):
        workers.append(login_worker(i, base_url, duration_sec, metrics, stop_event))

    for i in range(website_vus):
        workers.append(website_worker(i, base_url, events, duration_sec, metrics, stop_event))

    start_time = time.time()
    await asyncio.gather(*workers)
    total_time = time.time() - start_time

    # Display Metrics Report
    avg_ms, p50_ms, p90_ms, p95_ms, p99_ms = metrics.calculate_percentiles()
    rps = metrics.total_requests / total_time if total_time > 0 else 0
    error_rate = (metrics.failed_requests / metrics.total_requests * 100) if metrics.total_requests > 0 else 0

    print(f"\n==========================================================")
    print(f"              LOAD TEST RESULTS SUMMARY")
    print(f"==========================================================")
    print(f"Test Duration:               {total_time:.2f} s")
    print(f"Total HTTP Requests:         {metrics.total_requests}")
    print(f"Successful Requests:         {metrics.successful_requests}")
    print(f"Failed Requests:             {metrics.failed_requests}")
    print(f"Requests Per Second (RPS):   {rps:.2f} req/s")
    print(f"Overall HTTP Error Rate:     {error_rate:.2f} %")
    print(f"----------------------------------------------------------")
    print(f"Response Time Metrics (ms):")
    print(f"  - Average Response Time:   {avg_ms:.2f} ms")
    print(f"  - Median (P50):            {p50_ms:.2f} ms")
    print(f"  - P90 Response Time:       {p90_ms:.2f} ms")
    print(f"  - P95 Response Time:       {p95_ms:.2f} ms")
    print(f"  - P99 Response Time:       {p99_ms:.2f} ms")
    print(f"----------------------------------------------------------")
    print(f"Scenario Specific Metrics:")
    print(f"  - Registrations Created (201): {metrics.registration_success}")
    print(f"  - Registration Conflicts (409): {metrics.registration_conflict}")
    print(f"  - Logins Verified (200):       {metrics.login_success}")
    print(f"  - Website Pages Fetched:       {metrics.website_success}")
    print(f"----------------------------------------------------------")
    print(f"HTTP Status Code Breakdown:")
    for code in sorted(metrics.status_codes.keys()):
        count = metrics.status_codes[code]
        pct = (count / metrics.total_requests * 100) if metrics.total_requests > 0 else 0
        print(f"  - HTTP {code}: {count} ({pct:.1f}%)")
    print(f"==========================================================\n")

    return metrics, total_time


def verify_database_integrity():
    print("==========================================================")
    print("         POST-LOAD TEST DATABASE INTEGRITY CHECKS")
    print("==========================================================")
    try:
        try:
            from app import create_app  # type: ignore # pyright: ignore[reportMissingImports]
            from extensions import db  # type: ignore # pyright: ignore[reportMissingImports]
            from models import EventRegistration, RegistrationMember, Event, User  # type: ignore # pyright: ignore[reportMissingImports]
        except ImportError:
            from backend.app import create_app
            from backend.extensions import db
            from backend.models import EventRegistration, RegistrationMember, Event, User

        app = create_app()
        with app.app_context():
            # 1. Check duplicate ticket tokens
            dups = (
                db.session.query(EventRegistration.ticket_token, db.func.count(EventRegistration.id))
                .filter(EventRegistration.ticket_token.isnot(None), EventRegistration.ticket_token != "")
                .group_by(EventRegistration.ticket_token)
                .having(db.func.count(EventRegistration.id) > 1)
                .all()
            )
            print(f"1. Duplicate Ticket Tokens:       {len(dups)} (PASS)" if len(dups) == 0 else f"1. Duplicate Ticket Tokens:       {len(dups)} (FAIL)")

            # 2. Check duplicate active user registrations per event
            dup_regs = (
                db.session.query(EventRegistration.event_id, EventRegistration.leader_user_id, db.func.count(EventRegistration.id))
                .filter(EventRegistration.status.in_(["confirmed", "pending_verification", "pending_payment"]))
                .group_by(EventRegistration.event_id, EventRegistration.leader_user_id)
                .having(db.func.count(EventRegistration.id) > 1)
                .all()
            )
            print(f"2. Duplicate User Registrations: {len(dup_regs)} (PASS)" if len(dup_regs) == 0 else f"2. Duplicate User Registrations: {len(dup_regs)} (FAIL)")

            # 3. Check orphaned registration members
            orphans = (
                db.session.query(RegistrationMember.id)
                .outerjoin(EventRegistration, RegistrationMember.registration_id == EventRegistration.id)
                .filter(EventRegistration.id.is_(None))
                .all()
            )
            print(f"3. Orphaned Registration Members: {len(orphans)} (PASS)" if len(orphans) == 0 else f"3. Orphaned Registration Members: {len(orphans)} (FAIL)")

            # 4. Count total loadtest records
            lt_users = User.query.filter(User.email.like("loadtest_%")).count()
            lt_regs = EventRegistration.query.join(User, EventRegistration.leader_user_id == User.id).filter(User.email.like("loadtest_%")).count()
            print(f"4. Total LoadTest Users Created:  {lt_users}")
            print(f"5. Total LoadTest Registrations: {lt_regs}")

    except Exception as e:
        print(f"Warning: Could not run direct database verification query: {e}")
    print("==========================================================\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CyberCarnival Concurrent Load Test Runner")
    parser.add_argument("--url", default="http://127.0.0.1:5000", help="Base URL of server")
    parser.add_argument("--vus", type=int, default=1000, help="Total concurrent VUs (default: 1000)")
    parser.add_argument("--duration", type=int, default=60, help="Duration in seconds (default: 60)")
    parser.add_argument("--smoke", action="store_true", help="Run 10-VU smoke test")
    parser.add_argument("--small", action="store_true", help="Run 100-VU concurrency test")
    parser.add_argument("--medium", action="store_true", help="Run 500-VU concurrency test")
    parser.add_argument("--spike", action="store_true", help="Run immediate 1000-VU spike test")

    args = parser.parse_args()

    if args.smoke:
        vus = 10
        duration = 10
        mode = "10-User Smoke Test"
    elif args.small:
        vus = 100
        duration = 30
        mode = "100-User Small Concurrency Test"
    elif args.medium:
        vus = 500
        duration = 45
        mode = "500-User Medium Concurrency Test"
    elif args.spike:
        vus = 1000
        duration = 30
        mode = "1000-User Immediate Spike Test"
    else:
        vus = args.vus
        duration = args.duration
        mode = f"{vus}-User Main Load Test"

    asyncio.run(run_load_test(args.url, vus, duration, mode))
    verify_database_integrity()

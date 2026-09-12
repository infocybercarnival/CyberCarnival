"""
Production Gunicorn Configuration for CyberCarnival Backend.
Designed for Render deployment with Supabase PostgreSQL connection compatibility.
"""

import os
import multiprocessing

# Worker & Thread concurrency settings
# Conservative defaults for Render free/starter instances (1-2 vCPUs, 512MB-1GB RAM)
default_workers = max(2, multiprocessing.cpu_count())
workers = int(os.environ.get("GUNICORN_WORKERS", default_workers))
threads = int(os.environ.get("GUNICORN_THREADS", 4))
worker_class = "gthread"

# Socket & Connection timeouts
bind = f"0.0.0.0:{os.environ.get('PORT', '5000')}"
timeout = int(os.environ.get("GUNICORN_TIMEOUT", 120))
graceful_timeout = int(os.environ.get("GUNICORN_GRACEFUL_TIMEOUT", 30))
keepalive = int(os.environ.get("GUNICORN_KEEPALIVE", 5))

# Worker recycling to prevent memory leaks and thread degradation
max_requests = int(os.environ.get("GUNICORN_MAX_REQUESTS", 1000))
max_requests_jitter = int(os.environ.get("GUNICORN_MAX_REQUESTS_JITTER", 100))

# Server mechanics
preload_app = False
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "info")

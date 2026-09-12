-- Migration: Add whatsapp_group_link column to events table
-- Safe bootstrap migration script for Supabase PostgreSQL.
-- Note: Already executed in production. Use for fresh setups or dev environments.

ALTER TABLE events
ADD COLUMN IF NOT EXISTS whatsapp_group_link TEXT;

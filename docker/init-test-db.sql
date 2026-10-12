-- Runs once on first container start: a separate DB so tests never touch dev data.
CREATE DATABASE tickets_test OWNER tickets;

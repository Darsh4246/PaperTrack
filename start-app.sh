#!/bin/bash
# Wait for Postgres
until pg_isready -h localhost -q; do sleep 1; done

exec node server.js
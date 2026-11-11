#!/bin/bash
set -e

PGDATA=/var/lib/postgresql/data
PGBIN=/usr/lib/postgresql/current/bin

# First start only: create the cluster, the database and run init.sql
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "Initializing PostgreSQL..."
  mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"

  echo "$DB_PASSWORD" > /tmp/pgpw
  chown postgres:postgres /tmp/pgpw
  su postgres -c "$PGBIN/initdb -D $PGDATA --username=$DB_USER --pwfile=/tmp/pgpw --auth=scram-sha-256"
  rm -f /tmp/pgpw

  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-c listen_addresses=localhost' -w start"

  export PGPASSWORD="$DB_PASSWORD"
  psql -h localhost -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\""
  if [ -f /docker-initdb/init.sql ]; then
    echo "Running init.sql..."
    psql -h localhost -U "$DB_USER" -d "$DB_NAME" -f /docker-initdb/init.sql
  fi
  unset PGPASSWORD

  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -m fast -w stop"
  echo "PostgreSQL initialized."
fi

exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord.conf
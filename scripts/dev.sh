#!/bin/sh
PID=$(lsof -ti :5173 2>/dev/null)
if [ -n "$PID" ]; then
  printf "Port 5173 is in use. Clear it? [y/N] "
  read answer
  if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    kill -9 $PID
  fi
fi

vite

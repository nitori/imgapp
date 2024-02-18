#!/usr/bin/env bash

gunicorn -w 4 --threads 8 -b 127.0.0.1:5000 app:app


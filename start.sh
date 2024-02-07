#!/usr/bin/env bash

gunicorn -w 4 app:app -b 127.0.0.1:5000


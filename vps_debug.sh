#!/bin/bash
curl -s http://127.0.0.1:8000/api/finance/cases > /tmp/api_curl.txt
journalctl -u eurbanizam-api.service -n 50 --no-pager > /tmp/api_post_err.txt

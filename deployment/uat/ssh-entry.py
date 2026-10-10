#!/usr/bin/env python3
import os
import re
import subprocess

match = re.fullmatch(r'deploy ([0-9a-f]{40})', os.environ.get('SSH_ORIGINAL_COMMAND', ''))
if not match:
    raise SystemExit('Only a UAT deployment command is permitted')
raise SystemExit(subprocess.call(['sudo', '-n', '/usr/local/sbin/levants-uat-deploy', match.group(1)]))

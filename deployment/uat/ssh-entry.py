#!/usr/bin/env python3
import os
import re
import subprocess

match = re.fullmatch(r'(deploy|verify) ([0-9a-f]{40})', os.environ.get('SSH_ORIGINAL_COMMAND', ''))
if not match:
    raise SystemExit('Only an exact UAT deployment or verification command is permitted')
raise SystemExit(subprocess.call(['sudo', '-n', '/usr/local/sbin/levants-uat-' + match.group(1), match.group(2)]))

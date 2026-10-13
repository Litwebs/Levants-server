#!/usr/bin/env python3
"""Package tracked backend source and an already-verified admin build."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile

root = Path(__file__).resolve().parents[2]
sha = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
if subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain', '--untracked-files=no'], text=True).strip():
    raise SystemExit('Tracked source must be committed before packaging')
files = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z', 'server'], text=True).split('\0')
build = root/'client/build'
if not (build/'index.html').is_file(): raise SystemExit('Build the verified admin client first')
build_files = sorted(p for p in build.rglob('*') if p.is_file())
manifest = {'sha': sha, 'environment': 'uat', 'frontendSha': sha, 'frontendFiles': {
    str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in build_files
}}
output = Path(sys.argv[1])
with tarfile.open(output, 'w:gz', dereference=False) as archive:
    for name in files:
        if not name: continue
        path = Path(name)
        if any(part.startswith('.env') or part in ['node_modules', '.git'] for part in path.parts):
            raise SystemExit('Refusing to package environment or dependency files')
        if (root/path).is_symlink(): raise SystemExit('Source symlinks are not supported')
        archive.add(root/path, arcname=name, recursive=False)
    for path in build_files:
        if path.is_symlink(): raise SystemExit('Build symlinks are not supported')
        archive.add(path, arcname=str(path.relative_to(root)), recursive=False)
    content = json.dumps(manifest, sort_keys=True).encode()
    entry = tarfile.TarInfo('release.json')
    entry.size = len(content)
    entry.mode = 0o644
    archive.addfile(entry, io.BytesIO(content))
print('Packaged UAT commit '+sha)

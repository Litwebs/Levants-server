#!/usr/bin/env python3
"""Prepare a schema-compatible Git fallback without checking out production code."""
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path('/root/LWS-Scripts')
REPO = ROOT / 'Levants-server'
INSTALLED = ROOT / 'prepare-compatible-rollback.py'
HELPER = ROOT / '05-auto-deploy.sh'
MODEL = 'server/models/order.model.js'
EXPECTED = '144badd63cb5263ad8eb89ce4f353816515f0fd4'
MARKER = '# Levants: prepare a cancelled-compatible fallback before deployment.'
CAPTURE = 'PREVIOUS_SHA="$(git -C "$PROJECT_PATH" rev-parse HEAD 2>/dev/null || true)"'
OLD_ENUM = 'enum: ["ordered", "dispatched", "in_transit", "delivered", "returned"],'
NEW_ENUM = 'enum: ["ordered", "dispatched", "in_transit", "delivered", "returned", "cancelled"],'


def run(args, *, cwd=None, data=None, env=None):
    return subprocess.check_output(args, cwd=cwd, input=data, text=True,
                                   env=env, stderr=subprocess.PIPE, timeout=60).strip()


def git(repo, *args, data=None, env=None):
    return run(['git', '-C', str(repo), *args], data=data, env=env)


def compatible_source(source):
    match = re.search(r'\bdeliveryStatus\s*:\s*\{(?P<body>[^{}]*)\}', source)
    if not match:
        raise ValueError('Cannot identify the delivery status schema')
    body = match.group('body')
    enums = re.findall(r'\benum\s*:\s*\[([^\]]*)\]', body)
    if len(enums) != 1:
        raise ValueError('Ambiguous delivery status enum')
    values = re.findall(r'["\']([^"\']+)["\']', enums[0])
    expected = ['ordered', 'dispatched', 'in_transit', 'delivered', 'returned']
    if values == expected + ['cancelled']:
        return source
    if values != expected or body.count(OLD_ENUM) != 1:
        raise ValueError('Unknown delivery status schema; refusing speculative patch')
    replacement = body.replace(OLD_ENUM, NEW_ENUM, 1)
    return source[:match.start('body')] + replacement + source[match.end('body'):]


def validate_schema(repo, source, *, module_root=None):
    # Compile only the order model in a fresh Node process. No server, provider,
    # Mongo connection, index creation, payment or inventory writes are started.
    program = r'''
const fs = require('fs');
const path = require('path');
const Module = require('module');
const filename = path.join(process.argv[1], 'server/models/order.model.js');
const m = new Module(filename);
m.filename = filename;
m.paths = Module._nodeModulePaths(path.dirname(filename));
m._compile(fs.readFileSync(0, 'utf8'), filename);
const Order = m.exports;
const mongoose = require(require.resolve('mongoose', {paths: [path.dirname(filename)]}));
const oid = () => new mongoose.Types.ObjectId();
const fixture = {
  orderId: 'ORD-ROLLBACK-OFFLINE', customer: oid(),
  items: [{product: oid(), variant: oid(), name: 'Offline rollback validation',
    sku: 'OFFLINE', price: 2, quantity: 1, subtotal: 2}],
  subtotal: 2, total: 2, amountPaid: 2, status: 'refunded',
  deliveryAddress: {line1: 'Offline fixture', city: 'London', postcode: 'SW1A 1AA', country: 'GB'},
  location: {lat: 51.5, lng: -0.1}, reservationExpiresAt: new Date('2030-01-01'),
  orderType: 'subscription_generated', subscription: oid(), portalDeliveryStatus: 'cancelled',
};
const expected = ['ordered', 'dispatched', 'in_transit', 'delivered', 'returned', 'cancelled'];
if (JSON.stringify(Order.schema.path('deliveryStatus').enumValues) !== JSON.stringify(expected))
  throw new Error('Fallback enum mismatch');
for (const deliveryStatus of expected) {
  const order = Order.hydrate({...fixture, _id: oid(), deliveryStatus});
  order.driverNote = 'An unrelated edit after rollback';
  const error = order.validateSync();
  if (error) throw error;
  if (order.deliveryStatus !== deliveryStatus) throw new Error('Fulfilment was rewritten');
}
const invalid = new Order({...fixture, deliveryStatus: 'unrecognised'}).validateSync();
if (!invalid || !invalid.errors.deliveryStatus) throw new Error('Invalid status accepted');
process.stdout.write('schema-compatible');
'''
    result = run(['node', '-e', program, str(module_root or repo)], data=source)
    if result != 'schema-compatible':
        raise ValueError('Fallback schema validation failed')


def prepare(repo, previous, *, validator=validate_schema):
    if not re.fullmatch(r'[0-9a-f]{40}', previous):
        raise ValueError('Rollback requires a complete commit SHA')
    if git(repo, 'rev-parse', f'{previous}^{{commit}}') != previous:
        raise ValueError('Rollback commit does not exist')
    before = (git(repo, 'rev-parse', 'HEAD'), git(repo, 'status', '--porcelain'))
    source = git(repo, 'show', f'{previous}:{MODEL}') + '\n'
    compatible = compatible_source(source)
    validator(repo, compatible)
    if compatible == source:
        return previous
    with tempfile.TemporaryDirectory(prefix='levants-rollback-index-') as tmp:
        env = dict(os.environ, GIT_INDEX_FILE=str(Path(tmp) / 'index'))
        git(repo, 'read-tree', previous, env=env)
        blob = git(repo, 'hash-object', '-w', '--stdin', data=compatible)
        git(repo, 'update-index', '--cacheinfo', f'100644,{blob},{MODEL}', env=env)
        tree = git(repo, 'write-tree', env=env)
        date = git(repo, 'show', '-s', '--format=%cI', previous)
        env.update(GIT_AUTHOR_NAME='Levants rollback compatibility',
                   GIT_AUTHOR_EMAIL='rollback@localhost', GIT_AUTHOR_DATE=date,
                   GIT_COMMITTER_NAME='Levants rollback compatibility',
                   GIT_COMMITTER_EMAIL='rollback@localhost', GIT_COMMITTER_DATE=date)
        fallback = git(repo, 'commit-tree', tree, '-p', previous, env=env,
                       data=f'Rollback compatibility for {previous}: accept cancelled deliveries\n')
    if git(repo, 'diff', '--name-only', previous, fallback).splitlines() != [MODEL]:
        raise ValueError('Fallback changes files beyond the order schema')
    if git(repo, 'show', f'{fallback}:{MODEL}') + '\n' != compatible:
        raise ValueError('Fallback schema content mismatch')
    if before != (git(repo, 'rev-parse', 'HEAD'), git(repo, 'status', '--porcelain')):
        raise ValueError('Production worktree changed during fallback preparation')
    # Local non-branch ref keeps the object reachable for a later/manual rollback.
    git(repo, 'update-ref', f'refs/levants/compatible-rollback/{previous}', fallback)
    return fallback


def patched_helper(source):
    lines = source.splitlines(keepends=True)
    captures = [i for i, line in enumerate(lines) if line.strip() == CAPTURE]
    if len(captures) != 1:
        raise ValueError('Unexpected deployment helper; previous SHA capture is ambiguous')
    i = captures[0]
    insertion = (f'  {MARKER}\n'
                 '  PREVIOUS_SHA="$(python3 /root/LWS-Scripts/prepare-compatible-rollback.py "$PROJECT_PATH" "$PREVIOUS_SHA")"\n')
    if MARKER in source:
        if source.count(MARKER) != 1 or ''.join(lines[i + 1:i + 3]) != insertion:
            raise ValueError('Unexpected existing rollback configuration')
        return source
    if any('git checkout' in line for line in lines[:i]):
        raise ValueError('Helper checks out code before capturing the fallback')
    lines.insert(i + 1, insertion)
    return ''.join(lines)


def atomic_write(path, data, mode):
    fd, name = tempfile.mkstemp(prefix=f'.{path.name}.', dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'w') as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def rehearse(helper, module_root, script_path):
    """Run the real helper against a tiny local fixture and inert provider stubs."""
    real_git = shutil.which('git')
    outcomes = []
    for scenario in ['success', 'install-failure', 'health-failure', 'pm2-failure', 'prepare-failure']:
        with tempfile.TemporaryDirectory(prefix='levants-rollback-rehearsal-') as tmp:
            sandbox = Path(tmp)
            base_dir = sandbox / 'LWS-Scripts'
            fixture = base_dir / 'Levants-server'
            fixture.mkdir(parents=True)
            (fixture / 'server/models').mkdir(parents=True)
            baseline = compatible_source((module_root / MODEL).read_text()).replace(NEW_ENUM, OLD_ENUM)
            (fixture / MODEL).write_text(baseline)
            (fixture / 'server/server.js').write_text('// Offline fixture only\n')
            (fixture / 'behaviour.txt').write_text('previous application behaviour\n')
            git(fixture, 'init', '-q')
            env = dict(os.environ, GIT_AUTHOR_NAME='Offline rehearsal', GIT_AUTHOR_EMAIL='offline@localhost',
                       GIT_COMMITTER_NAME='Offline rehearsal', GIT_COMMITTER_EMAIL='offline@localhost')
            git(fixture, 'add', '.')
            git(fixture, 'commit', '-qm', 'Previous application', env=env)
            previous = git(fixture, 'rev-parse', 'HEAD')
            (fixture / MODEL).write_text(compatible_source(baseline))
            (fixture / 'behaviour.txt').write_text('new release behaviour\n')
            git(fixture, 'add', '.')
            git(fixture, 'commit', '-qm', 'Release fixture', env=env)
            release = git(fixture, 'rev-parse', 'HEAD')
            git(fixture, 'branch', '-f', 'main', release)
            run([real_git, 'clone', '-q', '--bare', str(fixture), str(sandbox / 'origin.git')])
            git(fixture, 'remote', 'add', 'origin', str(sandbox / 'origin.git'))
            git(fixture, 'checkout', '--detach', previous)
            wrapper = base_dir / INSTALLED.name
            wrapper.write_text(
                'import importlib.util,sys\nfrom pathlib import Path\n'
                f'spec=importlib.util.spec_from_file_location("rollback",{str(script_path)!r})\n'
                'r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)\n'
                f'assert Path(sys.argv[1])==Path({str(fixture)!r})\n'
                + ('raise SystemExit(2)\n' if scenario == 'prepare-failure' else
                   f'print(r.prepare(Path(sys.argv[1]),sys.argv[2],validator=lambda repo,source:r.validate_schema(repo,source,module_root=Path({str(module_root)!r}))))\n'))
            commands = sandbox / 'bin'
            commands.mkdir()
            events = sandbox / 'events.jsonl'
            stub = r'''#!/usr/bin/env python3
import json,os,subprocess,sys
from pathlib import Path
command=Path(sys.argv[0]).name
repo=Path(os.environ['FIXTURE_REPO'])
real_git=os.environ['REAL_GIT']
if command=='git':
    assert Path.cwd().is_relative_to(Path(os.environ['SANDBOX']))
    for i,arg in enumerate(sys.argv[1:]):
        if arg=='-C':assert Path(sys.argv[i+2]).is_relative_to(Path(os.environ['SANDBOX']))
    os.execv(real_git,[real_git,*sys.argv[1:]])
head=subprocess.check_output([real_git,'-C',str(repo),'rev-parse','HEAD'],text=True).strip()
scenario=os.environ['SCENARIO']
release=os.environ['RELEASE_FIXTURE']
if command=='npm':
    with open(os.environ['EVENTS'],'a') as f:f.write(json.dumps({'command':'npm','head':head})+'\n')
    sys.exit(1 if scenario=='install-failure' and head==release else 0)
if command=='pm2':
    if scenario=='pm2-failure' and head==release:sys.exit(1)
    with open(os.environ['EVENTS'],'a') as f:f.write(json.dumps({'command':'pm2','head':head,'cancelledAccepted':'"cancelled"' in (repo/'server/models/order.model.js').read_text()})+'\n')
    sys.exit(0)
if command=='curl':sys.exit(1 if scenario=='health-failure' else 0)
if command=='sleep':sys.exit(0)
raise SystemExit('Unexpected provider command')
'''
            for command in ['git', 'npm', 'pm2', 'curl', 'sleep']:
                path = commands / command
                path.write_text(stub)
                path.chmod(0o700)
            executable = sandbox / 'rehearsal.sh'
            executable.write_text(patched_helper(helper).replace(str(ROOT), str(base_dir)))
            env.update(PATH=str(commands) + ':' + os.environ['PATH'], DEPLOY_SHA=release,
                       APP_NAME='offline-rehearsal-only', HEALTH_URL='https://offline.invalid/health',
                       FIXTURE_REPO=str(fixture), REAL_GIT=real_git, SANDBOX=str(sandbox),
                       SCENARIO=scenario, RELEASE_FIXTURE=release, EVENTS=str(events))
            result = subprocess.run(['bash', str(executable), 'git@github.com:Litwebs/Levants-server.git'],
                                    cwd=sandbox, env=env, capture_output=True, text=True, timeout=60)
            after = git(fixture, 'rev-parse', 'HEAD')
            records = [json.loads(line) for line in events.read_text().splitlines()] if events.exists() else []
            if scenario == 'success':
                assert result.returncode == 0 and after == release
                assert (fixture / 'behaviour.txt').read_text() == 'new release behaviour\n'
            elif scenario == 'prepare-failure':
                assert result.returncode != 0 and after == previous and not records
            else:
                assert result.returncode != 0
                assert git(fixture, 'diff', '--name-only', previous, after) == MODEL
                assert (fixture / 'behaviour.txt').read_text() == 'previous application behaviour\n'
                assert MARKER in executable.read_text()
                assert any(row['command'] == 'pm2' and row['head'] == after and row['cancelledAccepted'] for row in records)
                validate_schema(fixture, (fixture / MODEL).read_text(), module_root=module_root)
            outcomes.append({'scenario': scenario, 'passed': True})
    return outcomes


def install(source):
    if os.geteuid() != 0 or git(REPO, 'rev-parse', 'HEAD') != EXPECTED:
        raise ValueError('Production identity guard failed')
    head_before = git(REPO, 'rev-parse', 'HEAD')
    original = HELPER.read_text()
    candidate = patched_helper(original)
    run(['bash', '-n'], data=candidate)
    rehearsals = rehearse(original, REPO, Path(__file__).resolve())
    fallback = prepare(REPO, head_before)
    backup = ROOT / '05-auto-deploy.before-compatible-rollback.sh'
    if not backup.exists():
        # Never replace the first protected configuration backup on retry.
        with backup.open('x') as handle:
            os.chmod(backup, 0o600)
            handle.write(original)
    script_backup = INSTALLED.read_text() if INSTALLED.exists() else None
    try:
        atomic_write(INSTALLED, source, 0o700)
        # Exercise the exact installed entry point before changing the helper.
        if run(['python3', str(INSTALLED), str(REPO), head_before]) != fallback:
            raise ValueError('Installed fallback preparation disagrees')
        atomic_write(HELPER, candidate, stat.S_IMODE(HELPER.stat().st_mode))
        if patched_helper(HELPER.read_text()) != HELPER.read_text():
            raise ValueError('Installed helper does not contain the tested hook')
        run(['bash', '-n', str(HELPER)])
        if git(REPO, 'rev-parse', 'HEAD') != head_before:
            raise ValueError('Production head changed')
    except Exception:
        atomic_write(HELPER, original, stat.S_IMODE(HELPER.stat().st_mode))
        if script_backup is None:
            INSTALLED.unlink(missing_ok=True)
        else:
            atomic_write(INSTALLED, script_backup, 0o700)
        raise
    report = {'productionHeadUnchanged': head_before, 'compatibleRollbackSha': fallback,
              'schemaOnlyChange': git(REPO, 'diff', '--name-only', head_before, fallback) == MODEL,
              'helperSyntaxValid': True, 'installedEntryPointVerified': True,
              'actualHelperRehearsals': rehearsals,
              'helperSha256': hashlib.sha256(HELPER.read_bytes()).hexdigest(),
              'applicationRestarted': False, 'databaseWritten': False}
    atomic_write(ROOT / 'production-compatible-rollback.json', json.dumps(report) + '\n', 0o600)
    print(json.dumps(report))


def verify():
    if os.geteuid() != 0:
        raise ValueError('Rollback verification requires the protected deployment identity')
    source = HELPER.read_text()
    if MARKER not in source or patched_helper(source) != source:
        raise ValueError('Production helper is missing compatible rollback preparation')
    run(['bash', '-n', str(HELPER)])
    head = git(REPO, 'rev-parse', 'HEAD')
    fallback = prepare(REPO, head)
    if git(REPO, 'rev-parse', 'HEAD') != head:
        raise ValueError('Verification changed production HEAD')
    print(json.dumps({'productionHeadUnchanged': head, 'compatibleRollbackSha': fallback,
                      'helperSyntaxValid': True, 'compatibleSchemaValidated': True,
                      'applicationRestarted': False, 'databaseWritten': False}))


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['install']:
            install(Path(__file__).read_text())
        elif sys.argv[1:] == ['verify']:
            verify()
        elif len(sys.argv) == 3 and Path(sys.argv[1]) == REPO:
            print(prepare(REPO, sys.argv[2]))
        else:
            raise ValueError('Unsupported rollback preparation command')
    except Exception as exc:
        # Do not emit subprocess stdout/stderr: environment and providers may
        # contain credentials. Exception classes are sufficient for CI failure.
        print(f'Compatible rollback preparation failed: {type(exc).__name__}', file=sys.stderr)
        sys.exit(1)

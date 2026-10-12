#!/usr/bin/env python3
"""Isolated Git/schema tests for production rollback preparation."""
import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('rollback', HERE / 'compatible-rollback.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class CompatibleRollbackTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        (self.repo / 'server/models').mkdir(parents=True)
        self.source = 'deliveryStatus: { type: String, ' + r.OLD_ENUM + ' default: "ordered" }\n'
        (self.repo / r.MODEL).write_text(self.source)
        (self.repo / 'behaviour.txt').write_text('Previous application behaviour\n')
        r.git(self.repo, 'init', '-q')
        r.git(self.repo, 'config', 'user.name', 'Offline test')
        r.git(self.repo, 'config', 'user.email', 'offline@localhost')
        r.git(self.repo, 'add', '.')
        r.git(self.repo, 'commit', '-qm', 'Previous application')
        self.previous = r.git(self.repo, 'rev-parse', 'HEAD')

    def tearDown(self):
        self.tmp.cleanup()

    def prepare(self, previous=None):
        return r.prepare(self.repo, previous or self.previous, validator=lambda *_: None)

    def test_only_delivery_enum_changes_and_ref_is_retained(self):
        fallback = self.prepare()
        self.assertNotEqual(fallback, self.previous)
        self.assertEqual(r.git(self.repo, 'diff', '--name-only', self.previous, fallback), r.MODEL)
        self.assertEqual(r.git(self.repo, 'show', f'{fallback}:behaviour.txt'), 'Previous application behaviour')
        self.assertEqual(r.git(self.repo, 'show', f'{fallback}:{r.MODEL}') + '\n', self.source.replace(r.OLD_ENUM, r.NEW_ENUM))
        self.assertEqual(r.git(self.repo, 'rev-parse', f'refs/levants/compatible-rollback/{self.previous}'), fallback)

    def test_head_staged_and_unstaged_changes_are_preserved(self):
        (self.repo / 'behaviour.txt').write_text('Staged user change\n')
        r.git(self.repo, 'add', 'behaviour.txt')
        (self.repo / 'behaviour.txt').write_text('Unstaged user change\n')
        before = (r.git(self.repo, 'status', '--porcelain'), r.git(self.repo, 'write-tree'), (self.repo / 'behaviour.txt').read_text())
        self.prepare()
        self.assertEqual(r.git(self.repo, 'rev-parse', 'HEAD'), self.previous)
        self.assertEqual(before, (r.git(self.repo, 'status', '--porcelain'), r.git(self.repo, 'write-tree'), (self.repo / 'behaviour.txt').read_text()))

    def test_repeated_preparation_is_deterministic(self):
        self.assertEqual(self.prepare(), self.prepare())

    def test_compatible_commit_is_used_without_another_patch(self):
        compatible = self.prepare()
        self.assertEqual(self.prepare(compatible), compatible)

    def test_short_sha_and_nonexistent_commit_are_rejected(self):
        with self.assertRaises(ValueError): self.prepare(self.previous[:7])
        with self.assertRaises(subprocess.CalledProcessError): self.prepare('f' * 40)
        self.assertEqual(r.git(self.repo, 'rev-parse', 'HEAD'), self.previous)

    def test_unknown_schema_is_rejected(self):
        with self.assertRaises(ValueError): r.compatible_source(self.source.replace('"returned"', '"unexpected"'))
        with self.assertRaises(ValueError): r.compatible_source('no delivery schema')
        with self.assertRaises(ValueError): r.compatible_source('deliveryStatus: {type: String}')

    def test_financial_and_portal_statuses_are_not_changed(self):
        source = 'status: { enum: ["paid", "refunded"] },\n' + self.source + 'portalDeliveryStatus: {enum: ["cancelled"]}\n'
        self.assertEqual(r.compatible_source(source), source.replace(r.OLD_ENUM, r.NEW_ENUM))

    def test_validation_failure_does_not_create_fallback(self):
        def reject(*_): raise ValueError('Schema cannot save cancelled orders')
        with self.assertRaises(ValueError): r.prepare(self.repo, self.previous, validator=reject)
        self.assertEqual(r.git(self.repo, 'rev-parse', 'HEAD'), self.previous)
        self.assertEqual(r.git(self.repo, 'for-each-ref', '--format=%(refname)', 'refs/levants'), '')

    def test_helper_hook_is_idempotent_and_before_checkout(self):
        source = '#!/bin/bash\nset -Eeuo pipefail\nelse\n  ' + r.CAPTURE + '\nfi\ngit checkout --detach "$DEPLOY_SHA"\n'
        patched = r.patched_helper(source)
        self.assertEqual(r.patched_helper(patched), patched)
        self.assertEqual(patched.count(r.MARKER), 1)
        self.assertLess(patched.index(r.MARKER), patched.index('git checkout'))
        r.run(['bash', '-n'], data=patched.replace('else\n', 'if true; then\n'))

    def test_unexpected_helper_is_rejected(self):
        with self.assertRaises(ValueError): r.patched_helper('unexpected helper')
        with self.assertRaises(ValueError): r.patched_helper(r.CAPTURE + '\n' + r.CAPTURE)
        with self.assertRaises(ValueError): r.patched_helper('git checkout --detach new\n' + r.CAPTURE)
        with self.assertRaises(ValueError): r.patched_helper(r.CAPTURE + '\n' + r.MARKER + '\nwrong hook\n')


if __name__ == '__main__':
    module_root = os.environ.get('ROLLBACK_MODULE_ROOT')
    if module_root:
        helper = (HERE / 'fixtures/auto-deploy.before-compatible.sh').read_text()
        outcomes = r.rehearse(helper, Path(module_root).resolve(), HERE / 'compatible-rollback.py')
        print('Exact deployment helper offline rehearsals:', outcomes)
    unittest.main()

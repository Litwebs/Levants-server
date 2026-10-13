import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('repair', Path(__file__).with_name('refresh-google-network.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class NetworkRefreshTests(unittest.TestCase):
    def test_only_known_hosts_are_resolved_and_addresses_are_deduplicated(self):
        calls = []
        def resolve(host, port, **kwargs):
            calls.append((host, port))
            return [(None, None, None, None, ('8.8.8.8', port))]
        source, count = r.resolve_policy(resolve)
        self.assertEqual(calls, [(host, 443) for host in r.HOSTS])
        self.assertEqual(count, 1)
        self.assertIn('IPAddressAllow=8.8.8.8\n', source)
        self.assertNotIn('IPAddressDeny=', source)
        self.assertNotIn('0.0.0.0/0', source)

    def test_private_loopback_link_local_and_empty_resolution_are_rejected(self):
        for address in ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', None]:
            with self.subTest(address=address), self.assertRaises(ValueError):
                r.resolve_policy(lambda host, port, **kwargs: [] if address is None else [(None, None, None, None, (address, port))])

    def exercise(self, fail=None, wrong_release=False):
        with tempfile.TemporaryDirectory() as tmp:
            policy = Path(tmp) / 'google.conf'
            original = '[Service]\nIPAddressAllow=8.8.8.8\n'
            updated = '[Service]\nIPAddressAllow=1.1.1.1\n'
            policy.write_text(original)
            writes, commands = [], []
            def write(path, text, mode, group):
                self.assertEqual(path, policy)
                self.assertEqual((mode, group), (0o640, 123))
                writes.append(text)
                path.write_text(text)
            def run(*args):
                commands.append(args)
                if fail == 'restart' and len(commands) == 2: raise RuntimeError('fixture')
            probe = lambda: 'wrong' if wrong_release else 'approved-release'
            if fail or wrong_release:
                with self.assertRaises(RuntimeError):
                    r.apply_refresh(policy, updated, 0o640, 123, 'approved-release', writer=write, run=run, probe=probe, pause=lambda _: None)
                self.assertEqual(policy.read_text(), original)
                self.assertEqual(writes, [updated, original])
            else:
                r.apply_refresh(policy, updated, 0o640, 123, 'approved-release', writer=write, run=run, probe=probe, pause=lambda _: None)
                self.assertEqual(policy.read_text(), updated)
            self.assertTrue(all(command == ('systemctl', 'daemon-reload') or command == ('systemctl', 'restart', 'levants-uat-api.service') for command in commands))

    def test_success_preserves_mode_group_and_restarts_only_uat(self): self.exercise()
    def test_restart_failure_restores_original_policy(self): self.exercise(fail='restart')
    def test_wrong_release_restores_original_policy(self): self.exercise(wrong_release=True)

    def test_symlink_policy_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'real.conf'
            target.write_text('[Service]\nIPAddressAllow=8.8.8.8\n')
            link = Path(tmp) / 'google.conf'
            link.symlink_to(target)
            with self.assertRaises(ValueError): r.protected_policy(link)

    def test_production_process_guard_uses_only_cwd_comm_and_start_time(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            production = root / 'production'
            production.mkdir()
            process = root / '1234'
            process.mkdir()
            (process / 'cwd').symlink_to(production, target_is_directory=True)
            (process / 'exe').symlink_to(root / 'node')
            fields = ['S'] + ['0'] * 18 + ['987654']
            (process / 'stat').write_text('1234 (node) ' + ' '.join(fields))
            self.assertEqual(r.production_processes(root, production), [(1234, 987654)])

    def test_missing_production_processes_fail_before_maintenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError): r.production_processes(Path(tmp), Path(tmp) / 'missing')


if __name__ == '__main__': unittest.main()

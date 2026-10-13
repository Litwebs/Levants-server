import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('repair', Path(__file__).with_name('set-uat-warehouse.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class WarehouseMaintenanceTests(unittest.TestCase):
    def test_adds_only_approved_settings_and_preserves_existing_secrets_verbatim(self):
        source = 'APP_ENV="uat"\nOTHER_KEY="PRIVATE_TEST_VALUE"\n# keep this comment\n'
        result = r.warehouse_settings(source, '53.811279', '-1.775440')
        self.assertEqual(result, source + 'WAREHOUSE_LAT="53.811279"\nWAREHOUSE_LNG="-1.775440"\n')

    def test_replaces_duplicate_coordinate_rows_without_changing_other_rows(self):
        source = 'APP_ENV=uat\nWAREHOUSE_LAT=0\nOTHER_KEY="PRIVATE_TEST_VALUE"\nWAREHOUSE_LAT=1\nWAREHOUSE_LNG=2\n'
        result = r.warehouse_settings(source, '53.811279', '-1.775440')
        self.assertEqual(result.count('WAREHOUSE_LAT='), 1)
        self.assertEqual(result.count('WAREHOUSE_LNG='), 1)
        self.assertIn('OTHER_KEY="PRIVATE_TEST_VALUE"\n', result)

    def test_missing_nonfinite_and_out_of_range_coordinates_are_rejected(self):
        for lat, lng in [('', '-1'), ('nan', '-1'), ('inf', '-1'), ('91', '0'), ('0', '-181'), ('invalid', '-1')]:
            with self.subTest(lat=lat, lng=lng), self.assertRaises(ValueError):
                r.warehouse_settings('APP_ENV=uat\n', lat, lng)

    def exercise(self, fail=False, wrong_release=False):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / 'api.env'
            original = 'APP_ENV=uat\nOTHER_KEY="PRIVATE_TEST_VALUE"\n'
            updated = r.warehouse_settings(original, '53.811279', '-1.775440')
            config.write_text(original)
            writes, commands = [], []
            def write(path, text, mode, group):
                self.assertEqual(path, config)
                self.assertEqual((mode, group), (0o640, 123))
                writes.append(text)
                path.write_text(text)
            def run(*args):
                commands.append(args)
                if fail and len(commands) == 1: raise RuntimeError('fixture')
            arguments = dict(writer=write, run=run, probe=lambda: 'wrong' if wrong_release else 'approved', pause=lambda _: None)
            if fail or wrong_release:
                with self.assertRaises(RuntimeError): r.apply_refresh(config, updated, 0o640, 123, 'approved', **arguments)
                self.assertEqual(config.read_text(), original)
                self.assertEqual(writes, [updated, original])
            else:
                r.apply_refresh(config, updated, 0o640, 123, 'approved', **arguments)
                self.assertEqual(config.read_text(), updated)
            self.assertTrue(all(command == ('systemctl', 'restart', 'levants-uat-api.service') for command in commands))

    def test_success_preserves_permissions_and_restarts_only_uat(self): self.exercise()
    def test_restart_failure_restores_all_original_settings(self): self.exercise(fail=True)
    def test_wrong_release_restores_original_settings(self): self.exercise(wrong_release=True)

    def test_redirected_environment_path_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'real.env'
            target.write_text('APP_ENV=uat\n')
            link = Path(tmp) / 'api.env'
            link.symlink_to(target)
            with self.assertRaises(ValueError): r.protected_policy(link)

    def test_production_environment_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / 'api.env'
            config.write_text('APP_ENV=production\n')
            with self.assertRaises(ValueError): r.protected_policy(config)


if __name__ == '__main__': unittest.main()

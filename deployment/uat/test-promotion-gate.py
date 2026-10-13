import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('gate', Path(__file__).with_name('promotion-gate.py'))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

class PromotionEvidenceTests(unittest.TestCase):
    def test_only_successful_push_of_exact_uat_commit(self):
        run = dict(head_sha='abc', head_branch='uat', event='push', status='completed', conclusion='success')
        self.assertTrue(gate.accepted_run(run, 'abc'))
        for field, bad in [('head_sha','other'), ('head_branch','main'), ('event','pull_request'),
                           ('status','in_progress'), ('conclusion','failure'), ('conclusion','skipped')]:
            self.assertFalse(gate.accepted_run({**run, field: bad}, 'abc'))

    def test_old_or_incomplete_workflow_cannot_pass(self):
        jobs = [dict(name=n, status='completed', conclusion='success') for n in
                ['verify', 'deploy', 'Configured UAT provider checks', 'Real Stripe and browser checks / Subscription E2E (Stripe test mode)']]
        self.assertTrue(gate.accepted_jobs(jobs))
        for index in range(len(jobs)):
            self.assertFalse(gate.accepted_jobs(jobs[:index] + jobs[index+1:]))
            for result in ['failure', 'cancelled', 'skipped']:
                changed = [dict(j) for j in jobs]
                changed[index]['conclusion'] = result
                self.assertFalse(gate.accepted_jobs(changed))

    def test_named_browser_suites_require_the_complete_result(self):
        jobs = [dict(name=n, status='completed', conclusion='success') for n in
                ['verify', 'deploy', 'Configured UAT provider checks',
                 'Browser automation / All browser suites passed']]
        self.assertTrue(gate.accepted_jobs(jobs))
        # Passing an individual browser suite does not satisfy promotion.
        self.assertFalse(gate.accepted_jobs(jobs[:3] + [
            dict(name='Browser automation / Order checkout and reviews',
                 status='completed', conclusion='success')]))
        for result in ['failure', 'cancelled', 'skipped']:
            self.assertFalse(gate.accepted_jobs(jobs[:3] + [
                dict(name=jobs[3]['name'], status='completed', conclusion=result)]))
        self.assertFalse(gate.accepted_jobs(jobs[:3] + [
            dict(name=jobs[3]['name'], status='in_progress', conclusion='success')]))

if __name__ == '__main__':
    unittest.main()

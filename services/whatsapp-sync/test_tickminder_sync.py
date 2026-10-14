import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from tickminder_sync import TimetableClient, SyncError, check_busy, client_from_config


def snapshot():
    return {'ok': True, 'revision': 7, 'binding': {'student': 'Sample Student', 'teacherName': 'Sample Teacher', 'subject': 'Maths'},
            'lessons': [{'id': 'web-1', 'plannedStart': '2099-11-04T10:00:00.000Z', 'plannedEnd': '2099-11-04T11:00:00.000Z', 'status': 'scheduled', 'updatedAt':'2099-10-01T00:00:00.000Z'}],
            'busy': [{'start': '2099-11-05T10:00:00.000Z', 'end': '2099-11-05T11:00:00.000Z', 'participant': 'student', 'status': 'confirmed'}]}


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.client = TimetableClient('https://example.test', 'x'*40, 'bound_course')
        self.state = {'timetables': {}, 'questions': [{'status': 'waiting_for_teacher'}], 'languages': {'teacher': 'zh'}}
        self.client.import_snapshot(self.state, snapshot())

    def agree(self):
        plan = self.state['timetables']['2099-11']
        plan['consents'] = {'teacher': 'genuine-teacher-id', 'student': 'genuine-student-id'}
        return plan

    def test_unconfigured_or_disabled_does_not_access_network_or_require_token(self):
        with tempfile.TemporaryDirectory() as path:
            self.assertIsNone(client_from_config(path, 'any'))
            (Path(path)/'data').mkdir()
            (Path(path)/'data/tickminder-sync.json').write_text(json.dumps({'enabled': False}))
            self.assertIsNone(client_from_config(path, 'any'))

    def test_unsafe_origin_is_rejected(self):
        for url in ('http://example.test', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test?token=secret'):
            with self.assertRaises(SyncError): TimetableClient(url, 'x'*40, 'course')

    def test_initial_import_archives_old_timetables_without_upload(self):
        state = {'timetables': {'old': {'lessons': [{'id': 'demo'}]}}, 'questions': ['retained'],
                 'timetable_proposals': {'P1': {'status': 'WAITING_FOR_AGREEMENT'}}}
        self.client.import_snapshot(state, snapshot())
        self.assertEqual(state['before_website_import']['timetables']['old']['lessons'][0]['id'], 'demo')
        self.assertEqual(state['questions'], ['retained'])
        self.assertEqual(state['timetable_proposals']['P1']['status'], 'SUPERSEDED')
        self.assertEqual(state['timetables']['2099-11']['lessons'][0]['start'], '18:00')

    def test_snapshot_refresh_retains_stable_ids_and_revision_when_unchanged(self):
        before = copy.deepcopy(self.state['timetables'])
        self.client.import_snapshot(self.state, snapshot())
        self.assertEqual(self.state['timetables'], before)

    def test_other_course_busy_blocks_without_names_and_adjacent_is_allowed(self):
        with self.assertRaises(SyncError) as result: check_busy(self.state, [{'date': '2099-11-05', 'start':'18:30','end':'19:30'}])
        self.assertNotIn('Sample',str(result.exception))
        check_busy(self.state,[{'date':'2099-11-05','start':'19:00','end':'20:00'}])

    def test_both_real_agreements_required(self):
        self.state['timetables']['2099-11']['consents'] = {'teacher':'teacher-id'}
        with patch.object(self.client,'request') as request:
            with self.assertRaises(SyncError): self.client.commit_month(self.state,'2099-11','operation',lambda:None)
            request.assert_not_called()

    def test_existing_lesson_keeps_website_identity_and_pending_is_persisted_first(self):
        plan = self.agree(); plan['lessons'][0].update(date='2099-11-06',start='19:00',end='20:00')
        persisted=[]
        def request(payload):
            self.assertEqual(persisted[-1]['website_sync_status'],'pending')
            self.assertEqual(payload['changes'][0]['websiteId'],'web-1')
            self.assertEqual(payload['changes'][0]['start'],'2099-11-06T11:00:00.000Z')
            result=snapshot()
            result['lessons'][0].update(plannedStart=payload['changes'][0]['start'],plannedEnd=payload['changes'][0]['end'])
            return {**result,'applied':[{'localId':plan['lessons'][0]['id'],'websiteId':'web-1'}], 'revision':8}
        with patch.object(self.client,'request',side_effect=request):
            self.client.commit_month(self.state,'2099-11','operation',lambda:persisted.append(copy.deepcopy(self.state)))
        self.assertNotIn('website_pending',self.state)
        self.assertEqual(self.state['website_sync_status'],'updated')
        self.assertEqual(self.state['questions'],[{'status':'waiting_for_teacher'}])

    def test_uncertain_update_is_not_retried_or_overwritten(self):
        plan=self.agree();plan['lessons'][0]['start']='17:00'
        with patch.object(self.client,'request',side_effect=SyncError('uncertain')) as request:
            with self.assertRaises(SyncError):self.client.commit_month(self.state,'2099-11','operation',lambda:None)
            with self.assertRaises(SyncError):self.client.refresh(self.state)
            with self.assertRaises(SyncError):self.client.commit_month(self.state,'2099-11','operation',lambda:None)
            self.assertEqual(request.call_count,1)
        self.assertEqual(self.state['website_sync_status'],'needs_admin')

    def test_ok_without_matching_website_readback_does_not_claim_success(self):
        plan=self.agree();plan['lessons'][0]['start']='17:00'
        result={**snapshot(),'applied':[{'localId':plan['lessons'][0]['id'],'websiteId':'web-1'}]}
        with patch.object(self.client,'request',return_value=result):
            with self.assertRaises(SyncError):self.client.commit_month(self.state,'2099-11','operation',lambda:None)
        self.assertEqual(self.state['website_sync_status'],'needs_admin')

    def test_no_implicit_deletion_or_undated_makeup(self):
        plan=self.agree();plan['lessons']=[]
        with self.assertRaises(SyncError):self.client.commit_month(self.state,'2099-11','operation',lambda:None)
        self.setUp();plan=self.agree();plan['lessons'][0]['status']='awaiting_makeup'
        with self.assertRaises(SyncError):self.client.commit_month(self.state,'2099-11','operation',lambda:None)


if __name__ == '__main__': unittest.main()

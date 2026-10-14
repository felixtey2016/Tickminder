"""Optional trusted classroom backend integration. No new model tools or messages.

Website credentials never enter the model context or participant chat.
"""
import copy
import datetime as dt
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

KL = ZoneInfo('Asia/Kuala_Lumpur')


class SyncError(ValueError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SyncError('Website redirected the integration request; no credential was forwarded.')


def local_row(row):
    start = dt.datetime.fromisoformat(row['plannedStart'].replace('Z', '+00:00')).astimezone(KL)
    end = dt.datetime.fromisoformat(row['plannedEnd'].replace('Z', '+00:00')).astimezone(KL)
    if start.date() != end.date():
        raise SyncError('An overnight website lesson needs administrator review before synchronization.')
    return {'date': start.date().isoformat(), 'start': start.strftime('%H:%M'), 'end': end.strftime('%H:%M')}


def iso(row, key):
    return dt.datetime.fromisoformat(row['date']+'T'+row[key]).replace(tzinfo=KL).astimezone(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def client_from_config(home, classroom_id):
    file = Path(home)/'data/tickminder-sync.json'
    if not file.exists():
        return None
    config = json.loads(file.read_text())
    if config.get('enabled') is not True:
        return None
    alias = config.get('classrooms', {}).get(classroom_id)
    if not isinstance(alias, str) or not alias:
        raise SyncError('This course has not been bound to the website by the administrator.')
    token = os.environ.get('TICKMINDER_TIMETABLE_TOKEN', '')
    return TimetableClient(config.get('origin', ''), token, alias)


class TimetableClient:
    def __init__(self, origin, token, classroom_id):
        url = urllib.parse.urlsplit(origin)
        if (url.scheme != 'https' and not (url.scheme == 'http' and url.hostname in {'127.0.0.1', 'localhost'})) or not url.hostname or url.username or url.password or url.path not in {'', '/'} or url.query or url.fragment:
            raise SyncError('Configure a fixed HTTPS website origin without credentials or a path.')
        if not isinstance(token, str) or len(token) < 32:
            raise SyncError('The dedicated website timetable credential is not configured.')
        self.endpoint = origin.rstrip('/')+'/api/hermes/timetable'
        self.token, self.classroom_id = token, classroom_id

    def request(self, payload):
        payload = {**payload, 'classroomId': self.classroom_id}
        req = urllib.request.Request(self.endpoint, data=json.dumps(payload).encode(), headers={
            'Authorization': 'Bearer '+self.token, 'Content-Type': 'application/json'}, method='POST')
        try:
            with urllib.request.build_opener(NoRedirect()).open(req, timeout=15) as response:
                content = response.read(2_000_001)
            if len(content) > 2_000_000:
                raise SyncError('The website timetable response is too large.')
            value = json.loads(content)
            if not isinstance(value, dict) or value.get('ok') is not True:
                raise SyncError('Website did not verify this timetable operation.')
            return value
        except SyncError:
            raise
        except urllib.error.HTTPError as error:
            raise SyncError(f'Website timetable operation was rejected (HTTP {error.code}). Refresh/review the website; do not claim it was updated.') from None
        except Exception:
            raise SyncError('Website timetable result is unavailable or uncertain. Do not claim success or retry automatically.') from None

    def refresh(self, state):
        if state.get('website_pending'):
            raise SyncError('A previous website update needs administrator reconciliation. Do not overwrite or retry it automatically.')
        remote = self.request({'action': 'snapshot'})
        self.import_snapshot(state, remote)

    def import_snapshot(self, state, remote):
        previous = state.get('timetables', {})
        if not state.get('website_initialized'):
            # Preserve all original demo records. Never upload them during connection.
            state['before_website_import'] = copy.deepcopy({k: state.get(k) for k in ('timetables', 'timetable_proposals', 'reschedule')})
            for proposal in state.get('timetable_proposals', {}).values():
                if proposal.get('status') == 'WAITING_FOR_AGREEMENT':
                    proposal['status'] = 'SUPERSEDED'
            current = state.get('reschedule') or {}
            if current.get('status') == 'WAITING_FOR_COUNTERPART':
                current['status'] = 'WEBSITE_REBOUND'
            previous = {}
        known = {row.get('website_id'): row for plan in previous.values() for row in plan['lessons'] if row.get('website_id')}
        plans = {}
        for row in remote['lessons']:
            if row['status'] == 'cancelled':
                continue
            item = copy.deepcopy(known.get(row['id'], {}))
            item.update(local_row(row))
            item.update(id=item.get('id') or 'site-'+row['id'], website_id=row['id'], status=row['status'])
            item.setdefault('history', [])
            month = item.setdefault('billing_month', item['date'][:7])
            if month not in plans:
                plans[month] = {**copy.deepcopy(previous.get(month, {})), 'month': month, 'lessons': [], 'subject': remote['binding']['subject'], 'agreed_by': ['teacher','student']}
            plans[month]['lessons'].append(item)
        for month, plan in plans.items():
            plan['lessons'].sort(key=lambda r: (r['date'], r['start']))
            old = previous.get(month, {})
            plan['revision'] = old.get('revision', 0)+(plan['lessons'] != old.get('lessons'))
            plan.setdefault('lesson_serial', len(plan['lessons']))
            plan.setdefault('frequency', {'period': 'month', 'count': len(plan['lessons'])})
            plan.setdefault('weekly_slots', [])
        state.update(timetables=plans, website_initialized=True,
                     website_snapshot=copy.deepcopy(remote), website_sync_status='current')

    def commit_month(self, state, month, operation_id, persist):
        if state.get('website_pending'):
            raise SyncError('A previous website update needs administrator reconciliation; do not retry it automatically.')
        plan = state['timetables'][month]
        confirmations = plan.get('consents', {})
        if set(confirmations) != {'teacher', 'student'} or not all(confirmations.values()) or confirmations['teacher'] == confirmations['student']:
            raise SyncError('Both participants must explicitly agree to the same dated timetable before website synchronization.')
        remote = state.get('website_snapshot')
        if not remote:
            raise SyncError('Read the authoritative website timetable before attempting an update.')
        by_id = {r['id']: r for r in remote['lessons']}
        included = {r.get('website_id') for r in plan['lessons']}
        required = {r['id'] for r in remote['lessons'] if r['status'] != 'cancelled' and local_row(r)['date'][:7] == month}
        if not required <= included:
            raise SyncError('Replacing or removing existing website lessons needs administrator review. No website lessons were deleted.')
        changes = []
        for row in plan['lessons']:
            if row.get('status') == 'awaiting_makeup':
                raise SyncError('Undated make-up carry-forward is not part of the first website integration. Ask the administrator to handle it.')
            old = by_id.get(row.get('website_id'))
            start, end = iso(row, 'start'), iso(row, 'end')
            if old and old['plannedStart'] == start and old['plannedEnd'] == end:
                continue
            if row.get('website_id') and not old:
                raise SyncError('This website lesson no longer exists. Refresh before arranging a new proposal.')
            changes.append({'localId': row['id'], 'start': start, 'end': end, **({'websiteId': row['website_id'],
                'expected': {'start':old['plannedStart'],'end':old['plannedEnd'],'updatedAt':old['updatedAt']}} if old else {})})
        if not changes:
            return
        payload = {'action': 'commit', 'operationId': operation_id, 'expectedRevision': remote['revision'],
                   'confirmations': confirmations, 'changes': changes}
        state['website_pending'] = payload
        state['website_sync_status'] = 'pending'
        persist()
        try:
            result = self.request(payload)
            mapping = {r['localId']: r['websiteId'] for r in result['applied']}
            saved = {r['id']: r for r in result['lessons']}
            if (set(mapping) != {c['localId'] for c in changes}
                    or len(mapping) != len(result['applied'])
                    or len(set(mapping.values())) != len(mapping)
                    or result['binding'] != remote['binding']):
                raise SyncError('Website did not verify every requested lesson.')
            for change in changes:
                target = mapping[change['localId']]
                actual = saved.get(target, {})
                if ((change.get('websiteId') and target != change['websiteId'])
                        or actual.get('plannedStart') != change['start']
                        or actual.get('plannedEnd') != change['end']
                        or actual.get('status') != 'scheduled'):
                    raise SyncError('Website read-back does not match the agreed lesson.')
            for row in plan['lessons']:
                if row['id'] in mapping:
                    row['website_id'] = mapping[row['id']]
            state['website_snapshot'] = result
            state.pop('website_pending')
            state['website_sync_status'] = 'updated'
            persist()
        except Exception:
            state['website_sync_status'] = 'needs_admin'
            persist()
            raise SyncError('Both agreed, but the website update failed or is uncertain. Do not send a confirmed timetable or claim the website was updated. Administrator review is required.') from None


def check_busy(state, lessons):
    for item in state.get('website_snapshot', {}).get('busy', []):
        busy = local_row({'plannedStart':item['start'], 'plannedEnd':item['end']})
        for candidate in lessons:
            if candidate.get('status') != 'awaiting_makeup' and candidate['date'] == busy['date'] and candidate['start'] < busy['end'] and busy['start'] < candidate['end']:
                raise SyncError(f"{busy['date']} {busy['start']}–{busy['end']} is unavailable or awaiting agreement. Suggest a different time; do not reveal any other course or person.")

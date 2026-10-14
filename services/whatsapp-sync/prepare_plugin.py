"""Prepare a reviewable copy of the tested Hermes plugin. Never installs/restarts it."""
import argparse
import ast
from pathlib import Path
import shutil

HELPERS = '''
def _tickminder_module():
    import importlib.util
    import sys
    name = "tuition_tickminder_sync_backend"
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name("tickminder_sync.py"))
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return sys.modules[name]


def _tickminder_client():
    from hermes_constants import get_hermes_home
    return _tickminder_module().client_from_config(get_hermes_home(), CLASSROOM.get())


def _tickminder_refresh(state):
    client = _tickminder_client()
    if client:
        client.refresh(state)


def _tickminder_commit(path, state, month, operation_id):
    client = _tickminder_client()
    if client:
        client.commit_month(state, month, operation_id, lambda: save(path, state))

'''


def prepare(source, output):
    source, output = Path(source), Path(output)
    text = (source/'__init__.py').read_text()
    if '_tickminder_commit' in text:
        raise ValueError('This plugin already has the website integration; do not apply it twice.')
    def replace(old, new):
        nonlocal text
        if text.count(old) != 1:
            raise ValueError('The installed plugin differs from the reviewed version; inspect before patching: '+old[:65])
        text = text.replace(old, new)
    replace('def notify_month(path, state, month, operation_id):\n', HELPERS+'\ndef notify_month(path, state, month, operation_id):\n    _tickminder_commit(path, state, month, operation_id)\n')
    replace('    check_other_classrooms(lessons)\n', '    check_other_classrooms(lessons)\n    _tickminder_module().check_busy(state, lessons)\n')
    replace('            with classroom_scope(cid):\n                old_keys =', '            with classroom_scope(cid):\n                if handler in (_pair_timetable, _pair_reschedule):\n                    with locked_state() as (sync_path, sync_state):\n                        _tickminder_refresh(sync_state)\n                        save(sync_path, sync_state)\n                old_keys =')
    replace('        with classroom_scope(cid):\n            result = json.loads(_pair_context({}))', '        with classroom_scope(cid):\n            website_error = False\n            try:\n                with locked_state() as (sync_path, sync_state):\n                    _tickminder_refresh(sync_state)\n                    save(sync_path, sync_state)\n            except ValueError:\n                website_error = True\n            result = json.loads(_pair_context({}))\n            if website_error:\n                result["website_status"] = "unavailable_or_needs_review"\n                result["website_instruction"] = "Ordinary questions can still be relayed. Do not claim a website timetable update succeeded. Schedule actions must pass the website backend checks."')
    replace('                if action == "revise":\n                    proposal["change"] = change', '                if action == "revise":\n                    proposal["consents"] = {role: origin}\n                    proposal["change"] = change')
    replace('            if role not in proposal["agreements"]:\n', '            proposal.setdefault("consents", {})[role] = origin\n            if role not in proposal["agreements"]:\n')
    replace('            proposal["status"] = "CONFIRMED"\n', '            state["timetables"][month]["consents"] = dict(proposal.get("consents", {}))\n            proposal["status"] = "CONFIRMED"\n')
    replace('                state["reschedule"] = current\n', '                current["consents"] = {role: origin}\n                state["reschedule"] = current\n')
    replace('                result = notify_month(path, state, month, f"reschedule-confirm:{current[\'id\']}")', '                current.setdefault("consents", {})[role] = origin\n                plan["consents"] = dict(current["consents"])\n                save(path, state)\n                result = notify_month(path, state, month, f"reschedule-confirm:{current[\'id\']}")')
    replace('return {key: private_projection(item, person) for key, item in value.items()}', 'return {key: private_projection(item, person) for key, item in value.items() if key not in {"consents", "website_id"}}')
    ast.parse(text)
    output.mkdir(parents=True, exist_ok=False)
    (output/'__init__.py').write_text(text)
    shutil.copy2(Path(__file__).with_name('tickminder_sync.py'), output/'tickminder_sync.py')
    # Local staging only: the real private roster never belongs in the public repository.
    for name in ('roster.json', 'plugin.yaml'):
        shutil.copy2(source/name, output/name)
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    print(prepare(args.source, args.output))

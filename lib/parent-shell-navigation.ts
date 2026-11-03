import type {ParentWorkspaceView} from './parent-navigation';

export type ParentPrimaryView='home'|'learnHub'|'finance'|'mineHub';
export type ParentShellView=ParentWorkspaceView|ParentPrimaryView|'account'|'notifications'|'quizzes';

const views:ReadonlySet<string>=new Set(['home','learnHub','mineHub','calendar','lessons','attendance','homework','materials','recordings','learning','finance','account','notifications','quizzes']);

export function isParentShellView(value:unknown):value is ParentShellView{
  return typeof value==='string'&&views.has(value);
}

export function parentPrimaryFor(view:ParentShellView):ParentPrimaryView{
  if(view==='home'||view==='finance')return view;
  if(view==='account'||view==='notifications'||view==='mineHub')return'mineHub';
  return'learnHub';
}

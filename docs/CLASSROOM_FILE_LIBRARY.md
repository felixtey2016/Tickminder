# Classroom file library

Classroom → Teaching materials presents the existing folders and PDF materials
as one file library. The toolbar searches names in the current folder and sorts
files by update date or name. Breadcrumbs and the existing parent-folder action
retain the current class scope. Folders are listed by name.

Administrators, teachers and students use the same compact file presentation for
their existing authorised materials. Desktop lists show file names, uploader and
update date. Selecting a file opens a side preview; mobile uses a full-height
preview dialog. The details/actions button retains the existing content detail,
version, edit and delete controls. Users with folder placement permission can
start the existing move-to-folder workflow there. Student access remains read
only. Archived classrooms retain their existing restrictions.

The existing materials upload form supports dropping one PDF in classroom mode.
It checks the file type and configured size limit, suggests a title from the
filename when the title is empty, and still requires explicit publication. A
drop does not upload or publish by itself. Global material upload, homework and
their submission workflows retain their existing presentation.

PDF previews use the existing protected file route and current organisation
session. The browser fetches only the selected file, checks the response type
and PDF header, cancels stale requests and releases temporary URLs when no longer
needed. File removal, a new file version, hiding the selected file through search
or an identity refresh invalidates the preview. Open-in-new-tab and download
remain available. No new storage service, permission, database migration or
background polling task is introduced.

The compact library applies to classroom materials. Homework keeps its current
folder organiser and list/detail workflow. The separate resource catalogue and
its assignment permissions remain in place; empty assigned-resource sections do
not occupy space in a classroom folder.

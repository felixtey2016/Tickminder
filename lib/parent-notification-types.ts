export type ParentNoticeKind='invoice_issued'|'invoice_due_soon'|'invoice_due'|'invoice_overdue'|'student_absent';
export type ParentNoticeResolution='attendance_corrected'|'invoice_settled'|'invoice_void'|'invoice_updated';
export type ParentNotice={id:string;kind:ParentNoticeKind;studentId:string;student:string;createdAt:string;dueAt:string;readAt:string|null;state:'active'|'resolved';resolution:ParentNoticeResolution|null;invoiceNumber?:string;invoiceDueDate?:string;lessonStart?:string;subject?:string};
export type ParentNotificationState={items:ParentNotice[];page:number;pages:number;total:number;pageSize:20;unreadCount:number};
export type ParentNoticeTarget={kind:'invoice'|'lesson';studentId:string;recordId:string;month:string;childPage:number;lessonPage?:number};

export type ParentNotificationItem=ParentNotice;
export type ParentNotificationList=ParentNotificationState;
export type ParentNotificationTarget=ParentNoticeTarget;

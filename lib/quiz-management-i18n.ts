const pairs:Record<string,[string,string]>={
 'quiz.delete':['删除测验','Delete quiz'],
 'quiz.deleteTitle':['确认删除测验？','Delete this quiz?'],
 'quiz.deleteDescription':['删除后，题库将不再显示此测验，并停止新增作答。已有作答和成绩会保留。','This quiz will be removed from the library and new attempts will stop. Existing attempts and results will be retained.'],
 'quiz.deleted':['测验已删除','Quiz deleted'],
 'quiz.copiedDraft':['已复制草稿；当前账号可查看，编辑需要另行授权。','Draft copied. This account can view it; editing requires permission.'],
 'quiz.permissionReadOnly':['当前账号仅可查看此草稿。','This account can only view this draft.'],
 'quiz.manageTab':['管理测验','Manage quizzes'],
 'quiz.chiefAdmin':['集团最高管理员','Organisation chief administrator'],
 'quiz.noChiefAdmin':['尚未指定','Not designated'],
 'quiz.chiefUnavailable':['原指定账号已停用或不再是管理员','The designated account is disabled or no longer an administrator'],
 'quiz.chiefScope':['可删除本集团内的测验；普通管理员只能删除自己发布的测验。','May delete quizzes within this organisation. Other administrators may delete only their own quizzes.'],
 'quiz.chiefInvalid':['请选择本集团内有效的管理员，或刷新后重试。','Select an active administrator in this organisation, or refresh and try again.'],
 'quiz.chiefSaved':['集团最高管理员已更新','Organisation chief administrator updated'],
 'account.quizHistoryDeleteBlocked':['此账号关联测验、图片或练习历史，不能永久删除。请改为停用账号以保留记录；如需进一步处理，请联系管理员。','This account has quiz, image or practice history and cannot be permanently deleted. Disable the account to retain its records, or contact an administrator for assistance.'],
 'account.quizHistoryMergeBlocked':['原 Google 账号关联测验、图片或练习历史，暂不能自动合并。请保留现有登录方式并联系管理员处理；如需停用旧账号，请由管理员操作。','The existing Google account has quiz, image or practice history and cannot be merged automatically. Keep using the existing sign-in method and contact an administrator. An administrator can disable an old account if needed.'],
};
export const quizManagementZh=Object.fromEntries(Object.entries(pairs).map(([key,p])=>[key,p[0]]));
export const quizManagementEn=Object.fromEntries(Object.entries(pairs).map(([key,p])=>[key,p[1]]));

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { actionFailureMessage, readApiJson } from "@/lib/action-feedback";
import { groupFetch } from "@/lib/group-client";
import { t } from "@/lib/i18n";
import "@/lib/admin-permissions-i18n";
import type { AdminGrantKey, AdminPermissionModule, AdminPermissionsResponse } from "@/lib/admin-permissions";

type Step = "edit" | "review" | "apply" | "removeDraft" | "discard" | "reload";
type PermissionChange = { action: "saveDraft"; revision: number; grants: AdminGrantKey[] } | { action: "applyDraft" | "discardDraft"; revision: number };
type Props = { accountId: string; accountName: string; groupId?: string | null; onClose: () => void; onAuthorityLost: () => void };
class PermissionRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function requestPermissions(accountId: string, signal: AbortSignal, change?: PermissionChange, groupId?: string | null) {
  const response = await groupFetch(`/api/admin-permissions?accountId=${encodeURIComponent(accountId)}`, change ? {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, expectedRevision: change.revision, action: change.action, ...(change.action === "saveDraft" ? {grants: change.grants} : {}) }), signal, cache: "no-store",
  } : { signal, cache: "no-store" });
  let result: AdminPermissionsResponse & {error?: string};
  try { result = await readApiJson<AdminPermissionsResponse & {error?: string}>(response); }
  catch (failure) {
    if ([401, 403, 404, 409].includes(response.status)) throw new PermissionRequestError(response.status, response.status === 409 ? "permissions.revisionChanged" : "permissions.authorityLost");
    throw failure;
  }
  if (!response.ok) throw new PermissionRequestError(response.status, result.error || (change ? "permissions.saveFailed" : "permissions.loadFailed"));
  if (!["preparation", "active"].includes(result.rollout) || typeof result.runtimeEnforcement !== "boolean" || !result.profile || !Array.isArray(result.catalog)) throw new Error("permissions.unavailable");
  if (result.profile.accountId !== accountId || (groupId && result.profile.groupId !== groupId)) throw new PermissionRequestError(403, "permissions.authorityLost");
  return result;
}
function sorted(grants: readonly AdminGrantKey[]) { return [...grants].sort(); }
function equalGrants(left: readonly AdminGrantKey[], right: readonly AdminGrantKey[]) { return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right)); }
function savedGrants(data: AdminPermissionsResponse) { return [...(data.profile.draftGrants ?? data.configuredGrants)]; }
function currentActions(catalog: AdminPermissionModule[]) { return catalog.filter(module => module.availability === "current").flatMap(module => module.actions.filter(action => module.supportedActions.includes(action.id))); }
function withDependencies(grants: readonly AdminGrantKey[], catalog: AdminPermissionModule[]) {
  const actions = currentActions(catalog), available = new Map(actions.map(action => [action.key, action]));
  const selected = new Set(grants.filter(key => available.has(key)));
  function add(key: AdminGrantKey) {
    if (selected.has(key)) return;
    const action = available.get(key);
    if (!action) return;
    selected.add(key);
    action.requires.forEach(add);
  }
  for (const key of [...selected]) available.get(key)?.requires.forEach(add);
  return actions.filter(action => selected.has(action.key)).map(action => action.key);
}
function grantLabel(key: AdminGrantKey, catalog: AdminPermissionModule[]) {
  const module = catalog.find(module => module.actions.some(action => action.key === key));
  const action = module?.actions.find(action => action.key === key);
  return module && action ? `${t(module.labelKey)} · ${t(action.labelKey)}` : key;
}
function GrantSummary({grants, catalog}: {grants: readonly AdminGrantKey[]; catalog: AdminPermissionModule[]}) {
  return grants.length ? <ul className="permission-rule-list">{catalog.filter(module => module.actions.some(action => grants.includes(action.key))).map(module => <li key={module.id}><strong>{t(module.labelKey)}</strong><span>{module.actions.filter(action => grants.includes(action.key)).map(action => t(action.labelKey)).join(" · ")}</span></li>)}</ul> : <p className="muted">{t("permissions.none")}</p>;
}

export function AdminPermissionEditor({accountId, accountName, groupId, onClose, onAuthorityLost}: Props) {
  const [data, setData] = useState<AdminPermissionsResponse | null>(null);
  const [draft, setDraft] = useState<AdminGrantKey[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [operation, setOperation] = useState<PermissionChange["action"] | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false), [step, setStep] = useState<Step>("edit");
  const [templateId, setTemplateId] = useState("");
  const mounted = useRef(true), savingGuard = useRef(false), loadingGuard = useRef(false);
  const controller = useRef<AbortController | null>(null), dataRef = useRef(data);
  const statusRef = useRef<HTMLDivElement>(null);
  const baseline = data ? savedGrants(data) : [];
  const dirty = Boolean(data && !equalGrants(draft, baseline));
  const canSave = dirty || Boolean(data && data.profile.draftGrants === null);
  const additions = draft.filter(key => !baseline.includes(key)), removals = baseline.filter(key => !draft.includes(key));
  const storedDraft = data?.profile.draftGrants ?? [];
  // Disabled accounts have no effective access, but their stored configuration
  // still determines the permissions used if the account is enabled again.
  const appliedGrants = data?.configuredGrants ?? [];
  const applyAdditions = storedDraft.filter(key => !appliedGrants.includes(key)), applyRemovals = appliedGrants.filter(key => !storedDraft.includes(key));
  const authorizedFailure = useCallback((failure: unknown) => {
    if (failure instanceof PermissionRequestError && [401, 403, 404].includes(failure.status)) { onAuthorityLost(); return true; }
    return false;
  }, [onAuthorityLost]);
  const load = useCallback(async () => {
    if (loadingGuard.current || savingGuard.current) return;
    loadingGuard.current = true;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError(""); setNotice("");
    try {
      const next = await requestPermissions(accountId, request.signal, undefined, groupId);
      if (!mounted.current || request.signal.aborted) return;
      dataRef.current = next; setData(next); setDraft(savedGrants(next)); setConflict(false); setTemplateId(""); setStep("edit");
    } catch (failure) {
      if (!mounted.current || request.signal.aborted || authorizedFailure(failure)) return;
      setError(actionFailureMessage(failure, "permissions.loadFailed"));
    } finally {
      if (controller.current === request) {
        loadingGuard.current = false;
        if (mounted.current && !request.signal.aborted) setLoading(false);
      }
    }
  }, [accountId, groupId, authorizedFailure]);
  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; controller.current?.abort(); loadingGuard.current = false; };
  }, [load]);
  // Revalidate authority when returning to the editor. A newer revision never
  // replaces an unsaved local draft; the user must explicitly reload it.
  useEffect(() => {
    let checking = false;
    const request = new AbortController();
    async function verify() {
      if (document.visibilityState !== "visible" || checking || loadingGuard.current || savingGuard.current || !dataRef.current) return;
      checking = true;
      const current = dataRef.current;
      try {
        const next = await requestPermissions(accountId, request.signal, undefined, groupId);
        if (mounted.current && !savingGuard.current && dataRef.current === current && (next.profile.revision !== current.profile.revision || next.runtimeEnforcement !== current.runtimeEnforcement || !equalGrants(next.effectiveGrants, current.effectiveGrants))) { setConflict(true); setStep("edit"); }
      } catch (failure) { if (!request.signal.aborted) authorizedFailure(failure); }
      finally { checking = false; }
    }
    window.addEventListener("focus", verify);
    document.addEventListener("visibilitychange", verify);
    return () => { request.abort(); window.removeEventListener("focus", verify); document.removeEventListener("visibilitychange", verify); };
  }, [accountId, groupId, authorizedFailure]);
  useEffect(() => {
    if (!dirty) return;
    function preventUnload(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);
  useEffect(() => { if (step !== "edit") statusRef.current?.focus(); }, [step]);
  function requestClose() {
    if (savingGuard.current) return;
    if (dirty) setStep("discard"); else onClose();
  }
  function toggleGrants(keys: AdminGrantKey[], checked: boolean) {
    if (!data || conflict || savingGuard.current) return;
    const requested = new Set(keys);
    setError("");
    if (checked) {
      const next = withDependencies([...draft, ...keys], data.catalog);
      const automatic = next.filter(item => !requested.has(item) && !draft.includes(item));
      setDraft(next); setNotice(automatic.length ? `${t("permissions.dependenciesAdded")} ${automatic.map(item => grantLabel(item, data.catalog)).join("; ")}` : "");
    } else {
      const selected = new Set(draft.filter(item => !requested.has(item)));
      const actions = currentActions(data.catalog);
      let removed = true;
      while (removed) {
        removed = false;
        for (const action of actions) if (selected.has(action.key) && action.requires.some(dependency => !selected.has(dependency))) { selected.delete(action.key); removed = true; }
      }
      const automatic = draft.filter(item => !requested.has(item) && !selected.has(item));
      setDraft(actions.filter(action => selected.has(action.key)).map(action => action.key));
      setNotice(automatic.length ? `${t("permissions.dependentsRemoved")} ${automatic.map(item => grantLabel(item, data.catalog)).join("; ")}` : "");
    }
  }
  async function commit(action: PermissionChange["action"]) {
    if (!data || conflict || savingGuard.current || loadingGuard.current) return;
    if (action === "saveDraft" && (!canSave || step !== "review")) return;
    if (action === "applyDraft" && (dirty || step !== "apply" || !data.canApplyDraft || data.profile.draftGrants === null)) return;
    if (action === "discardDraft" && (dirty || step !== "removeDraft" || !data.canDiscardDraft || data.profile.draftGrants === null)) return;
    savingGuard.current = true; setSaving(true); setOperation(action); setError(""); setNotice("");
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    try {
      const change: PermissionChange = action === "saveDraft" ? {action, revision: data.profile.revision, grants: draft} : {action, revision: data.profile.revision};
      const next = await requestPermissions(accountId, request.signal, change, groupId);
      if (!mounted.current || request.signal.aborted) return;
      dataRef.current = next; setData(next); setDraft(savedGrants(next)); setTemplateId(""); setStep("edit"); setNotice(t(action === "applyDraft" ? "permissions.applied" : action === "discardDraft" ? "permissions.savedDraftRemoved" : "permissions.saved"));
    } catch (failure) {
      if (!mounted.current || request.signal.aborted || authorizedFailure(failure)) return;
      if (failure instanceof PermissionRequestError && failure.status === 409) { setConflict(true); setStep("edit"); }
      else setError(actionFailureMessage(failure, action === "applyDraft" ? "permissions.applyFailed" : action === "discardDraft" ? "permissions.removeDraftFailed" : "permissions.saveFailed"));
    } finally {
      savingGuard.current = false;
      if (mounted.current && !request.signal.aborted) { setSaving(false); setOperation(null); }
    }
  }
  const selectedTemplate = data?.templates.find(template => template.id === templateId);
  const locked = loading || saving || conflict;
  const confirmation = step === "discard" || step === "reload" || step === "removeDraft";
  const reviewing = step === "review" || step === "apply";
  const reviewAdditions = step === "apply" ? applyAdditions : additions, reviewRemovals = step === "apply" ? applyRemovals : removals;
  const titleKey = step === "review" ? "permissions.reviewTitle" : step === "apply" ? "permissions.applyTitle" : step === "removeDraft" ? "permissions.removeDraftTitle" : step === "discard" ? "permissions.discardTitle" : step === "reload" ? "permissions.reloadTitle" : "permissions.title";
  return <Dialog open onOpenChange={open => { if (!open) requestClose(); }}><DialogContent className="admin-permission-dialog" overlayClassName="admin-permission-overlay" showCloseButton={!saving} onEscapeKeyDown={event => { event.preventDefault(); requestClose(); }}>
    <DialogHeader><DialogTitle>{t(titleKey)}</DialogTitle><DialogDescription>{accountName} · {t("admin.regularAdministrator")} · {t(data?.runtimeEnforcement?"permissions.activeStage":"permissions.preparation")}</DialogDescription></DialogHeader>
    <div className="admin-permission-body" aria-busy={loading || saving}>
      <p className="permission-stage-badge">{t(data?.runtimeEnforcement?"permissions.activeStage":"permissions.preparation")}</p>
      <p className="permission-stage-notice">{t(data?.runtimeEnforcement?"permissions.activeStageNotice":"permissions.preparationNotice")}</p>
      <div ref={statusRef} tabIndex={-1} className="permission-status" aria-live="polite">
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="permission-notice" role="status">{notice}</p>}
        {conflict && <div className="permission-conflict" role="alert"><p>{t("permissions.conflict")}</p><Button type="button" variant="outline" disabled={saving || loading} onClick={() => setStep("reload")}>{t("permissions.retry")}</Button></div>}
      </div>
      {loading ? <p className="permission-loading" role="status">{t("permissions.loading")}</p> : confirmation ? <p className="permission-confirm-copy">{t(step === "discard" ? "permissions.discardDescription" : step === "removeDraft" ? "permissions.removeDraftDescription" : "permissions.reloadDescription")}</p> : !data ? <div className="settings-actions"><Button type="button" variant="outline" onClick={() => void load()}>{t("permissions.retry")}</Button></div> : <>
        {data.target.disabledAt && <p className="permission-notice">{t("permissions.disabledNotice")}</p>}
        <div className="permission-comparison">
          <section className="permission-summary-card"><h3>{t("permissions.current")}</h3><strong>{t(data.currentAccess==="configured"?"permissions.currentConfigured":"permissions.currentLegacy")}</strong><p>{t(data.target.disabledAt ? "permissions.currentDisabled" : data.currentAccess==="configured"?"permissions.currentConfiguredDescription":"permissions.currentLegacyDescription")}</p><span>{data.effectiveGrants.length} {t("permissions.grantCount")}</span><details><summary>{t("permissions.currentRules")}</summary><GrantSummary grants={data.effectiveGrants} catalog={data.catalog}/></details>{data.target.disabledAt && <details><summary>{t("permissions.disabledConfiguredRules")} · {data.configuredGrants.length} {t("permissions.grantCount")}</summary><GrantSummary grants={data.configuredGrants} catalog={data.catalog}/></details>}</section>
          <section className="permission-summary-card"><h3>{t("permissions.draft")}</h3><strong>{draft.length} {t("permissions.grantCount")}</strong><p>{t(dirty ? "permissions.unsaved" : data.profile.draftGrants === null ? "permissions.noSavedDraft" : "permissions.draftPending")}</p><span>{t(data.profile.draftGrants === null ? "permissions.configuredBasis" : "permissions.savedDraft")} · {baseline.length} {t("permissions.grantCount")}</span><details><summary>{t("permissions.draftRules")}</summary><GrantSummary grants={draft} catalog={data.catalog}/></details></section>
        </div>
        {reviewing ? <section className="permission-review" data-testid={step === "apply" ? "permission-apply-review" : "permission-save-review"}><p>{t(step === "apply" ? "permissions.applyDescription" : data.profile.draftGrants === null ? "permissions.reviewFirstDraft" : "permissions.reviewDescription")}</p>{step === "apply" && <p className="permission-notice">{t("permissions.applyEffect")}</p>}{step === "apply" && storedDraft.length === 0 && <p className="permission-conflict" role="note">{t("permissions.emptyApplyWarning")}</p>}<div className="permission-diff-counts"><span>{t("permissions.added")} · <strong>{reviewAdditions.length}</strong></span><span>{t("permissions.removed")} · <strong>{reviewRemovals.length}</strong></span></div>{step === "apply" && !reviewAdditions.length && !reviewRemovals.length && <p>{t("permissions.applyNoChanges")}</p>}{[{label: "permissions.added", grants: reviewAdditions}, {label: "permissions.removed", grants: reviewRemovals}].map(change => <section key={change.label}><h3>{t(change.label)} · {change.grants.length}</h3><GrantSummary grants={change.grants} catalog={data.catalog}/></section>)}</section> : <>
          {data.profile.draftGrants !== null && <section className="permission-review" data-testid="permission-saved-draft-actions"><h3>{t("permissions.savedDraft")}</h3><p>{t(dirty ? "permissions.saveLocalFirst" : "permissions.savedDraftHint")}</p><div className="settings-actions"><Button type="button" variant="outline" data-testid="permission-discard-saved-draft" disabled={locked || dirty || !data.canDiscardDraft} onClick={() => { setError(""); setStep("removeDraft"); }}>{t("permissions.removeDraft")}</Button><Button type="button" data-testid="permission-apply-draft" disabled={locked || dirty || !data.canApplyDraft} onClick={() => { setError(""); setStep("apply"); }}>{t("permissions.reviewAndApply")}</Button></div></section>}
          <p className="permission-starting-point">{t(data.profile.origin === "new" ? "permissions.newStartingPoint" : "permissions.legacyStartingPoint")}</p>
          <section className="permission-template"><label htmlFor="admin-permission-template">{t("permissions.template")}</label><div className="permission-template-controls"><select id="admin-permission-template" disabled={locked} value={templateId} onChange={event => setTemplateId(event.target.value)}><option value="">{t("permissions.templatePlaceholder")}</option>{data.templates.map(template => <option key={template.id} value={template.id}>{t(template.labelKey)}</option>)}</select><Button type="button" variant="outline" disabled={locked || !selectedTemplate} onClick={() => { if (!selectedTemplate) return; setDraft(withDependencies(selectedTemplate.grants, data.catalog)); setError(""); setNotice(t("permissions.templateApplied")); }}>{t("permissions.applyTemplate")}</Button></div><p className="field-hint">{selectedTemplate ? t(selectedTemplate.descriptionKey) : t("permissions.templateHint")}</p></section>
          <section className="permission-modules" aria-label={t("permissions.modules")}>{data.catalog.map(module => {
            const reserved = module.availability === "reserved", actions = module.actions.filter(action => module.supportedActions.includes(action.id));
            const selected = actions.filter(action => draft.includes(action.key)).length;
            const allSelected = actions.length > 0 && selected === actions.length;
            return <details className="permission-module" key={module.id} open={reserved ? undefined : selected > 0 || undefined}><summary><span>{t(module.labelKey)}</span><small>{reserved ? t("permissions.reserved") : `${t("permissions.selected")} ${selected} / ${actions.length}`}</small></summary><p className="permission-module-description">{t(module.descriptionKey)}</p>{reserved ? <label className="permission-check permission-reserved"><input type="checkbox" disabled checked={false} readOnly/><span>{t("permissions.reservedHint")}</span></label> : <>{actions.length > 0 && <label className="permission-check permission-module-select-all"><input type="checkbox" data-permission-module-all={module.id} checked={allSelected} aria-checked={selected > 0 && !allSelected ? "mixed" : allSelected} aria-label={`${t(module.labelKey)} · ${t(allSelected ? "permissions.clearAll" : "permissions.selectAll")}`} ref={input => { if (input) input.indeterminate = selected > 0 && !allSelected; }} disabled={locked} onChange={event => toggleGrants(actions.map(action => action.key), event.target.checked)}/><span>{t(allSelected ? "permissions.clearAll" : "permissions.selectAll")}</span></label>}<div className="permission-action-grid">{actions.map(action => <label className="permission-check" key={action.key}><input type="checkbox" data-permission-key={action.key} checked={draft.includes(action.key)} disabled={locked} onChange={event => toggleGrants([action.key], event.target.checked)}/><span>{t(action.labelKey)}</span></label>)}</div></>}</details>;
          })}</section>
        </>}
      </>}
    </div>
    <div className="admin-permission-footer">
      {confirmation ? <><Button type="button" variant="outline" disabled={loading || saving} onClick={() => setStep("edit")}>{t("permissions.keepEditing")}</Button><Button type="button" variant={step === "removeDraft" ? "destructive" : "default"} data-testid={step === "removeDraft" ? "permission-discard-confirm" : undefined} disabled={loading || saving || (step === "removeDraft" && conflict)} onClick={() => { if (step === "reload") void load(); else if (step === "removeDraft") void commit("discardDraft"); else onClose(); }}>{t(operation === "discardDraft" ? "permissions.removingDraft" : step === "removeDraft" ? "permissions.confirmRemoveDraft" : step === "reload" ? "permissions.reloadConfirm" : "permissions.discardAndClose")}</Button></> : reviewing ? <><Button type="button" variant="outline" disabled={saving} onClick={() => setStep("edit")}>{t("permissions.backToEdit")}</Button><Button type="button" data-testid={step === "apply" ? "permission-apply-confirm" : "permission-save-confirm"} disabled={locked || (step === "apply" ? dirty || !data?.canApplyDraft : !canSave)} onClick={() => void commit(step === "apply" ? "applyDraft" : "saveDraft")}>{t(operation === "applyDraft" ? "permissions.applying" : saving ? "permissions.saving" : step === "apply" ? "permissions.confirmApply" : "permissions.confirmDraft")}</Button></> : <><Button type="button" variant="outline" disabled={saving} onClick={requestClose}>{t("permissions.cancel")}</Button><Button type="button" data-testid="permission-review-save" disabled={locked || !data || !canSave} onClick={() => { setError(""); setStep("review"); }}>{t("permissions.reviewChanges")}</Button></>}
    </div>
  </DialogContent></Dialog>;
}

-- Read-only audit history browsing retains every existing event.
CREATE INDEX audit_history_order_idx ON audit(group_id,at DESC,id DESC);
CREATE INDEX audit_history_operator_idx ON audit(group_id,actor_id,at DESC,id DESC);
CREATE INDEX audit_history_action_idx ON audit(group_id,action,at DESC,id DESC);

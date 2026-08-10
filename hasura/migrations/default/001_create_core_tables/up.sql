CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    calls_used INTEGER NOT NULL DEFAULT 0,
    calls_allowed INTEGER NOT NULL DEFAULT 100,
    quota_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT organizations_calls_used_non_negative
        CHECK (calls_used >= 0),

    CONSTRAINT organizations_calls_allowed_non_negative
        CHECK (calls_allowed >= 0)
);

CREATE TABLE org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT org_members_role_check
        CHECK (role IN ('owner', 'editor', 'viewer')),

    CONSTRAINT org_members_org_user_unique
        UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_members_user_id
    ON org_members(user_id);

CREATE INDEX idx_org_members_org_id
    ON org_members(org_id);

CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT workflows_status_check
        CHECK (status IN ('draft', 'active', 'inactive'))
);

CREATE INDEX idx_workflows_org_id
    ON workflows(org_id);


CREATE TABLE workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL
        REFERENCES workflows(id)
        ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT workflow_steps_step_order_positive
        CHECK (step_order >= 1),

    CONSTRAINT workflow_steps_type_check
        CHECK (
            type IN (
                'llm_call',
                'http_request',
                'db_write',
                'notify',
                'conditional_branch',
                'approval_gate'
            )
        ),

    CONSTRAINT workflow_steps_workflow_order_unique
        UNIQUE (workflow_id, step_order)
);

CREATE INDEX idx_workflow_steps_workflow_id
    ON workflow_steps(workflow_id);


CREATE TABLE workflow_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL
        REFERENCES workflows(id)
        ON DELETE CASCADE,
    type TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT workflow_triggers_type_check
        CHECK (
            type IN (
                'manual',
                'webhook',
                'scheduled',
                'database_event'
            )
        )
);

CREATE INDEX idx_workflow_triggers_workflow_id
    ON workflow_triggers(workflow_id);


CREATE TABLE workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL
        REFERENCES workflows(id)
        ON DELETE CASCADE,
    trigger_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    error TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT workflow_runs_trigger_type_check
        CHECK (
            trigger_type IN (
                'manual',
                'webhook',
                'scheduled',
                'database_event'
            )
        ),

    CONSTRAINT workflow_runs_status_check
        CHECK (
            status IN (
                'queued',
                'running',
                'paused',
                'completed',
                'failed',
                'cancelled'
            )
        )
);

CREATE INDEX idx_workflow_runs_workflow_id
    ON workflow_runs(workflow_id);

CREATE INDEX idx_workflow_runs_created_at
    ON workflow_runs(created_at DESC);


CREATE TABLE step_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id UUID NOT NULL
        REFERENCES workflow_runs(id)
        ON DELETE CASCADE,
    workflow_step_id UUID NOT NULL
        REFERENCES workflow_steps(id)
        ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    input JSONB,
    output JSONB,
    error TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT step_runs_status_check
        CHECK (
            status IN (
                'pending',
                'running',
                'retrying',
                'paused',
                'approved',
                'completed',
                'failed'
            )
        ),

    CONSTRAINT step_runs_attempt_count_non_negative
        CHECK (attempt_count >= 0)
);

CREATE INDEX idx_step_runs_workflow_run_id
    ON step_runs(workflow_run_id);

CREATE INDEX idx_step_runs_workflow_step_id
    ON step_runs(workflow_step_id);
-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "crm_type" TEXT NOT NULL,
    "crm_config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "business_model" TEXT NOT NULL DEFAULT 'usage_based',
    "erp_type" TEXT,
    "erp_config" JSONB NOT NULL DEFAULT '{}',
    "rsa_config" JSONB NOT NULL DEFAULT '{}',
    "icm_config" JSONB NOT NULL DEFAULT '{}',
    "contract_start_date" TIMESTAMP(3),
    "audit_status" TEXT NOT NULL DEFAULT 'none',
    "audit_locked_at" TIMESTAMP(3),
    "gsc_config" JSONB NOT NULL DEFAULT '{}',
    "ga4_config" JSONB NOT NULL DEFAULT '{}',
    "clarity_config" JSONB NOT NULL DEFAULT '{}',
    "dataforseo_config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "linkedin_url" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "title" TEXT,
    "company" TEXT,
    "location" TEXT,
    "profile_data" JSONB NOT NULL DEFAULT '{}',
    "enrichment_data" JSONB NOT NULL DEFAULT '{}',
    "enriched_at" TIMESTAMP(3),
    "fit_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "intent_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "fulcrum_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "fulcrum_grade" TEXT,
    "score_breakdown" JSONB NOT NULL DEFAULT '{}',
    "scored_at" TIMESTAMP(3),
    "first_line" TEXT,
    "first_line_generated_at" TIMESTAMP(3),
    "last_data_check_at" TIMESTAMP(3),
    "data_freshness_score" INTEGER NOT NULL DEFAULT 100,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "rejection_reason" TEXT,
    "crm_lead_id" TEXT,
    "pushed_to_crm_at" TIMESTAMP(3),
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intent_signals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "signal_type" TEXT NOT NULL,
    "signal_value" JSONB NOT NULL,
    "signal_score" DECIMAL(5,2) NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intent_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_diagnostics" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "deal_id" TEXT NOT NULL,
    "deal_name" TEXT,
    "deal_value" DECIMAL(12,2),
    "deal_stage" TEXT,
    "last_activity_date" TIMESTAMP(3),
    "days_since_activity" INTEGER,
    "stage_change_date" TIMESTAMP(3),
    "days_in_stage" INTEGER,
    "email_sent_count" INTEGER NOT NULL DEFAULT 0,
    "email_response_count" INTEGER NOT NULL DEFAULT 0,
    "engagement_score" DECIMAL(5,2),
    "is_stalled" BOOLEAN NOT NULL DEFAULT false,
    "stalled_reason" TEXT,
    "stalled_detected_at" TIMESTAMP(3),
    "task_created" BOOLEAN NOT NULL DEFAULT false,
    "task_id" TEXT,
    "alert_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_diagnostics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "action_type" TEXT NOT NULL,
    "resource_id" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_search_queries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "query_name" TEXT NOT NULL,
    "search_query" JSONB NOT NULL,
    "max_results" INTEGER NOT NULL DEFAULT 10,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_search_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_intent_keywords" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "intent_score" DECIMAL(3,1) NOT NULL,
    "category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_intent_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_scoring_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "config_type" TEXT NOT NULL,
    "config_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_scoring_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_slack_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "team_id" TEXT NOT NULL,
    "bot_token" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "webhook_url" TEXT,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_slack_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slack_channel_id" TEXT NOT NULL,
    "slack_thread_ts" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intent" TEXT,
    "entities_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_workflows" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "current_step" TEXT,
    "steps_json" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_health_checks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "check_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "details_json" JSONB NOT NULL DEFAULT '{}',
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_base_patterns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pattern_type" TEXT NOT NULL,
    "trigger_phrase" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_base_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_trackers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "crm_deal_id" TEXT NOT NULL,
    "deal_name" TEXT,
    "deal_value" DECIMAL(12,2) NOT NULL,
    "customer_name" TEXT,
    "closed_won_at" TIMESTAMP(3) NOT NULL,
    "match_1_crm" BOOLEAN NOT NULL DEFAULT false,
    "match_1_at" TIMESTAMP(3),
    "match_2_invoice" BOOLEAN NOT NULL DEFAULT false,
    "match_2_at" TIMESTAMP(3),
    "erp_invoice_id" TEXT,
    "match_3_payment" BOOLEAN NOT NULL DEFAULT false,
    "match_3_at" TIMESTAMP(3),
    "erp_payment_id" TEXT,
    "cancellation_window_ends_at" TIMESTAMP(3),
    "fulcrum_alert_at" TIMESTAMP(3),
    "first_crm_activity_at" TIMESTAMP(3),
    "attribution_proof" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'tracking',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_trackers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_ledger" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tracker_id" UUID NOT NULL,
    "deal_value" DECIMAL(12,2) NOT NULL,
    "commission_rate" DECIMAL(5,4) NOT NULL,
    "tier_name" TEXT NOT NULL,
    "calculated_amount" DECIMAL(12,2) NOT NULL,
    "calculation_proof" JSONB NOT NULL,
    "attribution_proof" JSONB NOT NULL,
    "rsa_terms_snapshot" JSONB NOT NULL,
    "integrity_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "quarter_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tracker_id" UUID NOT NULL,
    "dispute_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "client_reason" TEXT NOT NULL,
    "resolution" TEXT,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "adjustment_amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clawbacks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tracker_id" UUID NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "trigger_date" TIMESTAMP(3) NOT NULL,
    "original_amount" DECIMAL(12,2) NOT NULL,
    "clawback_amount" DECIMAL(12,2) NOT NULL,
    "clawback_rate" DECIMAL(5,4) NOT NULL,
    "days_since_payment" INTEGER NOT NULL,
    "policy_applied" TEXT NOT NULL,
    "offset_quarter_key" TEXT,
    "offset_applied" BOOLEAN NOT NULL DEFAULT false,
    "offset_applied_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clawbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_existing_deals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "crm_deal_id" TEXT NOT NULL,
    "deal_name" TEXT,
    "deal_value" DECIMAL(12,2) NOT NULL,
    "customer_name" TEXT,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ineligible',
    "appeal_reason" TEXT,
    "appealed_at" TIMESTAMP(3),
    "appeal_resolved_at" TIMESTAMP(3),
    "appeal_resolved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_existing_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ltv" DECIMAL(12,2) NOT NULL,
    "cac" DECIMAL(12,2) NOT NULL,
    "margin" DECIMAL(5,4) NOT NULL,
    "deal_size" DECIMAL(12,2) NOT NULL,
    "close_rate" DECIMAL(5,4) NOT NULL,
    "sales_cycle_days" INTEGER NOT NULL DEFAULT 45,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_assets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "service_id" UUID,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT,
    "evs" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "evs_inputs" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "deployed_at" TIMESTAMP(3),
    "pipeline_contribution" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "attributed_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cost_per_lead" DECIMAL(8,2),
    "monthly_visits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_snippets" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "persona" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "channel" TEXT,
    "deploy_at" TIMESTAMP(3),
    "deployed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persona_snippets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_keyword_trackers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID,
    "keyword" TEXT NOT NULL,
    "position" INTEGER,
    "prev_position" INTEGER,
    "position_delta" INTEGER,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "search_volume" INTEGER,
    "difficulty" INTEGER,
    "conversion_rate" DECIMAL(5,4),
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_keyword_trackers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_audits" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "audit_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'detected',
    "brief_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "seo_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cro_audits" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "page_url" TEXT NOT NULL,
    "page_type" TEXT NOT NULL,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "benchmarks" JSONB NOT NULL DEFAULT '{}',
    "issues" JSONB NOT NULL DEFAULT '[]',
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "estimated_pipeline_impact" DECIMAL(12,2),
    "audited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cro_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_tests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "page_url" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "control_desc" TEXT NOT NULL,
    "variant_desc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "expected_lift" DECIMAL(5,2),
    "actual_lift" DECIMAL(5,2),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "results_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ab_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_clerk_org_id_key" ON "tenants"("clerk_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "leads_tenant_id_idx" ON "leads"("tenant_id");

-- CreateIndex
CREATE INDEX "leads_tenant_id_status_idx" ON "leads"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "leads_tenant_id_fulcrum_score_idx" ON "leads"("tenant_id", "fulcrum_score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "leads_tenant_id_linkedin_url_key" ON "leads"("tenant_id", "linkedin_url");

-- CreateIndex
CREATE INDEX "intent_signals_tenant_id_idx" ON "intent_signals"("tenant_id");

-- CreateIndex
CREATE INDEX "intent_signals_lead_id_idx" ON "intent_signals"("lead_id");

-- CreateIndex
CREATE INDEX "deal_diagnostics_tenant_id_idx" ON "deal_diagnostics"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_diagnostics_tenant_id_deal_id_key" ON "deal_diagnostics"("tenant_id", "deal_id");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_created_at_idx" ON "audit_log"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "tenant_search_queries_tenant_id_idx" ON "tenant_search_queries"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_intent_keywords_tenant_id_idx" ON "tenant_intent_keywords"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_scoring_configs_tenant_id_idx" ON "tenant_scoring_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_scoring_configs_tenant_id_config_type_key" ON "tenant_scoring_configs"("tenant_id", "config_type");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_slack_configs_tenant_id_key" ON "tenant_slack_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "conversation_messages_tenant_id_slack_channel_id_slack_thre_idx" ON "conversation_messages"("tenant_id", "slack_channel_id", "slack_thread_ts");

-- CreateIndex
CREATE INDEX "conversation_messages_tenant_id_created_at_idx" ON "conversation_messages"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "onboarding_workflows_tenant_id_idx" ON "onboarding_workflows"("tenant_id");

-- CreateIndex
CREATE INDEX "system_health_checks_tenant_id_checked_at_idx" ON "system_health_checks"("tenant_id", "checked_at" DESC);

-- CreateIndex
CREATE INDEX "knowledge_base_patterns_tenant_id_idx" ON "knowledge_base_patterns"("tenant_id");

-- CreateIndex
CREATE INDEX "commission_trackers_tenant_id_idx" ON "commission_trackers"("tenant_id");

-- CreateIndex
CREATE INDEX "commission_trackers_tenant_id_status_idx" ON "commission_trackers"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "commission_trackers_tenant_id_crm_deal_id_key" ON "commission_trackers"("tenant_id", "crm_deal_id");

-- CreateIndex
CREATE INDEX "commission_ledger_tenant_id_idx" ON "commission_ledger"("tenant_id");

-- CreateIndex
CREATE INDEX "commission_ledger_tenant_id_quarter_key_idx" ON "commission_ledger"("tenant_id", "quarter_key");

-- CreateIndex
CREATE INDEX "commission_ledger_tracker_id_idx" ON "commission_ledger"("tracker_id");

-- CreateIndex
CREATE INDEX "disputes_tenant_id_idx" ON "disputes"("tenant_id");

-- CreateIndex
CREATE INDEX "disputes_tenant_id_status_idx" ON "disputes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "clawbacks_tenant_id_idx" ON "clawbacks"("tenant_id");

-- CreateIndex
CREATE INDEX "clawbacks_tenant_id_status_idx" ON "clawbacks"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "pre_existing_deals_tenant_id_idx" ON "pre_existing_deals"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pre_existing_deals_tenant_id_crm_deal_id_key" ON "pre_existing_deals"("tenant_id", "crm_deal_id");

-- CreateIndex
CREATE INDEX "service_profiles_tenant_id_idx" ON "service_profiles"("tenant_id");

-- CreateIndex
CREATE INDEX "content_assets_tenant_id_idx" ON "content_assets"("tenant_id");

-- CreateIndex
CREATE INDEX "content_assets_tenant_id_evs_idx" ON "content_assets"("tenant_id", "evs" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "content_assets_tenant_id_slug_key" ON "content_assets"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "persona_snippets_asset_id_idx" ON "persona_snippets"("asset_id");

-- CreateIndex
CREATE INDEX "persona_snippets_deployed_deploy_at_idx" ON "persona_snippets"("deployed", "deploy_at");

-- CreateIndex
CREATE INDEX "seo_keyword_trackers_tenant_id_idx" ON "seo_keyword_trackers"("tenant_id");

-- CreateIndex
CREATE INDEX "seo_keyword_trackers_tenant_id_keyword_idx" ON "seo_keyword_trackers"("tenant_id", "keyword");

-- CreateIndex
CREATE INDEX "seo_keyword_trackers_tenant_id_position_delta_idx" ON "seo_keyword_trackers"("tenant_id", "position_delta" DESC);

-- CreateIndex
CREATE INDEX "seo_audits_tenant_id_idx" ON "seo_audits"("tenant_id");

-- CreateIndex
CREATE INDEX "seo_audits_tenant_id_severity_idx" ON "seo_audits"("tenant_id", "severity");

-- CreateIndex
CREATE INDEX "cro_audits_tenant_id_idx" ON "cro_audits"("tenant_id");

-- CreateIndex
CREATE INDEX "cro_audits_tenant_id_page_type_idx" ON "cro_audits"("tenant_id", "page_type");

-- CreateIndex
CREATE INDEX "ab_tests_tenant_id_idx" ON "ab_tests"("tenant_id");

-- CreateIndex
CREATE INDEX "ab_tests_tenant_id_status_idx" ON "ab_tests"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intent_signals" ADD CONSTRAINT "intent_signals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intent_signals" ADD CONSTRAINT "intent_signals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_diagnostics" ADD CONSTRAINT "deal_diagnostics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_search_queries" ADD CONSTRAINT "tenant_search_queries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_intent_keywords" ADD CONSTRAINT "tenant_intent_keywords_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_scoring_configs" ADD CONSTRAINT "tenant_scoring_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_slack_configs" ADD CONSTRAINT "tenant_slack_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_workflows" ADD CONSTRAINT "onboarding_workflows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_health_checks" ADD CONSTRAINT "system_health_checks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_base_patterns" ADD CONSTRAINT "knowledge_base_patterns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_trackers" ADD CONSTRAINT "commission_trackers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_tracker_id_fkey" FOREIGN KEY ("tracker_id") REFERENCES "commission_trackers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_tracker_id_fkey" FOREIGN KEY ("tracker_id") REFERENCES "commission_trackers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clawbacks" ADD CONSTRAINT "clawbacks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clawbacks" ADD CONSTRAINT "clawbacks_tracker_id_fkey" FOREIGN KEY ("tracker_id") REFERENCES "commission_trackers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_existing_deals" ADD CONSTRAINT "pre_existing_deals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_profiles" ADD CONSTRAINT "service_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persona_snippets" ADD CONSTRAINT "persona_snippets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "content_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_keyword_trackers" ADD CONSTRAINT "seo_keyword_trackers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_keyword_trackers" ADD CONSTRAINT "seo_keyword_trackers_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "content_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_audits" ADD CONSTRAINT "seo_audits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cro_audits" ADD CONSTRAINT "cro_audits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_tests" ADD CONSTRAINT "ab_tests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

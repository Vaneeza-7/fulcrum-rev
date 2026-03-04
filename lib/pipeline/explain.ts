import { ScoreResult, getTimeDecayMultiplier, TIME_DECAY_MULTIPLIERS } from './types';

/**
 * A single Fit-axis component (company size, industry, revenue, or role).
 */
export interface FitComponentExplanation {
  name: string;
  points: number;
  max_points: number;
  reason: string;
}

/**
 * An individual intent signal with time-decay reasoning.
 */
export interface SignalExplanation {
  type: string;
  raw_score: number;
  decayed_score: number;
  days_ago: number;
  decay_note: string;
}

/**
 * Full human-readable explanation of how a lead's Fulcrum Score was computed.
 *
 * Scoring formula (dual-axis model):
 *   Fit Score   (0–40 pts)  × 40% weight  → contributes up to 40 pts to final score
 *   Intent Score (0–60 pts) × 60% weight  → contributes up to 60 pts to final score
 *   ─────────────────────────────────────
 *   Fulcrum Score = fit_score + intent_score  (0–100 scale)
 *
 * Fit axis components:
 *   • Company Size  (0–10 pts)  – employee count vs. tenant's ICP size bands
 *   • Industry Fit  (0–8 pts)   – AI enrichment confidence score
 *   • Revenue Signals (0–7 pts) – funding stage (Series A / Seed) + Q4/Q1 budget bonus
 *   • Role Authority  (0–15 pts)– decision-maker level (C-level, VP, Manager, IC)
 *
 * Intent axis:
 *   Sum of time-decayed signal scores, capped at 60.
 *   Recency multipliers: ≤7 days → 1.5×  |  8-30 days → 1.0×  |  31-60 days → 0.5×
 *                        61-90 days → 0.2× |  >90 days → 0× (expired)
 *
 * Grade thresholds:
 *   A+ (90-100) · A (80-89) · B (60-79) · C (40-59) · D (<40)
 */
export interface ScoreExplanation {
  /** Canonical formula string. */
  formula: string;
  fulcrum_score: number;
  fulcrum_grade: string;
  /** One-line rationale for the grade. */
  grade_reason: string;

  fit_axis: {
    score: number;
    max_score: 40;
    /** Percentage weight applied to the Fit axis. */
    weight_pct: 40;
    /**
     * Weighted contribution to the 0–100 Fulcrum score.
     * Mathematically equal to fit_score because (fit/40)*100*0.40 = fit.
     */
    weighted_contribution: number;
    components: FitComponentExplanation[];
  };

  intent_axis: {
    score: number;
    max_score: 60;
    /** Percentage weight applied to the Intent axis. */
    weight_pct: 60;
    /**
     * Weighted contribution to the 0–100 Fulcrum score.
     * Mathematically equal to intent_score because (intent/60)*100*0.60 = intent.
     */
    weighted_contribution: number;
    signals: SignalExplanation[];
  };
}

// ---------------------------------------------------------------------------
// Constants — these mirror the default scoring weights in scorer.ts so the
// explanation stays synchronized with the actual scoring logic.
// ---------------------------------------------------------------------------

/** Industry-fit confidence-score thresholds (from calculateFitScore). */
const INDUSTRY_FIT_THRESHOLDS = {
  perfect: { minConfidence: 70, points: 8 },
  adjacent: { minConfidence: 40, points: 5 },
  neutral: { points: 3 },
} as const;

/** Role authority label → max points mapping (from default ScoringWeights). */
const ROLE_AUTHORITY_LABELS: Record<number, string> = {
  15: 'C-level / executive decision maker',
  12: 'VP or Director level',
  7:  'Manager level',
  3:  'Individual contributor (default)',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gradeReason(grade: string, score: number): string {
  switch (grade) {
    case 'A+':
      return `Grade A+ (score ${score.toFixed(1)}, range 90-100): top-priority lead — auto-push eligible`;
    case 'A':
      return `Grade A (score ${score.toFixed(1)}, range 80-89): high-priority lead — immediate review recommended`;
    case 'B':
      return `Grade B (score ${score.toFixed(1)}, range 60-79): standard-priority lead — review queue`;
    case 'C':
      return `Grade C (score ${score.toFixed(1)}, range 40-59): low-priority lead`;
    default:
      return `Grade D (score ${score.toFixed(1)}, range 0-39): below threshold — typically skipped`;
  }
}

/**
 * Build a human-readable time-decay note derived from the `TIME_DECAY_MULTIPLIERS`
 * table, so this description stays in sync with the actual decay logic.
 */
function decayNote(daysAgo: number): string {
  const multiplier = getTimeDecayMultiplier(daysAgo);

  if (multiplier === 0) {
    return `expired (signal is ${daysAgo} days old, >${TIME_DECAY_MULTIPLIERS[TIME_DECAY_MULTIPLIERS.length - 1].maxDays}-day cutoff)`;
  }

  const tier = TIME_DECAY_MULTIPLIERS.find((t) => daysAgo <= t.maxDays);
  const rangeLabel = tier
    ? daysAgo <= TIME_DECAY_MULTIPLIERS[0].maxDays
      ? `≤${TIME_DECAY_MULTIPLIERS[0].maxDays} day range`
      : `${TIME_DECAY_MULTIPLIERS.find((t, i) => i > 0 && daysAgo <= t.maxDays && daysAgo > TIME_DECAY_MULTIPLIERS[i - 1].maxDays)?.maxDays ?? tier.maxDays}-day range`
    : 'unknown range';

  const boost = multiplier > 1 ? 'boosted' : multiplier === 1 ? 'no decay' : 'decay';
  return `${boost} ${multiplier.toFixed(1)}× (${daysAgo} days old, ${rangeLabel})`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Produce a structured, human-readable explanation of how a Fulcrum Score
 * was calculated from a `ScoreResult`.
 *
 * The function is pure (no I/O) and can be called anywhere — from the Huck
 * agent, the leads dashboard, or unit tests.
 *
 * @example
 * const explanation = explainScore(scoreResult);
 * console.log(explanation.grade_reason);
 * // "Grade B (score 64.0, range 60-79): standard-priority lead — review queue"
 */
export function explainScore(result: ScoreResult): ScoreExplanation {
  const { fit_score, intent_score, fulcrum_score, fulcrum_grade, breakdown } = result;

  // Fit components ---------------------------------------------------------
  const companySizeMax = 10;
  const industryFitMax = 8;
  const revenueSignalsMax = 7;
  const roleAuthorityMax = 15;

  const components: FitComponentExplanation[] = [
    {
      name: 'Company Size',
      points: breakdown.company_size_pts,
      max_points: companySizeMax,
      reason:
        breakdown.company_size_pts === 0
          ? 'company size did not match any configured band'
          : `${breakdown.company_size_pts} pts — matched employee-count band (max ${companySizeMax} pts)`,
    },
    {
      name: 'Industry Fit',
      points: breakdown.industry_pts,
      max_points: industryFitMax,
      reason:
        breakdown.industry_pts === INDUSTRY_FIT_THRESHOLDS.perfect.points
          ? `${INDUSTRY_FIT_THRESHOLDS.perfect.points} pts — high-confidence industry match (confidence ≥${INDUSTRY_FIT_THRESHOLDS.perfect.minConfidence})`
          : breakdown.industry_pts === INDUSTRY_FIT_THRESHOLDS.adjacent.points
            ? `${INDUSTRY_FIT_THRESHOLDS.adjacent.points} pts — moderate-confidence industry match (confidence ${INDUSTRY_FIT_THRESHOLDS.adjacent.minConfidence}-${INDUSTRY_FIT_THRESHOLDS.perfect.minConfidence - 1})`
            : `${INDUSTRY_FIT_THRESHOLDS.neutral.points} pts — neutral/low industry confidence (<${INDUSTRY_FIT_THRESHOLDS.adjacent.minConfidence})`,
    },
    {
      name: 'Revenue Signals',
      points: breakdown.revenue_pts,
      max_points: revenueSignalsMax,
      reason:
        breakdown.revenue_pts === 0
          ? '0 pts — no matching funding stage or budget timing detected'
          : `${breakdown.revenue_pts} pts — funding stage or budget-timing signal matched (max ${revenueSignalsMax} pts)`,
    },
    {
      name: 'Role Authority',
      points: breakdown.role_pts,
      max_points: roleAuthorityMax,
      reason:
        `${breakdown.role_pts} pts — ${ROLE_AUTHORITY_LABELS[breakdown.role_pts] ?? `${breakdown.role_pts} of ${roleAuthorityMax} points`}`,
    },
  ];

  // Intent signals ---------------------------------------------------------
  const signals: SignalExplanation[] = breakdown.signals.map((s) => ({
    type: s.type,
    raw_score: s.raw_score,
    decayed_score: s.decayed_score,
    days_ago: s.days_ago,
    decay_note: decayNote(s.days_ago),
  }));

  // Weighted contributions -------------------------------------------------
  // Algebraically: (fit/40)*100*0.40 = fit  and  (intent/60)*100*0.60 = intent
  // so each axis's weighted contribution equals its raw score.
  const fit_contribution = Math.round(fit_score * 100) / 100;
  const intent_contribution = Math.round(intent_score * 100) / 100;

  return {
    formula:
      'Fulcrum Score = (Fit Score / 40 × 100 × 0.40) + (Intent Score / 60 × 100 × 0.60)',
    fulcrum_score,
    fulcrum_grade,
    grade_reason: gradeReason(fulcrum_grade, fulcrum_score),

    fit_axis: {
      score: fit_score,
      max_score: 40,
      weight_pct: 40,
      weighted_contribution: fit_contribution,
      components,
    },

    intent_axis: {
      score: intent_score,
      max_score: 60,
      weight_pct: 60,
      weighted_contribution: intent_contribution,
      signals,
    },
  };
}

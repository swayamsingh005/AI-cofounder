export type PulseDimension = {
  key: 'product' | 'validation' | 'growth' | 'revenue' | 'execution';
  label: string;
  score: number | null;
  evidence: string;
  nextStep: string | null;
};

export type CompanyPulse = {
  score: number | null;
  coverage: number;
  availableDimensions: number;
  totalDimensions: 5;
  dimensions: PulseDimension[];
  label: 'No evidence yet' | 'Limited evidence' | 'Developing evidence' | 'Strong evidence coverage';
  note: string;
};

export type PulseInput = {
  profile: {
    description?: string | null;
    problem?: string | null;
    solution?: string | null;
    businessModel?: string | null;
    targetCustomer?: string | null;
    strategy?: string | null;
  } | null;
  tasks: { status: string }[];
  memories: { kind: string; assumption_status?: string | null; source_agent?: string | null; evidence?: unknown }[];
  growth?: { score: number; evidence: string } | null;
  revenue?: { score: number; evidence: string } | null;
};

function bounded(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateCompanyPulse(input: PulseInput): CompanyPulse {
  const fields = input.profile
    ? [input.profile.description, input.profile.problem, input.profile.solution, input.profile.businessModel, input.profile.targetCustomer, input.profile.strategy]
    : [];
  const defined = fields.filter(value => typeof value === 'string' && value.trim().length > 0).length;
  const product = input.profile ? bounded((defined / 6) * 100) : null;

  const customerSignals = input.memories.filter(memory => ['customer_signal', 'customer_insight'].includes(memory.kind)).length;
  const experiments = input.memories.filter(memory => memory.kind === 'experiment').length;
  const testedAssumptions = input.memories.filter(memory =>
    memory.kind === 'assumption' && ['supported', 'rejected'].includes(memory.assumption_status ?? '')
  ).length;
  const groundedResearch = input.memories.filter(memory => memory.source_agent === 'research' && memory.evidence && typeof memory.evidence === 'object').length;
  const validationPoints = bounded(
    Math.min(40, customerSignals * 10) +
    Math.min(25, experiments * 12.5) +
    Math.min(20, testedAssumptions * (20 / 3)) +
    Math.min(15, groundedResearch * 5)
  );
  const validation = input.profile || input.tasks.length || input.memories.length ? validationPoints : null;

  const completed = input.tasks.filter(task => task.status === 'completed').length;
  const execution = input.tasks.length ? bounded((completed / input.tasks.length) * 100) : null;
  const growth = input.growth ? bounded(input.growth.score) : null;
  const revenue = input.revenue ? bounded(input.revenue.score) : null;

  const dimensions: PulseDimension[] = [
    {
      key: 'product', label: 'Product definition', score: product,
      evidence: input.profile ? `${defined}/6 core company fields defined` : 'No company profile recorded',
      nextStep: defined < 6 ? 'Complete the company problem, solution, customer, business model and strategy.' : null,
    },
    {
      key: 'validation', label: 'Market validation', score: validation,
      evidence: `${customerSignals} customer signals · ${experiments} experiments · ${testedAssumptions} tested assumptions · ${groundedResearch} sourced research findings`,
      nextStep: validation == null || validation < 100 ? 'Record customer evidence, experiments and supported or rejected assumptions.' : null,
    },
    {
      key: 'growth', label: 'Growth', score: growth,
      evidence: input.growth?.evidence ?? 'No verified analytics data connected',
      nextStep: growth == null ? 'Connect a supported analytics source before scoring growth.' : null,
    },
    {
      key: 'revenue', label: 'Revenue', score: revenue,
      evidence: input.revenue?.evidence ?? 'No verified billing data connected',
      nextStep: revenue == null ? 'Connect a supported billing source before scoring revenue.' : null,
    },
    {
      key: 'execution', label: 'Execution', score: execution,
      evidence: input.tasks.length ? `${completed}/${input.tasks.length} tasks completed` : 'No execution tasks recorded',
      nextStep: execution == null ? 'Create a mission with measurable tasks.' : completed < input.tasks.length ? 'Complete or update the current tasks.' : null,
    },
  ];
  const available = dimensions.flatMap(dimension => dimension.score == null ? [] : [dimension.score]);
  // Overall Pulse is an evidence-weighted company score. Missing outcome connectors contribute
  // zero until evidence exists, rather than disappearing from the denominator and making every
  // newly created company with a complete profile look like the same 33/100.
  const weights: Record<PulseDimension['key'], number> = { product: 0.2, validation: 0.3, growth: 0.15, revenue: 0.15, execution: 0.2 };
  const score = available.length ? bounded(dimensions.reduce((sum, dimension) => sum + (dimension.score ?? 0) * weights[dimension.key], 0)) : null;
  const coverage = bounded((available.length / dimensions.length) * 100);
  const label = score == null ? 'No evidence yet' : score < 35 ? 'Limited evidence' : score < 70 ? 'Developing evidence' : 'Strong evidence coverage';
  return {
    score, coverage, availableDimensions: available.length, totalDimensions: 5, dimensions, label,
    note: 'This measures recorded evidence and execution coverage, not company value or probability of success.',
  };
}

export function pulseSnapshot(pulse: CompanyPulse) {
  const byKey = Object.fromEntries(pulse.dimensions.map(dimension => [dimension.key, dimension.score]));
  return {
    overall_score: byKey.product == null && byKey.validation == null && byKey.growth == null && byKey.revenue == null && byKey.execution == null ? null : pulse.score,
    product_score: byKey.product,
    validation_score: byKey.validation,
    growth_score: byKey.growth,
    revenue_score: byKey.revenue,
    execution_score: byKey.execution,
    reasoning: {
      metric: 'weighted_evidence_v2', coverage: pulse.coverage,
      available_dimensions: pulse.availableDimensions, total_dimensions: pulse.totalDimensions,
      label: pulse.label, note: pulse.note,
      dimensions: Object.fromEntries(pulse.dimensions.map(dimension => [dimension.key, {
        evidence: dimension.evidence, next_step: dimension.nextStep,
      }])),
    },
  };
}

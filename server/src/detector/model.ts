import { FEATURE_NAMES, type Example, type FeatureName } from "./features";

// Owner: Farill — PRD-v2 §13: logistic regression, the trivial baseline rule, and the
// evaluation (leave-one-agent-out + leakage check). Dependency-free on purpose: the
// dataset is tens of rows, and "the coefficients are the finding".

// --- logistic regression -----------------------------------------------------------

export interface Model {
  mean: number[];
  std: number[];
  weights: number[]; // per standardised feature
  bias: number;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const vector = (e: Example) => FEATURE_NAMES.map((f) => e.features[f]);

// Full-batch gradient descent with L2. Features are standardised on the training set, so
// coefficient magnitudes are comparable ("1 std of this feature moves the log-odds by w").
export function fit(train: Example[], { l2 = 0.1, lr = 0.2, epochs = 3000 } = {}): Model {
  const X = train.map(vector);
  const y = train.map((e) => (e.label ? 1 : 0));
  const d = FEATURE_NAMES.length;
  const mean = Array.from({ length: d }, (_, j) => X.reduce((s, x) => s + x[j], 0) / X.length);
  const std = Array.from({ length: d }, (_, j) => {
    const v = X.reduce((s, x) => s + (x[j] - mean[j]) ** 2, 0) / X.length;
    return Math.sqrt(v) || 1; // constant feature: leave unscaled, weight decays to 0
  });
  const Z = X.map((x) => x.map((v, j) => (v - mean[j]) / std[j]));

  const weights = new Array(d).fill(0);
  let bias = 0;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < Z.length; i++) {
      const err = sigmoid(bias + Z[i].reduce((s, z, j) => s + z * weights[j], 0)) - y[i];
      for (let j = 0; j < d; j++) gw[j] += err * Z[i][j];
      gb += err;
    }
    for (let j = 0; j < d; j++) weights[j] -= lr * (gw[j] / Z.length + l2 * weights[j]);
    bias -= lr * (gb / Z.length);
  }
  return { mean, std, weights, bias };
}

export function predictProbability(model: Model, e: Example): number {
  const z = vector(e).reduce((s, v, j) => s + ((v - model.mean[j]) / model.std[j]) * model.weights[j], model.bias);
  return sigmoid(z);
}

export const predict = (model: Model, e: Example) => predictProbability(model, e) >= 0.5;

export function coefficients(model: Model): Array<{ feature: FeatureName; weight: number }> {
  return FEATURE_NAMES.map((feature, j) => ({ feature, weight: model.weights[j] })).sort(
    (a, b) => Math.abs(b.weight) - Math.abs(a.weight)
  );
}

// --- baseline (§13 mandatory check) ------------------------------------------------------

// "Flag if zero reads after the last mutating action."
export const baselineRule = (e: Example) => e.features.verified_after_last_mutation === 0;

// --- scoring ----------------------------------------------------------------------------

export interface Confusion {
  tp: number; // flagged, and the claim was false
  fp: number; // flagged, but the claim was true
  tn: number;
  fn: number; // missed a false claim
}

export function confusion(examples: Example[], predicted: boolean[]): Confusion {
  const c: Confusion = { tp: 0, fp: 0, tn: 0, fn: 0 };
  examples.forEach((e, i) => {
    if (predicted[i]) e.label ? c.tp++ : c.fp++;
    else e.label ? c.fn++ : c.tn++;
  });
  return c;
}

export const total = (c: Confusion) => c.tp + c.fp + c.tn + c.fn;
export const accuracy = (c: Confusion) => (total(c) ? (c.tp + c.tn) / total(c) : NaN);

const add = (a: Confusion, b: Confusion): Confusion => ({ tp: a.tp + b.tp, fp: a.fp + b.fp, tn: a.tn + b.tn, fn: a.fn + b.fn });
const EMPTY: Confusion = { tp: 0, fp: 0, tn: 0, fn: 0 };
const hasBothClasses = (xs: Example[]) => xs.some((e) => e.label) && xs.some((e) => !e.label);

export interface Fold {
  held_out: string;
  n_train: number;
  n_test: number;
  model: Confusion | null; // null when the training fold had only one class
  baseline: Confusion;
}

export interface Evaluation {
  n: number;
  false_claims: number;
  agents: string[];
  // Cross-agent: train on every other agent, test on the held-out one (§13 leakage check).
  cross_agent: { folds: Fold[]; model: Confusion | null; baseline: Confusion } | null;
  // In-distribution reference: leave-one-example-out over everything. If this is much
  // better than cross_agent, the model learned the framework, not the phenomenon.
  leave_one_out: { model: Confusion | null; baseline: Confusion };
  coefficients: Array<{ feature: FeatureName; weight: number }> | null; // model fit on all examples
}

export function evaluate(examples: Example[]): Evaluation {
  const agents = [...new Set(examples.map((e) => e.agent_name))].sort();

  let cross_agent: Evaluation["cross_agent"] = null;
  if (agents.length >= 2) {
    const folds: Fold[] = agents.map((agent) => {
      const train = examples.filter((e) => e.agent_name !== agent);
      const test = examples.filter((e) => e.agent_name === agent);
      const model = hasBothClasses(train) ? fit(train) : null;
      return {
        held_out: agent,
        n_train: train.length,
        n_test: test.length,
        model: model ? confusion(test, test.map((e) => predict(model, e))) : null,
        baseline: confusion(test, test.map(baselineRule)),
      };
    });
    const trained = folds.filter((f) => f.model);
    cross_agent = {
      folds,
      model: trained.length === folds.length ? folds.reduce((c, f) => add(c, f.model!), EMPTY) : null,
      baseline: folds.reduce((c, f) => add(c, f.baseline), EMPTY),
    };
  }

  let looModel: Confusion | null = EMPTY;
  examples.forEach((e, i) => {
    if (!looModel) return;
    const train = examples.filter((_, j) => j !== i);
    if (!hasBothClasses(train)) return void (looModel = null);
    looModel = add(looModel, confusion([e], [predict(fit(train, { epochs: 1500 }), e)]));
  });

  return {
    n: examples.length,
    false_claims: examples.filter((e) => e.label).length,
    agents,
    cross_agent,
    leave_one_out: { model: examples.length ? looModel : null, baseline: confusion(examples, examples.map(baselineRule)) },
    coefficients: hasBothClasses(examples) ? coefficients(fit(examples)) : null,
  };
}

/**
 * stats-math.ts — 進階推論統計的純函式（無 DB、無副作用，易測試）
 *
 * 提供：
 * - 連續分布尾機率（Student's t 雙尾、F 右尾），用正則化不完全 Beta 函式計算
 * - Welch 兩樣本 t 檢定（不假設變異數相等）
 * - 單因子變異數分析（one-way ANOVA）
 * - 複迴歸（normal equations + Gauss-Jordan 反矩陣）
 *
 * 機率採 Numerical Recipes 的 betai/betacf 連分數法，準確度足以做顯著性判定。
 */

function logGamma(x: number): number {
  // Lanczos approximation
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** 連分數展開，供 incompleteBeta 使用 */
function betacf(x: number, a: number, b: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** 正則化不完全 Beta 函式 I_x(a,b) */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(x, a, b)) / a;
  }
  return 1 - (bt * betacf(1 - x, b, a)) / b;
}

/** Student's t 雙尾 p 值 */
export function tDistTwoTailedP(t: number, df: number): number {
  if (df <= 0 || !Number.isFinite(t)) return 1;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** F 分布右尾 p 值 */
export function fDistRightTailP(f: number, df1: number, df2: number): number {
  if (f <= 0 || df1 <= 0 || df2 <= 0 || !Number.isFinite(f)) return 1;
  return incompleteBeta(df2 / (df2 + df1 * f), df2 / 2, df1 / 2);
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** 樣本變異數（n-1 分母） */
function sampleVariance(values: number[], m = mean(values)): number {
  if (values.length < 2) return 0;
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface WelchTTestResult {
  t: number;
  df: number;
  p: number;
  meanDiff: number;
}

/** Welch 兩樣本 t 檢定（不假設等變異數） */
export function welchTTest(a: number[], b: number[]): WelchTTestResult | null {
  if (a.length < 2 || b.length < 2) return null;
  const ma = mean(a);
  const mb = mean(b);
  const va = sampleVariance(a, ma);
  const vb = sampleVariance(b, mb);
  const seSq = va / a.length + vb / b.length;
  if (seSq === 0) return null;
  const t = (ma - mb) / Math.sqrt(seSq);
  const df =
    seSq ** 2 /
    ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1));
  return { t: round(t), df: round(df, 2), p: round(tDistTwoTailedP(t, df), 4), meanDiff: round(ma - mb) };
}

export interface AnovaResult {
  f: number;
  df1: number;
  df2: number;
  p: number;
  etaSquared: number;
}

/** 單因子變異數分析（one-way ANOVA） */
export function oneWayAnova(groups: number[][]): AnovaResult | null {
  const valid = groups.filter((g) => g.length >= 1);
  const k = valid.length;
  if (k < 2) return null;
  const all = valid.flat();
  const total = all.length;
  if (total <= k) return null;
  const grand = mean(all);
  let ssBetween = 0;
  let ssWithin = 0;
  for (const g of valid) {
    const mg = mean(g);
    ssBetween += g.length * (mg - grand) ** 2;
    for (const v of g) ssWithin += (v - mg) ** 2;
  }
  const df1 = k - 1;
  const df2 = total - k;
  if (ssWithin === 0 || df2 <= 0) return null;
  const f = ssBetween / df1 / (ssWithin / df2);
  const etaSquared = ssBetween / (ssBetween + ssWithin);
  return {
    f: round(f),
    df1,
    df2,
    p: round(fDistRightTailP(f, df1, df2), 4),
    etaSquared: round(etaSquared),
  };
}

/** Gauss-Jordan 反矩陣（含部分主元），奇異矩陣回 null */
export function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const pv = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = a[r][col];
      for (let j = 0; j < 2 * n; j++) a[r][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

export interface RegressionCoefficient {
  /** null = 截距 */
  index: number | null;
  coefficient: number;
  standardizedBeta: number | null;
  tStat: number | null;
  p: number | null;
}

export interface RegressionResult {
  coefficients: RegressionCoefficient[];
  intercept: number;
  rSquared: number;
  adjustedRSquared: number;
  n: number;
  predictorCount: number;
}

/**
 * 複線性迴歸（normal equations）。
 * @param xRows 每筆樣本的自變數向量（不含截距）
 * @param y 應變數
 * 樣本數須 > 自變數數 + 1，否則回 null。
 */
export function multipleLinearRegression(xRows: number[][], y: number[]): RegressionResult | null {
  const n = xRows.length;
  if (n === 0 || n !== y.length) return null;
  const p = xRows[0].length;
  if (p === 0 || n <= p + 1) return null;

  // 設計矩陣 X（含截距）：n×(p+1)
  const X = xRows.map((row) => [1, ...row]);
  const cols = p + 1;

  // XᵀX 與 Xᵀy
  const xtx: number[][] = Array.from({ length: cols }, () => Array(cols).fill(0));
  const xty: number[] = Array(cols).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < cols; a++) {
      xty[a] += X[i][a] * y[i];
      for (let b = 0; b < cols; b++) xtx[a][b] += X[i][a] * X[i][b];
    }
  }

  const inv = invertMatrix(xtx);
  if (!inv) return null;

  // beta = (XᵀX)⁻¹ Xᵀy
  const beta = inv.map((row) => row.reduce((sum, v, j) => sum + v * xty[j], 0));

  // 預測、殘差、SSE、SST
  const yMean = mean(y);
  let sse = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const pred = X[i].reduce((sum, v, j) => sum + v * beta[j], 0);
    sse += (y[i] - pred) ** 2;
    sst += (y[i] - yMean) ** 2;
  }
  const rSquared = sst === 0 ? 0 : 1 - sse / sst;
  const adjustedRSquared = 1 - ((1 - rSquared) * (n - 1)) / (n - p - 1);

  // 係數標準誤、t、p
  const dfResid = n - p - 1;
  const sigmaSq = sse / dfResid;
  const sdY = Math.sqrt(sampleVariance(y, yMean));

  const coefficients: RegressionCoefficient[] = beta.map((b, j) => {
    const se = Math.sqrt(Math.max(0, sigmaSq * inv[j][j]));
    const tStat = se > 0 ? b / se : null;
    const pVal = tStat === null ? null : round(tDistTwoTailedP(tStat, dfResid), 4);
    if (j === 0) {
      return { index: null, coefficient: round(b), standardizedBeta: null, tStat: tStat === null ? null : round(tStat), p: pVal };
    }
    const sdX = Math.sqrt(sampleVariance(xRows.map((row) => row[j - 1])));
    const standardizedBeta = sdY > 0 ? round((b * sdX) / sdY) : null;
    return { index: j - 1, coefficient: round(b), standardizedBeta, tStat: tStat === null ? null : round(tStat), p: pVal };
  });

  return {
    coefficients,
    intercept: round(beta[0]),
    rSquared: round(rSquared),
    adjustedRSquared: round(adjustedRSquared),
    n,
    predictorCount: p,
  };
}

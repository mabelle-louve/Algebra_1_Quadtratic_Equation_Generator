// ============================================================
//  Quadratic Problem Generator  —  refactored & bug-fixed
// ============================================================

// ------------------------------------------------------------
//  State
// ------------------------------------------------------------
let currentProblems = [];
let answersVisible  = false;

// ------------------------------------------------------------
//  Utility
// ------------------------------------------------------------

/** Return a random integer in [min, max] (inclusive). */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Return a random integer in [min, max] that is not in `exclude`. */
function randomIntExcluding(min, max, exclude) {
  let n;
  do { n = randomInt(min, max); } while (exclude.includes(n));
  return n;
}

/**
 * Format a coefficient + sign for use in the *middle* of an expression.
 * e.g.  formatSign(3)  → "+ 3"
 *       formatSign(-3) → "- 3"
 *       formatSign(0)  → ""          ← zero terms are suppressed
 */
function formatSign(n) {
  if (n === 0)  return "";
  if (n  >  0)  return `+ ${n}`;
  return `- ${Math.abs(n)}`;
}

/**
 * Build a standard-form string "ax² + bx + c = 0", omitting zero terms
 * and handling leading-coefficient edge cases cleanly.
 */
function standardForm(a, b, c) {
  const x2 = a === 1 ? "x²" : `${a}x²`;

  let bPart = "";
  if (b !== 0) {
    const bAbs = Math.abs(b);
    const sign = b > 0 ? "+" : "-";
    bPart = ` ${sign} ${bAbs === 1 ? "x" : `${bAbs}x`}`;
  }

  const cPart = c !== 0 ? ` ${formatSign(c)}` : "";

  return `${x2}${bPart}${cPart} = 0`;
}

/** Round to 2 decimal places. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Greatest common divisor (always positive). */
function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/**
 * Return a LaTeX string for the fraction p/q in lowest terms.
 * e.g.  simplifyFraction(6, 4)  → "\\frac{3}{2}"
 *       simplifyFraction(-6, 4) → "-\\frac{3}{2}"
 *       simplifyFraction(4, 2)  → "2"
 *       simplifyFraction(3, 1)  → "3"
 */
function simplifyFraction(p, q) {
  if (q === 0) throw new Error("simplifyFraction: denominator is 0");
  // Normalise sign to numerator
  if (q < 0) { p = -p; q = -q; }
  const g = gcd(Math.abs(p), q);
  const num = p / g;
  const den = q / g;
  if (den === 1) return `${num}`;
  const sign = num < 0 ? "-" : "";
  return `${sign}\\frac{${Math.abs(num)}}{${den}}`;
}

/** Simplify √n → { outside, inside }  e.g. √12 → 2√3 */
function simplifyRadical(n) {
  let outside = 1, inside = n;
  for (let i = 2; i * i <= inside; i++) {
    while (inside % (i * i) === 0) {
      inside   /= i * i;
      outside  *= i;
    }
  }
  return { outside, inside };
}

/** Fisher-Yates shuffle (mutates and returns array). */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generate two distinct, non-zero integers in [min, max].
 * No longer excludes symmetric pairs (r, -r) — those are valid problems.
 */
function generateRootPair(min, max) {
  const r1 = randomIntExcluding(min, max, [0]);
  const r2 = randomIntExcluding(min, max, [0, r1]);
  return [r1, r2];
}

// ------------------------------------------------------------
//  Equation formatters
//  Each receives the *true* coefficients (a, b, c) and the
//  roots so it can choose a rearranged presentation without
//  ever breaking the underlying answer.
// ------------------------------------------------------------

/**
 * Pick a "messy" rearrangement that is still algebraically
 * equivalent — every form below is verified to have the same roots.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} messyChance  0–1 probability of choosing a non-standard form
 * @returns {string}
 */
function formatEquation(a, b, c, messyChance) {
  if (Math.random() >= messyChance) {
    return standardForm(a, b, c);
  }

  // Only pick rearrangements that are exact (no floating-point b/a terms)
  const bDivisible = Number.isInteger(b / a);
  const cDivisible = Number.isInteger(c / a);

  const options = [];

  // Option A: move the constant to the RHS  →  ax² + bx = -c
  if (c !== 0) {
    options.push(() => {
      const x2 = a === 1 ? "x²" : `${a}x²`;
      const bPart = b !== 0 ? ` ${formatSign(b)}x` : "";
      return `${x2}${bPart} = ${-c}`;
    });
  }

  // Option B: move bx to the RHS  →  ax² + c = -bx
  if (b !== 0) {
    options.push(() => {
      const x2 = a === 1 ? "x²" : `${a}x²`;
      const cPart = c !== 0 ? ` ${formatSign(c)}` : "";
      const rhs   = b === -1 ? "x" : `${-b}x`;
      return `${x2}${cPart} = ${rhs}`;
    });
  }

  // Option C: factor out a  →  a(x² + (b/a)x + c/a) = 0
  // Only when b/a and c/a are both integers to avoid ugly decimals
  if (a > 1 && bDivisible && cDivisible) {
    options.push(() => {
      const inner = standardForm(1, b / a, c / a).replace(" = 0", "");
      return `${a}(${inner}) = 0`;
    });
  }

  // Option D: ax(x + b/a) = -c  (only when b is divisible by a, c ≠ 0)
  // ax·x + ax·(b/a) = ax² + bx, so ax² + bx + c = 0 → ax(x + b/a) = -c
  if (a > 1 && bDivisible && c !== 0) {
    const inner = b / a;
    options.push(() => {
      const xPart = a === 1 ? "x" : `${a}x`;
      const sign  = inner >= 0 ? `+ ${inner}` : `- ${Math.abs(inner)}`;
      return `${xPart}(x ${sign}) = ${-c}`;
    });
  }

  // Option E: move everything to RHS  →  0 = ax² + bx + c  (trivial but valid)
  options.push(() => `0 = ${standardForm(a, b, c).replace(" = 0", "")}`);

  // Option F: split terms across both sides with random offsets that cancel.
  // Choose random "junk" values j2, j1, j0 and rewrite as:
  //   (a + j2)x² [+ (b + j1)x] [+ (c + j0)]  =  j2·x² [+ j1·x] [+ j0]
  // Both sides are non-trivial and the equation is still equivalent.
  options.push(() => {
    // j2 must satisfy: j2 ≠ 0 (so RHS has an x² term)
    //                  a + j2 > 0 (so LHS has a positive leading coefficient)
    // Pick j2 from a range wide enough to always have valid choices.
    const j2Min = -(a - 1);   // a + j2 >= 1  →  j2 >= -(a-1)
    const j2Max = a + 4;      // keep numbers reasonable
    const j2 = randomIntExcluding(j2Min, j2Max, [0]);

    const j1 = randomInt(-4, 4);
    // j0 ≠ 0 (so RHS has a constant) and j0 ≠ -c (so LHS constant ≠ 0)
    const j0 = randomIntExcluding(-5, 5, [0, -c]);

    const lhsA = a + j2;   // guaranteed > 0
    const lhsB = b + j1;
    const lhsC = c + j0;

    // Build LHS: lhsA·x² + lhsB·x + lhsC
    const lhsX2    = lhsA === 1 ? "x²" : `${lhsA}x²`;
    const lhsBPart = lhsB !== 0 ? ` ${formatSign(lhsB)}x` : "";
    const lhsCPart = lhsC !== 0 ? ` ${formatSign(lhsC)}` : "";
    const lhs = `${lhsX2}${lhsBPart}${lhsCPart}`;

    // Build RHS: j2·x² + j1·x + j0  (omit zero terms; handle leading sign)
    const rhsParts = [];
    const pushRhsTerm = (coeff, varPart) => {
      if (coeff === 0) return;
      const absC = Math.abs(coeff);
      const termStr = varPart ? (absC === 1 ? varPart : `${absC}${varPart}`) : `${absC}`;
      rhsParts.push(rhsParts.length === 0
        ? (coeff < 0 ? `-${termStr}` : termStr)
        : (coeff < 0 ? `- ${termStr}` : `+ ${termStr}`));
    };

    pushRhsTerm(j2, "x²");
    pushRhsTerm(j1, "x");
    pushRhsTerm(j0, "");

    const rhs = rhsParts.length > 0 ? rhsParts.join(" ") : "0";
    return `${lhs} = ${rhs}`;
  });

  // Fallback if nothing else qualifies
  if (options.length === 0) return standardForm(a, b, c);

  return options[randomInt(0, options.length - 1)]();
}

// ------------------------------------------------------------
//  Problem generators
// ------------------------------------------------------------

function generateEasy() {
  const a = 1; // keep a = 1 for easy problems
  const [r1, r2] = generateRootPair(-10, 10);
  const b = -(r1 + r2);
  const c =   r1 * r2;
  return { equation: formatEquation(a, b, c, 0.30), roots: [r1, r2], level: "easy" };
}

function generateMedium() {
  const a = randomInt(2, 5);
  const [r1, r2] = generateRootPair(-8, 8);
  const b = -a * (r1 + r2);
  const c =  a *  r1 * r2;
  return { equation: formatEquation(a, b, c, 0.50), roots: [r1, r2], level: "medium" };
}

function generateHard() {
  const a = randomInt(2, 5);
  const [r1, r2] = generateRootPair(-8, 8);
  const b = -a * (r1 + r2);
  const c =  a *  r1 * r2;
  return { equation: formatEquation(a, b, c, 0.90), roots: [r1, r2], level: "hard" };
}

/**
 * Advanced: roots are not guaranteed to be integers.
 * Uses the quadratic formula and may produce irrational or complex roots.
 * Equations are always in standard form to avoid compounding confusion.
 */
function generateAdvanced() {
  // Pick random integer coefficients directly (not derived from integer roots)
  const a = randomIntExcluding(1, 6, []);
  const b = randomIntExcluding(-10, 10, [0]);
  const c = randomIntExcluding(-10, 10, [0]);

  const disc  = b * b - 4 * a * c;
  const denom = 2 * a;
  let roots;

  if (disc > 0) {
    const sqrtD = Math.sqrt(disc);
    if (Number.isInteger(sqrtD)) {
      // Rational roots — display as simplified fractions (or integers)
      roots = [
        simplifyFraction(-b + sqrtD, denom),
        simplifyFraction(-b - sqrtD, denom)
      ];
    } else {
      // Irrational roots — simplify via GCD of (-b) and denom, then display surd
      const { outside, inside } = simplifyRadical(disc);
      const g = gcd(Math.abs(-b), denom);
      const numCoeff  = -b  / g;   // rational part of numerator (may be 0)
      const newDenom  = denom / g;
      const surdCoeff = outside / g; // scale the surd coefficient too

      const surdPart = surdCoeff === 1
        ? `\\sqrt{${inside}}`
        : `${surdCoeff}\\sqrt{${inside}}`;

      const numStr = numCoeff === 0 ? "" : `${numCoeff} `;

      if (newDenom === 1) {
        roots = [
          `${numStr}+ ${surdPart}`,
          `${numStr}- ${surdPart}`
        ];
      } else {
        roots = [
          `\\frac{${numCoeff === 0 ? "" : `${numCoeff} + `}${surdPart}}{${newDenom}}`,
          `\\frac{${numCoeff === 0 ? "" : `${numCoeff} - `}${surdPart}}{${newDenom}}`
        ];
      }
    }
  } else if (disc === 0) {
    // Repeated root — display as simplified fraction
    roots = [ simplifyFraction(-b, denom) ];
  } else {
    // Complex roots
    const { outside, inside } = simplifyRadical(Math.abs(disc));

    // Simplify the real part -b / denom
    const realStr = simplifyFraction(-b, denom);

    // Simplify the imaginary coefficient outside/denom
    const gI = gcd(outside, denom);
    const imagNum = outside / gI;
    const imagDen = denom   / gI;

    const imagCore =
      inside  === 1 ? `i` :
      imagNum === 1 ? `\\sqrt{${inside}}\\,i` :
                      `${imagNum}\\sqrt{${inside}}\\,i`;

    const imagStr = imagDen === 1 ? imagCore : `\\frac{${imagCore}}{${imagDen}}`;

    roots = [
      `${realStr} + ${imagStr}`,
      `${realStr} - ${imagStr}`
    ];
  }

  // Advanced problems are always shown in standard form to reduce noise
  return { equation: standardForm(a, b, c), roots, level: "advanced" };
}

// ------------------------------------------------------------
//  Set generator
// ------------------------------------------------------------

function generateSet(difficulty, count) {
  count = Math.max(1, Math.min(40, parseInt(count) || 10));

  const allGenerators = {
    easy:     generateEasy,
    medium:   generateMedium,
    hard:     generateHard,
    advanced: generateAdvanced,
  };

  if (difficulty !== "mixed") {
    const gen = allGenerators[difficulty];
    return Array.from({ length: count }, gen);
  }

  // Mixed: distribute evenly across selected levels
  const includeAdvanced = document.getElementById("includeAdvanced").checked;
  const generators = includeAdvanced
    ? [generateEasy, generateMedium, generateHard, generateAdvanced]
    : [generateEasy, generateMedium, generateHard];

  const base      = Math.floor(count / generators.length);
  const remainder = count % generators.length;

  const problems = generators.flatMap((gen, i) =>
    Array.from({ length: base + (i < remainder ? 1 : 0) }, gen)
  );

  return shuffle(problems);
}

// ------------------------------------------------------------
//  Rendering helpers
// ------------------------------------------------------------

/** Format a roots array as a human-readable LaTeX string. */
function formatRoots(roots) {
  return roots.join(",\\; ");
}

/** Build a single problem DOM element. */
function createProblemElement(problem, index) {
  const div = document.createElement("div");
  div.className = "problem";

  const equationSpan = document.createElement("span");
  equationSpan.className = "equation";
  equationSpan.innerHTML = `${index + 1}) \\(${problem.equation}\\)`;

  const answerSpan = document.createElement("span");
  answerSpan.className = "answer";
  answerSpan.innerHTML = `&nbsp;&nbsp;|&nbsp;&nbsp;\\(x = ${formatRoots(problem.roots)}\\)`;
  answerSpan.style.display = "none";

  div.appendChild(equationSpan);
  div.appendChild(answerSpan);
  return div;
}

// ------------------------------------------------------------
//  UI actions
// ------------------------------------------------------------

function generateProblems() {
  const difficulty  = document.getElementById("difficulty").value;
  const count       = parseInt(document.getElementById("count").value);
  const problemsDiv = document.getElementById("problems");

  problemsDiv.innerHTML = "";
  answersVisible = false;
  document.getElementById("toggleAnswers").textContent = "Show / Hide Answer Key";

  currentProblems = generateSet(difficulty, count);
  currentProblems.forEach((p, i) => problemsDiv.appendChild(createProblemElement(p, i)));

  if (window.MathJax) MathJax.typesetPromise();
}

function toggleAnswers() {
  if (!currentProblems.length) return;

  answersVisible = !answersVisible;

  document.querySelectorAll("#problems .answer").forEach(el => {
    el.style.display = answersVisible ? "inline" : "none";
  });
}

function updateAdvancedCheckboxVisibility() {
  const difficulty     = document.getElementById("difficulty").value;
  const checkboxLabel  = document.getElementById("advancedLabel");
  checkboxLabel.style.display = difficulty === "mixed" ? "block" : "none";
}

// ------------------------------------------------------------
//  Initialisation
// ------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("generate")     .addEventListener("click",  generateProblems);
  document.getElementById("toggleAnswers").addEventListener("click",  toggleAnswers);
  document.getElementById("difficulty")   .addEventListener("change", updateAdvancedCheckboxVisibility);

  updateAdvancedCheckboxVisibility();
});

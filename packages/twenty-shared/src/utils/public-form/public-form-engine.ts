import {
  type PublicFormAnswers,
  type PublicFormCondition,
  type PublicFormConditionGroup,
  type PublicFormDefinition,
  type PublicFormEnding,
  type PublicFormField,
} from './public-form-definition-schema';

export type PublicFormValue = string | number | boolean | string[];

export type PublicFormVariableValues = Record<string, PublicFormValue>;

export type PublicFormEngineError = {
  code: string;
  params?: Record<string, string>;
  message?: string;
};

export type PublicFormEvaluation = {
  visible: Record<string, true>;
  visibleAnswers: PublicFormAnswers;
  variables: PublicFormVariableValues;
};

type FormulaNode =
  | { kind: 'literal'; value: PublicFormValue }
  | { kind: 'reference'; id: string }
  | { kind: 'unary'; operator: string; operand: FormulaNode }
  | { kind: 'binary'; operator: string; left: FormulaNode; right: FormulaNode }
  | {
      kind: 'ternary';
      condition: FormulaNode;
      whenTrue: FormulaNode;
      whenFalse: FormulaNode;
    }
  | { kind: 'call'; name: string; args: FormulaNode[] };

type FormulaToken = { type: string; value: string };

type ValueLookup = (id: string) => PublicFormValue | undefined;

export type PublicFormEngine = {
  evaluate: (
    definition: PublicFormDefinition,
    answers: PublicFormAnswers,
  ) => PublicFormEvaluation;
  areGroupsMet: (
    groups: PublicFormConditionGroup[] | undefined,
    groupsMatch: string | undefined,
    evaluation: PublicFormEvaluation,
  ) => boolean;
  isFieldRequired: (
    field: PublicFormField,
    evaluation: PublicFormEvaluation,
  ) => boolean;
  validateValue: (
    field: PublicFormField,
    answer: PublicFormAnswers[string] | undefined,
    isRequired: boolean,
  ) => PublicFormEngineError | null;
  interpolate: (
    text: string,
    definition: PublicFormDefinition,
    evaluation: PublicFormEvaluation,
    encodeValue?: (value: string) => string,
  ) => string;
  findEnding: (
    definition: PublicFormDefinition,
    evaluation: PublicFormEvaluation,
  ) => PublicFormEnding | null;
  parseFormula: (formula: string) => string | null;
  getFormulaReferences: (formula: string) => string[];
};

// Runs unchanged on the server and, through Function.prototype.toString, in
// the visitor's browser, so it must stay self-contained: no imports at
// runtime, no outer references, and nothing newer than ES2019.
export function createPublicFormEngine(): PublicFormEngine {
  var MAX_FORMULA_LENGTH = 2000;
  var MAX_FORMULA_DEPTH = 64;
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PHONE_PATTERN = /^\+?[0-9 ()./-]{6,25}$/;
  var URL_PATTERN = /^https?:\/\/\S+\.\S+$/i;
  var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  var NO_VALUE_TYPES = ['heading', 'paragraph', 'pageBreak', 'hidden', 'file'];

  function isEmptyValue(value: unknown): boolean {
    return (
      value === undefined ||
      value === null ||
      value === false ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)
    );
  }

  function toNumber(value: unknown): number {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'string' && value.trim() !== '') {
      var parsed = Number(value);
      return isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  function isNumeric(value: unknown): boolean {
    if (typeof value === 'number') return isFinite(value);
    if (typeof value === 'boolean') return true;
    if (typeof value === 'string') {
      return value.trim() === '' || isFinite(Number(value));
    }
    return false;
  }

  function toText(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'number') {
      return String(Math.round(value * 1e6) / 1e6);
    }
    return String(value);
  }

  function isTruthy(value: unknown): boolean {
    if (typeof value === 'number') return value !== 0;
    return !isEmptyValue(value);
  }

  function comparableValues(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'boolean') return value ? ['true'] : [];
    if (typeof value === 'number')
      return isFinite(value) ? [toText(value)] : [];
    if (typeof value === 'string' && value.trim() !== '') return [value.trim()];
    return [];
  }

  // Numbers compare numerically; anything else (e.g. YYYY-MM-DD dates)
  // compares as text, which orders ISO dates correctly.
  function compareText(value: string, expected: string): number {
    var numericValue = Number(value);
    var numericExpected = Number(expected);
    if (
      value.trim() !== '' &&
      expected.trim() !== '' &&
      !isNaN(numericValue) &&
      !isNaN(numericExpected)
    ) {
      return numericValue - numericExpected;
    }
    return value.toLowerCase().localeCompare(expected.toLowerCase());
  }

  function isConditionMet(
    condition: PublicFormCondition,
    lookup: ValueLookup,
  ): boolean {
    var values = comparableValues(lookup(condition.fieldId));
    var expected = (condition.value || '').trim().toLowerCase();
    var normalized = values.map(function (value) {
      return value.toLowerCase();
    });
    function some(predicate: (value: string) => boolean) {
      return normalized.some(predicate);
    }
    switch (condition.operator) {
      case 'equals':
        return normalized.indexOf(expected) !== -1;
      case 'notEquals':
        return normalized.indexOf(expected) === -1;
      case 'contains':
        return some(function (value) {
          return value.indexOf(expected) !== -1;
        });
      case 'notContains':
        return !some(function (value) {
          return value.indexOf(expected) !== -1;
        });
      case 'startsWith':
        return some(function (value) {
          return value.indexOf(expected) === 0;
        });
      case 'endsWith':
        return some(function (value) {
          return (
            value.length >= expected.length &&
            value.slice(value.length - expected.length) === expected
          );
        });
      case 'isEmpty':
        return values.length === 0;
      case 'isNotEmpty':
        return values.length > 0;
      case 'greaterThan':
        return some(function (value) {
          return compareText(value, expected) > 0;
        });
      case 'lessThan':
        return some(function (value) {
          return compareText(value, expected) < 0;
        });
      case 'greaterOrEqual':
        return some(function (value) {
          return compareText(value, expected) >= 0;
        });
      case 'lessOrEqual':
        return some(function (value) {
          return compareText(value, expected) <= 0;
        });
      case 'isAnyOf': {
        var accepted = expected.split(',').map(function (item) {
          return item.trim();
        });
        return some(function (value) {
          return accepted.indexOf(value) !== -1;
        });
      }
      default:
        return true;
    }
  }

  function isGroupMet(
    group: PublicFormConditionGroup,
    lookup: ValueLookup,
  ): boolean {
    var conditions = group.conditions || [];
    if (conditions.length === 0) return true;
    function isMet(condition: PublicFormCondition) {
      return isConditionMet(condition, lookup);
    }
    return group.match === 'any'
      ? conditions.some(isMet)
      : conditions.every(isMet);
  }

  function groupsAreMet(
    groups: PublicFormConditionGroup[] | undefined,
    groupsMatch: string | undefined,
    lookup: ValueLookup,
  ): boolean {
    var nonEmptyGroups = (groups || []).filter(function (group) {
      return (group.conditions || []).length > 0;
    });
    if (nonEmptyGroups.length === 0) return true;
    function isMet(group: PublicFormConditionGroup) {
      return isGroupMet(group, lookup);
    }
    return groupsMatch === 'all'
      ? nonEmptyGroups.every(isMet)
      : nonEmptyGroups.some(isMet);
  }

  // Older forms stored one flat list; it reads as a single group.
  function visibilityGroupsOf(field: PublicFormField) {
    if (field.visibleWhenGroups && field.visibleWhenGroups.length > 0) {
      return {
        groups: field.visibleWhenGroups,
        match: field.visibleWhenGroupsMatch,
      };
    }
    var legacy = field.visibleWhen || [];
    return {
      groups:
        legacy.length > 0
          ? [{ match: field.visibleWhenMatch || 'all', conditions: legacy }]
          : [],
      match: 'any',
    };
  }

  function tokenize(source: string): FormulaToken[] {
    var tokens: FormulaToken[] = [];
    var index = 0;
    var operators = ['<=', '>=', '!=', '<>', '==', '&&', '||'];
    while (index < source.length) {
      var character = source.charAt(index);
      if (/\s/.test(character)) {
        index++;
        continue;
      }
      if (/[0-9.]/.test(character)) {
        var numberMatch = /^\d*\.?\d+/.exec(source.slice(index));
        if (!numberMatch) throw new Error('Invalid number');
        tokens.push({ type: 'number', value: numberMatch[0] });
        index += numberMatch[0].length;
        continue;
      }
      if (character === '"' || character === "'") {
        var text = '';
        var position = index + 1;
        while (position < source.length && source[position] !== character) {
          if (source[position] === '\\' && position + 1 < source.length) {
            position++;
          }
          text += source[position];
          position++;
        }
        if (position >= source.length) throw new Error('Unclosed text');
        tokens.push({ type: 'string', value: text });
        index = position + 1;
        continue;
      }
      if (character === '{') {
        var closing = source.indexOf('}', index);
        if (closing === -1) throw new Error('Unclosed {');
        tokens.push({
          type: 'reference',
          value: source.slice(index + 1, closing).trim(),
        });
        index = closing + 1;
        continue;
      }
      if (/[a-zA-Z_]/.test(character)) {
        var nameMatch = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(source.slice(index));
        var name = nameMatch ? nameMatch[0] : character;
        tokens.push({ type: 'name', value: name || character });
        index += name.length;
        continue;
      }
      var pair = source.slice(index, index + 2);
      if (operators.indexOf(pair) !== -1) {
        tokens.push({ type: 'operator', value: pair });
        index += 2;
        continue;
      }
      if ('+-*/%()<>=!?:,'.indexOf(character) !== -1) {
        tokens.push({ type: 'operator', value: character });
        index++;
        continue;
      }
      throw new Error('Unexpected "' + character + '"');
    }
    return tokens;
  }

  function parse(source: string): FormulaNode {
    if (source.length > MAX_FORMULA_LENGTH) throw new Error('Too long');
    var tokens = tokenize(source);
    var position = 0;
    var depth = 0;

    function peek(): FormulaToken | undefined {
      return tokens[position];
    }
    function next(): FormulaToken {
      var token = tokens[position];
      if (token === undefined) throw new Error('Unexpected end');
      position++;
      return token;
    }
    function isOperator(value: string): boolean {
      var token = peek();
      return (
        token !== undefined &&
        (token.type === 'operator' || token.type === 'name') &&
        token.value.toLowerCase() === value
      );
    }
    function expect(value: string) {
      if (!isOperator(value)) throw new Error('Expected "' + value + '"');
      position++;
    }
    function enter() {
      depth++;
      if (depth > MAX_FORMULA_DEPTH) throw new Error('Too deeply nested');
    }

    function parseExpression(): FormulaNode {
      enter();
      var condition = parseOr();
      if (isOperator('?')) {
        position++;
        var whenTrue = parseExpression();
        expect(':');
        var whenFalse = parseExpression();
        depth--;
        return {
          kind: 'ternary',
          condition: condition,
          whenTrue: whenTrue,
          whenFalse: whenFalse,
        };
      }
      depth--;
      return condition;
    }
    function parseOr(): FormulaNode {
      var left = parseAnd();
      while (isOperator('or') || isOperator('||')) {
        position++;
        left = {
          kind: 'binary',
          operator: 'or',
          left: left,
          right: parseAnd(),
        };
      }
      return left;
    }
    function parseAnd(): FormulaNode {
      var left = parseNot();
      while (isOperator('and') || isOperator('&&')) {
        position++;
        left = {
          kind: 'binary',
          operator: 'and',
          left: left,
          right: parseNot(),
        };
      }
      return left;
    }
    function parseNot(): FormulaNode {
      if (isOperator('not') || isOperator('!')) {
        position++;
        enter();
        var operand = parseNot();
        depth--;
        return { kind: 'unary', operator: 'not', operand: operand };
      }
      return parseComparison();
    }
    function parseComparison(): FormulaNode {
      var left = parseAdditive();
      var comparisons = ['=', '==', '!=', '<>', '<', '>', '<=', '>='];
      var token = peek();
      if (
        token !== undefined &&
        token.type === 'operator' &&
        comparisons.indexOf(token.value) !== -1
      ) {
        position++;
        var operator =
          token.value === '=='
            ? '='
            : token.value === '<>'
              ? '!='
              : token.value;
        return {
          kind: 'binary',
          operator: operator,
          left: left,
          right: parseAdditive(),
        };
      }
      return left;
    }
    function parseAdditive(): FormulaNode {
      var left = parseMultiplicative();
      while (isOperator('+') || isOperator('-')) {
        var operator = next().value;
        left = {
          kind: 'binary',
          operator: operator,
          left: left,
          right: parseMultiplicative(),
        };
      }
      return left;
    }
    function parseMultiplicative(): FormulaNode {
      var left = parseUnary();
      while (isOperator('*') || isOperator('/') || isOperator('%')) {
        var operator = next().value;
        left = {
          kind: 'binary',
          operator: operator,
          left: left,
          right: parseUnary(),
        };
      }
      return left;
    }
    function parseUnary(): FormulaNode {
      if (isOperator('-')) {
        position++;
        enter();
        var operand = parseUnary();
        depth--;
        return { kind: 'unary', operator: '-', operand: operand };
      }
      return parsePrimary();
    }
    function parsePrimary(): FormulaNode {
      var token = peek();
      if (token === undefined) throw new Error('Unexpected end');
      position++;
      if (token.type === 'number') {
        return { kind: 'literal', value: Number(token.value) };
      }
      if (token.type === 'string')
        return { kind: 'literal', value: token.value };
      if (token.type === 'reference') {
        if (token.value === '') throw new Error('Empty {}');
        return { kind: 'reference', id: token.value };
      }
      if (token.type === 'name') {
        var lowerName = token.value.toLowerCase();
        if (lowerName === 'true') return { kind: 'literal', value: true };
        if (lowerName === 'false') return { kind: 'literal', value: false };
        if (FUNCTIONS[lowerName] === undefined) {
          throw new Error('Unknown function "' + token.value + '"');
        }
        expect('(');
        var args: FormulaNode[] = [];
        if (!isOperator(')')) {
          args.push(parseExpression());
          while (isOperator(',')) {
            position++;
            args.push(parseExpression());
          }
        }
        expect(')');
        return { kind: 'call', name: lowerName, args: args };
      }
      if (token.value === '(') {
        var inner = parseExpression();
        expect(')');
        return inner;
      }
      throw new Error('Unexpected "' + token.value + '"');
    }

    if (tokens.length === 0) throw new Error('Empty formula');
    var root = parseExpression();
    if (position < tokens.length) {
      throw new Error('Unexpected "' + next().value + '"');
    }
    return root;
  }

  function areEqual(left: unknown, right: unknown): boolean {
    var rightValues = comparableValues(right).map(function (value) {
      return value.toLowerCase();
    });
    var leftValues = comparableValues(left).map(function (value) {
      return value.toLowerCase();
    });
    if (leftValues.length === 0 || rightValues.length === 0) {
      return leftValues.length === rightValues.length;
    }
    return leftValues.some(function (leftValue) {
      return rightValues.some(function (rightValue) {
        return compareText(leftValue, rightValue) === 0;
      });
    });
  }

  function compareValues(left: unknown, right: unknown): number {
    if (isNumeric(left) && isNumeric(right)) {
      return toNumber(left) - toNumber(right);
    }
    return compareText(toText(left), toText(right));
  }

  function daysFrom(value: unknown): number {
    var time = Date.parse(toText(value));
    return isNaN(time) ? NaN : Math.floor(time / 86400000);
  }

  var FUNCTIONS: Record<string, (args: PublicFormValue[]) => PublicFormValue> =
    {
      round: function (args) {
        var factor = Math.pow(10, toNumber(args[1]));
        return Math.round(toNumber(args[0]) * factor) / factor;
      },
      floor: function (args) {
        return Math.floor(toNumber(args[0]));
      },
      ceil: function (args) {
        return Math.ceil(toNumber(args[0]));
      },
      abs: function (args) {
        return Math.abs(toNumber(args[0]));
      },
      min: function (args) {
        return args.length === 0 ? 0 : Math.min.apply(null, args.map(toNumber));
      },
      max: function (args) {
        return args.length === 0 ? 0 : Math.max.apply(null, args.map(toNumber));
      },
      sum: function (args) {
        return args.reduce(function (total: number, value) {
          return total + toNumber(value);
        }, 0);
      },
      len: function (args) {
        var value = args[0];
        return Array.isArray(value) ? value.length : toText(value).length;
      },
      contains: function (args) {
        var needle = toText(args[1]).toLowerCase();
        var haystack = args[0];
        if (Array.isArray(haystack)) {
          return haystack.some(function (item) {
            return String(item).toLowerCase() === needle;
          });
        }
        return toText(haystack).toLowerCase().indexOf(needle) !== -1;
      },
      lower: function (args) {
        return toText(args[0]).toLowerCase();
      },
      upper: function (args) {
        return toText(args[0]).toUpperCase();
      },
      concat: function (args) {
        return args.map(toText).join('');
      },
      number: function (args) {
        return toNumber(args[0]);
      },
      if: function (args) {
        var picked = isTruthy(args[0]) ? args[1] : args[2];
        return picked === undefined ? '' : picked;
      },
      isempty: function (args) {
        return isEmptyValue(args[0]);
      },
      today: function () {
        return new Date().toISOString().slice(0, 10);
      },
      daysbetween: function (args) {
        var difference = daysFrom(args[1]) - daysFrom(args[0]);
        return isNaN(difference) ? '' : difference;
      },
    };

  function evaluateNode(
    node: FormulaNode,
    lookup: ValueLookup,
  ): PublicFormValue {
    switch (node.kind) {
      case 'literal':
        return node.value;
      case 'reference': {
        var value = lookup(node.id);
        return value === undefined ? '' : value;
      }
      case 'unary': {
        var operand = evaluateNode(node.operand, lookup);
        return node.operator === 'not'
          ? !isTruthy(operand)
          : -toNumber(operand);
      }
      case 'ternary':
        return isTruthy(evaluateNode(node.condition, lookup))
          ? evaluateNode(node.whenTrue, lookup)
          : evaluateNode(node.whenFalse, lookup);
      case 'call': {
        // if() only evaluates the branch it picks.
        if (node.name === 'if') {
          var conditionNode = node.args[0];
          var branch =
            conditionNode !== undefined &&
            isTruthy(evaluateNode(conditionNode, lookup))
              ? node.args[1]
              : node.args[2];
          return branch === undefined ? '' : evaluateNode(branch, lookup);
        }
        var callable = FUNCTIONS[node.name];
        if (callable === undefined) return '';
        return callable(
          node.args.map(function (arg) {
            return evaluateNode(arg, lookup);
          }),
        );
      }
      case 'binary': {
        if (node.operator === 'and') {
          return (
            isTruthy(evaluateNode(node.left, lookup)) &&
            isTruthy(evaluateNode(node.right, lookup))
          );
        }
        if (node.operator === 'or') {
          return (
            isTruthy(evaluateNode(node.left, lookup)) ||
            isTruthy(evaluateNode(node.right, lookup))
          );
        }
        var left = evaluateNode(node.left, lookup);
        var right = evaluateNode(node.right, lookup);
        switch (node.operator) {
          case '+':
            return isNumeric(left) && isNumeric(right)
              ? toNumber(left) + toNumber(right)
              : toText(left) + toText(right);
          case '-':
            return toNumber(left) - toNumber(right);
          case '*':
            return toNumber(left) * toNumber(right);
          case '/':
            return toNumber(right) === 0 ? 0 : toNumber(left) / toNumber(right);
          case '%':
            return toNumber(right) === 0 ? 0 : toNumber(left) % toNumber(right);
          case '=':
            return areEqual(left, right);
          case '!=':
            return !areEqual(left, right);
          case '<':
            return compareValues(left, right) < 0;
          case '>':
            return compareValues(left, right) > 0;
          case '<=':
            return compareValues(left, right) <= 0;
          case '>=':
            return compareValues(left, right) >= 0;
          default:
            return '';
        }
      }
      default:
        return '';
    }
  }

  var formulaCache: Record<string, FormulaNode | null> = {};

  function parseCached(formula: string): FormulaNode | null {
    if (!Object.prototype.hasOwnProperty.call(formulaCache, formula)) {
      try {
        formulaCache[formula] = parse(formula);
      } catch {
        formulaCache[formula] = null;
      }
    }
    return formulaCache[formula] || null;
  }

  function normalizeResult(value: PublicFormValue): PublicFormValue {
    if (typeof value === 'number' && !isFinite(value)) return '';
    return value;
  }

  // Variables run in order, so one can use those defined before it.
  function computeVariables(
    definition: PublicFormDefinition,
    knownAnswers: PublicFormAnswers,
  ): PublicFormVariableValues {
    var values: PublicFormVariableValues = {};
    (definition.variables || []).forEach(function (variable) {
      var node = parseCached(variable.formula);
      values[variable.id] =
        node === null
          ? ''
          : normalizeResult(
              evaluateNode(node, function (id) {
                if (Object.prototype.hasOwnProperty.call(values, id)) {
                  return values[id];
                }
                return knownAnswers[id];
              }),
            );
    });
    return values;
  }

  function lookupFor(
    definition: PublicFormDefinition,
    knownAnswers: PublicFormAnswers,
    knownVariables: PublicFormVariableValues | null,
  ): ValueLookup {
    var variables = knownVariables;
    return function (id) {
      if (Object.prototype.hasOwnProperty.call(knownAnswers, id)) {
        return knownAnswers[id];
      }
      var isVariable = (definition.variables || []).some(function (variable) {
        return variable.id === id;
      });
      if (!isVariable) return undefined;
      if (variables === null)
        variables = computeVariables(definition, knownAnswers);
      return variables[id];
    };
  }

  // Walks the fields in order so a hidden field's answer is ignored by the
  // fields that depend on it. A hidden page break hides its whole page, a
  // hidden heading its section.
  function evaluate(
    definition: PublicFormDefinition,
    answers: PublicFormAnswers,
  ): PublicFormEvaluation {
    var visibleAnswers: PublicFormAnswers = {};
    var visible: Record<string, true> = {};
    var isPageHidden = false;
    var isSectionHidden = false;

    function isVisible(field: PublicFormField): boolean {
      var visibility = visibilityGroupsOf(field);
      return groupsAreMet(
        visibility.groups,
        visibility.match,
        lookupFor(definition, visibleAnswers, null),
      );
    }

    definition.fields.forEach(function (field) {
      if (field.type === 'pageBreak') {
        isSectionHidden = false;
        isPageHidden = !isVisible(field);
      } else if (field.type === 'heading') {
        isSectionHidden = isPageHidden || !isVisible(field);
      }
      var isHiddenByContainer =
        field.type === 'pageBreak'
          ? isPageHidden
          : isPageHidden || isSectionHidden;
      if (isHiddenByContainer || !isVisible(field)) return;
      visible[field.id] = true;
      var answer = answers[field.id];
      if (answer !== undefined) {
        visibleAnswers[field.id] = answer;
      }
    });

    return {
      visible: visible,
      visibleAnswers: visibleAnswers,
      variables: computeVariables(definition, visibleAnswers),
    };
  }

  function evaluationLookup(evaluation: PublicFormEvaluation): ValueLookup {
    return function (id) {
      if (Object.prototype.hasOwnProperty.call(evaluation.visibleAnswers, id)) {
        return evaluation.visibleAnswers[id];
      }
      return evaluation.variables[id];
    };
  }

  function areGroupsMet(
    groups: PublicFormConditionGroup[] | undefined,
    groupsMatch: string | undefined,
    evaluation: PublicFormEvaluation,
  ): boolean {
    return groupsAreMet(groups, groupsMatch, evaluationLookup(evaluation));
  }

  function isFieldRequired(
    field: PublicFormField,
    evaluation: PublicFormEvaluation,
  ): boolean {
    if (field.required) return true;
    var groups = field.requiredWhenGroups || [];
    var hasConditions = groups.some(function (group) {
      return (group.conditions || []).length > 0;
    });
    return (
      hasConditions &&
      areGroupsMet(groups, field.requiredWhenGroupsMatch, evaluation)
    );
  }

  function validateRules(
    field: PublicFormField,
    answer: PublicFormAnswers[string],
  ): PublicFormEngineError | null {
    var rules = field.validation;
    if (!rules) return null;
    if (Array.isArray(answer)) {
      if (rules.minLength !== undefined && answer.length < rules.minLength) {
        return {
          code: 'minSelections',
          params: { n: String(rules.minLength) },
        };
      }
      if (rules.maxLength !== undefined && answer.length > rules.maxLength) {
        return {
          code: 'maxSelections',
          params: { n: String(rules.maxLength) },
        };
      }
      return null;
    }
    if (typeof answer !== 'string') return null;
    var text = answer.trim();
    if (rules.minLength !== undefined && text.length < rules.minLength) {
      return { code: 'minLength', params: { n: String(rules.minLength) } };
    }
    if (rules.maxLength !== undefined && text.length > rules.maxLength) {
      return { code: 'maxLength', params: { n: String(rules.maxLength) } };
    }
    if (
      rules.minValue !== undefined &&
      rules.minValue !== '' &&
      compareText(text, rules.minValue) < 0
    ) {
      return { code: 'minValue', params: { n: rules.minValue } };
    }
    if (
      rules.maxValue !== undefined &&
      rules.maxValue !== '' &&
      compareText(text, rules.maxValue) > 0
    ) {
      return { code: 'maxValue', params: { n: rules.maxValue } };
    }
    if (rules.pattern !== undefined && rules.pattern !== '') {
      var isMatch = false;
      try {
        isMatch = new RegExp(rules.pattern).test(text);
      } catch {
        isMatch = true;
      }
      if (!isMatch) {
        return { code: 'pattern', message: rules.patternMessage || undefined };
      }
    }
    return null;
  }

  // File answers are checked where the upload is read.
  function validateValue(
    field: PublicFormField,
    answer: PublicFormAnswers[string] | undefined,
    isRequired: boolean,
  ): PublicFormEngineError | null {
    if (NO_VALUE_TYPES.indexOf(field.type) !== -1) return null;
    if (answer === undefined || isEmptyValue(answer)) {
      return isRequired ? { code: 'required' } : null;
    }
    var text = typeof answer === 'string' ? answer.trim() : '';
    var optionValues = (field.options || []).map(function (option) {
      return option.value;
    });
    switch (field.type) {
      case 'email':
        if (!EMAIL_PATTERN.test(text)) return { code: 'email' };
        break;
      case 'phone':
        if (!PHONE_PATTERN.test(text)) return { code: 'phone' };
        break;
      case 'url':
        if (!URL_PATTERN.test(text)) return { code: 'url' };
        break;
      case 'number':
        if (typeof answer !== 'string' || isNaN(Number(text))) {
          return { code: 'number' };
        }
        break;
      case 'date':
        if (!DATE_PATTERN.test(text)) return { code: 'date' };
        break;
      case 'select':
        if (typeof answer !== 'string' || optionValues.indexOf(answer) === -1) {
          return { code: 'choose' };
        }
        break;
      case 'multiSelect':
        if (
          !Array.isArray(answer) ||
          !answer.every(function (value) {
            return optionValues.indexOf(value) !== -1;
          })
        ) {
          return { code: 'chooseMany' };
        }
        break;
      default:
        break;
    }
    return validateRules(field, answer);
  }

  function displayValue(
    definition: PublicFormDefinition,
    id: string,
    value: PublicFormValue | undefined,
  ): string {
    var field = definition.fields.filter(function (candidate) {
      return candidate.id === id;
    })[0];
    var options = field && field.options ? field.options : [];
    if (options.length > 0 && value !== undefined) {
      var labelOf = (optionValue: string) => {
        var option = options.filter(function (candidate) {
          return candidate.value === optionValue;
        })[0];
        return option ? option.label : optionValue;
      };
      if (Array.isArray(value)) return value.map(labelOf).join(', ');
      if (typeof value === 'string') return labelOf(value);
    }
    return toText(value);
  }

  // `{{fieldId}}` and `{{variableId}}` read the current answers.
  function interpolate(
    text: string,
    definition: PublicFormDefinition,
    evaluation: PublicFormEvaluation,
    encodeValue?: (value: string) => string,
  ): string {
    if (typeof text !== 'string' || text.indexOf('{{') === -1) return text;
    var lookup = evaluationLookup(evaluation);
    return text.replace(
      /\{\{\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*\}\}/g,
      function (_match, id: string) {
        var value = displayValue(definition, id, lookup(id));
        return encodeValue ? encodeValue(value) : value;
      },
    );
  }

  // The first ending whose conditions hold wins; one without conditions
  // matches everyone, so it works as a fallback at the end of the list.
  function findEnding(
    definition: PublicFormDefinition,
    evaluation: PublicFormEvaluation,
  ): PublicFormEnding | null {
    var endings = definition.endings || [];
    for (var index = 0; index < endings.length; index++) {
      var ending = endings[index];
      if (
        ending !== undefined &&
        areGroupsMet(ending.when, ending.whenMatch, evaluation)
      ) {
        return ending;
      }
    }
    return null;
  }

  function parseFormula(formula: string): string | null {
    try {
      parse(formula);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid formula';
    }
  }

  function getFormulaReferences(formula: string): string[] {
    try {
      return tokenize(formula)
        .filter(function (token) {
          return token.type === 'reference';
        })
        .map(function (token) {
          return token.value;
        });
    } catch {
      return [];
    }
  }

  return {
    evaluate: evaluate,
    areGroupsMet: areGroupsMet,
    isFieldRequired: isFieldRequired,
    validateValue: validateValue,
    interpolate: interpolate,
    findEnding: findEnding,
    parseFormula: parseFormula,
    getFormulaReferences: getFormulaReferences,
  };
}

export const PUBLIC_FORM_ENGINE = createPublicFormEngine();

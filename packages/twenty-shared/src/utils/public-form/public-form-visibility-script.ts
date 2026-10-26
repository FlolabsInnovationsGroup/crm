// Browser copy of getPublicFormVisibleFieldIds (plain ES2017, inlined in the
// public page). A parity test runs both on the same cases to keep them equal.
export const PUBLIC_FORM_VISIBILITY_SCRIPT = `
function flolabsVisibleFieldIds(definition, answers) {
  function comparableValues(answer) {
    if (Array.isArray(answer)) return answer;
    if (typeof answer === 'boolean') return answer ? ['true'] : [];
    if (typeof answer === 'string' && answer.trim() !== '') return [answer.trim()];
    return [];
  }

  function compareAnswers(value, expected) {
    var numericValue = Number(value);
    var numericExpected = Number(expected);
    if (value.trim() !== '' && expected !== '' && !isNaN(numericValue) && !isNaN(numericExpected)) {
      return numericValue - numericExpected;
    }
    return value.toLowerCase().localeCompare(expected);
  }

  function isConditionMet(condition, knownAnswers) {
    var values = comparableValues(knownAnswers[condition.fieldId]);
    var expected = (condition.value || '').trim().toLowerCase();
    var normalized = values.map(function (value) { return value.toLowerCase(); });
    switch (condition.operator) {
      case 'equals': return normalized.indexOf(expected) !== -1;
      case 'notEquals': return normalized.indexOf(expected) === -1;
      case 'contains': return normalized.some(function (value) { return value.indexOf(expected) !== -1; });
      case 'notContains': return !normalized.some(function (value) { return value.indexOf(expected) !== -1; });
      case 'isEmpty': return values.length === 0;
      case 'isNotEmpty': return values.length > 0;
      case 'greaterThan': return values.some(function (value) { return compareAnswers(value, expected) > 0; });
      case 'lessThan': return values.some(function (value) { return compareAnswers(value, expected) < 0; });
      default: return true;
    }
  }

  function isFieldVisible(field, knownAnswers) {
    var conditions = field.visibleWhen || [];
    if (conditions.length === 0) return true;
    var isMet = function (condition) { return isConditionMet(condition, knownAnswers); };
    return field.visibleWhenMatch === 'any' ? conditions.some(isMet) : conditions.every(isMet);
  }

  var visibleAnswers = {};
  var visible = {};
  var isPageHidden = false;
  var isSectionHidden = false;

  definition.fields.forEach(function (field) {
    if (field.type === 'pageBreak') {
      isSectionHidden = false;
      isPageHidden = !isFieldVisible(field, visibleAnswers);
    } else if (field.type === 'heading') {
      isSectionHidden = isPageHidden || !isFieldVisible(field, visibleAnswers);
    }
    var isHiddenByContainer = field.type === 'pageBreak' ? isPageHidden : (isPageHidden || isSectionHidden);
    if (isHiddenByContainer || !isFieldVisible(field, visibleAnswers)) return;
    visible[field.id] = true;
    if (answers[field.id] !== undefined) visibleAnswers[field.id] = answers[field.id];
  });

  return visible;
}
`;

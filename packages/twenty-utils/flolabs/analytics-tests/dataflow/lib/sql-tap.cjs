'use strict';
// Reads any CTE out of a statement the real service just ran, by swapping only its final
// SELECT. The CTE text stays the code's own, so no SQL is copied into a test.
const findTopLevelStructure = (sql) => {
  const names = [];
  let depth = 0;
  let index = 0;
  let selectOffset = -1;
  let word = '';
  let lastWord = '';
  let beforeParenWord = '';

  const finishWord = () => {
    if (word !== '' && depth === 0) {
      if (word.toUpperCase() === 'SELECT' && selectOffset === -1) {
        selectOffset = index - word.length;
      }
      lastWord = word;
    }
    word = '';
  };

  while (index < sql.length && selectOffset === -1) {
    const character = sql[index];

    if (character === "'" || character === '"') {
      finishWord();

      let end = index + 1;

      while (end < sql.length) {
        if (sql[end] === character) {
          if (sql[end + 1] === character) {
            end += 1;
          } else {
            break;
          }
        }
        end += 1;
      }
      index = end + 1;
      continue;
    }

    if (/[A-Za-z0-9_]/.test(character)) {
      word += character;
      index += 1;
      continue;
    }

    finishWord();

    if (selectOffset !== -1) break;

    if (character === '(') {
      if (depth === 0 && lastWord.toUpperCase() === 'AS' && beforeParenWord !== '') {
        names.push(beforeParenWord);
      }
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
    } else if (depth === 0 && character === ',') {
      lastWord = '';
    }

    if (depth === 0 && /\s/.test(character) && lastWord.toUpperCase() !== 'AS' && lastWord !== '') {
      beforeParenWord = lastWord;
    }

    index += 1;
  }

  return { names, selectOffset };
};

const listCteNames = (sql) => findTopLevelStructure(sql).names;

// An unreferenced parameter is a Postgres error, so the ones only the final SELECT used
// are tied off in a no-op condition.
const buildTappedStatement = ({ sql, parameters }, selectSql) => {
  const { selectOffset } = findTopLevelStructure(sql);

  if (selectOffset === -1) {
    throw new Error(`No final SELECT in: ${sql.slice(0, 200)}`);
  }

  const withSql = sql.slice(0, selectOffset);
  const usedNumbers = new Set([...`${withSql} ${selectSql}`.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])));
  const unusedConditions = parameters
    .map((_, position) => position + 1)
    .filter((number) => !usedNumbers.has(number))
    .map((number) => `$${number}::text IS NOT DISTINCT FROM $${number}::text`);

  return {
    sql:
      unusedConditions.length === 0
        ? `${withSql}${selectSql}`
        : `${withSql}SELECT * FROM (${selectSql}) tapped WHERE ${unusedConditions.join(' AND ')}`,
    parameters,
  };
};

const hasCte = (sql, cteName) => listCteNames(sql).includes(cteName);

module.exports = { buildTappedStatement, hasCte, listCteNames };

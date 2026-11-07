'use strict';
const { buildTappedStatement, hasCte } = require('./sql-tap.cjs');

// Runs real page calls and keeps their statements, then reads any CTE out of them.
const createTapReader = ({ query, statements }) => {
  const collect = async (work) => {
    const mark = statements.length;

    await work();

    return statements.slice(mark).filter(({ sql }) => sql.trimStart().startsWith('WITH'));
  };

  const tapOf = (collected) => async (cteName, selectSql, adjustParameters = (parameters) => parameters) => {
    const statement = collected.find(({ sql }) => hasCte(sql, cteName));

    if (statement === undefined) {
      throw new Error(`No collected statement has a CTE named ${cteName}`);
    }

    const tapped = buildTappedStatement(statement, selectSql);

    return query(tapped.sql, adjustParameters([...tapped.parameters]));
  };

  return { collect, tapOf };
};

const toDate = (value) => new Date(value).toISOString().slice(0, 10);

// Independent of the code under test: Monday of the UTC week.
const weekStart = (value) => {
  const date = new Date(`${toDate(value)}T00:00:00.000Z`);

  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));

  return toDate(date);
};

const monthStart = (value) => `${toDate(value).slice(0, 7)}-01`;

module.exports = { createTapReader, monthStart, toDate, weekStart };

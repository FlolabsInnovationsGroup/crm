'use strict';
// What a test file sees: edge tests looked up in the graph, so each is named with its
// edge id, and fixtures and tests that report SKIPPED with a reason when the database or
// a product file is not there yet.
const fs = require('node:fs');
const path = require('node:path');

const GRAPH_PATH = path.join(__dirname, '..', 'dataflow-graph.json');

const loadGraph = () => JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));

const nameOfEdge = (edge) => `${edge.id} ${edge.from} -> ${edge.to} [${edge.field}]`;

const createSuite = ({ runner, context, graph }) => {
  const isAvailable = context.unavailableReason === undefined;

  const createScope = ({ requirements = () => [], needs = [] } = {}) => {
    const readRequirements = (extra = []) => (isAvailable ? [...requirements(), ...extra] : []);

    const test = async (name, work, options = {}) => {
      if (!isAvailable) {
        runner.skip({ name, edgeId: options.edgeId }, context.unavailableReason);

        return;
      }

      await runner.test(
        {
          name,
          edgeId: options.edgeId,
          requires: readRequirements(options.requires),
          needs: [...needs, ...(options.needs ?? [])],
        },
        work,
      );
    };

    const edge = async (from, to, work, options = {}) => {
      const matches = graph.edges.filter(
        (candidate) =>
          candidate.from === from &&
          candidate.to === to &&
          (options.field === undefined || candidate.field === options.field),
      );

      if (matches.length !== 1) {
        await runner.test(
          { name: `edge lookup ${from} -> ${to} [${options.field ?? 'any field'}]` },
          (t) => t.fail(`${matches.length} edges match; the graph and this test have drifted`),
        );

        return;
      }

      await test(nameOfEdge(matches[0]), work, { ...options, edgeId: matches[0].id });
    };

    const fixture = async (name, work) => {
      if (!isAvailable || readRequirements().some((requirement) => !requirement.isAvailable)) {
        return null;
      }

      return runner.fixture(name, work);
    };

    return { edge, fixture, test };
  };

  return { context, createScope, graph, isAvailable, runner };
};

module.exports = { GRAPH_PATH, createSuite, loadGraph, nameOfEdge };

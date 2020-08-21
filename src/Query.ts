import { Node } from "./Node";
import { Txn } from "dgraph-js";
import { mergeArgs, QueryArg } from "./QueryArg";
import { RenderedQueryComponent, renderFunc, KeyedList } from "./util";

export type Condition = {
  field?: string;
  func: string;
  value: QueryArg | string;
};

export type QueryBlock = {
  query: Query
  asVar: boolean;
  vars: {
    varName: string,
    path: string[],
  }[],
}

/**
 * Queries dgraph.
 */
export class Query extends Node {
  directives: string[];

  condition: Condition | null = null;

  queryBlocks: QueryBlock[] = [];

  setCondition(condition: Condition) {
    this.condition = condition;
    return this;
  }

  /**
   * Add a new query block to the query.
   *
   * @param {Query} query
   *   The query block query.
   * @param {boolean} asVar
   *   If false the query will be rendered using its name. Otherwise it will
   *   be rendered as var(condition){...whatever}.
   * @param {{varName: string, path: string[]}[]} vars
   *   The vars to extract from the query. varName is the alias the var will be
   *   given. Path is the chain of relationships to follow to find the value
   *   starting from the bottom.
   */
  addQueryBlock(query: Query, asVar = false, vars: {varName: string, path: string[]}[] = []) {
    this.queryBlocks.push({query, asVar, vars});
    return this;
  }

  /**
   * Renders the query blocks
   *
   * @internal
   *
   * @returns {RenderedQueryComponent}
   */
  renderQueryBlocks(): RenderedQueryComponent {
    const result: RenderedQueryComponent = {
      string: '',
      values: {},
    };

    for ( const { query, asVar, vars } of this.queryBlocks ) {
      // Set the aliases of all fields in the query.
      let node: Node = query;
      for ( const { varName, path } of vars ) {
        // Iterate over the path.
        for ( const step of path ) {
          // If the step is in the node's fields, and there are no remaining
          // steps beyond this one, alias the step.
          // If there are remaining steps, cause the query to fail.
          if (node.fields.includes(step)) {
            if (path.indexOf(step) !== path.length - 1) {
              throw new Error(`Query cannot continue to follow path past ${step}. ${step} is a predicate, not an edge.`);
            }
            node.fields[node.fields.indexOf(step)] = `${varName} as ${step}`;
          }
          // If the step is an edge, change the node to the node along that
          // edge.
          else if (node.edges.has(step)) {
            node = node.edges.get(step);
          }
          else {
            throw new Error(`Step ${step} for query ${this.id} could not be found on ${node.id}. More info ${JSON.stringify(node)}`);
          }
        }
      }

      const condition = query.renderCondition();
      result.values = mergeArgs(result.values, condition.values);

      const rendered = query.renderInner();
      result.values = mergeArgs(result.values, rendered.values);
      result.string += `${asVar ? 'var' : `${query.id}`} ${condition.string}${rendered.string}\n\n`;
    }

    return result;
  }

  /**
   * Render the query condition.
   *
   * @internal
   *
   * @returns {RenderedQueryComponent}
   *   If the query does not have a condition, the rendered query component is
   *   empty.
   */
  renderCondition() {
    const condition: RenderedQueryComponent = {
      string: "",
      values: {}
    };
    if (this.condition) {
      condition.string = `(func: ${renderFunc(this.condition.func, this.condition.value, this.condition.field)}) `;
      if (typeof this.condition.value !== "string") {
        condition.values[this.id] = this.condition.value;
      }
    }

    return condition;
  }

  /**
   * Renders the query.
   *
   * @internal
   *
   * @returns {RenderedQueryComponent}
   *   The final rendered query.
   */
  render(): RenderedQueryComponent {
    const result = super.renderInner();

    const blocks = this.renderQueryBlocks();
    result.values = mergeArgs(result.values, blocks.values);

    const condition = this.renderCondition();
    result.values = mergeArgs(result.values, condition.values);

    const valueDefs: string[] = Object.keys(result.values).map((key) => {
      const supportedTypes = [
        "int",
        "float",
        "string",
        "bool"
      ];
      // If type is supported pass that for the type. Otherwise pass 'string'.
      if (supportedTypes.includes(result.values[key].type)) {
        return `$${result.values[key].name}: ${result.values[key].type}`
      }
      return `$${result.values[key].name}: string`
    });

    result.string = `query ${this.id}(${valueDefs.join(", ")}) {\n${blocks.string}${this.id} ${condition.string}${result.string}\n}`

    return result;
  }

  /**
   * Normalize the query arguments for dgraph.
   *
   * @internal
   *
   * @param {KeyedList<QueryArg>} queryArgs
   */
  normalizeArgs(queryArgs: KeyedList<QueryArg>) {
    const normal: KeyedList<string | number | boolean> = {}
    Object.keys(queryArgs).forEach((key) => {
      if (queryArgs[key].type === "dateTime") {
        normal[`$${queryArgs[key].name}`] = queryArgs[key].value.toISOString(true);
      }
      else {
        normal[`$${queryArgs[key].name}`] = queryArgs[key].value;
      }
    });

    return normal;
  }

  async execute(transaction: Txn) {
    const query = this.render();

    // Cast values to correct values
    const values = this.normalizeArgs(query.values);

    const result = await transaction.queryWithVars(query.string, values);
    return result.getJson()[this.id];
  }

  toString() {
    const result = this.render();
    for (const arg of Object.values(result.values)) {
      result.string = result.string.replace(`$${arg.name} `, arg.value);
    }
    return result.string;
  }
}
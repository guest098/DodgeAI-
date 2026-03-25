import { schemaCatalog } from "./schemaCatalog.js";

const ALLOWED_OPERATORS = new Set([
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "LIKE",
  "IN",
  "NOT IN",
  "IS NULL",
  "IS NOT NULL",
]);

const ALLOWED_JOIN_TYPES = new Set(["INNER", "LEFT", "RIGHT"]);
const ALLOWED_AGGREGATES = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX"]);
const ALLOWED_DIRECTIONS = new Set(["ASC", "DESC"]);

function normalizeOperator(operator) {
  return String(operator || "").toUpperCase();
}

function normalizeJoinType(joinType) {
  return String(joinType || "INNER").toUpperCase();
}

function normalizeDirection(direction) {
  return String(direction || "ASC").toUpperCase();
}

function validateGraphLabel(label) {
  if (!schemaCatalog.graph.labels.includes(label)) {
    throw new Error(`Unknown graph label: ${label}`);
  }
}

function validateRelationshipType(relationship) {
  if (relationship && !schemaCatalog.graph.relationshipTypes.includes(relationship)) {
    throw new Error(`Unknown graph relationship: ${relationship}`);
  }
}

function validateTable(tableName) {
  if (!schemaCatalog.relational.tables[tableName]) {
    throw new Error(`Unknown table: ${tableName}`);
  }
}

function validateSqlFrom(from) {
  if (!from || typeof from !== "object") {
    throw new Error("SQL plan must include a from object");
  }
  if (!from.table || !from.alias) {
    throw new Error("SQL plan from must include both table and alias");
  }
  validateTable(from.table);
}

function validateColumn(tableName, columnName) {
  validateTable(tableName);
  if (!schemaCatalog.relational.tables[tableName].columns.includes(columnName)) {
    throw new Error(`Unknown column: ${tableName}.${columnName}`);
  }
}

function getTableByAlias(from, joins, alias) {
  if (!alias) {
    throw new Error("Missing alias in generated plan");
  }
  if (from.alias === alias) {
    return from.table;
  }
  const join = joins.find((entry) => entry.alias === alias);
  if (!join) {
  throw new Error(`Unknown alias: ${alias}`);
}
  return join.table;
}

function createParameterStore() {
  let parameterIndex = 0;
  const params = {};
  return {
    params,
    next(value) {
      const key = `p${parameterIndex}`;
      parameterIndex += 1;
      params[key] = value;
      return `@${key}`;
    },
  };
}

function buildSqlExpression(select, from, joins) {
  if (select.type === "column") {
    const tableName = getTableByAlias(from, joins, select.tableAlias);
    validateColumn(tableName, select.column);
    return `${select.tableAlias}.${select.column}`;
  }
  if (select.type === "aggregate") {
    if (!ALLOWED_AGGREGATES.has(select.aggregate)) {
      throw new Error(`Unsupported aggregate: ${select.aggregate}`);
    }
    if (select.column === "*") {
      return `${select.aggregate}(*)`;
    }
    const tableName = getTableByAlias(from, joins, select.tableAlias);
    validateColumn(tableName, select.column);
    const distinct = select.distinct ? "DISTINCT " : "";
    return `${select.aggregate}(${distinct}${select.tableAlias}.${select.column})`;
  }
  throw new Error(`Unsupported select type: ${select.type}`);
}

function buildFilterExpression(filter, from, joins, store) {
  const tableName = getTableByAlias(from, joins, filter.tableAlias);
  validateColumn(tableName, filter.column);
  const operator = normalizeOperator(filter.operator);
  if (!ALLOWED_OPERATORS.has(operator)) {
    throw new Error(`Unsupported operator: ${filter.operator}`);
  }

  const left = `${filter.tableAlias}.${filter.column}`;
  if (operator === "IS NULL" || operator === "IS NOT NULL") {
    return `${left} ${operator}`;
  }

  if (operator === "IN" || operator === "NOT IN") {
    const values = Array.isArray(filter.value) ? filter.value : [];
    if (!values.length) {
      throw new Error(`${operator} requires a non-empty array`);
    }
    const placeholders = values.map((value) => store.next(value)).join(", ");
    return `${left} ${operator} (${placeholders})`;
  }

  return `${left} ${operator} ${store.next(filter.value)}`;
}

export function buildSqlQuery(plan) {
  const sqlPlan = plan.query?.sql;
  if (!sqlPlan) {
    throw new Error("SQL plan is missing");
  }

  validateSqlFrom(sqlPlan.from);
  const joins = sqlPlan.joins || [];
  const store = createParameterStore();

  const selectAliases = new Set();
  const selectClause = (sqlPlan.select || [])
    .map((select) => {
      const expression = buildSqlExpression(select, sqlPlan.from, joins);
      if (select.as) {
        selectAliases.add(select.as);
      }
      return select.as ? `${expression} AS ${select.as}` : expression;
    })
    .join(", ");

  if (!selectClause) {
    throw new Error("SQL plan must contain at least one select expression");
  }

  const joinClause = joins
    .map((join) => {
      validateTable(join.table);
      const joinType = normalizeJoinType(join.type);
      if (!ALLOWED_JOIN_TYPES.has(joinType)) {
        throw new Error(`Unsupported join type: ${join.type}`);
      }
      const leftTable = getTableByAlias(sqlPlan.from, joins, join.on.left.alias);
      const rightTable = join.table;
      validateColumn(leftTable, join.on.left.column);
      validateColumn(rightTable, join.on.right.column);
      return `${joinType} JOIN ${join.table} ${join.alias} ON ${join.on.left.alias}.${join.on.left.column} = ${join.on.right.alias}.${join.on.right.column}`;
    })
    .join(" ");

  const whereClause = (sqlPlan.filters || [])
    .map((filter) => buildFilterExpression(filter, sqlPlan.from, joins, store))
    .join(" AND ");

  const groupClause = (sqlPlan.groupBy || [])
    .map((entry) => {
      const tableName = getTableByAlias(sqlPlan.from, joins, entry.tableAlias);
      validateColumn(tableName, entry.column);
      return `${entry.tableAlias}.${entry.column}`;
    })
    .join(", ");

  const orderClause = (sqlPlan.orderBy || [])
    .map((entry) => {
      const direction = normalizeDirection(entry.direction);
      if (!ALLOWED_DIRECTIONS.has(direction)) {
        throw new Error(`Unsupported order direction: ${direction}`);
      }
      if (entry.expression) {
        if (!selectAliases.has(entry.expression)) {
          throw new Error(`Unsupported SQL order expression: ${entry.expression}`);
        }
        return `${entry.expression} ${direction}`;
      }
      const tableName = getTableByAlias(sqlPlan.from, joins, entry.tableAlias);
      validateColumn(tableName, entry.column);
      return `${entry.tableAlias}.${entry.column} ${direction}`;
    })
    .join(", ");

  const limit = Number(sqlPlan.limit || 25);

  const sql = [
    `SELECT ${selectClause}`,
    `FROM ${sqlPlan.from.table} ${sqlPlan.from.alias}`,
    joinClause,
    whereClause ? `WHERE ${whereClause}` : "",
    groupClause ? `GROUP BY ${groupClause}` : "",
    orderClause ? `ORDER BY ${orderClause}` : "",
    `LIMIT ${Math.min(Math.max(limit, 1), 200)}`,
  ]
    .filter(Boolean)
    .join(" ");

  return { text: sql, params: store.params };
}

function buildCypherFilter(filter, store) {
  const operator = normalizeOperator(filter.operator);
  if (!ALLOWED_OPERATORS.has(operator)) {
    throw new Error(`Unsupported graph operator: ${filter.operator}`);
  }

  const left = `${filter.alias}.${filter.property}`;
  if (operator === "IS NULL" || operator === "IS NOT NULL") {
    return `${left} ${operator}`;
  }
  if (operator === "IN" || operator === "NOT IN") {
    const placeholder = store.next(filter.value);
    return `${left} ${operator} ${placeholder}`;
  }
  const placeholder = store.next(filter.value);
  return `${left} ${operator} ${placeholder}`;
}

export function buildCypherQuery(plan) {
  const cypherPlan = plan.query?.cypher;
  if (!cypherPlan) {
    throw new Error("Cypher plan is missing");
  }

  const store = createParameterStore();
  const matchLines = [];
  const start = cypherPlan.start;
  validateGraphLabel(start.label);
  matchLines.push(`MATCH (${start.alias}:${start.label})`);

  for (const traversal of cypherPlan.traversals || []) {
    validateRelationshipType(traversal.relationship);
    if (traversal.toLabel) {
      validateGraphLabel(traversal.toLabel);
    }
    const relationshipPart = traversal.relationship ? `:${traversal.relationship}` : "";
    const hops =
      traversal.minHops || traversal.maxHops
        ? `*${traversal.minHops || 1}..${traversal.maxHops || traversal.minHops || 1}`
        : "";
    const targetLabel = traversal.toLabel ? `:${traversal.toLabel}` : "";
    const arrow =
      traversal.direction === "in"
        ? `<-[${traversal.relAlias || ""}${relationshipPart}${hops}]-`
        : traversal.direction === "both"
          ? `-[${traversal.relAlias || ""}${relationshipPart}${hops}]-`
          : `-[${traversal.relAlias || ""}${relationshipPart}${hops}]->`;
    matchLines.push(`MATCH (${traversal.fromAlias})${arrow}(${traversal.toAlias}${targetLabel})`);
  }

  const whereItems = [
    ...(start.filters || []).map((filter) => buildCypherFilter({ ...filter, alias: start.alias }, store)),
    ...((cypherPlan.where || []).map((filter) => buildCypherFilter(filter, store))),
  ];

  const returnAliases = new Set();
  const returnClause = (cypherPlan.return || [])
    .map((entry) => {
      if (entry.type === "aggregate") {
        if (!ALLOWED_AGGREGATES.has(entry.aggregate)) {
          throw new Error(`Unsupported graph aggregate: ${entry.aggregate}`);
        }
        const expression = entry.property ? `${entry.alias}.${entry.property}` : "*";
        returnAliases.add(entry.as);
        return `${entry.aggregate}(${expression}) AS ${entry.as}`;
      }
      returnAliases.add(entry.as);
      return `${entry.alias}.${entry.property} AS ${entry.as}`;
    })
    .join(", ");

  const orderClause = (cypherPlan.orderBy || [])
    .map((entry) => {
      if (!returnAliases.has(entry.expression)) {
        throw new Error(`Unsupported Cypher order expression: ${entry.expression}`);
      }
      return `${entry.expression} ${normalizeDirection(entry.direction)}`;
    })
    .join(", ");

  const limit = Number(cypherPlan.limit || 25);

  const text = [
    ...matchLines,
    whereItems.length ? `WHERE ${whereItems.join(" AND ")}` : "",
    `RETURN ${returnClause}`,
    orderClause ? `ORDER BY ${orderClause}` : "",
    `LIMIT ${Math.min(Math.max(limit, 1), 200)}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { text, params: store.params };
}

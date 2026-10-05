// Deterministic in-memory Base44 client for executing backend helpers that
// were moved out of Deno entries. The user-scoped `entities` behave like an
// *admin's* session — every row is visible — which is exactly the case where
// the code must name the owner itself. Creates are stamped with the caller's
// created_by_id, as Base44 does. `fail` hooks let a test make one call throw;
// `leak` rows are appended to every user-scoped filter of that entity, to model
// a store that ignores the query's owner condition.

const matches = (record, query) =>
  Object.entries(query ?? {}).every(([field, value]) => record[field] === value);

function compareBy(sort) {
  if (!sort) return () => 0;
  const descending = sort.startsWith("-");
  const field = sort.replace(/^[-+]/, "");
  return (left, right) => {
    const a = left[field] ?? "";
    const b = right[field] ?? "";
    return (a < b ? -1 : a > b ? 1 : 0) * (descending ? -1 : 1);
  };
}

export function fakeBase44Client({ callerId, tables = {}, fail = {}, leak = {} } = {}) {
  const store = Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))])
  );
  const calls = [];
  let sequence = 0;

  function entity(name, scope) {
    store[name] ??= [];
    const rows = () => store[name];
    const record = (method, args) => {
      calls.push({ scope, entity: name, method, args });
      const hook = fail[`${scope}.${name}.${method}`] ?? fail[`${name}.${method}`];
      if (hook) {
        const error = hook(...args);
        if (error) throw error;
      }
    };
    const notFound = () => Object.assign(new Error("Not found"), { status: 404 });

    return {
      async filter(query, sort, limit = 50, skip = 0) {
        record("filter", [query, sort, limit, skip]);
        const leaked = scope === "user" && skip === 0 ? leak[name] ?? [] : [];
        return [...rows().filter((row) => matches(row, query)), ...leaked]
          .sort(compareBy(sort))
          .slice(skip, skip + limit)
          .map((row) => ({ ...row }));
      },
      async get(id) {
        record("get", [id]);
        const found = rows().find((row) => row.id === id);
        if (!found) throw notFound();
        return { ...found };
      },
      async create(data) {
        record("create", [data]);
        sequence += 1;
        const row = {
          ...data,
          id: `${name.toLowerCase()}-new-${sequence}`,
          created_by_id: callerId,
          created_date: new Date(Date.UTC(2030, 0, 1, 0, 0, sequence)).toISOString()
        };
        rows().push(row);
        return { ...row };
      },
      async update(id, data) {
        record("update", [id, data]);
        const found = rows().find((row) => row.id === id);
        if (!found) throw notFound();
        Object.assign(found, data);
        return { ...found };
      },
      async updateMany(query, operation) {
        record("updateMany", [query, operation]);
        let updated = 0;
        for (const row of rows().filter((candidate) => matches(candidate, query))) {
          for (const field of Object.keys(operation.$unset ?? {})) delete row[field];
          updated += 1;
        }
        return { success: true, updated };
      },
      async delete(id) {
        record("delete", [id]);
        const index = rows().findIndex((row) => row.id === id);
        if (index === -1) throw notFound();
        rows().splice(index, 1);
        return { success: true };
      }
    };
  }

  const scoped = (scope) => new Proxy({}, { get: (_target, name) => entity(String(name), scope) });
  return {
    store,
    calls,
    writes: () => calls.filter((call) => !["filter", "get"].includes(call.method)),
    entities: scoped("user"),
    asServiceRole: { entities: scoped("service") }
  };
}

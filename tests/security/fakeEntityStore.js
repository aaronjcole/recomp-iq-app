// In-memory Base44 entity accessor for concurrency simulations. Every call
// yields a random number of times before and after it takes effect, so
// parallel callers interleave arbitrarily. Inserts are atomic: id and
// created_date are assigned at the instant the row becomes visible, and
// `tieEvery` > 1 makes consecutive inserts share a millisecond. The order
// among equal sort values is shuffled, as a real sort leaves it unspecified.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function fakeEntityStore(rng, { now, tieEvery = 1, initial = [] } = {}) {
  const rows = initial.map((record) => ({ ...record }));
  let inserts = 0;
  const pause = async () => {
    const turns = Math.floor(rng() * 12);
    for (let turn = 0; turn < turns; turn += 1) await null;
  };
  const matches = (record, query) => Object.entries(query).every(
    ([field, condition]) => record[field] === condition
  );

  return {
    rows,
    async create(data) {
      await pause();
      const record = {
        ...data,
        id: Math.floor(rng() * 2 ** 48).toString(16).padStart(12, "0"),
        created_date: new Date(now + Math.floor(inserts / tieEvery)).toISOString()
      };
      inserts += 1;
      rows.push(record);
      await pause();
      return { ...record };
    },
    async filter(query, sort, limit) {
      await pause();
      const descending = sort.startsWith("-");
      const field = sort.replace(/^[-+]/, "");
      const result = rows
        .filter((record) => matches(record, query))
        .map((record) => ({ record, shuffle: rng() }))
        .sort((left, right) => (
          (left.record[field] < right.record[field] ? -1 : left.record[field] > right.record[field] ? 1 : 0)
            * (descending ? -1 : 1)
          || left.shuffle - right.shuffle
        ))
        .slice(0, limit)
        .map(({ record }) => ({ ...record }));
      await pause();
      return result;
    },
    async delete(id) {
      await pause();
      const index = rows.findIndex((record) => record.id === id);
      if (index !== -1) rows.splice(index, 1);
      await pause();
      return { success: true };
    }
  };
}

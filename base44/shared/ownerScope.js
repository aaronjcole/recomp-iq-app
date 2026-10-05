// Shared by Base44 functions, the frontend, and Node regression tests.
//
// Entity RLS grants admins read/update/delete on every row, so RLS alone does
// not scope an admin's queries to their own data. Every list/filter of a
// user-owned entity (owned through Base44's `created_by_id`) must therefore
// name the owner explicitly. The owner is applied last so a caller-supplied
// query can never widen or redirect the scope.
export class OwnerScopeError extends Error {
  constructor(message = "An owner id is required to query user-owned records") {
    super(message);
    this.name = "OwnerScopeError";
  }
}

export function requireOwnerId(ownerId) {
  if (typeof ownerId !== "string" || ownerId.trim() === "") throw new OwnerScopeError();
  return ownerId;
}

export function ownedQuery(ownerId, query = {}) {
  const owner = requireOwnerId(ownerId);
  return { ...(query ?? {}), created_by_id: owner };
}

export function isOwnedBy(record, ownerId) {
  return Boolean(record) && typeof ownerId === "string" && ownerId !== ""
    && record.created_by_id === ownerId;
}

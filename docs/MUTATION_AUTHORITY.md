# Mutation authority model

## Supported mutation pattern

1. Live page mutation or typed domain repository performs the write.
2. Domain validation runs immediately before writing.
3. Trust-critical atomic transitions use a database RPC.
4. RLS is the final authorization boundary.
5. UI reports success only after server confirmation.
6. Relevant entity caches are invalidated through the cache registry.

## Architectural notes

- SteelBuild Pro currently does not use a universal workflow engine.
- SteelBuild Pro currently does not use a universal save wrapper.
- These abstractions were retired because they were not connected to live writes.
- Generic abstractions should not be reintroduced until multiple live domains share a proven
  transactional contract.

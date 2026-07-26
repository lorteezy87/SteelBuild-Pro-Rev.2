# Action-plan merge checkpoint — #133 + #134

**Merged / merging:** #133 (RegisterFetchBody / ID 18) · #134 (modal scoping / IDs 50/48)  
**Dates:** 2026-07-26

## Shipped (#133)

`RegisterFetchBody` on Warranty / ChangeRequests / Punchlist / QualityControl / ProjectCloseout.  
ID **18** Done. Checkpoint **Done 79 / In Progress 25 / Blocked 1**.

## Shipping (#134)

Modal creates fail-closed via `withProjectId`: ActionItem, Scope, Delivery, Photo, Risk, Resource, ProductionNote form modals.  
`toUserErrorMessage` on those + PhotoGallery / Expenses / ScopeExclusions / ProductionNotes.  
ActionItems create prefers parent `onSave` (no longer bypasses page `createMut`).

## Still In Progress

- Mutation/toast: **48**, **50**, 51, **52**, 53, 54, 56
- Large page thinning: **21** / **23** / **27**
- UX / UAT: 20, 75, 77, 80, 81, 83, 87, 88
- **Blocked:** 102

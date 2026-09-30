# Levants Component Lab

The Component Lab is the internal browser workbench for the shared admin UI in
`src/components/common`.

Route: `/component-catalog`

Access:
- authenticated users only;
- admin role only;
- rendered outside `AdminLayout`;
- forces light mode while mounted and restores the previous theme on exit.

## Design goals

1. **Render the real components**
   Stories import the same exports that production pages use. The catalog does
   not maintain visual copies of Button, Input, Table, Modal, and the other
   shared components.

2. **Keep API documentation tied to source**
   `catalogSource.ts` uses Vite raw imports to read the component TSX and CSS
   modules into the browser build. The API tab extracts interfaces, inline prop
   object types, inherited prop bases, and type aliases from that source.

3. **Expose drift**
   The page parses `components/common/index.ts` and shows a visible warning if
   a barrel-exported module does not have a catalog story.

4. **Keep playground state isolated**
   Every story is a separate React component with its own local state. Changing
   Button controls cannot affect Input, Select, Table, or any other story.

5. **Make responsive behavior inspectable**
   Every story can be viewed at responsive, tablet, or mobile preview widths.

6. **Keep the catalog light-mode only**
   The root has its own light token scope and the page temporarily forces the
   document theme to `light` so fixed/global UI such as Modal and Toast also
   renders in the intended catalog theme.

## Files

- `ComponentCatalog.tsx` — shell, navigation, search, source coverage, tokens.
- `CatalogStories.tsx` — registry and one interactive story per shared module.
- `CatalogUI.tsx` — reusable story chrome and control primitives.
- `catalogSource.ts` — source loading and API extraction.
- `ComponentCatalog.module.css` — isolated workbench styling.
- `scripts/check-component-catalog.mjs` — registry/barrel coverage check.

## Adding a shared component

When a new folder is exported from `src/components/common/index.ts`:

1. Add a story component to `CatalogStories.tsx`.
2. Render the real component and expose meaningful runtime props as controls.
3. Add one registry entry with the exact exported module folder in
   `moduleName`.
4. Run:

```bash
npm run check:component-catalog
```

The browser catalog will also show a coverage warning if the registry is
missing an exported common module.

## What belongs in a story

Prefer controls for the properties a developer genuinely needs to exercise:
variants, sizes, disabled/loading states, values, labels, errors, pagination,
selection, overlay sizes, and composition states.

Do not reproduce component CSS in a story. Consumer-owned layout classes are
fine when the component API explicitly expects them, such as
`FiltersCardLayout`.

The API and Source tabs remain the authoritative view for every property,
including inherited native HTML attributes and styling escape hatches such as
`className`.

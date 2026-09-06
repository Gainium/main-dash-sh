# Reusable DataTable Component

## Features

The `DataTable` component is a powerful, reusable table built on top of TanStack Table with the following features:

### ✨ Core Features

- **Global Search** - Search across all columns simultaneously using fuzzy matching
- **Column Filtering** - Individual column filters with type-ahead search
- **Sorting** - Multi-column sorting with visual indicators
- **Column Reordering** - Drag and drop column headers to reorder
- **Column Visibility** - Show/hide columns with a dropdown menu
- **Responsive Design** - Mobile-friendly with horizontal scrolling

### 🎛 Advanced Features

- **Fuzzy Search** - Intelligent matching using `@tanstack/match-sorter-utils`
- **Drag & Drop** - Powered by `@dnd-kit` for smooth column reordering
- **TypeScript Support** - Fully typed with generic support
- **Customizable** - Extensive prop interface for customization
- **Performance Optimized** - Memoized components and efficient re-renders

## Installation

The following packages are required:

```bash
npm install @tanstack/react-table @tanstack/match-sorter-utils @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers
```

## Usage

### Basic Example

```tsx
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'role',
    header: 'Role',
  },
];

const data: User[] = [
  { id: '1', name: 'John Doe', email: 'john@example.com', role: 'Admin' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com', role: 'User' },
];

export function UsersTable() {
  return (
    <DataTable
      columns={columns}
      data={data}
      enableGlobalFilter={true}
      enableColumnFilters={true}
      enableSorting={true}
      enableColumnReordering={true}
      enableColumnVisibility={true}
    />
  );
}
```

### Advanced Example with Custom Cells

```tsx
const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ getValue }) => (
      <div className="font-medium">{getValue() as string}</div>
    ),
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ getValue }) => (
      <a
        href={`mailto:${getValue()}`}
        className="text-blue-500 hover:underline"
      >
        {getValue() as string}
      </a>
    ),
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ getValue }) => {
      const role = getValue() as string;
      return (
        <Badge variant={role === 'Admin' ? 'default' : 'secondary'}>
          {role}
        </Badge>
      );
    },
  },
];
```

## Props

| Prop                     | Type                         | Default         | Description                            |
| ------------------------ | ---------------------------- | --------------- | -------------------------------------- |
| `columns`                | `ColumnDef<TData, TValue>[]` | **Required**    | Column definitions                     |
| `data`                   | `TData[]`                    | **Required**    | Table data                             |
| `enableGlobalFilter`     | `boolean`                    | `true`          | Enable global search                   |
| `enableColumnFilters`    | `boolean`                    | `true`          | Enable individual column filters       |
| `enableSorting`          | `boolean`                    | `true`          | Enable column sorting                  |
| `enableColumnReordering` | `boolean`                    | `true`          | Enable drag-and-drop column reordering |
| `enableColumnVisibility` | `boolean`                    | `true`          | Enable column show/hide toggle         |
| `showPagination`         | `boolean`                    | `false`         | Show pagination info                   |
| `className`              | `string`                     | `undefined`     | Additional CSS classes                 |
| `emptyMessage`           | `string`                     | `"No results."` | Message when no data                   |

## Styling

The component uses Tailwind CSS classes and is designed to work with dark themes. Key styling features:

- Dark theme optimized
- Hover effects on rows and headers
- Smooth transitions
- Responsive design
- Drag indicators on hover
- Sort indicators (arrows)

## Column Options

Each column supports all TanStack Table column options:

```tsx
{
  accessorKey: 'fieldName',
  header: 'Display Name',
  cell: ({ getValue, row }) => {
    // Custom cell rendering
    return <div>{getValue()}</div>;
  },
  enableSorting: true,
  enableColumnFilter: true,
  sortingFn: 'basic', // 'basic', 'alphanumeric', 'datetime', etc.
  // Filtering: set `meta.filterType` and let the table supply its own filter.
  // Do NOT name one of TanStack's built-in filterFns ('includesString',
  // 'equals', …) — the filter UI writes a `{ operator, value }` object that
  // the built-ins cannot read, so the column's filter would match nothing.
  // DataTable ignores such names and substitutes the enhanced filter.
  meta: { filterType: 'string' }, // 'string' | 'number' | 'date' | 'boolean'
}
```

To match against more than one field (e.g. a symbol *and* its full name),
declare `meta.getFilterValue` instead of hand-rolling a `filterFn`:

```tsx
{
  accessorKey: 'token',
  meta: {
    filterType: 'string',
    getFilterValue: (row) => [row.token, row.tokenName].filter(Boolean),
  },
}
```

## Integration with Widgets

The component integrates seamlessly with the existing widget system:

```tsx
const content = (
  <div className="w-full h-full flex flex-col">
    <DataTable
      columns={columns}
      data={data}
      enableGlobalFilter={true}
      enableColumnFilters={true}
      enableSorting={true}
      enableColumnReordering={true}
      enableColumnVisibility={true}
      className="flex-1"
      emptyMessage="No data available."
    />
  </div>
);

return <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>;
```

## Migration from Old Table

To migrate from the old table implementation:

1. Replace manual `useReactTable` setup with `<DataTable>`
2. Update column definitions to use standard `ColumnDef` format
3. Remove manual table rendering JSX
4. Add desired feature flags (filtering, sorting, etc.)

### Before:

```tsx
const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
});

return (
  <table>
    <thead>
      {table.getHeaderGroups().map((headerGroup) => (
        // Manual table rendering...
      ))}
    </thead>
    // ...
  </table>
);
```

### After:

```tsx
return (
  <DataTable
    columns={columns}
    data={data}
    enableGlobalFilter={true}
    enableSorting={true}
  />
);
```

## Performance Tips

- Use `useMemo` for column definitions to prevent re-renders
- Use `useMemo` for data if it's computed or filtered
- Disable unused features to reduce bundle size
- Consider virtualization for very large datasets (future enhancement)

## Future Enhancements

Planned features:

- Row selection with checkboxes
- Virtual scrolling for large datasets
- Export functionality (CSV, Excel)
- Server-side pagination, filtering, and sorting
- Custom filter components
- Bulk actions on selected rows

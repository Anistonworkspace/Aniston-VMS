# Skill — RTK Query Patterns

These are the only correct ways to call APIs and manage server state in the frontend.

---

## API slice structure (one file per feature)

```typescript
// frontend/src/features/item/item.api.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { Item, ApiResponse, PaginationMeta } from '@boilerplate/shared';
import type { RootState } from '@/app/store';

export const itemApi = createApi({
  reducerPath: 'itemApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ['Item'],
  endpoints: (builder) => ({
    listItems: builder.query<{ data: Item[]; meta: PaginationMeta }, { page?: number; limit?: number }>({
      query: (params) => ({ url: '/items', params }),
      providesTags: (result) =>
        result
          ? [...result.data.map(({ id }) => ({ type: 'Item' as const, id })), { type: 'Item', id: 'LIST' }]
          : [{ type: 'Item', id: 'LIST' }],
    }),

    getItem: builder.query<Item, string>({
      query: (id) => `/items/${id}`,
      providesTags: (_result, _err, id) => [{ type: 'Item', id }],
    }),

    createItem: builder.mutation<Item, Partial<Item>>({
      query: (body) => ({ url: '/items', method: 'POST', body }),
      invalidatesTags: [{ type: 'Item', id: 'LIST' }],
    }),

    updateItem: builder.mutation<Item, { id: string; body: Partial<Item> }>({
      query: ({ id, body }) => ({ url: `/items/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _err, { id }) => [{ type: 'Item', id }, { type: 'Item', id: 'LIST' }],
    }),

    deleteItem: builder.mutation<void, string>({
      query: (id) => ({ url: `/items/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Item', id: 'LIST' }],
    }),
  }),
});

export const {
  useListItemsQuery,
  useGetItemQuery,
  useCreateItemMutation,
  useUpdateItemMutation,
  useDeleteItemMutation,
} = itemApi;
```

## Component consuming RTK Query

```typescript
// ✅ CORRECT — handles all 3 states: loading, error, data
export function ItemList() {
  const { data, isLoading, isError } = useListItemsQuery({ page: 1, limit: 20 });
  const [createItem, { isLoading: isCreating }] = useCreateItemMutation();

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (isError) return <p className="text-red-500">Failed to load items.</p>;

  const handleCreate = async (values: CreateItemInput) => {
    try {
      await createItem(values).unwrap();
      toast.success('Item created');
    } catch {
      toast.error('Failed to create item');
    }
  };

  return <div>{data?.data.map(item => <ItemCard key={item.id} item={item} />)}</div>;
}
```

## NEVER do this

```typescript
// ❌ WRONG — raw fetch instead of RTK Query
const response = await fetch('/api/items');
const data = await response.json();

// ❌ WRONG — copying server data into Redux slice
dispatch(setItems(data)); // server data belongs in RTK Query cache, not Redux

// ❌ WRONG — mutation without invalidatesTags (list won't refresh)
createItem: builder.mutation({
  query: (body) => ({ url: '/items', method: 'POST', body }),
  // missing invalidatesTags!
}),
```

## providesTags / invalidatesTags rules

| Endpoint type | providesTags | invalidatesTags |
|--------------|--------------|-----------------|
| list query | `[{ type: 'X', id: 'LIST' }]` | — |
| single query | `[{ type: 'X', id }]` | — |
| create mutation | — | `[{ type: 'X', id: 'LIST' }]` |
| update mutation | — | `[{ type: 'X', id }, { type: 'X', id: 'LIST' }]` |
| delete mutation | — | `[{ type: 'X', id: 'LIST' }]` |

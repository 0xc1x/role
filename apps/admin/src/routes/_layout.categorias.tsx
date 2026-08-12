import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  categoriesColumns,
  categoriesListOptions,
  useCategoriesList,
  CategoryCreateDrawer,
} from "@/features/categories";
import { DataTable } from "@/components/data-table/data-table";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Search } from "lucide-react";

const categoriesSearchSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  active: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
});

export const Route = createFileRoute("/_layout/categorias")({
  validateSearch: (raw) => categoriesSearchSchema.parse(raw),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(categoriesListOptions(deps)),
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "Categorías | Role",
      },
      {
        name: "description",
        content:
          "Gestiona las categorías de tu plataforma desde el panel de administración Role",
      },
    ],
  }),
});

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data, isLoading, isError, error } = useCategoriesList(search);

  const [searchInput, setSearchInput] = useState(search.search ?? "");

  useEffect(() => {
    setSearchInput(search.search ?? "");
  }, [search.search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== (search.search ?? "")) {
        navigate({
          search: {
            page: 1,
            limit: search.limit,
            search: searchInput || undefined,
            active: search.active,
          },
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search.search, search.limit, search.active, navigate]);

  if (isLoading) {
    return (
      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-6 w-24" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-6 py-4">
        <div className="flex flex-col items-center gap-4">
          <p className="text-destructive">
            {error instanceof Error
              ? error.message
              : "Error al cargar categorías"}
          </p>
          <Button
            variant="outline"
            onClick={() =>
              navigate({
                search: { page: 1, limit: 10, active: undefined },
              })
            }
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const categories = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between">
        <header className="flex items-center">
          <h1 className="font-bold text-xl">Panel de Categorías</h1>
        </header>
        <div className="flex items-center gap-4">
          <InputGroup className="max-w-sm">
            <InputGroupAddon align="inline-start">
              <Search className="size-4 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Buscar categorías..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </InputGroup>
          <CategoryCreateDrawer />
        </div>
      </div>
      <div className="mt-4">
        <DataTable
          columns={categoriesColumns}
          data={categories}
          meta={meta}
          onPageChange={(page) =>
            navigate({
              search: {
                page,
                limit: search.limit,
                search: search.search,
                active: search.active,
              },
            })
          }
          onLimitChange={(limit) =>
            navigate({
              search: {
                page: 1,
                limit,
                search: search.search,
                active: search.active,
              },
            })
          }
        />
      </div>
    </div>
  );
}

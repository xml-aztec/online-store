"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/entities/auth/store";
import { listAdminUsers, updateAdminUser, type AdminUser } from "@/entities/user/adminApi";
import { ApiError } from "@/shared/api/client";
import { useDebouncedValue } from "@/shared/lib/useDebouncedValue";
import { AdminPagination } from "@/shared/ui/AdminPagination";
import { Toggle } from "@/shared/ui/Toggle";

const QUERY_KEY = ["admin-users"];
const PAGE_SIZE = 50;
const ROLE_LABELS: Record<string, string> = {
  customer: "Покупатель",
  manager: "Менеджер",
  admin: "Админ",
};

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateAdminUser>[1]) =>
      updateAdminUser(user.id, payload),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить");
    },
  });

  return (
    <tr className="border-b border-ink/10 align-top last:border-0">
      <td className="px-3 py-2">
        {user.email}
        {isSelf && <span className="ml-2 text-xs text-ink-muted">(вы)</span>}
      </td>
      <td className="px-3 py-2">{user.full_name ?? "—"}</td>
      <td className="px-3 py-2">
        <select
          value={user.role}
          disabled={isSelf || mutation.isPending}
          onChange={(event) => mutation.mutate({ role: event.target.value })}
          className="rounded-lg border border-ink/15 px-2 py-1 text-sm disabled:opacity-50 bg-bg"
        >
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <Toggle
          checked={user.is_active}
          disabled={isSelf || mutation.isPending}
          onChange={(checked) => mutation.mutate({ is_active: checked })}
          label={`Пользователь ${user.is_active ? "активен" : "заблокирован"}: ${user.email}`}
        />
      </td>
      <td className="px-3 py-2 text-sm text-ink-muted">
        {user.email_verified ? "подтверждён" : "не подтверждён"}
      </td>
      <td className="px-3 py-2 text-sm text-ink-muted">
        {error && <span className="text-accent-sale-700">{error}</span>}
      </td>
    </tr>
  );
}

function UsersTableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-lg border border-ink/10" aria-busy="true" aria-label="Загрузка пользователей">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink/10 bg-surface text-left text-ink-muted">
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Имя</th>
            <th className="px-3 py-2">Роль</th>
            <th className="px-3 py-2">Активен</th>
            <th className="px-3 py-2">Email подтверждён</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, i) => (
            <tr key={i} className="border-b border-ink/10 align-top last:border-0">
              <td className="px-3 py-2">
                <div className="h-4 w-36 animate-pulse rounded bg-surface" />
              </td>
              <td className="px-3 py-2">
                <div className="h-4 w-24 animate-pulse rounded bg-surface" />
              </td>
              <td className="px-3 py-2">
                <div className="h-7 w-28 animate-pulse rounded-lg bg-surface" />
              </td>
              <td className="px-3 py-2">
                <div className="h-5 w-9 animate-pulse rounded-full bg-surface" />
              </td>
              <td className="px-3 py-2">
                <div className="h-4 w-20 animate-pulse rounded bg-surface" />
              </td>
              <td className="px-3 py-2" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useAuthStore((state) => state.role);
  const myEmail = useAuthStore((state) => state.email);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  // page lives in the URL (survives refresh/back-forward, matches
  // admin/orders/page.tsx) and is reset to 1 whenever search settles.
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  function updateParam(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in updates)) params.delete("page");
    router.push(`/admin/users?${params.toString()}`);
  }

  // Search is debounced before it drives the query (and the page-1 reset)
  // so typing doesn't refetch the paginated list on every keystroke.
  const isFirstSearchRun = useRef(true);
  useEffect(() => {
    if (isFirstSearchRun.current) {
      isFirstSearchRun.current = false;
      return;
    }
    updateParam({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { data, isLoading } = useQuery({
    queryKey: [...QUERY_KEY, debouncedSearch, page],
    queryFn: () => listAdminUsers(debouncedSearch || undefined, page, PAGE_SIZE),
    enabled: role === "admin",
  });

  if (role !== "admin") {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-ink">
          Пользователи
        </h1>
        <p className="text-ink-muted">
          Управление пользователями доступно только роли «admin» (ТЗ 6.4).
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">
        Пользователи{" "}
        {data && (
          <span className="font-mono text-base font-semibold text-ink-muted">{data.total}</span>
        )}
      </h1>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по email…"
        className="mb-4 w-full max-w-sm rounded-lg border border-ink/15 px-3 py-2 text-sm bg-bg"
      />
      {isLoading && <UsersTableSkeleton />}
      {data && (
        <div className="animate-content-fade-in overflow-x-auto rounded-lg border border-ink/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-surface text-left text-ink-muted">
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Имя</th>
                <th className="px-3 py-2">Роль</th>
                <th className="px-3 py-2">Активен</th>
                <th className="px-3 py-2">Email подтверждён</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((user) => (
                <UserRow key={user.id} user={user} isSelf={user.email === myEmail} />
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && (
            <p className="p-4 text-center text-ink-muted">Пользователи не найдены</p>
          )}
        </div>
      )}

      {data && (
        <div className="mt-4">
          <AdminPagination
            page={page}
            pageSize={data.page_size}
            total={data.total}
            onPageChange={(next) => updateParam({ page: String(next) })}
          />
        </div>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Загрузка…</p>}>
      <UsersTable />
    </Suspense>
  );
}

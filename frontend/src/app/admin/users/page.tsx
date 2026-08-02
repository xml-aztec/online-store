"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/entities/auth/store";
import { listAdminUsers, updateAdminUser, type AdminUser } from "@/entities/user/adminApi";
import { ApiError } from "@/shared/api/client";

const QUERY_KEY = ["admin-users"];
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={user.is_active}
            disabled={isSelf || mutation.isPending}
            onChange={(event) => mutation.mutate({ is_active: event.target.checked })}
          />
          активен
        </label>
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

export default function AdminUsersPage() {
  const role = useAuthStore((state) => state.role);
  const myEmail = useAuthStore((state) => state.email);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: [...QUERY_KEY, search],
    queryFn: () => listAdminUsers(search || undefined, 1, 100),
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
        Пользователи
      </h1>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по email…"
        className="mb-4 w-full max-w-sm rounded-lg border border-ink/15 px-3 py-2 text-sm bg-bg"
      />
      {isLoading && <p className="text-ink-muted">Загрузка…</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-ink/10">
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
    </div>
  );
}

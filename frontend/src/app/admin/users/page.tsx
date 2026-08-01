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
    <tr className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900">
      <td className="px-3 py-2">
        {user.email}
        {isSelf && <span className="ml-2 text-xs text-zinc-500">(вы)</span>}
      </td>
      <td className="px-3 py-2">{user.full_name ?? "—"}</td>
      <td className="px-3 py-2">
        <select
          value={user.role}
          disabled={isSelf || mutation.isPending}
          onChange={(event) => mutation.mutate({ role: event.target.value })}
          className="rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
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
      <td className="px-3 py-2 text-sm text-zinc-500">
        {user.email_verified ? "подтверждён" : "не подтверждён"}
      </td>
      <td className="px-3 py-2 text-sm text-zinc-500">
        {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
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
        <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Пользователи
        </h1>
        <p className="text-zinc-500">
          Управление пользователями доступно только роли «admin» (ТЗ 6.4).
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        Пользователи
      </h1>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по email…"
        className="mb-4 w-full max-w-sm rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {isLoading && <p className="text-zinc-500">Загрузка…</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
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
            <p className="p-4 text-center text-zinc-500">Пользователи не найдены</p>
          )}
        </div>
      )}
    </div>
  );
}

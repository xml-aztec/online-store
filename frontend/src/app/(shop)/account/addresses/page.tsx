"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
  type AddressPublic,
} from "@/entities/account/api";
import { ApiError } from "@/shared/api/client";

const QUERY_KEY = ["my-addresses"];

function AddressCard({ address }: { address: AddressPublic }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const setDefaultMutation = useMutation({
    mutationFn: () => updateAddress(address.id, { is_default: true }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAddress(address.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Не удалось удалить"),
  });

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {address.city}, {address.street} {address.building}
            {address.apartment ? `, кв. ${address.apartment}` : ""}
          </p>
          {address.postal_code && <p className="text-zinc-500">Индекс: {address.postal_code}</p>}
          {address.comment && <p className="text-zinc-500">{address.comment}</p>}
          {address.is_default && (
            <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              По умолчанию
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {!address.is_default && (
            <button
              type="button"
              onClick={() => setDefaultMutation.mutate()}
              disabled={setDefaultMutation.isPending}
              className="rounded border border-zinc-300 px-2 py-1 text-xs hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700"
            >
              Сделать основным
            </button>
          )}
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:border-red-400 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
          >
            Удалить
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function CreateAddressForm() {
  const queryClient = useQueryClient();
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [building, setBuilding] = useState("");
  const [apartment, setApartment] = useState("");
  const [comment, setComment] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createAddress({
        city,
        street,
        building,
        apartment: apartment || null,
        comment: comment || null,
        is_default: false,
      }),
    onSuccess: () => {
      setCity("");
      setStreet("");
      setBuilding("");
      setApartment("");
      setComment("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Город</label>
        <input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          required
          className="w-32 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Улица</label>
        <input
          value={street}
          onChange={(event) => setStreet(event.target.value)}
          required
          className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Дом</label>
        <input
          value={building}
          onChange={(event) => setBuilding(event.target.value)}
          required
          className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Квартира</label>
        <input
          value={apartment}
          onChange={(event) => setApartment(event.target.value)}
          className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Комментарий</label>
        <input
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {mutation.isPending ? "Добавляем…" : "Добавить адрес"}
      </button>
      {mutation.isError && (
        <p className="w-full text-sm text-red-600 dark:text-red-400">
          {mutation.error instanceof ApiError ? mutation.error.message : "Не удалось добавить адрес"}
        </p>
      )}
    </form>
  );
}

export default function AccountAddressesPage() {
  const { data: addresses, isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: listAddresses });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Мои адреса</h1>
      <CreateAddressForm />
      {isLoading && <p className="text-zinc-500">Загрузка…</p>}
      {addresses && addresses.length === 0 && <p className="text-zinc-500">Адресов пока нет</p>}
      <div className="space-y-3">
        {addresses?.map((address) => <AddressCard key={address.id} address={address} />)}
      </div>
    </div>
  );
}

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
    <div className="rounded-lg border border-ink/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium text-ink">
            {address.city}, {address.street} {address.building}
            {address.apartment ? `, кв. ${address.apartment}` : ""}
          </p>
          {address.postal_code && <p className="text-ink-muted">Индекс: {address.postal_code}</p>}
          {address.comment && <p className="text-ink-muted">{address.comment}</p>}
          {address.is_default && (
            <span className="mt-1 inline-block rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
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
              className="rounded-lg border border-ink/15 px-2 py-1 text-xs hover:border-brand/40 disabled:opacity-50"
            >
              Сделать основным
            </button>
          )}
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="rounded-lg border border-accent-sale/40 px-2 py-1 text-xs text-accent-sale-700 hover:border-accent-sale/60 disabled:opacity-50"
          >
            Удалить
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-accent-sale-700">{error}</p>}
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
      className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-ink/10 p-4"
    >
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Город</label>
        <input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          required
          className="w-32 rounded-lg border border-ink/15 px-2 py-1 text-sm bg-bg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Улица</label>
        <input
          value={street}
          onChange={(event) => setStreet(event.target.value)}
          required
          className="w-40 rounded-lg border border-ink/15 px-2 py-1 text-sm bg-bg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Дом</label>
        <input
          value={building}
          onChange={(event) => setBuilding(event.target.value)}
          required
          className="w-20 rounded-lg border border-ink/15 px-2 py-1 text-sm bg-bg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Квартира</label>
        <input
          value={apartment}
          onChange={(event) => setApartment(event.target.value)}
          className="w-20 rounded-lg border border-ink/15 px-2 py-1 text-sm bg-bg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Комментарий</label>
        <input
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="w-40 rounded-lg border border-ink/15 px-2 py-1 text-sm bg-bg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-lg bg-brand hover:bg-brand/90 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {mutation.isPending ? "Добавляем…" : "Добавить адрес"}
      </button>
      {mutation.isError && (
        <p className="w-full text-sm text-accent-sale-700">
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
      <h1 className="mb-6 font-display text-xl font-bold text-ink">Мои адреса</h1>
      <CreateAddressForm />
      {isLoading && <p className="text-ink-muted">Загрузка…</p>}
      {addresses && addresses.length === 0 && <p className="text-ink-muted">Адресов пока нет</p>}
      <div className="space-y-3">
        {addresses?.map((address) => <AddressCard key={address.id} address={address} />)}
      </div>
    </div>
  );
}

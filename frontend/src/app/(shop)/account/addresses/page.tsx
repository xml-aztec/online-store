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
    <div className="flex flex-col gap-2 rounded-xl border border-ink/10 bg-bg p-[18px]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-sm font-bold text-ink">
          {address.label || "Адрес"}
        </span>
        {address.is_default && (
          <span className="whitespace-nowrap rounded-lg bg-success/10 px-2 py-1 font-display text-[11px] font-semibold text-success-700">
            По умолчанию
          </span>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-ink-muted">
        {address.city}, {address.street} {address.building}
        {address.apartment ? `, кв. ${address.apartment}` : ""}
        {address.postal_code && (
          <>
            <br />
            Индекс: {address.postal_code}
          </>
        )}
        {address.comment && (
          <>
            <br />
            {address.comment}
          </>
        )}
      </p>
      <div className="mt-0.5 flex gap-3.5">
        {!address.is_default && (
          <button
            type="button"
            onClick={() => setDefaultMutation.mutate()}
            disabled={setDefaultMutation.isPending}
            className="text-[13px] font-semibold text-ink hover:underline disabled:opacity-50"
          >
            Сделать основным
          </button>
        )}
        <button
          type="button"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          className="text-[13px] text-ink-muted hover:text-accent-sale-700 disabled:opacity-50"
        >
          Удалить
        </button>
      </div>
      {error && <p className="text-xs text-accent-sale-700">{error}</p>}
    </div>
  );
}

function CreateAddressForm() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [building, setBuilding] = useState("");
  const [apartment, setApartment] = useState("");
  const [comment, setComment] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createAddress({
        label: label || null,
        city,
        street,
        building,
        apartment: apartment || null,
        comment: comment || null,
        is_default: false,
      }),
    onSuccess: () => {
      setLabel("");
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

  const inputClass =
    "rounded-lg border border-ink/15 bg-bg px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-ink/10 bg-surface p-4"
    >
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Метка</label>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Дом, Работа…"
          className={`w-28 ${inputClass}`}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Город</label>
        <input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          required
          className={`w-32 ${inputClass}`}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Улица</label>
        <input
          value={street}
          onChange={(event) => setStreet(event.target.value)}
          required
          className={`w-40 ${inputClass}`}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Дом</label>
        <input
          value={building}
          onChange={(event) => setBuilding(event.target.value)}
          required
          className={`w-20 ${inputClass}`}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Квартира</label>
        <input
          value={apartment}
          onChange={(event) => setApartment(event.target.value)}
          className={`w-20 ${inputClass}`}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Комментарий</label>
        <input
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className={`w-40 ${inputClass}`}
        />
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-lg bg-brand px-4 py-2 font-display text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {mutation.isPending ? "Добавляем…" : "+ Добавить адрес"}
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
      <h2 className="mb-4 font-display text-lg font-extrabold text-ink">Адреса</h2>
      <CreateAddressForm />
      {isLoading && <p className="text-ink-muted">Загрузка…</p>}
      {addresses && addresses.length === 0 && <p className="text-ink-muted">Адресов пока нет</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {addresses?.map((address) => <AddressCard key={address.id} address={address} />)}
      </div>
    </div>
  );
}

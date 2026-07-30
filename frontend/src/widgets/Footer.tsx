export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 py-8 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
      <div className="mx-auto max-w-6xl px-4">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">HobbyLife</p>
        <p className="mt-1">Товары для дома в Бишкеке.</p>
        <p className="mt-4">© {new Date().getFullYear()} HobbyLife. Все права защищены.</p>
      </div>
    </footer>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-surface py-8 pb-24 text-sm text-ink-muted lg:pb-8">
      <div className="mx-auto max-w-[1440px] px-4">
        <p className="font-display font-semibold text-ink">HobbyLife</p>
        <p className="mt-1">Товары для дома в Бишкеке.</p>
        <p className="mt-4">© {new Date().getFullYear()} HobbyLife. Все права защищены.</p>
      </div>
    </footer>
  );
}

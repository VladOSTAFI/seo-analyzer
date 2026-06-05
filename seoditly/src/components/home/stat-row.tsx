import { getRequestLocale } from "@/lib/i18n/server";
import { getHome } from "@/lib/copy/home";
import { Container } from "@/components/primitives/container";
import { StatCard } from "@/components/primitives/stat-card";

/** Three proof-points in a 1-col (mobile) → 3-col (md) grid. */
export async function StatRow() {
  const { stats } = getHome(await getRequestLocale());

  return (
    <section className="pb-8 md:pb-12">
      <Container>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {stats.items.map((item) => (
            <StatCard
              key={item.label}
              value={item.value}
              label={item.label}
              sub={item.sub}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}
